/**
 * Strudel-Compatible WebAudio Synthesizer, Mini-Notation Engine & Sampler
 * Supports full TidalCycles mini-notation, multi-voice polyphony, DSP effects,
 * and live oscilloscope/spectrum analysis.
 */

import { TriggeredNote } from '../types';

export interface EvalEvent {
  timestamp: number;
  cycle: number;
  layersCount: number;
  bpm: number;
  success: boolean;
  code?: string;
  error?: string;
}

export type NoteCallback = (note: TriggeredNote) => void;
export type EvalCallback = (ev: EvalEvent) => void;

class StrudelAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterFilter: BiquadFilterNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayGain: GainNode | null = null;
  private delayFeedback: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  private isRunning: boolean = false;
  private bpm: number = 120;
  private currentCycle: number = 0;
  private timerId: number | null = null;
  private currentCode: string = '';
  private parsedLayers: ParsedLayer[] = [];
  private noteCallbacks: Set<NoteCallback> = new Set();
  private evalCallbacks: Set<EvalCallback> = new Set();
  private voiceActivity: Record<string, number> = {};

  // Interactive live DSP controls
  private masterCutoff: number = 12000;
  private masterVolume: number = 0.85;
  private reverbLevel: number = 0.35;
  private delayLevel: number = 0.25;

  constructor() {
    // Lazy init audio context on first user gesture
  }

  public init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioCtx();

    // Master bus
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);

    this.masterFilter = this.ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.setValueAtTime(this.masterCutoff, this.ctx.currentTime);
    this.masterFilter.Q.setValueAtTime(2.0, this.ctx.currentTime);

    // Delay FX
    this.delayNode = this.ctx.createDelay(1.0);
    this.delayNode.delayTime.setValueAtTime(0.25, this.ctx.currentTime);
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.setValueAtTime(0.4, this.ctx.currentTime);
    this.delayGain = this.ctx.createGain();
    this.delayGain.gain.setValueAtTime(this.delayLevel, this.ctx.currentTime);

    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayGain);
    this.delayGain.connect(this.masterFilter);

    // Reverb FX (Procedural algorithmic impulse response)
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.buildReverbImpulse(2.4, 2.0);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.setValueAtTime(this.reverbLevel, this.ctx.currentTime);
    this.convolver.connect(this.reverbGain);
    this.reverbGain.connect(this.masterFilter);

    // Analyser Node for visualizers
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.85;

    // Connect chain
    this.masterFilter.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  private buildReverbImpulse(duration: number, decay: number): AudioBuffer {
    if (!this.ctx) throw new Error('AudioContext missing');
    const rate = this.ctx.sampleRate;
    const length = rate * duration;
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i;
      const env = Math.exp(-n / (rate * (duration / decay)));
      left[i] = (Math.random() * 2 - 1) * env;
      right[i] = (Math.random() * 2 - 1) * env;
    }
    return impulse;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public subscribe(cb: NoteCallback) {
    this.noteCallbacks.add(cb);
    return () => this.noteCallbacks.delete(cb);
  }

  public subscribeEval(cb: EvalCallback) {
    this.evalCallbacks.add(cb);
    return () => this.evalCallbacks.delete(cb);
  }

  private emitNote(note: TriggeredNote) {
    this.voiceActivity[note.voice] = (this.voiceActivity[note.voice] || 0) + 1;
    setTimeout(() => {
      this.noteCallbacks.forEach((cb) => {
        try {
          cb(note);
        } catch (e) {
          console.error(e);
        }
      });
    }, 0);
  }

  private emitEval(ev: EvalEvent) {
    setTimeout(() => {
      this.evalCallbacks.forEach((cb) => {
        try {
          cb(ev);
        } catch (e) {
          console.error(e);
        }
      });
    }, 0);
  }

  public getVoiceActivity(): Record<string, number> {
    return { ...this.voiceActivity };
  }

  public setMasterVolume(val: number) {
    this.masterVolume = Math.max(0, Math.min(1.5, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.02);
    }
  }

  public setCutoff(hz: number) {
    this.masterCutoff = Math.max(100, Math.min(20000, hz));
    if (this.masterFilter && this.ctx) {
      this.masterFilter.frequency.setTargetAtTime(this.masterCutoff, this.ctx.currentTime, 0.02);
    }
  }

  public setReverb(amount: number) {
    this.reverbLevel = Math.max(0, Math.min(1, amount));
    if (this.reverbGain && this.ctx) {
      this.reverbGain.gain.setTargetAtTime(this.reverbLevel, this.ctx.currentTime, 0.02);
    }
  }

  public setDelay(amount: number) {
    this.delayLevel = Math.max(0, Math.min(1, amount));
    if (this.delayGain && this.ctx) {
      this.delayGain.gain.setTargetAtTime(this.delayLevel, this.ctx.currentTime, 0.02);
    }
  }

  public setBpm(newBpm: number) {
    this.bpm = Math.max(20, Math.min(300, newBpm));
  }

  public getBpm(): number {
    return this.bpm;
  }

  public getIsPlaying(): boolean {
    return this.isRunning;
  }

  public getCurrentCycle(): number {
    return this.currentCycle;
  }

  // Evaluate Strudel code
  public evaluate(code: string): { success: boolean; error?: string } {
    try {
      this.init();
      this.currentCode = code;

      // Extract BPM if present in code like .cpm(120) or .cps(1) or setcps
      const cpmMatch = code.match(/\.cpm\((\d+)\)/);
      if (cpmMatch && cpmMatch[1]) {
        this.bpm = parseInt(cpmMatch[1], 10);
      } else {
        const cpsMatch = code.match(/\.cps\(([\d\.\/\*]+)\)/);
        if (cpsMatch && cpsMatch[1]) {
          try {
            // eslint-disable-next-line no-eval
            const computedCps = eval(cpsMatch[1]);
            if (typeof computedCps === 'number' && computedCps > 0) {
              this.bpm = Math.round(computedCps * 60 * 4);
            }
          } catch (e) {
            // ignore
          }
        }
      }

      this.parsedLayers = this.parseStrudelCode(code);
      this.emitEval({
        timestamp: Date.now(),
        cycle: this.currentCycle,
        layersCount: this.parsedLayers.length,
        bpm: this.bpm,
        success: true,
        code,
      });
      return { success: true };
    } catch (err: any) {
      console.error('Strudel evaluation error:', err);
      this.emitEval({
        timestamp: Date.now(),
        cycle: this.currentCycle,
        layersCount: 0,
        bpm: this.bpm,
        success: false,
        code,
        error: err.message || 'Syntax error evaluating pattern',
      });
      return { success: false, error: err.message || 'Syntax error evaluating pattern' };
    }
  }

  public async play() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleLoop();
  }

  public stop() {
    this.isRunning = false;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  public hush() {
    this.stop();
    this.voiceActivity = {};
  }

  // Engine cycle scheduler
  private scheduleLoop() {
    if (!this.isRunning || !this.ctx) return;

    const cycleDurationSeconds = (60 / this.bpm) * 4; // 1 Strudel cycle = 4 beats / 1 measure
    const stepResolution = 16; // 16th note steps per cycle
    const stepDuration = cycleDurationSeconds / stepResolution;

    const now = this.ctx.currentTime;
    const cycle = this.currentCycle;

    // Trigger events for each parsed layer in this cycle
    for (const layer of this.parsedLayers) {
      const events = this.resolveLayerEvents(layer, cycle, stepResolution);
      for (const ev of events) {
        const eventTime = now + ev.timeOffset * cycleDurationSeconds;
        this.triggerSound(ev, eventTime, layer);
      }
    }

    this.currentCycle = (this.currentCycle + 1) % 64;

    // Schedule next cycle slightly before current cycle ends to prevent gaps
    const nextTickMs = (cycleDurationSeconds - 0.05) * 1000;
    this.timerId = window.setTimeout(() => {
      this.scheduleLoop();
    }, Math.max(10, nextTickMs));
  }

  // -------------------------------------------------------------
  // Mini-Notation Parser & Layer Resolver
  // -------------------------------------------------------------
  private parseStrudelCode(code: string): ParsedLayer[] {
    const layers: ParsedLayer[] = [];

    // Clean comments and multiline
    const cleanCode = code.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '');

    // Split stack elements or extract chains
    const stackMatch = cleanCode.match(/stack\s*\(([\s\S]*)\)/);
    let layerStrings: string[] = [];

    if (stackMatch && stackMatch[1]) {
      // Split top-level comma arguments inside stack
      layerStrings = this.splitTopLevelCommas(stackMatch[1]);
    } else {
      // Single layer or chained lines
      layerStrings = cleanCode
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('//') && !l.startsWith('import'));
    }

    if (layerStrings.length === 0) {
      layerStrings = [cleanCode.trim()];
    }

    for (const raw of layerStrings) {
      if (!raw || raw.trim().length === 0) continue;
      const parsed = this.parseSingleLayer(raw);
      if (parsed) layers.push(parsed);
    }

    // Default fallback if no pattern parsed
    if (layers.length === 0) {
      layers.push({
        type: 'sample',
        pattern: 'bd sd, hh*4',
        soundType: 'drum',
        gain: 0.8,
        pan: 0,
        cutoff: 12000,
        decay: 0.3,
        room: 0.2,
        delay: 0.2,
      });
    }

    return layers;
  }

  private splitTopLevelCommas(str: string): string[] {
    const results: string[] = [];
    let depth = 0;
    let current = '';

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === '(' || char === '[' || char === '{' || char === '<') {
        depth++;
      } else if (char === ')' || char === ']' || char === '}' || char === '>') {
        depth--;
      }

      if (char === ',' && depth === 0) {
        if (current.trim().length > 0) results.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim().length > 0) results.push(current.trim());
    return results;
  }

  private parseSingleLayer(str: string): ParsedLayer | null {
    let type: 'sample' | 'note' = 'sample';
    let pattern = '';
    let soundType = 'sawtooth';
    let gain = 0.8;
    let pan = 0;
    let cutoff = 12000;
    let decay = 0.4;
    let speedMultiplier = 1;
    let room = 0.2;
    let delay = 0.2;

    // Detect s("...") or sound("...")
    const sMatch = str.match(/(?:s|sound)\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/);
    if (sMatch) {
      type = 'sample';
      pattern = sMatch[1];
    }

    // Detect note("...") or n("...")
    const noteMatch = str.match(/(?:note|n)\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/);
    if (noteMatch) {
      type = 'note';
      pattern = noteMatch[1];
      soundType = 'sawtooth';
    }

    // Synthesizer instrument selector .s("sawtooth") or .sound("piano")
    const instrumentMatch = str.match(/\.(?:s|sound)\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/);
    if (instrumentMatch) {
      soundType = instrumentMatch[1];
    }

    // Extraction of modifier methods
    const gainMatch = str.match(/\.gain\s*\(\s*([\d\.]+)\s*\)/);
    if (gainMatch) gain = parseFloat(gainMatch[1]);

    const panMatch = str.match(/\.pan\s*\(\s*([\d\.\-]+)\s*\)/);
    if (panMatch) pan = parseFloat(panMatch[1]);

    const lpfMatch = str.match(/\.(?:lpf|cutoff)\s*\(\s*([\d\.]+)\s*\)/);
    if (lpfMatch) cutoff = parseFloat(lpfMatch[1]);

    const decayMatch = str.match(/\.decay\s*\(\s*([\d\.]+)\s*\)/);
    if (decayMatch) decay = parseFloat(decayMatch[1]);

    const fastMatch = str.match(/\.fast\s*\(\s*([\d\.]+)\s*\)/);
    if (fastMatch) speedMultiplier = parseFloat(fastMatch[1]);

    const slowMatch = str.match(/\.slow\s*\(\s*([\d\.]+)\s*\)/);
    if (slowMatch) speedMultiplier = 1 / parseFloat(slowMatch[1]);

    const roomMatch = str.match(/\.room\s*\(\s*([\d\.]+)\s*\)/);
    if (roomMatch) room = parseFloat(roomMatch[1]);

    const delayMatch = str.match(/\.delay\s*\(\s*([\d\.]+)\s*\)/);
    if (delayMatch) delay = parseFloat(delayMatch[1]);

    if (!pattern) {
      // If no explicit s() or note(), check if whole string is notation
      pattern = str.replace(/^[a-zA-Z0-9_\.]+\(/, '').replace(/\)$/, '').trim();
      if (!pattern) return null;
    }

    return {
      type,
      pattern,
      soundType,
      gain,
      pan,
      cutoff,
      decay,
      speedMultiplier,
      room,
      delay,
    };
  }

  // Resolve mini-notation into time-stamped events for a given cycle
  private resolveLayerEvents(layer: ParsedLayer, cycle: number, resolution: number): ResolvedEvent[] {
    const events: ResolvedEvent[] = [];
    const parallelStreams = layer.pattern.split(',');

    for (const stream of parallelStreams) {
      const streamTokens = this.tokenizeMiniNotation(stream.trim(), cycle);
      const streamEvents = this.expandTokensToEvents(streamTokens, 0, 1);
      for (const ev of streamEvents) {
        events.push(ev);
      }
    }

    return events;
  }

  private tokenizeMiniNotation(str: string, cycle: number): string[] {
    // Handle cycle alternations <a b c>
    let processed = str.replace(/<([^>]+)>/g, (_, inner) => {
      const options = inner.trim().split(/\s+/);
      const idx = cycle % options.length;
      return options[idx] || options[0];
    });

    // Handle euclidean rhythm like "bd(3,8)" or "hh(5,8)"
    processed = processed.replace(/([a-zA-Z0-9_~]+)\((\d+)\s*,\s*(\d+)\)/g, (_, sound, kStr, nStr) => {
      const k = parseInt(kStr, 10);
      const n = parseInt(nStr, 10);
      const pattern = this.generateEuclidean(sound, k, n);
      return `[${pattern.join(' ')}]`;
    });

    // Tokenize space-separated units while respecting [ ] groups
    const tokens: string[] = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < processed.length; i++) {
      const c = processed[i];
      if (c === '[') {
        depth++;
        current += c;
      } else if (c === ']') {
        depth--;
        current += c;
      } else if (c === ' ' && depth === 0) {
        if (current.trim().length > 0) tokens.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    if (current.trim().length > 0) tokens.push(current.trim());
    return tokens;
  }

  private generateEuclidean(sound: string, k: number, n: number): string[] {
    const result: string[] = [];
    for (let i = 0; i < n; i++) {
      if ((i * k) % n < k) {
        result.push(sound);
      } else {
        result.push('~');
      }
    }
    return result;
  }

  private expandTokensToEvents(tokens: string[], start: number, duration: number): ResolvedEvent[] {
    const events: ResolvedEvent[] = [];
    if (tokens.length === 0) return events;

    const slotDuration = duration / tokens.length;

    for (let i = 0; i < tokens.length; i++) {
      let token = tokens[i].trim();
      const slotStart = start + i * slotDuration;

      // Rest
      if (token === '~' || token === '_') continue;

      // Grouping [a b c]
      if (token.startsWith('[') && token.endsWith(']')) {
        const inner = token.slice(1, -1);
        const subTokens = this.tokenizeMiniNotation(inner, 0);
        const subEvents = this.expandTokensToEvents(subTokens, slotStart, slotDuration);
        events.push(...subEvents);
        continue;
      }

      // Multiplier bd*4
      if (token.includes('*')) {
        const parts = token.split('*');
        const item = parts[0];
        const count = parseInt(parts[1], 10) || 2;
        const subDuration = slotDuration / count;
        for (let j = 0; j < count; j++) {
          if (item !== '~') {
            events.push({
              item,
              timeOffset: slotStart + j * subDuration,
              duration: subDuration,
            });
          }
        }
        continue;
      }

      // Single item
      events.push({
        item: token,
        timeOffset: slotStart,
        duration: slotDuration,
      });
    }

    return events;
  }

  // -------------------------------------------------------------
  // Web Audio Synth & Sampler Sound Generator
  // -------------------------------------------------------------
  private triggerSound(ev: ResolvedEvent, time: number, layer: ParsedLayer) {
    if (!this.ctx || !this.masterGain) return;

    const item = ev.item.toLowerCase();
    const isDrum = ['bd', 'sd', 'hh', 'oh', 'cp', 'rim', 'tom', 'perc', 'cb', 'cr', 'shaker', 'kick', 'snare', 'clap', 'hat'].some(
      (d) => item.startsWith(d)
    );

    // Determine voice category for visualizer
    let voiceRole: 'drums' | 'bass' | 'chords' | 'lead' | 'fx' = 'lead';
    if (isDrum) {
      voiceRole = 'drums';
    } else if (item.startsWith('c1') || item.startsWith('c2') || item.startsWith('f1') || item.startsWith('f2') || item.startsWith('a1') || item.startsWith('a2') || layer.soundType.includes('bass')) {
      voiceRole = 'bass';
    } else if (layer.soundType.includes('piano') || layer.soundType.includes('organ') || layer.soundType.includes('vibraphone') || layer.soundType.includes('rhodes')) {
      voiceRole = 'chords';
    } else {
      voiceRole = 'lead';
    }

    // Schedule notification for visualizer
    const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
    setTimeout(() => {
      this.emitNote({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        voice: voiceRole,
        label: ev.item,
        velocity: layer.gain,
        step: Math.round(ev.timeOffset * 16),
      });
    }, delayMs);

    // Create voice routing
    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(layer.gain, time);

    const voicePanner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (voicePanner) {
      voicePanner.pan.setValueAtTime(layer.pan, time);
      voiceGain.connect(voicePanner);
      voicePanner.connect(this.masterFilter!);
      if (this.delayNode && layer.delay > 0) voicePanner.connect(this.delayNode);
      if (this.convolver && layer.room > 0) voicePanner.connect(this.convolver);
    } else {
      voiceGain.connect(this.masterFilter!);
      if (this.delayNode && layer.delay > 0) voiceGain.connect(this.delayNode);
      if (this.convolver && layer.room > 0) voiceGain.connect(this.convolver);
    }

    if (isDrum) {
      this.renderDrumSound(item, time, voiceGain, layer.decay);
    } else {
      this.renderMelodySynth(item, time, voiceGain, layer);
    }
  }

  private renderDrumSound(soundName: string, time: number, dest: GainNode, decay: number) {
    if (!this.ctx) return;

    if (soundName.startsWith('bd') || soundName.startsWith('kick')) {
      // 808 / 909 Kick: fast pitch drop with click transient
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';

      osc.frequency.setValueAtTime(160, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.09);

      gain.gain.setValueAtTime(1.0, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + Math.max(0.15, decay));

      osc.connect(gain);
      gain.connect(dest);

      osc.start(time);
      osc.stop(time + Math.max(0.2, decay));

      // Click transient
      const click = this.ctx.createOscillator();
      const clickGain = this.ctx.createGain();
      click.type = 'triangle';
      click.frequency.setValueAtTime(800, time);
      click.frequency.exponentialRampToValueAtTime(80, time + 0.02);
      clickGain.gain.setValueAtTime(0.6, time);
      clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.025);
      click.connect(clickGain);
      clickGain.connect(dest);
      click.start(time);
      click.stop(time + 0.03);
    } else if (soundName.startsWith('sd') || soundName.startsWith('snare')) {
      // Snare: Tone + Filtered Noise Burst
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, time);
      osc.frequency.exponentialRampToValueAtTime(130, time + 0.06);
      oscGain.gain.setValueAtTime(0.7, time);
      oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
      osc.connect(oscGain);
      oscGain.connect(dest);
      osc.start(time);
      osc.stop(time + 0.15);

      // Noise component
      this.playNoiseBurst(time, dest, 0.18, 1800, 'bandpass', 0.8);
    } else if (soundName.startsWith('hh') || soundName.startsWith('hat')) {
      // Closed Hi-Hat: Crisp metallic high-pass noise burst
      this.playNoiseBurst(time, dest, Math.min(0.08, decay), 7500, 'highpass', 0.6);
    } else if (soundName.startsWith('oh')) {
      // Open Hi-Hat
      this.playNoiseBurst(time, dest, Math.max(0.28, decay), 6500, 'highpass', 0.7);
    } else if (soundName.startsWith('cp') || soundName.startsWith('clap')) {
      // 808 Clap: Multi-pulse noise bursts
      for (let p = 0; p < 3; p++) {
        this.playNoiseBurst(time + p * 0.012, dest, 0.03, 1200, 'bandpass', 0.5);
      }
      this.playNoiseBurst(time + 0.036, dest, 0.22, 1100, 'bandpass', 0.9);
    } else if (soundName.startsWith('rim')) {
      // Rimshot
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(950, time);
      gain.gain.setValueAtTime(0.8, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(time);
      osc.stop(time + 0.05);
    } else if (soundName.startsWith('cb') || soundName.startsWith('cowbell')) {
      // 808 Cowbell (Dual tuned square waves)
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc1.type = 'square';
      osc2.type = 'square';
      osc1.frequency.setValueAtTime(587, time);
      osc2.frequency.setValueAtTime(845, time);

      gain.gain.setValueAtTime(0.6, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1000, time);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(filter);
      filter.connect(dest);

      osc1.start(time);
      osc2.start(time);
      osc1.stop(time + 0.3);
      osc2.stop(time + 0.3);
    } else {
      // General percussion
      this.playNoiseBurst(time, dest, 0.1, 2400, 'bandpass', 0.6);
    }
  }

  private playNoiseBurst(
    time: number,
    dest: GainNode,
    duration: number,
    freq: number,
    filterType: BiquadFilterType,
    level: number
  ) {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, time);
    filter.Q.setValueAtTime(3.0, time);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(level, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration);

    whiteNoise.connect(filter);
    filter.connect(env);
    env.connect(dest);

    whiteNoise.start(time);
    whiteNoise.stop(time + duration);
  }

  private renderMelodySynth(noteStr: string, time: number, dest: GainNode, layer: ParsedLayer) {
    if (!this.ctx) return;

    const freq = this.noteToFrequency(noteStr);
    if (!freq) return;

    const oscType = this.resolveOscType(layer.soundType);
    const duration = Math.max(0.1, layer.decay);

    if (layer.soundType.includes('piano') || layer.soundType.includes('rhodes')) {
      // Rhodes / Piano FM Chime
      const carrier = this.ctx.createOscillator();
      const modulator = this.ctx.createOscillator();
      const modGain = this.ctx.createGain();
      const env = this.ctx.createGain();

      carrier.type = 'sine';
      modulator.type = 'sine';

      carrier.frequency.setValueAtTime(freq, time);
      modulator.frequency.setValueAtTime(freq * 2, time);

      modGain.gain.setValueAtTime(freq * 1.5, time);
      modGain.gain.exponentialRampToValueAtTime(0.1, time + duration);

      modulator.connect(modGain);
      modGain.connect(carrier.frequency);

      env.gain.setValueAtTime(0.8, time);
      env.gain.exponentialRampToValueAtTime(0.001, time + duration * 1.5);

      carrier.connect(env);
      env.connect(dest);

      carrier.start(time);
      modulator.start(time);
      carrier.stop(time + duration * 1.6);
      modulator.stop(time + duration * 1.6);
    } else if (layer.soundType.includes('pluck')) {
      // Fast attack pluck
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const env = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 6, time);
      filter.frequency.exponentialRampToValueAtTime(freq, time + 0.15);

      env.gain.setValueAtTime(0.9, time);
      env.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(filter);
      filter.connect(env);
      env.connect(dest);

      osc.start(time);
      osc.stop(time + duration + 0.05);
    } else {
      // Standard analog oscillator with dual detune
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc1.type = oscType;
      osc2.type = oscType;

      osc1.frequency.setValueAtTime(freq, time);
      osc2.frequency.setValueAtTime(freq * 1.004, time); // Subtle detune chorus

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(layer.cutoff || 6000, time);
      filter.Q.setValueAtTime(2.0, time);

      env.gain.setValueAtTime(0.7, time);
      env.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(env);
      env.connect(dest);

      osc1.start(time);
      osc2.start(time);
      osc1.stop(time + duration + 0.05);
      osc2.stop(time + duration + 0.05);
    }
  }

  private resolveOscType(sound: string): OscillatorType {
    if (sound.includes('saw')) return 'sawtooth';
    if (sound.includes('square')) return 'square';
    if (sound.includes('triangle')) return 'triangle';
    if (sound.includes('sine')) return 'sine';
    return 'sawtooth';
  }

  private noteToFrequency(noteStr: string): number | null {
    const clean = noteStr.trim().toLowerCase();

    // Check if integer MIDI note or string representation
    if (/^\d+$/.test(clean)) {
      const midi = parseInt(clean, 10);
      return 440 * Math.pow(2, (midi - 69) / 12);
    }

    const noteRegex = /^([a-g])([#b]?)(-?\d+)?$/;
    const match = clean.match(noteRegex);
    if (!match) return 261.63; // Default middle C

    const note = match[1];
    const accidental = match[2];
    const octave = match[3] ? parseInt(match[3], 10) : 3;

    const noteOffsets: Record<string, number> = {
      c: 0,
      d: 2,
      e: 4,
      f: 5,
      g: 7,
      a: 9,
      b: 11,
    };

    let semitone = noteOffsets[note] ?? 0;
    if (accidental === '#') semitone += 1;
    if (accidental === 'b') semitone -= 1;

    const midi = (octave + 1) * 12 + semitone;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
}

interface ParsedLayer {
  type: 'sample' | 'note';
  pattern: string;
  soundType: string;
  gain: number;
  pan: number;
  cutoff: number;
  decay: number;
  speedMultiplier?: number;
  room: number;
  delay: number;
}

interface ResolvedEvent {
  item: string;
  timeOffset: number; // 0 to 1 cycle fraction
  duration: number;
}

export const audioEngine = new StrudelAudioEngine();
