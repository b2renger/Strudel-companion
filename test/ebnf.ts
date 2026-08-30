/**
 * A minimal EBNF recognizer, for testing the Strudel grammar offline.
 *
 * The grammar's whole claim is that certain patterns are UNREPRESENTABLE, not
 * merely discouraged. XGrammar is what enforces that at run time, and it cannot
 * be run on the machine this was written on — so without something like this,
 * "s(\"rhodes\") is impossible now" would be an assertion with nothing behind
 * it, and a grammar bug would surface as every local generation failing in
 * front of a user.
 *
 * Supports the subset the grammar uses: literals, rule references, alternation,
 * concatenation, `?`, `*`, parenthesised groups, and `[...]` character classes
 * including negation. No left recursion (the grammar has none).
 *
 * Matching returns the SET of positions a node can end at, because the grammar
 * is ambiguous in places and committing to the first match would reject strings
 * the real matcher accepts.
 */

type Node =
  | { kind: 'lit'; value: string }
  | { kind: 'class'; negated: boolean; ranges: Array<[string, string]> }
  | { kind: 'ref'; name: string }
  | { kind: 'seq'; items: Node[] }
  | { kind: 'alt'; options: Node[] }
  | { kind: 'opt'; item: Node }
  | { kind: 'star'; item: Node };

export class Ebnf {
  private rules = new Map<string, Node>();

  constructor(source: string) {
    const withoutComments = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');

    // Rules may wrap across lines; a new rule starts at `name ::=`.
    const parts = withoutComments.split(/\n(?=\s*[a-zA-Z_][\w]*\s*::=)/);
    for (const part of parts) {
      const m = /^\s*([a-zA-Z_][\w]*)\s*::=([\s\S]*)$/.exec(part);
      if (!m) continue;
      this.rules.set(m[1], parseAlternation(new Cursor(m[2].trim())));
    }
  }

  ruleNames(): string[] {
    return [...this.rules.keys()];
  }

  /** True when `input` is matched in full by `rule`. */
  matches(input: string, rule = 'root'): boolean {
    const memo = new Map<string, number[]>();
    const ends = this.match(this.expect(rule), input, 0, memo);
    return ends.includes(input.length);
  }

  private expect(name: string): Node {
    const rule = this.rules.get(name);
    if (!rule) throw new Error(`grammar references an undefined rule: ${name}`);
    return rule;
  }

  private match(node: Node, input: string, pos: number, memo: Map<string, number[]>): number[] {
    const key = `${nodeKey(node)}@${pos}`;
    const cached = memo.get(key);
    if (cached) return cached;
    memo.set(key, []); // guards against accidental recursion

    let out: number[];
    switch (node.kind) {
      case 'lit':
        out = input.startsWith(node.value, pos) ? [pos + node.value.length] : [];
        break;
      case 'class': {
        const ch = input[pos];
        if (ch === undefined) {
          out = [];
          break;
        }
        const inRange = node.ranges.some(([lo, hi]) => ch >= lo && ch <= hi);
        out = inRange !== node.negated ? [pos + 1] : [];
        break;
      }
      case 'ref':
        out = this.match(this.expect(node.name), input, pos, memo);
        break;
      case 'alt':
        out = unique(node.options.flatMap((o) => this.match(o, input, pos, memo)));
        break;
      case 'seq': {
        let positions = [pos];
        for (const item of node.items) {
          positions = unique(positions.flatMap((p) => this.match(item, input, p, memo)));
          if (positions.length === 0) break;
        }
        out = positions;
        break;
      }
      case 'opt':
        out = unique([pos, ...this.match(node.item, input, pos, memo)]);
        break;
      case 'star': {
        const seen = new Set([pos]);
        let frontier = [pos];
        while (frontier.length) {
          const next = unique(
            frontier.flatMap((p) => this.match(node.item, input, p, memo)),
          ).filter((p) => !seen.has(p));
          next.forEach((p) => seen.add(p));
          frontier = next;
        }
        out = [...seen];
        break;
      }
    }

    memo.set(key, out);
    return out;
  }
}

function unique(values: number[]): number[] {
  return [...new Set(values)];
}

let keyCounter = 0;
const keys = new WeakMap<object, number>();
function nodeKey(node: Node): number {
  let k = keys.get(node);
  if (k === undefined) {
    k = ++keyCounter;
    keys.set(node, k);
  }
  return k;
}

// --- parser -----------------------------------------------------------------

class Cursor {
  constructor(
    readonly text: string,
    public pos = 0,
  ) {}
  skipSpace() {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos++;
  }
  peek(): string {
    return this.text[this.pos];
  }
  done(): boolean {
    this.skipSpace();
    return this.pos >= this.text.length;
  }
}

function parseAlternation(c: Cursor): Node {
  const options = [parseSequence(c)];
  for (;;) {
    c.skipSpace();
    if (c.peek() !== '|') break;
    c.pos++;
    options.push(parseSequence(c));
  }
  return options.length === 1 ? options[0] : { kind: 'alt', options };
}

function parseSequence(c: Cursor): Node {
  const items: Node[] = [];
  for (;;) {
    c.skipSpace();
    const ch = c.peek();
    if (ch === undefined || ch === '|' || ch === ')') break;
    items.push(parsePostfix(c));
  }
  if (items.length === 0) return { kind: 'seq', items: [] };
  return items.length === 1 ? items[0] : { kind: 'seq', items };
}

function parsePostfix(c: Cursor): Node {
  let node = parseAtom(c);
  for (;;) {
    const ch = c.peek();
    if (ch === '?') {
      c.pos++;
      node = { kind: 'opt', item: node };
    } else if (ch === '*') {
      c.pos++;
      node = { kind: 'star', item: node };
    } else if (ch === '+') {
      c.pos++;
      node = { kind: 'seq', items: [node, { kind: 'star', item: node }] };
    } else break;
  }
  return node;
}

function parseAtom(c: Cursor): Node {
  c.skipSpace();
  const ch = c.peek();

  if (ch === '(') {
    c.pos++;
    const inner = parseAlternation(c);
    c.skipSpace();
    if (c.peek() !== ')') throw new Error(`unclosed ( at ${c.pos} in: ${c.text}`);
    c.pos++;
    return inner;
  }

  if (ch === '"') {
    c.pos++;
    let value = '';
    while (c.pos < c.text.length && c.peek() !== '"') {
      if (c.peek() === '\\') {
        c.pos++;
        const esc = c.peek();
        value += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc;
      } else {
        value += c.peek();
      }
      c.pos++;
    }
    if (c.peek() !== '"') throw new Error(`unterminated literal in: ${c.text}`);
    c.pos++;
    return { kind: 'lit', value };
  }

  if (ch === '[') {
    c.pos++;
    const negated = c.peek() === '^';
    if (negated) c.pos++;
    const ranges: Array<[string, string]> = [];
    while (c.pos < c.text.length && c.peek() !== ']') {
      let lo = c.peek();
      if (lo === '\\') {
        c.pos++;
        const esc = c.peek();
        lo = esc === 'n' ? '\n' : esc === 't' ? '\t' : esc;
      }
      c.pos++;
      if (c.peek() === '-' && c.text[c.pos + 1] !== ']') {
        c.pos++;
        const hi = c.peek();
        c.pos++;
        ranges.push([lo, hi]);
      } else {
        ranges.push([lo, lo]);
      }
    }
    c.pos++;
    return { kind: 'class', negated, ranges };
  }

  const m = /^[a-zA-Z_][\w]*/.exec(c.text.slice(c.pos));
  if (!m) throw new Error(`cannot parse EBNF at ${c.pos}: ${c.text.slice(c.pos, c.pos + 30)}`);
  c.pos += m[0].length;
  return { kind: 'ref', name: m[0] };
}
