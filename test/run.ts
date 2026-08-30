/**
 * Test suite for the pure logic — parsers, validators and the sound vocabulary.
 *
 * Runs on Node's native type stripping, so there is no test framework and no
 * build step: `npm test`.
 *
 * Scope is deliberately the code where a silent regression is most likely and
 * most damaging: the regex-driven parsers. Anything needing a DOM, WebGPU or an
 * AudioContext is out of scope here and is covered by the manual checklist in
 * docs/ARCHITECTURE.md.
 */

import { strict as assert } from 'node:assert';

import { isDrumName, DRUM_VOICES, SYNTH_VOICES, buildVocabularyPromptSection } from '../src/audio/vocabulary.ts';
import { validateStructure } from '../src/audio/validate.ts';
import {
  extractCodeBlock,
  parseGeneratedTrack,
  parseTweakResult,
  parseExplanationResult,
  parseVariationResult,
  AIParseError,
} from '../src/ai/outputParser.ts';
import { composeTrack, PROCEDURAL_GENRES } from '../src/ai/proceduralComposer.ts';
import { VARIATION_RECIPES, buildVariationPrompt, buildCompactVariationPrompt } from '../src/ai/prompts.ts';
import {
  buildCompactGeneratePrompt,
  buildCompactTweakPrompt,
  buildExplainPrompt,
  buildFixPrompt,
  buildGeneratePrompt,
  buildTweakPrompt,
  withSystemPrompt,
  extractBpmFromPrompt,
  STRUDEL_SYNTAX_CARD,
  STRUDEL_SYSTEM_PROMPT,
} from '../src/ai/prompts.ts';
import { STARTER_PRESETS, INSPIRATION_PROMPTS } from '../src/data/presets.ts';
import {
  SUGGESTIONS_DATABASE,
  QUICK_ADD_MODIFIERS,
} from '../src/components/PromptSuggestionEngine.tsx';
import {
  parseStrudelCodeToTokens,
  findTokenExactRange,
  removeBlockInCode,
} from '../src/utils/strudelTokenParser.ts';
import {
  sanitizeGeneratedCode,
  stripComments,
  stripCommentsLenient,
} from '../src/ai/sanitizeCode.ts';
import { completionIsDone } from '../src/ai/streamStop.ts';
import { isTransientLoadError, describeLoadFailure } from '../src/ai/modelLoadErrors.ts';
import { clamp } from '../src/engine/audioEngine.ts';
import {
  buildHeuristicVariations,
  splitPattern,
  countChangedLayers,
} from '../src/ai/variationEngine.ts';
import { suggestHeuristicVariations } from '../src/ai/ruleBasedGenerator.ts';

let passed = 0;
const failures: string[] = [];

/**
 * Cases are REGISTERED, not executed, then run one at a time below.
 *
 * Running them eagerly meant two async cases both started before either
 * finished, and since several of them touch shared module state (the session
 * trace buffer) each wiped the other's setup. Sequencing removes that whole
 * class of flake.
 */
const cases: Array<[string, () => void | Promise<void>]> = [];

function test(name: string, fn: () => void | Promise<void>) {
  cases.push([name, fn]);
}

async function runAll() {
  for (const [name, fn] of cases) {
    try {
      await fn();
      passed++;
    } catch (err: any) {
      // The whole message, indented — not just its first line. A multi-line
      // assertion message (the list of everything that failed, say) was being
      // truncated to its useless first line.
      const message = String(err?.message ?? err)
        .split('\n')
        .map((line: string) => `    ${line.trim()}`)
        .join('\n');
      failures.push(`${name}\n${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Sound vocabulary — the single source of truth shared with the AI prompt
// ---------------------------------------------------------------------------

test('every declared drum voice is recognised as a drum', () => {
  for (const d of DRUM_VOICES) assert.equal(isDrumName(d), true, d);
});

test('drum aliases resolve', () => {
  for (const a of ['kick', 'snare', 'hat', 'clap', 'cowbell', 'crash']) {
    assert.equal(isDrumName(a), true, a);
  }
});

test('unsupported names are NOT treated as drums', () => {
  // Regression: `glitch` was absent from the drum list, so it fell through to
  // the melodic path and played a sustained middle C.
  for (const n of ['glitch', 'cabasa', 'marimba']) {
    assert.equal(isDrumName(n), false, n);
  }
});

test('note names are not mistaken for drums', () => {
  for (const n of ['c3', 'eb2', 'f#4', 'a1']) assert.equal(isDrumName(n), false, n);
});

test('prompt vocabulary lists exactly the implemented voices', () => {
  const section = buildVocabularyPromptSection();
  for (const d of DRUM_VOICES) assert.ok(section.includes(d), `prompt missing drum ${d}`);
  for (const s of SYNTH_VOICES) assert.ok(section.includes(s), `prompt missing synth ${s}`);
  // And it must warn the model off the names that misbehave.
  for (const bad of ['glitch', 'supersaw', 'marimba']) {
    assert.ok(section.includes(bad), `prompt should forbid ${bad}`);
  }
});

// ---------------------------------------------------------------------------
// Pattern validation — evaluate() must be able to fail
// ---------------------------------------------------------------------------

test('valid patterns pass structural validation', () => {
  for (const code of [
    'stack(\n  s("bd*4"),\n  s("~ cp ~ cp")\n)',
    's("bd*4, ~ [sd, cp](3,8)")',
    'note("<c2 f2>").s("sawtooth").lpf(1200)',
  ]) {
    assert.equal(validateStructure(code).ok, true, code);
  }
});

test('unbalanced brackets are rejected', () => {
  assert.equal(validateStructure('stack(\n  s("bd*4"),\n').ok, false);
  assert.equal(validateStructure('s("bd*4"))').ok, false);
  assert.equal(validateStructure('s("bd*4"').ok, false);
});

test('unterminated quote is rejected', () => {
  assert.equal(validateStructure('s("bd*4)').ok, false);
});

test('prose is rejected rather than silently played', () => {
  // Regression: evaluate() used to report success for ANY input and fall back
  // to a canned `bd sd, hh*4` loop.
  assert.equal(validateStructure('this is not code').ok, false);
  assert.equal(validateStructure('').ok, false);
});

test('brackets inside quoted patterns do not confuse the validator', () => {
  assert.equal(validateStructure('s("[bd sd] <hh oh>")').ok, true);
});

// ---------------------------------------------------------------------------
// Model output parsing — must never invent music
// ---------------------------------------------------------------------------

test('fenced code block is extracted', () => {
  const out = extractCodeBlock('Here you go:\n```strudel\nstack(\n  s("bd*4")\n)\n```\nEnjoy');
  assert.equal(out, 'stack(\n  s("bd*4")\n)');
});

test('prose containing "s(" is NOT accepted as code', () => {
  // Regression: the old catch-all `text.includes('s(')` matched almost any
  // sentence, which is how a raw JSON blob ended up in the editor.
  assert.equal(extractCodeBlock('This pattern uses s( to make sounds.'), null);
});

// These are the shapes a 0.5B-2B model actually emits. Each one previously
// produced "the model did not return a usable pattern", or smuggled prose into
// the editor as code.
test('messy small-model output still yields clean code', () => {
  const cases: Array<[string, string]> = [
    ['prose before and after', 'Sure! Here you go:\nstack(\n  s("bd*4")\n)\nHope you like it!'],
    ['js fence tag', '```js\nstack(\n  s("bd*4")\n)\n```'],
    ['no language tag', '```\nstack(s("bd*4"))\n```'],
    ['unclosed fence', '```strudel\nstack(\n  s("bd*4")\n)'],
    ['no fence at all', 'stack(\n  s("bd*4")\n)'],
    ['indented block', 'Sure!\n\n    stack(\n      s("bd*4")\n    )\n\nThat is a kick.'],
    ['parens in the trailing prose', 'stack(\n  s("bd*4")\n)\nThis uses s() for samples (nice).'],
  ];
  for (const [label, raw] of cases) {
    const code = extractCodeBlock(raw);
    assert.ok(code, `${label}: extracted nothing`);
    assert.match(code!, /^stack\(/, `${label}: did not start at the pattern`);
    assert.equal(
      code!.endsWith(')'),
      true,
      `${label}: trailing text was included — got ${JSON.stringify(code)}`,
    );
    assert.equal(validateStructure(code!).ok, true, `${label}: extracted code does not validate`);
  }
});

test('an unclosed fence is not mistaken for truncation', () => {
  // Small models forget the closing fence constantly. If the code inside is
  // complete, that is a formatting slip, not a cut-off answer.
  const r = parseGeneratedTrack('```strudel\nstack(\n  s("bd*4")\n)');
  assert.match(r.code, /^stack\(/);
});

test('truncated output is detected, not repaired', () => {
  // Genuinely incomplete: the parentheses never balance.
  assert.throws(
    () => parseGeneratedTrack('```strudel\nstack(\n  s("bd*4"),'),
    (e: any) => e instanceof AIParseError && /cut off/i.test(e.message),
  );
});

test('unusable output throws instead of returning a canned pattern', () => {
  assert.throws(() => parseGeneratedTrack('I cannot help with that.'), AIParseError);
  assert.throws(() => parseTweakResult('Sorry!'), AIParseError);
});

test('labelled generate response parses', () => {
  const raw = [
    '```strudel',
    'stack(',
    '  s("bd*4")',
    ')',
    '```',
    'TITLE: Midnight Drive',
    'BPM: 128',
    'GENRE: Techno',
    'WHY: A driving four-on-the-floor groove.',
    'NOTE: bd*4 — four-on-the-floor kick',
  ].join('\n');
  const r = parseGeneratedTrack(raw, 'prompt', 'Electronic', 120);
  assert.equal(r.title, 'Midnight Drive');
  assert.equal(r.bpm, 128);
  assert.equal(r.genre, 'Techno');
  assert.match(r.code, /^stack\(/);
  assert.equal(r.notationBreakdown[0].symbolOrMethod, 'bd*4');
});

test('generate falls back to the given bpm when the model omits it', () => {
  const r = parseGeneratedTrack('```strudel\nstack(s("bd*4"))\n```', 'p', 'House', 140);
  assert.equal(r.bpm, 140);
});

test('Gemini JSON responses still parse', () => {
  const r = parseGeneratedTrack(
    JSON.stringify({ code: 'stack(s("bd*4"))', title: 'X', bpm: 90, genre: 'Dub', explanation: 'e' }),
  );
  assert.equal(r.title, 'X');
  assert.equal(r.bpm, 90);
});

test('tweak response yields code and changes', () => {
  const raw = '```strudel\nstack(s("bd*4"))\n```\nSUMMARY: opened the filter\nCHANGED: lpf 800 to 2400\nCHANGED: added hats';
  const r = parseTweakResult(raw);
  assert.equal(r.summary, 'opened the filter');
  assert.deepEqual(r.diffHighlights, ['lpf 800 to 2400', 'added hats']);
});

test('explanation rows parse into roles', () => {
  const raw = [
    'SUMMARY: A driving groove.',
    'LINE: s("bd*4") | Drums | four-on-the-floor kick',
    'LINE: note("c2") | Bass | root movement',
    'SYMBOL: * | Subdivision | repeats N times | bd*4',
    'TIP: try modal interchange',
  ].join('\n');
  const r = parseExplanationResult(raw);
  assert.equal(r.lineByLine.length, 2);
  assert.equal(r.lineByLine[0].role, 'Drums');
  assert.equal(r.miniNotationGuide[0].symbol, '*');
  assert.equal(r.musicTheoryTip, 'try modal interchange');
});

test('an unknown role degrades to Structure rather than breaking the type', () => {
  const r = parseExplanationResult('SUMMARY: s\nLINE: s("x") | Percussion | thing');
  assert.equal(r.lineByLine[0].role, 'Structure');
});

test('variation parses and carries the recipe identity', () => {
  const recipe = { type: 'drop', title: 'The Drop', description: 'peak energy' };
  const r = parseVariationResult('```strudel\nstack(s("bd*4"))\n```\nTITLE: Peak Time\nSUMMARY: louder', recipe);
  assert.equal(r.title, 'Peak Time');
  assert.equal(r.type, 'drop');
  assert.match(r.code, /^stack\(/);
});

test('variation accepts Gemini JSON too', () => {
  const recipe = { type: 'breakdown', title: 'Breakdown', description: 'sparse' };
  const r = parseVariationResult(JSON.stringify({ code: 'stack(s("hh*8"))', title: 'Air', summary: 's' }), recipe);
  assert.equal(r.title, 'Air');
  assert.equal(r.type, 'breakdown');
});

// ---------------------------------------------------------------------------
// Token parser — the click-to-edit feature must never corrupt code
// ---------------------------------------------------------------------------

const CHAIN = 'note("a1").s("sawtooth").lpf(1400).decay(0.3).gain(0.85)';

test('removing an effect does not cut into a decimal literal', () => {
  // Regression: removal scanned back with lastIndexOf('.'), which landed on the
  // '.' inside 0.3 and produced `...decay(0` — unbalanced and unrunnable.
  const { allTokens } = parseStrudelCodeToTokens(CHAIN);
  const gain = allTokens.find((t) => t.type === 'method' && t.value === 'gain');
  assert.ok(gain, 'no .gain token parsed');
  const out = removeBlockInCode(CHAIN, gain!);
  assert.equal(out, 'note("a1").s("sawtooth").lpf(1400).decay(0.3)');
  assert.equal((out.match(/\(/g) || []).length, (out.match(/\)/g) || []).length, 'unbalanced parens');
});

test('removing a middle effect keeps the rest intact', () => {
  const { allTokens } = parseStrudelCodeToTokens(CHAIN);
  const lpf = allTokens.find((t) => t.type === 'method' && t.value === 'lpf');
  const out = removeBlockInCode(CHAIN, lpf!);
  assert.equal(out, 'note("a1").s("sawtooth").decay(0.3).gain(0.85)');
});

test('nested calls in an effect argument are captured whole', () => {
  // Regression: /\.(\w+)\(([^)]*)\)/ could not cross a nested ')', so it
  // captured `.lpf(sine.range(400, 3200)` and produced a broken param token.
  const code = 'note("c2").lpf(sine.range(400, 3200)).gain(0.8)';
  const { allTokens } = parseStrudelCodeToTokens(code);
  const lpf = allTokens.find((t) => t.type === 'method' && t.value === 'lpf');
  assert.ok(lpf, 'no .lpf token parsed');
  assert.ok(lpf!.methodSpan, 'no methodSpan recorded');
  assert.equal(code.slice(lpf!.methodSpan!.start, lpf!.methodSpan!.end), '.lpf(sine.range(400, 3200))');
});

test('repeated tokens resolve to the right occurrence after an edit', () => {
  // Regression: the stale-index fallback used code.indexOf(raw), so clicking
  // the fourth `hh` edited the first one.
  const code = 's("hh hh hh hh")';
  const { allTokens } = parseStrudelCodeToTokens(code);
  const hats = allTokens.filter((t) => t.raw === 'hh');
  assert.equal(hats.length, 4, `expected 4 hh tokens, got ${hats.length}`);
  hats.forEach((t, i) => assert.equal(t.occurrence, i, `hh #${i} has occurrence ${t.occurrence}`));

  // Shift the buffer so exact indices no longer match, then re-locate.
  const shifted = '// a comment\n' + code;
  const last = hats[3];
  const range = findTokenExactRange(shifted, last);
  assert.equal(shifted.slice(range.start, range.end), 'hh');
  assert.equal(range.start, shifted.lastIndexOf('hh'), 'resolved to the wrong occurrence');
});

test('an unresolvable token yields a no-op range rather than a wrong edit', () => {
  const { allTokens } = parseStrudelCodeToTokens('s("bd*4")');
  const tok = { ...allTokens[0], raw: 'zzz-not-present', occurrence: 0 };
  const range = findTokenExactRange('s("bd*4")', tok as any);
  assert.equal(range.start, range.end, 'expected a zero-width range');
});

// ---------------------------------------------------------------------------
// Session trace — must never throw, since it runs after something went wrong
// ---------------------------------------------------------------------------

test('the trace records and formats without a browser', async () => {
  const { record, formatTrace, clearTrace, getEntries } = await import('../src/ai/sessionLog.ts');
  clearTrace();
  record('event', 'user', 'CLICK Generate');
  record('info', 'worker', 'prompt', 'stack(s("bd*4"))');
  record('error', 'ai', 'engine failed', new Error('boom'));
  assert.equal(getEntries().length, 3);

  // No location/navigator/caches here at all — it must still produce a trace.
  const text = await formatTrace();
  assert.match(text, /STRUDEL AI SESSION TRACE/);
  assert.match(text, /CLICK Generate/);
  assert.match(text, /engine failed/);
  assert.match(text, /ENVIRONMENT/);
  clearTrace();
});

test('the trace survives circular and oversized detail', async () => {
  const { record, formatTrace, clearTrace } = await import('../src/ai/sessionLog.ts');
  clearTrace();
  const circular: any = { name: 'loop' };
  circular.self = circular;
  record('info', 'test', 'circular', circular);
  record('info', 'test', 'huge', 'x'.repeat(50_000));
  const text = await formatTrace();
  assert.match(text, /circular/);
  assert.match(text, /truncated/);
  clearTrace();
});

// ---------------------------------------------------------------------------
// Prompts — we must not teach the model syntax we reject
// ---------------------------------------------------------------------------

test('every code sample inside the prompts is itself valid', () => {
  const prompt = buildCompactGeneratePrompt('dark techno', 'Techno', 'Intermediate', 130);
  const blocks = [...prompt.matchAll(/```strudel\n([\s\S]*?)```/g)].map((m) => m[1]);
  // The syntax card's bare example plus the fenced worked example.
  const bare = STRUDEL_SYNTAX_CARD.match(/(stack\([\s\S]*?\n\))/);
  if (bare) blocks.push(bare[1]);

  assert.ok(blocks.length >= 2, `expected at least 2 samples, found ${blocks.length}`);
  for (const block of blocks) {
    const v = validateStructure(block.trim());
    assert.equal(v.ok, true, `prompt sample is invalid (${v.error}):\n${block}`);
    // And it must be extractable by our own parser.
    assert.ok(extractCodeBlock(block), 'prompt sample is not extractable');
  }
});

test('prompt vocabulary lists match the engine exactly', () => {
  for (const d of DRUM_VOICES) {
    assert.ok(STRUDEL_SYNTAX_CARD.includes(d), `syntax card omits drum ${d}`);
  }
  for (const v of SYNTH_VOICES) {
    assert.ok(STRUDEL_SYNTAX_CARD.includes(v), `syntax card omits voice ${v}`);
  }
});

// ---------------------------------------------------------------------------
// Procedural composer — output must always be playable
// ---------------------------------------------------------------------------

const KNOWN_SYNTHS = new Set(['piano', 'rhodes', 'pluck', 'sawtooth', 'square', 'triangle', 'sine']);

test('every composed pattern passes validation', () => {
  for (const genre of PROCEDURAL_GENRES) {
    for (let i = 0; i < 25; i++) {
      const track = composeTrack(genre, undefined, i * 7919 + genre.length);
      const v = validateStructure(track.code);
      assert.equal(v.ok, true, `${genre} seed ${i}: ${v.error}\n${track.code}`);
    }
  }
});

test('composed patterns only use implemented sounds', () => {
  for (const genre of PROCEDURAL_GENRES) {
    for (let i = 0; i < 25; i++) {
      const { code } = composeTrack(genre, undefined, i * 104729 + genre.length);

      // Sample patterns: the boundary keeps `.s("sawtooth")` out of this match.
      for (const m of code.matchAll(/(?:^|[^.\w])s\("([^"]+)"\)/gm)) {
        for (const raw of m[1].split(/[\s,]+/)) {
          const name = raw.replace(/[[\]<>~?@*(){}0-9.,]/g, '').trim();
          if (name) assert.equal(isDrumName(name), true, `${genre}: unknown drum "${name}"`);
        }
      }

      // Instrument selectors must name a real synth voice.
      for (const m of code.matchAll(/\.s\("([^"]+)"\)/g)) {
        assert.ok(KNOWN_SYNTHS.has(m[1]), `${genre}: unknown synth "${m[1]}"`);
      }
    }
  }
});

test('the same seed reproduces the same track', () => {
  const a = composeTrack('lofi', undefined, 4242);
  const b = composeTrack('lofi', undefined, 4242);
  assert.equal(a.code, b.code);
  assert.equal(a.title, b.title);
});

test('composition actually varies (this is the point of the module)', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) seen.add(composeTrack('cyberpunk', undefined, i).code);
  // The old generator had two hardcoded cyberpunk patterns.
  assert.ok(seen.size >= 55, `only ${seen.size}/60 distinct patterns`);
});

test('an explicit tempo is honoured', () => {
  assert.equal(composeTrack('acid', 137, 1).bpm, 137);
});

// ---------------------------------------------------------------------------
// Regressions from the 2026-08-30 live session trace.
//
// Every string below is copied verbatim from what a model actually produced in
// front of a user. Three of them were shown to the user as a parse error; the
// rest reached "EVALUATED OK" and played silence.
// ---------------------------------------------------------------------------

test('comments are stripped without touching string contents', () => {
  const { code } = stripComments('s("a // b") // real comment');
  assert.equal(code.trim(), 's("a // b")');
});

test("an apostrophe inside a comment does not swallow the rest of the pattern", () => {
  // `balancedSlice` tracked quotes but not comments, so `don't` opened a
  // string literal that never closed.
  const got = extractCodeBlock('stack(\n  s("bd*4"), // don\'t change this\n  s("hh*8")\n)');
  assert.ok(got, 'nothing extracted');
  assert.ok(got!.includes('hh*8'), 'the pattern was truncated at the apostrophe');
  assert.ok(!got!.includes('//'), 'the comment survived');
});

test('Gemini one-liner whose closing bracket is inside a comment is recovered', () => {
  const raw =
    'stack(s("bd [~ sd] bd [sd sd]").gain(0.8), // TWEAK TIP: change bd to tom for a ' +
    'different kick texture. s("hh(5,8)*2").gain(0.5).pan(0.3), // TWEAK TIP: change 5 ' +
    'to 7 for a denser hi-hat pattern. note("c2 e2 f2 g2").s("rhodes").room(0.4)' +
    '.decay(0.5) // TWEAK TIP: change the notes to alter the chord progression.)';
  const got = extractCodeBlock(raw);
  assert.ok(got, 'the one-liner was not recovered');
  assert.ok(validateStructure(got!).ok, `still invalid: ${validateStructure(got!).error}`);
  assert.ok(got!.includes('hh(5,8)*2'), 'the middle layer was lost');
  assert.ok(got!.includes('c2 e2 f2 g2'), 'the last layer was lost');
});

test('bracket recovery does NOT rescue a genuinely truncated reply', () => {
  // The whole point of the constraint. A half-written pattern that looks
  // valid is worse than an honest failure.
  assert.equal(extractCodeBlock('stack(\n  s("bd*4"),\n  note("<c2 eb2 g'), null);
  assert.equal(
    extractCodeBlock('stack(\n  s("bd*4"), // kick\n  note("<c2 eb2 g'),
    null,
    'a comment earlier in the reply must not license closing the brackets',
  );
  assert.equal(extractCodeBlock('Sure! Here is a nice techno pattern for you.'), null);
});

test('the lenient strip only ends a comment at the next layer', () => {
  const { code } = stripCommentsLenient('s("bd*4"), // tip goes here s("hh*8")');
  assert.ok(code.includes('hh*8'), 'the following layer was discarded');
  assert.ok(!code.includes('tip goes here'), 'the comment text survived');
});

test('a synth voice used as a drum pattern is removed, not played silently', () => {
  // s("rhodes") is not a drum, so isDrumName() sends it down the melodic path,
  // noteToFrequency() fails its regex and the event is dropped. The engine
  // still counted the layer and reported "EVALUATED OK".
  const r = sanitizeGeneratedCode('stack(\n  s("bd*4"),\n  s("rhodes"),\n  s("sine")\n)');
  assert.ok(!r.code.includes('s("rhodes")'), 'the silent rhodes layer survived');
  assert.ok(!r.code.includes('s("sine")'), 'the silent sine layer survived');
  assert.ok(r.code.includes('s("bd*4")'), 'the real layer was removed');
  assert.equal(r.problems.length, 2);
  assert.ok(r.problems[0].includes('note('), 'the problem should say what to do instead');
});

test('a tweak that echoes its own instruction as a layer is removed', () => {
  const r = sanitizeGeneratedCode(
    'stack(\n  s("bd*4"),\n  s("transpose 1 octave up").s("sawtooth")\n)',
  );
  assert.ok(!r.code.includes('transpose'), 'the instruction text is still a layer');
  assert.ok(r.code.includes('bd*4'));
});

test('a bare number in s() does not count as a playable token', () => {
  // In this engine it reaches noteToFrequency as MIDI note 1 — 8.66 Hz.
  const r = sanitizeGeneratedCode('stack(\n  s("bd*4"),\n  s("1 2 3")\n)');
  assert.ok(!r.code.includes('"1 2 3"'));
});

test('non-numeric Euclid arguments are dropped, not passed to the transpiler', () => {
  // s("shaker(e,i)") came back to the user as `RangeError: Invalid array length`.
  const r = sanitizeGeneratedCode('stack(\n  s("bd*4"),\n  s("shaker(e,i)").pan(0.2)\n)');
  assert.ok(r.code.includes('s("shaker")'), `got: ${r.code}`);
  assert.ok(!r.code.includes('(e,i)'));
  assert.ok(validateStructure(r.code).ok);
});

test('real Euclid arguments are left alone', () => {
  const r = sanitizeGeneratedCode('stack(\n  s("bd(3,8)"),\n  s("hh(5,8,2)")\n)');
  assert.ok(r.code.includes('bd(3,8)'), 'a valid Euclid call was damaged');
  assert.ok(r.code.includes('hh(5,8,2)'), 'a three-argument Euclid call was damaged');
  assert.equal(r.repairs.length, 0);
});

test('a duplicated .s() selector is collapsed', () => {
  const r = sanitizeGeneratedCode('stack(\n  s("bd*4"),\n  note("c3").s("rhodes").s("rhodes")\n)');
  assert.equal((r.code.match(/\.s\(/g) || []).length, 1, `got: ${r.code}`);
});

test('a stray ".~" is removed', () => {
  const r = sanitizeGeneratedCode('stack(\n  s("bd*4").~ .lpf(800)\n)');
  assert.ok(!r.code.includes('.~'), `got: ${r.code}`);
  assert.ok(validateStructure(r.code).ok);
});

test('a dangling "." before an identifier is left as a chain, not guessed at', () => {
  // Deliberate. `.s()`, `.note()`, `.n()` and `.gain()` are all legal chained
  // methods, so `foo().` followed by an identifier cannot be told apart from a
  // layer that lost its comma. Reading it as a chain always yields valid,
  // audible code; guessing "layer" deleted a voice and a filter in one real
  // case and produced a syntax error in another.
  const raw = 'stack(\n  s("hh*8").pan(0.4).// tip\n  s("bd*4")\n)';
  const got = extractCodeBlock(raw);
  assert.ok(got, 'nothing extracted');
  const r = sanitizeGeneratedCode(got!);
  assert.ok(r.code.includes('pan(0.4).'), `the dot was dropped: ${r.code}`);
  assert.ok(validateStructure(r.code).ok);

  // `stack(` is the one name that is never a method, so it does get the comma.
  const s2 = sanitizeGeneratedCode('stack(\n  s("bd*4").\n  stack(s("hh*8"))\n)');
  assert.ok(s2.code.includes('s("bd*4"),'), `got: ${s2.code}`);
});

test('a quoted numeric effect argument is unquoted', () => {
  // .pan("0 1") is parsed as a note pattern and silences the layer.
  const r = sanitizeGeneratedCode('stack(\n  s("bd*4").pan("0 1")\n)');
  assert.ok(r.code.includes('.pan(0)'), `got: ${r.code}`);
});

test('a pattern whose every layer is silent is rejected outright', () => {
  const r = sanitizeGeneratedCode('stack(\n  s("rhodes"),\n  s("sine")\n)');
  assert.equal(r.allLayersDead, true);
  assert.throws(
    () => parseGeneratedTrack('```strudel\nstack(\n  s("rhodes"),\n  s("sine")\n)\n```'),
    AIParseError,
  );
});

test('a rest-only layer is intentional silence, not a dead layer', () => {
  const r = sanitizeGeneratedCode('stack(\n  s("bd*4"),\n  s("~ ~ ~ ~")\n)');
  assert.ok(r.code.includes('~ ~ ~ ~'), 'a deliberate rest layer was deleted');
});

test('a correct pattern passes through completely untouched', () => {
  const good = 'stack(\n  s("bd*4").gain(0.95),\n  s("~ cp ~ cp").gain(0.8),\n' +
    '  note("<c2 c2 eb2 g2>").s("sawtooth").lpf(900)\n)';
  const r = sanitizeGeneratedCode(good);
  assert.equal(r.code, good, 'the sanitiser rewrote valid code');
  assert.equal(r.repairs.length, 0);
  assert.equal(r.problems.length, 0);
});

test('prompt builders no longer embed the system prompt', () => {
  // Every engine has its own system channel and was receiving a second copy
  // inside the user turn.
  const task = buildGeneratePrompt('dark techno', 'Techno', 'Advanced', 130);
  assert.ok(!task.includes('You are Strudel AI'), 'the full system prompt is still embedded');
  assert.ok(task.includes('dark techno'));

  const compact = buildCompactGeneratePrompt('dark techno', 'Techno', 'Advanced', 130);
  assert.ok(
    !compact.includes('Strudel is a live-coding music language'),
    'the syntax card is still embedded in the compact task',
  );

  assert.ok(withSystemPrompt('TASK: x', 'compact').includes('Strudel is a live-coding'));
  assert.ok(withSystemPrompt('TASK: x', 'full').includes('You are Strudel AI'));
});

test('no prompt asks the model to write comments', () => {
  // prompts.ts used to require an inline "// TWEAK TIP:" on every layer. Every
  // hard parse failure in the session trace carried one.
  const all = [
    STRUDEL_SYSTEM_PROMPT,
    STRUDEL_SYNTAX_CARD,
    buildGeneratePrompt('x', 'y', 'Beginner', 120),
    buildCompactGeneratePrompt('x', 'y', 'Beginner', 120),
  ].join('\n');
  assert.ok(!/TWEAK TIP/.test(all), 'a prompt still asks for TWEAK TIP comments');
  assert.ok(/NEVER write comments|NEVER write a comment/.test(STRUDEL_SYSTEM_PROMPT));
  assert.ok(/NEVER write a comment/.test(STRUDEL_SYNTAX_CARD));
});

test('the validator rejects a non-numeric Euclid rhythm with a readable message', () => {
  const v = validateStructure('stack(s("bd*4"), s("shaker(e,i)"))');
  assert.equal(v.ok, false);
  assert.ok(/whole numbers/i.test(v.error!), `unhelpful message: ${v.error}`);
  // It must NOT be the raw engine exception the user was actually shown.
  assert.ok(!/invalid array length/i.test(v.error!));
});

test('the validator accepts every Euclid rhythm the presets and composer use', () => {
  for (const good of [
    'stack(s("bd(3,8)"))',
    'stack(s("hh(5,8,2)"))',
    'stack(s("bd(3,8)"), note("<c2 eb2>").s("sawtooth"))',
    'stack(s("bd*4, [~ cp]*2"))',
  ]) {
    const v = validateStructure(good);
    assert.equal(v.ok, true, `${good} -> ${v.error}`);
  }
});

test('patterns quoted into a prompt have their comments removed', () => {
  // The starter presets and the procedural composer both write
  // "// TWEAK TIP:" comments. Quoting them showed the model the exact
  // same-line comment form the system prompt forbids two paragraphs earlier.
  const withComments = 'stack(\n  s("bd*4"), // TWEAK TIP: try bd*8\n  s("hh*8")\n)';
  for (const built of [
    buildTweakPrompt(withComments, 'make it darker'),
    buildCompactTweakPrompt(withComments, 'make it darker'),
    buildFixPrompt(withComments, 'some error'),
    buildExplainPrompt(withComments),
  ]) {
    assert.ok(!built.includes('TWEAK TIP'), 'a comment was quoted back to the model');
    assert.ok(built.includes('bd*4'), 'the pattern itself was damaged');
  }
});

test('every starter preset survives the validator', () => {
  for (const preset of STARTER_PRESETS) {
    const v = validateStructure(preset.code);
    assert.equal(v.ok, true, `${preset.title}: ${v.error}`);
  }
});

// ---------------------------------------------------------------------------
// Streaming stop condition. Simulated character by character, because that is
// how the worker sees it and the bugs here are all off-by-a-few-characters.
// ---------------------------------------------------------------------------

/** Returns the text the worker would have when it decides to stop, or null. */
function streamUntilStop(full: string): string | null {
  for (let i = 1; i <= full.length; i++) {
    const partial = full.slice(0, i);
    if (completionIsDone(partial)) return partial;
  }
  return null;
}

const FENCE = '`' + '`' + '`';

test('an unfenced reply keeps its whole label block', () => {
  // The budget was 40 characters past the closing bracket, so this stopped at
  // "BPM: 1" and the parser accepted 1 as the tempo.
  const reply =
    'stack(\n  s("bd*4"),\n  s("hh*8")\n)\n' +
    'TITLE: Midnight Corridor of Iron\nBPM: 138\nGENRE: Techno\n' +
    'WHY: A driving four-on-the-floor with a dark C minor bass.\n';
  const stopped = streamUntilStop(reply);
  const seen = stopped ?? reply;
  assert.ok(seen.includes('BPM: 138'), `cut before the BPM: ${JSON.stringify(seen.slice(-60))}`);
  assert.ok(seen.includes('GENRE: Techno'), 'cut before the genre');
});

test('a truncated BPM is not accepted as a tempo', () => {
  const cut = 'stack(\n  s("bd*4")\n)\nTITLE: Iron Corridor\nBPM: 1';
  assert.equal(parseGeneratedTrack(cut, 'x', 'Techno', 120).bpm, 120, 'BPM 1 was accepted');
  // A real tempo still comes through.
  const whole = 'stack(\n  s("bd*4")\n)\nTITLE: Iron Corridor\nBPM: 138\n';
  assert.equal(parseGeneratedTrack(whole, 'x', 'Techno', 120).bpm, 138);
});

test('an unclosed code fence still stops generation', () => {
  // The most common small-model slip, and the case the early stop was written
  // for. It previously fell through every branch and never fired at all, so
  // these replies ran to the full token cap — 37 seconds in the session trace.
  const rambling =
    FENCE + 'strudel\nstack(\n  s("bd*4"),\n  s("hh*8")\n)\n' +
    'Now let me explain what I did here in a great deal of detail. '.repeat(12);
  const stopped = streamUntilStop(rambling);
  assert.ok(stopped, 'never stopped');
  // The pattern is ~55 chars, so stopping means LABEL_BUDGET past it and no
  // more — roughly 100 tokens instead of the 800-token cap it used to run to.
  assert.ok(stopped!.length < 500, `stopped too late: ${stopped!.length} chars`);
  assert.ok(stopped!.includes('s("hh*8")'), 'stopped before the pattern was complete');
});

test('generation stops when the model starts a second pattern', () => {
  const restart =
    'stack(\n  s("bd*4")\n)\nTITLE: One\n\nstack(\n  s("sd*4")\n)';
  const stopped = streamUntilStop(restart);
  assert.ok(stopped, 'never stopped');
  assert.ok(!stopped!.includes('sd*4'), 'let the second pattern through');
});

test('a complete fenced reply is not cut short', () => {
  const reply =
    FENCE + 'strudel\nstack(\n  s("bd*4"),\n  s("hh*8")\n)\n' + FENCE +
    '\nTITLE: Iron\nBPM: 130\nGENRE: Techno\nWHY: Driving and dark.\n';
  const stopped = streamUntilStop(reply);
  const seen = stopped ?? reply;
  assert.ok(seen.includes('BPM: 130'), 'cut before the BPM');
  assert.ok(seen.includes('WHY:'), 'cut before the explanation');
});

test('an incomplete pattern never stops generation', () => {
  assert.equal(completionIsDone('stack(\n  s("bd*4"),\n  note("<c2 eb2'), null);
  assert.equal(completionIsDone(FENCE + 'strudel\nstack(\n  s("bd*4"),'), null);
  assert.equal(completionIsDone('Sure! Let me write you a pattern.'), null);
});

test('no prompt shown to the user names a sound the engine cannot make', () => {
  // vocabulary.ts tells the model these names are unsupported, and then the
  // suggestion list handed it "303 sawtooth bassline" and "warm organ stabs"
  // to copy. Contradictory demonstration, same failure mode as the comments —
  // and the direct upstream cause of s("303") and s("sub bass") in the trace.
  const forbidden = /\b(cabasa|supersaw|marimba|vibraphone|organ|koto|808|909|303|glitch)\b/i;
  const offenders: string[] = [];
  for (const item of SUGGESTIONS_DATABASE) {
    if (forbidden.test(item.promptText)) offenders.push(`${item.id}: ${item.promptText}`);
  }
  for (const mod of QUICK_ADD_MODIFIERS) {
    if (forbidden.test(mod.snippet)) offenders.push(`modifier "${mod.label}": ${mod.snippet}`);
  }
  for (const p of INSPIRATION_PROMPTS) {
    if (forbidden.test(p)) offenders.push(`inspiration: ${p}`);
  }
  assert.equal(offenders.length, 0, `\n    ${offenders.join('\n    ')}`);
});

test('a tempo named in the prompt is found', () => {
  assert.equal(extractBpmFromPrompt('High-energy 138 BPM Acid Techno'), 138);
  assert.equal(extractBpmFromPrompt('Deep Amapiano groove at 113 BPM with log drums'), 113);
  assert.equal(extractBpmFromPrompt('make me something at 90 bpm'), 90);
  assert.equal(extractBpmFromPrompt('Fast jungle breakbeat 165bpm'), 165);
  assert.equal(extractBpmFromPrompt('bpm: 128'), 128);
});

test('a tempo is not invented from unrelated numbers', () => {
  assert.equal(extractBpmFromPrompt('Math Rock in 7/8 time'), null);
  assert.equal(extractBpmFromPrompt('with Euclidean (5,8) hi-hats'), null);
  assert.equal(extractBpmFromPrompt('minor 9th chord voicings'), null);
  assert.equal(extractBpmFromPrompt('at 5000 bpm'), null, 'out of musical range');
  assert.equal(extractBpmFromPrompt(''), null);
});

test('every suggestion that names a tempo in its title agrees with its prompt', () => {
  const mismatched: string[] = [];
  for (const item of SUGGESTIONS_DATABASE) {
    const inTitle = /\((\d{2,3}) BPM\)/.exec(item.title);
    if (!inTitle) continue;
    const fromText = extractBpmFromPrompt(item.promptText);
    if (fromText !== Number(inTitle[1])) {
      mismatched.push(`${item.id}: title says ${inTitle[1]}, prompt text gives ${fromText}`);
    }
  }
  assert.equal(mismatched.length, 0, `\n    ${mismatched.join('\n    ')}`);
});

test('"All Styles" is never quoted to the model as a genre', () => {
  const built = buildGeneratePrompt('deep amapiano', 'All Styles', 'Intermediate', 113);
  assert.ok(!built.includes('"All Styles"'), 'the UI label reached the prompt');
  assert.ok(/take it from the description/.test(built));
  // A real style still comes through.
  assert.ok(buildGeneratePrompt('x', 'Techno', 'Intermediate', 130).includes('"Techno"'));
});

test('a truncated Gemini JSON reply is rejected, not shipped as a fragment', () => {
  // jsonrepair closes the cut-off string and hands back well-formed JSON whose
  // `code` is half a pattern. extractCodeBlock correctly returns null for it —
  // and a `|| json.code.trim()` fallback used to ship the fragment anyway,
  // over the user's working pattern, reported as success.
  const cut =
    '{"code":"stack(\\n s(\\"bd*4\\"),\\n s(\\"hh*8\\").lpf(3000).gain(0.4",' +
    '"summary":"Updated.","title":"X","bpm":130,"genre":"Techno","explanation":"y"}';
  assert.throws(() => parseTweakResult(cut), AIParseError);
  assert.throws(() => parseGeneratedTrack(cut), AIParseError);
  assert.throws(
    () => parseVariationResult(cut, { type: 'drop', title: 'D', description: 'd' }),
    AIParseError,
  );

  // A complete JSON reply still works.
  const whole =
    '{"code":"stack(\\n s(\\"bd*4\\"),\\n s(\\"hh*8\\").gain(0.4)\\n)",' +
    '"summary":"Updated.","title":"X","bpm":130,"genre":"Techno","explanation":"y"}';
  assert.ok(parseTweakResult(whole).code.includes('hh*8'));
  assert.equal(parseGeneratedTrack(whole).bpm, 130);
});

test('a reply cut off mid-comment is not closed up and passed off as complete', () => {
  // The model was writing a comment when it hit the cap, so the reply DOES end
  // inside one — but the comment has no bracket in it, and the premise of the
  // recovery is that a comment ate a bracket. Without that check the user lost
  // the very layer they had asked for, with no error.
  const cut =
    'stack(\n  s("bd*4").gain(0.95),\n  s("~ cp ~ cp"),\n' +
    '  s("hh(7,16)").gain(0.55) // now add the sub bass under';
  assert.throws(() => parseTweakResult(cut), AIParseError);

  // The case it exists for still recovers.
  const genuine = 'stack(s("bd*4").gain(0.8), // tip one. s("hh(5,8)").gain(0.5) // tip two.)';
  assert.ok(parseTweakResult(genuine).code.includes('hh(5,8)'));
});

test('a multi-line method chain is never rewritten', () => {
  // The indentation heuristic that used to live here deleted a layer's voice
  // and filter in one case and produced `Unexpected token (3:2)` in another —
  // the same error string it was written to remove.
  for (const chain of [
    'stack(\n  note("c2 e2").\n  s("sawtooth").\n  lpf(1200),\n  s("bd*4")\n)',
    'stack(\n  note("c2 e2").\n    s("sawtooth").\n    lpf(1200),\n  s("bd*4")\n)',
    'stack(\n  s("bd*4").\n  gain(0.8),\n  s("hh*8")\n)',
    'stack(\n  s("hh*8").pan(0.4).\n  s("perc*2"),\n  s("bd*4")\n)',
  ]) {
    const r = sanitizeGeneratedCode(chain);
    assert.equal(r.code, chain, `rewrote a legal chain:\n${r.code}`);
    assert.ok(validateStructure(r.code).ok);
  }
});

test('a stray "." before a bracket is still removed', () => {
  const r = sanitizeGeneratedCode('stack(\n  s("bd*4").\n)');
  assert.ok(!/\.\s*\n/.test(r.code), `got: ${r.code}`);
  assert.ok(validateStructure(r.code).ok);
});

test('a unit is not read as a tempo', () => {
  // `(\d+)\s*(?!percent)` backtracks \s* to zero width and succeeds, so the
  // exclusion never fired: "the reverb at 60 percent" moved the BPM slider.
  assert.equal(extractBpmFromPrompt('the reverb at 60 percent'), null);
  assert.equal(extractBpmFromPrompt('a kick at 100 percent gain'), null);
  assert.equal(extractBpmFromPrompt('a breakdown at 64 steps in'), null);
  assert.equal(extractBpmFromPrompt('a delay at 250 ms'), null);
  assert.equal(extractBpmFromPrompt('filter at 80 %'), null);
  // A bare tempo still reads.
  assert.equal(extractBpmFromPrompt('Math Rock at 130 in 7/8'), 130);
});

// ---------------------------------------------------------------------------
// The truncation invariant.
//
// For every prefix of a complete reply, parsing must either return exactly the
// code the whole reply gives, or throw. Anything else means a cut-off answer
// was accepted as a finished one — which reaches the user as their working
// pattern being overwritten by a fragment, reported as success.
//
// Three separate rounds of review each found a hole in this by hand. Checking
// every prefix of every shape catches the next one automatically.
// ---------------------------------------------------------------------------

test('no prefix of a reply is ever accepted as a different, complete pattern', () => {
  const F = '`' + '`' + '`';
  const PATTERN = 'stack(\n  s("bd*4").gain(0.95),\n  s("~ cp ~ cp"),\n  s("hh(7,16)").gain(0.55)\n)';
  const ONE_LINE = 'stack(s("bd*4").gain(0.8), s("hh(5,8)").gain(0.5), s("cp*2"))';

  const shapes: Array<[string, string]> = [
    ['fenced', `${F}strudel\n${PATTERN}\n${F}\nSUMMARY: done.`],
    ['fenced, no tag', `${F}\n${PATTERN}\n${F}\nSUMMARY: done.`],
    ['unfenced', `${PATTERN}\nSUMMARY: done.`],
    ['prose then fence', `Sure! Here you go.\n${F}strudel\n${PATTERN}\n${F}\nSUMMARY: done.`],
    ['unterminated fence', `${F}strudel\n${PATTERN}\nSUMMARY: done.`],
    ['CRLF', `${F}strudel\r\n${PATTERN.replace(/\n/g, '\r\n')}\r\n${F}\r\nSUMMARY: done.`],
    ['bare retry code', PATTERN],
    ['one line', ONE_LINE],
    ['comment on each layer', `stack(\n  s("bd*4"), // the kick (4 to the floor)\n  s("hh*8") // euclid (7,16) hats\n)`],
    ['one line + comments', 'stack(s("bd*4").gain(0.8), // tip one. s("hh(5,8)").gain(0.5) // tip two.)'],
    ['json', `{"code":${JSON.stringify(PATTERN)},"summary":"done","title":"A","bpm":130,"genre":"T","explanation":"e"}`],
    ['json in a fence', `${F}json\n{"code":${JSON.stringify(PATTERN)},"summary":"done","title":"A","bpm":130,"genre":"T","explanation":"e"}\n${F}`],
    ['json with prose', `Here it is:\n{"code":${JSON.stringify(PATTERN)},"summary":"done","title":"A","bpm":130,"genre":"T","explanation":"e"}\nDone.`],
  ];

  const recipe = { type: 'drop', title: 'D', description: 'd' };
  const parsers: Array<[string, (raw: string) => { code: string }]> = [
    ['parseTweakResult', parseTweakResult],
    ['parseGeneratedTrack', (raw) => parseGeneratedTrack(raw)],
    ['parseVariationResult', (raw) => parseVariationResult(raw, recipe)],
  ];

  const leaks: string[] = [];
  let checked = 0;
  let combos = 0;

  for (const [shapeName, full] of shapes) {
    for (const [parserName, parse] of parsers) {
      let whole: string;
      try {
        whole = parse(full).code;
        combos++;
      } catch (err: any) {
        leaks.push(`${shapeName} / ${parserName}: the COMPLETE reply was rejected (${err.message})`);
        continue;
      }
      for (let i = 1; i < full.length; i++) {
        checked++;
        let got: string;
        try {
          got = parse(full.slice(0, i)).code;
        } catch {
          continue; // rejecting a prefix is always correct
        }
        if (got !== whole) {
          leaks.push(
            `${shapeName} / ${parserName}: prefix of ${i} chars accepted as a different pattern\n` +
              `      cut at: ${JSON.stringify(full.slice(Math.max(0, i - 40), i))}\n` +
              `      gave:   ${JSON.stringify(got)}`,
          );
          break; // one report per shape/parser is enough
        }
      }
    }
  }

  // Guards against the test silently doing nothing if a shape stops parsing.
  assert.equal(leaks.length, 0, `\n    ${leaks.join('\n    ')}`);
  assert.equal(combos, shapes.length * parsers.length, 'a shape/parser pair did not run');
  assert.ok(checked > 4000, `only ${checked} prefixes checked`);
});

test('a comment may only close a bracket it did not open', () => {
  // "contains a )" was not a strong enough premise: `// euclid (7,16) hats`
  // has one, so a reply cut off while writing such a comment was closed up and
  // handed over as a finished edit.
  for (const cut of [
    'stack(s("bd*4").gain(0.8), // TIP: swap bd. s("hh(5,8)")',
    'stack(\n  s("bd*4"),\n  s("hh*8") // euclid (7,16) hats',
    'stack(s("bd*4"), s("~ cp"), // hats: euclid (7,16) then the sub, s("hh(7,16)").gain(0.55)',
  ]) {
    assert.throws(() => parseTweakResult(cut), AIParseError, `accepted: ${cut}`);
  }
  // The genuine swallowed bracket — unmatched inside the comment — still works.
  const genuine = 'stack(s("bd*4").gain(0.8), // tip one. s("hh(5,8)").gain(0.5) // tip two.)';
  assert.ok(parseTweakResult(genuine).code.includes('hh(5,8)'));
});

test('when a model echoes the pattern first, the ANSWER is taken', () => {
  // The tweak, fix and variation prompts all quote the current pattern in a
  // fenced block, and models restate it constantly. Taking the first block set
  // the editor to what it already said while the summary claimed an edit.
  const F = '`' + '`' + '`';
  const echoed =
    `The current pattern is:\n${F}strudel\nstack(\n  s("bd*4"),\n  s("hh*8")\n)\n${F}\n` +
    `Here is the updated one:\n${F}strudel\nstack(\n  s("bd*4").gain(0.95),\n  s("~ cp ~ cp")\n)\n${F}\n` +
    'SUMMARY: raised the hats.';
  const got = parseTweakResult(echoed).code;
  assert.ok(got.includes('~ cp ~ cp'), `took the echoed original: ${got}`);
});

test('a valid JSON reply survives prose around it', () => {
  // jsonrepair turns "Here is the JSON: {...} Done." into an ARRAY, which
  // parses — so the first-thing-that-parses rule returned the array, its
  // `.code` was undefined, and a working engine reported "did not return a
  // usable pattern".
  const prosey =
    'Here is the JSON:\n' +
    '{"code":"stack(\\n  s(\\"bd*4\\")\\n)","title":"A","bpm":138,"genre":"T",' +
    '"explanation":"e","summary":"s"}\nDone.';
  assert.ok(parseTweakResult(prosey).code.includes('bd*4'));
  assert.equal(parseGeneratedTrack(prosey).bpm, 138);
});

test('numbers from a pattern are clamped before they can reach Web Audio', () => {
  // Web Audio throws on what a text editor will happily produce, and the throw
  // lands in the scheduler where nothing catches it. `.slow(0)` gave Infinity,
  // which froze the tab outright; `.decay(0)` gave a zero-length buffer.
  // Non-finite takes the fallback rather than the bound: `.slow(0)` is 1/0,
  // and normal speed is a kinder reading of it than 16x.
  assert.equal(clamp(1 / 0, 1 / 16, 16, 1), 1, 'Infinity must not pass');
  assert.equal(clamp(-1 / 0, 1 / 16, 16, 1), 1);
  assert.equal(clamp(NaN, 1 / 16, 16, 1), 1, 'NaN must fall back');
  // A finite out-of-range value IS clamped, not discarded.
  assert.equal(clamp(1e9, 1 / 16, 16, 1), 16);
  assert.equal(clamp(-5, 0, 4, 0.8), 0);
  assert.equal(clamp(0, 0.01, 8, 0.4), 0.01, 'a zero decay must not reach createBuffer');
  // Ordinary values pass through untouched.
  assert.equal(clamp(0.8, 0, 4, 0.8), 0.8);
  assert.equal(clamp(-0.3, -1, 1, 0), -0.3);
  assert.equal(clamp(1200, 20, 20000, 12000), 1200);
});

// ---------------------------------------------------------------------------
// Rule-based variations.
//
// The old generator applied canned regexes and presented the result whether or
// not anything had changed — several of its transforms could not affect a real
// pattern at all, so a click produced confident titles over patterns identical
// to the one already playing.
// ---------------------------------------------------------------------------

const TECHNO = [
  'stack(',
  '  s("bd*4").gain(0.95),',
  '  s("~ cp ~ cp").gain(0.8),',
  '  s("hh*8").gain(0.55),',
  '  note("<c2 c2 eb2 g2>").s("sawtooth").lpf(900).decay(0.2).gain(0.9),',
  '  note("<[c3 eb3 g3] [ab2 c3 eb3]>").s("pluck").lpf(1800).room(0.3).gain(0.6)',
  ')',
].join('\n');

test('a variation is never identical to the pattern it varies', () => {
  for (let seed = 0; seed < 40; seed++) {
    for (const v of buildHeuristicVariations(TECHNO, 'Dynamic & Surprising', 4, seed)) {
      assert.notEqual(v.code.trim(), TECHNO.trim(), `seed ${seed}: "${v.title}" changed nothing`);
    }
  }
});

test('variations within one batch are distinct from each other', () => {
  for (let seed = 0; seed < 40; seed++) {
    const batch = buildHeuristicVariations(TECHNO, '', 4, seed);
    const codes = new Set(batch.map((v) => v.code.trim()));
    assert.equal(codes.size, batch.length, `seed ${seed} produced a duplicate`);
  }
});

test('every variation still parses', () => {
  for (let seed = 0; seed < 40; seed++) {
    for (const v of buildHeuristicVariations(TECHNO, '', 4, seed)) {
      const check = validateStructure(v.code);
      assert.ok(check.ok, `seed ${seed} "${v.title}": ${check.error}\n${v.code}`);
    }
  }
});

test('most variations are TINY — one layer, one parameter', () => {
  // The point of the rewrite. A variation that rewrites every layer is a
  // different pattern, not a variation of this one.
  const layersOf = (code: string) => splitPattern(code)?.layers ?? [];
  const original = layersOf(TECHNO);
  let tiny = 0;
  let total = 0;

  for (let seed = 0; seed < 40; seed++) {
    for (const v of buildHeuristicVariations(TECHNO, '', 4, seed)) {
      total++;
      const changed = layersOf(v.code);
      // A removed layer counts as one change too.
      const differing =
        changed.length !== original.length
          ? 1
          : changed.filter((l, i) => l.trim() !== original[i].trim()).length;
      if (differing <= 1) tiny++;
    }
  }
  assert.ok(total > 100, `only ${total} variations generated`);
  assert.ok(tiny / total >= 0.6, `only ${tiny}/${total} touched a single layer`);
});

test('repeated clicks do not keep offering the same thing', () => {
  const codes = new Set<string>();
  const titles = new Set<string>();
  for (let seed = 0; seed < 30; seed++) {
    for (const v of buildHeuristicVariations(TECHNO, 'Dynamic & Surprising', 4, seed)) {
      codes.add(v.code.trim());
      titles.add(v.title);
    }
  }
  assert.ok(codes.size >= 40, `only ${codes.size} distinct variations across 30 clicks`);
  assert.ok(titles.size >= 10, `only ${titles.size} distinct kinds of edit`);
});

test('a pattern with no stack() wrapper still varies', () => {
  const single = 's("bd*4").gain(0.9).lpf(2000)';
  const batch = buildHeuristicVariations(single, '', 4, 7);
  assert.ok(batch.length > 0, 'no variations for a single-layer pattern');
  for (const v of batch) {
    assert.notEqual(v.code.trim(), single);
    assert.ok(validateStructure(v.code).ok);
  }
});

test('an unparseable pattern yields nothing rather than nonsense', () => {
  assert.deepEqual(buildHeuristicVariations('', '', 4, 1), []);
  assert.deepEqual(buildHeuristicVariations('   ', '', 4, 1), []);
});

test('no variation reintroduces a quoted effect argument or a comment', () => {
  // Two of the old transforms did exactly this: `.pan("< -0.75 0.75 >")`,
  // which this engine ignores by design, and a `//` comment replacing a layer.
  for (let seed = 0; seed < 40; seed++) {
    for (const v of buildHeuristicVariations(TECHNO, '', 4, seed)) {
      assert.ok(!/\/\//.test(v.code), `"${v.title}" emitted a comment`);
      assert.ok(
        !/\.(gain|pan|lpf|hpf|room|delay|decay|fast|slow)\s*\(\s*["'`]/.test(v.code),
        `"${v.title}" emitted a quoted effect argument`,
      );
      assert.ok(!/delaytime/.test(v.code), `"${v.title}" used an unimplemented effect`);
    }
  }
});

test('the manager-facing entry point still returns variations', () => {
  const { variations } = suggestHeuristicVariations(TECHNO, 'Heavy Drops & Peak Energy');
  assert.ok(variations.length >= 3, `got ${variations.length}`);
  for (const v of variations) {
    assert.ok(v.title && v.description && v.code);
    assert.notEqual(v.code.trim(), TECHNO.trim());
  }
});

test('countChangedLayers measures what it says', () => {
  const two = 'stack(\n  s("bd*4"),\n  s("hh*8")\n)';
  assert.equal(countChangedLayers(two, two), 0);
  assert.equal(countChangedLayers(two, 'stack(\n  s("bd*4"),\n  s("hh*16")\n)'), 1);
  assert.equal(
    countChangedLayers(two, 'stack(\n  s("bd(3,8)"),\n  s("hh*16")\n)'),
    2,
    'both layers differ',
  );
  // A removed layer shifts the tail, which a positional diff would report as
  // everything having changed.
  assert.equal(countChangedLayers(two, 'stack(\n  s("bd*4")\n)'), 1, 'one layer removed');
  assert.equal(countChangedLayers(two, 'not a pattern at all'), Infinity);
});

test('the default mood only ever changes ONE layer', () => {
  // A DJ switches into a variation over the pattern already playing. If it has
  // rewritten every layer it is a different track, not a variation, and it is
  // useless mid-bar. The default mood is the conservative one.
  const layers = splitPattern(TECHNO)!.layers.length;
  assert.ok(layers >= 4, 'test pattern is too small to be meaningful');

  let checked = 0;
  for (let seed = 0; seed < 40; seed++) {
    for (const v of buildHeuristicVariations(TECHNO, 'Dynamic & Surprising', 4, seed)) {
      const touched = countChangedLayers(TECHNO, v.code);
      assert.equal(
        touched,
        1,
        `seed ${seed}: "${v.title}" changed ${touched} of ${layers} layers`,
      );
      checked++;
    }
  }
  assert.ok(checked > 100, `only ${checked} variations checked`);
});

test('a mood that names a big move still gets one', () => {
  // Conservative by default, but "Heavy Drops" is an explicit request.
  let sawBigMove = false;
  let batches = 0;
  for (let seed = 0; seed < 25; seed++) {
    const batch = buildHeuristicVariations(TECHNO, 'Heavy Drops & Peak Energy', 4, seed);
    if (batch.length === 0) continue;
    batches++;
    if (batch.some((v) => countChangedLayers(TECHNO, v.code) > 1)) sawBigMove = true;
    // ...and never more than one per batch.
    const big = batch.filter((v) => countChangedLayers(TECHNO, v.code) > 1).length;
    assert.ok(big <= 1, `seed ${seed} returned ${big} structural moves in one batch`);
  }
  assert.ok(batches > 0);
  assert.ok(sawBigMove, 'a mood that names a drop never produced one');
});

test('the AI variation prompts ask for one change, not a rewrite', () => {
  const pattern = 'stack(\n  s("bd*4"),\n  s("hh*8")\n)';
  for (const recipe of VARIATION_RECIPES) {
    const full = buildVariationPrompt(pattern, 'energetic', recipe.type, recipe.description);
    const compact = buildCompactVariationPrompt(pattern, recipe.type, recipe.description);
    assert.ok(/ONE/.test(full), `${recipe.type}: the full prompt does not insist on one change`);
    assert.ok(
      /identical/i.test(full),
      `${recipe.type}: the full prompt does not require the rest to be identical`,
    );
    assert.ok(/ONE change/.test(compact), `${recipe.type}: the compact prompt is not conservative`);
  }
  // The recipes themselves must not describe wholesale rewrites.
  const described = VARIATION_RECIPES.map((r) => r.description).join(' ');
  assert.ok(!/maximum drive|stripped back, atmospheric/.test(described));
});

test('an interrupted model download is explained, not quoted at the user', () => {
  // What a phone actually produced: "Local model (WebGPU) could not run —
  // Failed to execute 'add' on 'Cache': Cache.add() encountered a network
  // error". web-llm's Cache API path is `if (!cached) await cache.add(req)` —
  // one fetch, no retry — so any one of ~40 shards failing kills the lot.
  const raw = new Error(
    "Failed to execute 'add' on 'Cache': Cache.add() encountered a network error",
  );
  assert.ok(isTransientLoadError(raw), 'a Cache.add failure must be retryable');

  const message = describeLoadFailure(raw, 'Llama-3.2-1B-Instruct-q4f16_1-MLC');
  assert.ok(!/Cache\.add|execute 'add'/.test(message), `still DOM-speak: ${message}`);
  assert.ok(/interrupted/i.test(message), 'does not say what happened');
  assert.ok(/again/i.test(message), 'does not say the retry resumes');
});

test('load failures are classified so only retryable ones are retried', () => {
  for (const retryable of [
    "Failed to execute 'add' on 'Cache': Cache.add() encountered a network error",
    'Failed to fetch',
    'Load failed',
    'NetworkError when attempting to fetch resource.',
    'The operation timed out',
  ]) {
    assert.ok(isTransientLoadError(new Error(retryable)), `should retry: ${retryable}`);
  }
  for (const permanent of [
    'Device does not support shader-f16',
    'WebGPU is not available in this browser',
    'Cannot find adapter that matches the request',
  ]) {
    assert.ok(!isTransientLoadError(new Error(permanent)), `should NOT retry: ${permanent}`);
  }
});

test('a storage or device failure gets its own explanation', () => {
  const quota = describeLoadFailure(new Error('QuotaExceededError: storage full'), 'model-x');
  assert.ok(/storage/i.test(quota) && /smaller model|clear/i.test(quota));

  const device = describeLoadFailure(new Error('Device does not support shader-f16'), 'model-x');
  assert.ok(device.includes('model-x'), 'a device failure should name the model');
});

// ---------------------------------------------------------------------------

await runAll();

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error('  FAIL  ' + f);
  process.exit(1);
}
