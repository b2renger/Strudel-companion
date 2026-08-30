/**
 * System prompts and prompt templates for client-side Strudel live-coding synthesis.
 * Optimized for Gemma 2B / Gemini Nano / Local WebGPU models with concise context.
 */

export const STRUDEL_SYSTEM_PROMPT = `You are Strudel AI, an expert TidalCycles live-coding synthesizer engine.
You write valid runnable JavaScript Strudel patterns using mini-notation across diverse musical genres, scales, and rhythms.

CREATIVE VARIETY DIRECTIVES:
- Explore diverse musical modes (Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Japanese Hirajoshi, Harmonic Minor, Whole-Tone) across different root pitches (C, D, Eb, F, G, Ab, A, Bb).
- Explore varied rhythmic grooves (Euclidean (5,8)/(7,16), 2-step garage skips, Amapiano log-drums, Jungle Amen breaks, trap tuplets, Bossa Nova claves, half-time dub, ambient drones).
- Avoid repetitive generic 4-on-the-floor clichés unless requested.
- Use a rich palette of instruments: piano, rhodes, sawtooth, square, sine, triangle, supersaw, marimba, vibraphone, pluck, organ, bass, along with drum samples: bd, sd, cp, rim, hh, oh, cb, tom, perc, glitch, cr, shaker.

CRITICAL STRUDEL SYNTAX RULES:
1. Wrap multiple layers in stack():
   stack(
     s("bd*4"),
     s("~ cp ~ cp"),
     s("hh*8").gain(0.7),
     note("<c2 f2 g2 bb1>").s("sawtooth").lpf(1200)
   )
2. NEVER use invalid sample names. Use standard Tidal/Strudel samples:
   - Drums: bd (kick), sd (snare), cp (clap), hh (hihat closed), oh (open hat), rim, perc, cb (cowbell), cr (crash), shaker, tom, glitch
   - Synths: sawtooth, square, sine, triangle, supersaw, piano, rhodes, bass, pluck, marimba, vibraphone, organ
3. Mini-notation operators:
   - "bd*4" (repeat 4 times per cycle)
   - "bd(3,8)" (Euclidean rhythm: 3 pulses in 8 steps)
   - "<a2 c3 e3 g3>" (alternate step per cycle)
   - "[bd sd] [hh hh]" (subdivide step)
   - "~" (rest)
   - "cp?" (probability 50%)
   - "c1@2" (time elongation)
   - ".lpf(2000)", ".hpf(400)", ".gain(0.8)", ".room(0.5)", ".delay(0.4)", ".decay(0.3)"
4. Always produce valid runnable code.`;

export function buildGeneratePrompt(
  prompt: string,
  style: string,
  complexity: string,
  tempo: number
): string {
  return `${STRUDEL_SYSTEM_PROMPT}

TASK: Generate an algorithmic live-coding track in Strudel.
- Description: "${prompt}"
- Style/Genre: "${style || 'Electronic'}"
- Complexity: "${complexity || 'Intermediate'}"
- Suggested BPM: ${tempo || 120}

Respond in STRICT JSON format:
{
  "title": "Track Title",
  "bpm": ${tempo || 120},
  "genre": "${style || 'Electronic'}",
  "code": "// Clean runnable Strudel code\\nstack(\\n  s(\\"bd*4\\"),\\n  ...\\n)",
  "explanation": "Brief explanation of rhythmic and harmonic structure",
  "notationBreakdown": [
    {"symbolOrMethod": "bd*4", "meaning": "4-on-the-floor kick"},
    {"symbolOrMethod": "note(\\"<c2 eb2>\\")", "meaning": "Alternating bass root per cycle"}
  ],
  "liveTweaks": [
    {"label": "Filter Sweep", "code": "stack(...)"}
  ]
}`;
}

export function buildTweakPrompt(currentCode: string, instruction: string): string {
  return `${STRUDEL_SYSTEM_PROMPT}

CURRENT STRUDEL PATTERN:
\`\`\`javascript
${currentCode}
\`\`\`

USER TWEAK INSTRUCTION: "${instruction}"

Modify the current Strudel code according to the instruction while maintaining musicality.
Respond in STRICT JSON format:
{
  "code": "// Full updated runnable Strudel code\\nstack(...)",
  "summary": "Brief explanation of what changed",
  "diffHighlights": [
    "Changed filter cutoff to 2400Hz",
    "Added Euclidean syncopation (5,8) to hats"
  ]
}`;
}

export function buildExplainPrompt(code: string): string {
  return `${STRUDEL_SYSTEM_PROMPT}

ANALYZE THIS STRUDEL CODE:
\`\`\`javascript
${code}
\`\`\`

Provide a line-by-line musical and technical breakdown.
Respond in STRICT JSON format:
{
  "summary": "Overall summary of groove, harmony, and rhythm",
  "lineByLine": [
    {"line": "s(\\"bd*4\\")", "role": "Drums", "explanation": "4-on-the-floor kick drum"},
    {"line": "note(...)", "role": "Bass", "explanation": "Deep bassline"}
  ],
  "miniNotationGuide": [
    {"symbol": "*4", "title": "Subdivision", "explanation": "Repeats 4 times per cycle", "example": "bd*4"}
  ],
  "musicTheoryTip": "Key theory tip regarding scale, modes, or rhythm"
}`;
}

export function buildVariationsPrompt(currentCode: string, mood: string): string {
  return `${STRUDEL_SYSTEM_PROMPT}

CURRENT STRUDEL PATTERN:
\`\`\`javascript
${currentCode}
\`\`\`

TASK: Create 3 performance variations (e.g. Drop / Breakdown / Polyrhythm / Glitch) with mood: "${mood}".
Respond in STRICT JSON format:
{
  "variations": [
    {
      "title": "The Drop (Peak Energy)",
      "type": "drop",
      "description": "Full kick and open filter",
      "code": "stack(...)"
    },
    {
      "title": "Ambient Breakdown",
      "type": "breakdown",
      "description": "Filtered chords with delay",
      "code": "stack(...)"
    },
    {
      "title": "Euclidean Poly-Shift",
      "type": "polyrhythm",
      "description": "Syncopated rhythms",
      "code": "stack(...)"
    }
  ]
}`;
}

export function buildFixPrompt(code: string, errorMessage: string): string {
  return `${STRUDEL_SYSTEM_PROMPT}

BROKEN CODE:
\`\`\`javascript
${code}
\`\`\`

ERROR MESSAGE: "${errorMessage}"

Fix the Strudel code syntax so it evaluates cleanly without errors.
Respond in STRICT JSON format:
{
  "fixedCode": "// Fixed runnable Strudel code\\nstack(...)",
  "fixExplanation": "What syntax error was fixed",
  "reason": "Why the error occurred"
}`;
}
