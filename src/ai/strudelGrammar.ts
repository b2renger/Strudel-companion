/**
 * An EBNF grammar that can only spell valid Strudel.
 *
 * web-llm supports `response_format: { type: 'grammar', grammar }`, backed by
 * XGrammar, which masks the sampler at every step so a token that would break
 * the grammar cannot be chosen. Not discouraged — unreachable.
 *
 * That matters here more than it would in most apps, because the session traces
 * are almost entirely one failure mode: the model wrote something that is not
 * Strudel. Every one of these becomes impossible rather than repaired:
 *
 *   s("rhodes")            a synth voice used as a drum pattern — silent
 *   s("303") s("sub bass") invented sample names
 *   s("shaker(e,i)")       non-numeric Euclid arguments
 *   .pan("0 1")            a quoted effect argument
 *   .delaytime(0.375)      an effect the engine does not implement
 *   // TWEAK TIP: ...      a comment, which ate the layer separator
 *   stack(s("bd*4"),       an unclosed bracket
 *   s("a").s("b")          two source calls chained together
 *
 * The vocabulary comes from `src/audio/vocabulary.ts`, as everywhere else, so a
 * drum the engine cannot play cannot appear in the grammar either.
 *
 * Nesting is deliberately bounded to two levels. Mini-notation is recursive and
 * XGrammar would handle that, but unbounded recursion buys expressiveness the
 * composer never uses and costs matcher state on a phone.
 */

import { DRUM_VOICES, GENERIC_PERCUSSION, SYNTH_VOICES } from '../audio/vocabulary';

/** EBNF alternation over literals, e.g. `"bd" | "sd" | "hh"`. */
function alternatives(items: readonly string[]): string {
  return items.map((i) => `"${i}"`).join(' | ');
}

export interface GrammarShape {
  /** Whether the reply is wrapped in a ```strudel fence. */
  fenced: boolean;
  /** Labelled lines expected after the code, in order. */
  labels: readonly string[];
}

/** What each task asks for, mirroring the contracts in `prompts.ts`. */
export const GRAMMAR_SHAPES = {
  generate: { fenced: true, labels: ['TITLE', 'BPM', 'GENRE', 'WHY'] },
  tweak: { fenced: true, labels: ['SUMMARY'] },
  variation: { fenced: true, labels: ['TITLE'] },
  fix: { fenced: true, labels: ['SUMMARY'] },
  /** `buildRetryPrompt` asks for bare code and nothing else. */
  retry: { fenced: false, labels: [] },
} as const satisfies Record<string, GrammarShape>;

export type GrammarTask = keyof typeof GRAMMAR_SHAPES;

const DRUMS = [...DRUM_VOICES, ...GENERIC_PERCUSSION];

/**
 * Effects the audio engine actually reads.
 *
 * Deliberately not "every Strudel effect": an effect this engine ignores is one
 * the model spends tokens on for no audible result, and `.delaytime()` reaching
 * a user was exactly that.
 */
const NUMERIC_EFFECTS = ['gain', 'room', 'delay', 'decay'] as const;
const INTEGER_EFFECTS = ['lpf', 'hpf', 'cutoff'] as const;
const SPEED_EFFECTS = ['fast', 'slow'] as const;

export function buildStrudelGrammar(task: GrammarTask): string {
  const shape = GRAMMAR_SHAPES[task];

  const labelRules = shape.labels
    .map((label) =>
      label === 'BPM'
        ? `"\\nBPM: " int2or3`
        : `"\\n${label}: " textline`,
    )
    .join(' ');

  const opener = shape.fenced ? `"\`\`\`strudel\\n"` : '""';
  const closer = shape.fenced ? `"\\n\`\`\`"` : '""';

  return `# Generated from src/audio/vocabulary.ts. Do not edit by hand.
root ::= ${opener} pattern ${closer}${shape.labels.length ? ` ${labelRules}` : ''} "\\n"

pattern ::= "stack(\\n" layer ("," "\\n" layer)* "\\n)"
layer   ::= "  " source effect*

source  ::= drumsrc | notesrc
drumsrc ::= "s(\\"" dpat "\\")"
notesrc ::= "note(\\"" npat "\\")" voicesel?
voicesel ::= ".s(\\"" voice "\\")"

# --- mini-notation, two levels of nesting -----------------------------------
# Two levels, arranged so an alternation can contain subdivisions:
# <[c3 eb3 g3] [ab2 c3 eb3]> is what the composer writes for a chord
# progression, and it was the one valid shape an earlier, flatter version of
# these rules rejected.
dpat    ::= dseq ("," " " dseq)*
dseq    ::= dgroup (" " dgroup)*
# A suffix may follow a GROUP as well as a single hit: [hh oh]*4 and
# <a b>*2 are both everyday mini-notation, and a version of these rules that
# allowed it only on bare units rejected 24 of 144 real composer patterns.
dgroup  ::= dunit | dbracket suffix? | dangle suffix?
dangle  ::= "<" dalts ">"
dalts   ::= dchoice (" " dchoice)*
dchoice ::= dunit | dbracket suffix?
dbracket ::= "[" dinner "]"
dinner  ::= dunit (" " dunit)*
dunit   ::= dname suffix?
dname   ::= ${alternatives(DRUMS)} | "~"

npat    ::= nseq ("," " " nseq)*
nseq    ::= ngroup (" " ngroup)*
ngroup  ::= nunit | nbracket suffix? | nangle suffix?
nangle  ::= "<" nalts ">"
nalts   ::= nchoice (" " nchoice)*
nchoice ::= nunit | nbracket suffix?
nbracket ::= "[" ninner "]"
ninner  ::= nunit (" " nunit)*
nunit   ::= note suffix? | "~"
note    ::= pitch octave
# Parenthesised: "|" binds looser than concatenation, so without the brackets
# the optional accidental would attach to "g" alone and gb would be the only
# flat the model could spell.
pitch   ::= (${alternatives(['a', 'b', 'c', 'd', 'e', 'f', 'g'])}) accidental?
accidental ::= "#" | "b"
octave  ::= [1-7]

suffix  ::= "*" int1or2 | "(" int1or2 "," int1or2 ")" | "?" | "@" int1or2

voice   ::= ${alternatives(SYNTH_VOICES)}

# --- effects ----------------------------------------------------------------
effect  ::= ${NUMERIC_EFFECTS.map((e) => `".${e}(" frac ")"`).join(' | ')}
          | ${INTEGER_EFFECTS.map((e) => `".${e}(" int2or5 ")"`).join(' | ')}
          | ".pan(" signed ")"
          | ${SPEED_EFFECTS.map((e) => `".${e}(" int1or2 ")"`).join(' | ')}

frac    ::= "0." digit digit? | "0" | "1" | "1." digit digit?
signed  ::= "-"? frac
digit   ::= [0-9]
int1or2 ::= digit digit?
int2or3 ::= digit digit digit?
int2or5 ::= digit digit digit? digit? digit?
textline ::= [^\\n]+
`;
}

/**
 * A single line naming what the grammar allows, for the session trace.
 *
 * A grammar failure is otherwise very hard to diagnose from the outside: the
 * model simply stops producing anything, and nothing says why.
 */
export function describeGrammar(task: GrammarTask): string {
  const shape = GRAMMAR_SHAPES[task];
  return (
    `${task}: ${DRUMS.length} drums, ${SYNTH_VOICES.length} voices, ` +
    `${NUMERIC_EFFECTS.length + INTEGER_EFFECTS.length + SPEED_EFFECTS.length + 1} effects, ` +
    `${shape.fenced ? 'fenced' : 'bare'}, labels [${shape.labels.join(', ') || 'none'}]`
  );
}
