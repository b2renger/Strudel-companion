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
import {
  parseStrudelCodeToTokens,
  findTokenExactRange,
  removeBlockInCode,
} from '../src/utils/strudelTokenParser.ts';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err: any) {
    failures.push(`${name}\n    ${err?.message?.split('\n')[0] ?? err}`);
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

test('truncated output is detected, not repaired', () => {
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

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error('  FAIL  ' + f);
  process.exit(1);
}
