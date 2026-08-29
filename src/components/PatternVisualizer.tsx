import React, { useEffect, useRef, useState } from 'react';
import { audioEngine, EvalEvent } from '../engine/audioEngine';
import { TriggeredNote } from '../types';
import { Activity, Disc, Cpu, Zap, CheckCircle2 } from 'lucide-react';

interface PatternVisualizerProps {
  isPlaying: boolean;
  bpm: number;
}

export const PatternVisualizer: React.FC<PatternVisualizerProps> = ({ isPlaying, bpm }) => {
  const oscCanvasRef = useRef<HTMLCanvasElement>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement>(null);

  const [activeNotes, setActiveNotes] = useState<TriggeredNote[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [voicePulses, setVoicePulses] = useState<Record<string, number>>({
    drums: 0,
    bass: 0,
    chords: 0,
    lead: 0,
    fx: 0,
  });

  // Eval visual synchronization feedback
  const [evalSyncPulse, setEvalSyncPulse] = useState<number>(0);
  const [lastEvalInfo, setLastEvalInfo] = useState<EvalEvent | null>(null);

  // Track triggered notes and eval events from audio engine
  useEffect(() => {
    const unsubNote = audioEngine.subscribe((note) => {
      setActiveNotes((prev) => [note, ...prev.slice(0, 5)]);
      setVoicePulses((prev) => ({
        ...prev,
        [note.voice]: Date.now(),
      }));
    });

    const unsubEval = audioEngine.subscribeEval((ev: EvalEvent) => {
      setLastEvalInfo(ev);
      if (ev.success) {
        setEvalSyncPulse(Date.now());
      }
    });

    return () => {
      unsubNote();
      unsubEval();
    };
  }, []);

  // Update step clock
  useEffect(() => {
    if (!isPlaying) return;
    const stepDuration = (60 / bpm) * 1000 / 4; // 16th note steps
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % 16);
    }, stepDuration);
    return () => clearInterval(interval);
  }, [isPlaying, bpm]);

  // Real-time canvas animation loop (Oscilloscope, Spectrum, Radar Clock)
  useEffect(() => {
    let animId: number;

    const render = () => {
      const analyser = audioEngine.getAnalyser();
      const isEvalFresh = Date.now() - evalSyncPulse < 1400;

      // 1. Oscilloscope Waveform
      if (oscCanvasRef.current) {
        const canvas = oscCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;

          ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#0f0f0f' : '#fcfaf7';
          ctx.fillRect(0, 0, width, height);

          // Subtle grid lines
          ctx.strokeStyle = isEvalFresh ? (document.documentElement.classList.contains('dark') ? '#064e3b' : '#d1fae5') : (document.documentElement.classList.contains('dark') ? '#404040' : '#e6e2da');
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, height / 2);
          ctx.lineTo(width, height / 2);
          ctx.stroke();

          if (analyser && isPlaying) {
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteTimeDomainData(dataArray);

            ctx.lineWidth = isEvalFresh ? 2.2 : 1.6;
            ctx.strokeStyle = isEvalFresh ? '#059669' : '#059669';
            ctx.shadowBlur = isEvalFresh ? 10 : 6;
            ctx.shadowColor = '#059669';

            ctx.beginPath();
            const sliceWidth = width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
              const v = dataArray[i] / 128.0;
              const y = (v * height) / 2;

              if (i === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
              x += sliceWidth;
            }

            ctx.lineTo(width, height / 2);
            ctx.stroke();
            ctx.shadowBlur = 0; // reset
          } else {
            // Idle resting wave
            ctx.lineWidth = 1;
            ctx.strokeStyle = isEvalFresh ? '#059669' : document.documentElement.classList.contains('dark') ? '#525252' : '#dcd7ce';
            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
            ctx.stroke();
          }
        }
      }

      // 2. Frequency Spectrum Bars (High Density)
      if (spectrumCanvasRef.current) {
        const canvas = spectrumCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;

          ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#0f0f0f' : '#fcfaf7';
          ctx.fillRect(0, 0, width, height);

          if (analyser && isPlaying) {
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteFrequencyData(dataArray);

            const barCount = 32;
            const barWidth = width / barCount - 1;

            for (let i = 0; i < barCount; i++) {
              const logIndex = Math.floor(Math.pow(i / barCount, 2) * (bufferLength / 4));
              const value = dataArray[logIndex] || 0;
              const percent = value / 255;
              const barHeight = Math.max(1, percent * height);

              const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
              if (isEvalFresh) {
                gradient.addColorStop(0, '#059669');
                gradient.addColorStop(0.6, '#111827');
                gradient.addColorStop(1, '#db2777');
              } else {
                gradient.addColorStop(0, '#059669');
                gradient.addColorStop(0.5, '#111827');
                gradient.addColorStop(1, '#db2777');
              }

              ctx.fillStyle = gradient;
              ctx.fillRect(i * (barWidth + 1), height - barHeight, barWidth, barHeight);
            }
          } else {
            const barCount = 32;
            const barWidth = width / barCount - 1;
            ctx.fillStyle = isEvalFresh ? (document.documentElement.classList.contains('dark') ? '#064e3b' : '#d1fae5') : (document.documentElement.classList.contains('dark') ? '#404040' : '#e6e2da');
            for (let i = 0; i < barCount; i++) {
              ctx.fillRect(i * (barWidth + 1), height - 2, barWidth, 2);
            }
          }
        }
      }

      // 3. Radar Tidal Clock with Buffer Swap Ripple
      if (radarCanvasRef.current) {
        const canvas = radarCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;
          const cx = width / 2;
          const cy = height / 2;
          const radius = Math.min(cx, cy) - 8;

          ctx.clearRect(0, 0, width, height);

          // Outer ring
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.strokeStyle = isEvalFresh ? '#059669' : document.documentElement.classList.contains('dark') ? '#525252' : '#dcd7ce';
          ctx.lineWidth = isEvalFresh ? 2.0 : 1.5;
          ctx.stroke();

          // If evaluated recently, draw an expanding ripple ring
          if (isEvalFresh) {
            const elapsed = Date.now() - evalSyncPulse;
            const rippleProgress = (elapsed % 700) / 700;
            const rippleR = radius * rippleProgress;
            ctx.beginPath();
            ctx.arc(cx, cy, rippleR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(5,150,105, ${1 - rippleProgress})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // 16 Step markers on circle
          for (let s = 0; s < 16; s++) {
            const angle = (s / 16) * Math.PI * 2 - Math.PI / 2;
            const x1 = cx + Math.cos(angle) * (radius - (s % 4 === 0 ? 6 : 3));
            const y1 = cy + Math.sin(angle) * (radius - (s % 4 === 0 ? 6 : 3));
            const x2 = cx + Math.cos(angle) * radius;
            const y2 = cy + Math.sin(angle) * radius;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = s % 4 === 0 ? (isEvalFresh ? '#059669' : '#db2777') : document.documentElement.classList.contains('dark') ? '#525252' : '#dcd7ce';
            ctx.lineWidth = s % 4 === 0 ? 1.5 : 1;
            ctx.stroke();
          }

          if (isPlaying) {
            const cycleDuration = (60 / bpm) * 4;
            const timeInCycle = (Date.now() / 1000) % cycleDuration;
            const progress = timeInCycle / cycleDuration;
            const handAngle = progress * Math.PI * 2 - Math.PI / 2;

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(handAngle) * radius, cy + Math.sin(handAngle) * radius);
            ctx.strokeStyle = isEvalFresh ? '#059669' : '#db2777';
            ctx.lineWidth = 2;
            ctx.shadowBlur = 6;
            ctx.shadowColor = isEvalFresh ? '#059669' : '#db2777';
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.beginPath();
            ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = isEvalFresh ? '#059669' : '#db2777';
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#a89f91';
            ctx.fill();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, bpm, evalSyncPulse]);

  const isVoiceActive = (voice: string) => {
    const lastTime = voicePulses[voice] || 0;
    return Date.now() - lastTime < 180;
  };

  const isEvalFresh = Date.now() - evalSyncPulse < 1600;

  return (
    <div
      className={`bg-[var(--app-card-1)] border rounded-xl p-3.5 flex flex-col gap-3 font-mono select-none transition-all duration-500 shadow-sm ${
        isEvalFresh
          ? 'border-emerald-500/80 shadow-[0_0_20px_rgba(5,150,105,0.25)] ring-1 ring-emerald-500/40'
          : 'border-gray-200'
      }`}
    >
      {/* Header bar with dynamic evaluation badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-sm transition-colors duration-300 ${
              isEvalFresh ? 'bg-emerald-500 animate-ping' : 'bg-pink-500'
            }`}
          />
          <span className="text-[10px] uppercase tracking-widest text-gray-900 font-bold">
            Real-Time Engine Visualizer
          </span>
        </div>

        <div className="flex items-center gap-3 text-[9px] text-gray-500 uppercase">
          {lastEvalInfo && lastEvalInfo.success && (
            <span
              className={`transition-all duration-300 font-bold flex items-center gap-1 ${
                isEvalFresh ? 'text-emerald-600 animate-pulse' : 'text-gray-600'
              }`}
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>{isEvalFresh ? 'Buffer Applied & Synced' : `${lastEvalInfo.layersCount} Layers Active`}</span>
            </span>
          )}
          <span className="text-gray-400">|</span>
          <span className="text-emerald-600 font-semibold">FFT: Active</span>
        </div>
      </div>

      {/* Visualizer Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 items-center">
        {/* Oscilloscope */}
        <div
          className={`bg-[var(--app-card-1)] rounded-lg p-2.5 border transition-colors duration-300 flex flex-col gap-1 ${
            isEvalFresh ? 'border-emerald-500/50' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between text-[9px] text-gray-600">
            <span className="flex items-center gap-1 uppercase font-semibold">
              <Zap className={`w-2.5 h-2.5 ${isEvalFresh ? 'text-emerald-600' : 'text-emerald-600'}`} /> Waveform
            </span>
            <span className="text-gray-500">{isEvalFresh ? 'Synced' : 'DSP Stream'}</span>
          </div>
          <canvas ref={oscCanvasRef} width={240} height={52} className="w-full h-13 rounded bg-[var(--app-card-1)]" />
        </div>

        {/* Frequency Spectrum */}
        <div
          className={`bg-[var(--app-card-1)] rounded-lg p-2.5 border transition-colors duration-300 flex flex-col gap-1 ${
            isEvalFresh ? 'border-emerald-500/50' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between text-[9px] text-gray-600">
            <span className="flex items-center gap-1 uppercase font-semibold">
              <Cpu className={`w-2.5 h-2.5 ${isEvalFresh ? 'text-emerald-600' : 'text-pink-600'}`} /> Spectrum (FFT)
            </span>
            <span className="text-gray-500">20Hz - 20kHz</span>
          </div>
          <canvas ref={spectrumCanvasRef} width={240} height={52} className="w-full h-13 rounded bg-[var(--app-card-1)]" />
        </div>

        {/* Circular Tidal Radar Clock & Step Matrix */}
        <div
          className={`bg-[var(--app-card-1)] rounded-lg p-2.5 border transition-colors duration-300 flex items-center justify-between gap-2 ${
            isEvalFresh ? 'border-emerald-500/50' : 'border-gray-200'
          }`}
        >
          <div className="flex flex-col gap-1">
            <div className="text-[9px] text-gray-900 flex items-center gap-1 uppercase font-bold">
              <Disc
                className={`w-3 h-3 ${
                  isPlaying
                    ? isEvalFresh
                      ? 'text-emerald-600 animate-spin'
                      : 'text-pink-600 animate-spin'
                    : 'text-gray-500'
                }`}
              />
              <span>Tidal Cycle</span>
            </div>
            <div className="text-[10px] text-gray-800 font-medium">
              {isPlaying ? `${bpm.toFixed(0)} BPM • 1c/4b` : 'Engine Stopped'}
            </div>
            {/* Step trigger bar */}
            <div className="flex items-center gap-0.5 mt-0.5">
              {Array.from({ length: 16 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-[1px] transition-all duration-75 ${
                    isPlaying && currentStep === i
                      ? isEvalFresh
                        ? 'bg-emerald-500 shadow-[0_0_6px_rgba(5,150,105,0.9)] scale-110'
                        : 'bg-pink-500 shadow-[0_0_6px_rgba(219,39,119,0.9)] scale-110'
                      : i % 4 === 0
                      ? 'bg-gray-300'
                      : 'bg-gray-100'
                  }`}
                />
              ))}
            </div>
          </div>
          <canvas ref={radarCanvasRef} width={60} height={60} className="w-15 h-15 shrink-0" />
        </div>
      </div>

      {/* Multi-Channel Activity Bus & Trigger Status */}
      <div className="grid grid-cols-5 gap-1.5 pt-1 border-t border-gray-200">
        {[
          { key: 'drums', label: 'Drums', color: 'bg-pink-500', text: 'text-pink-600' },
          { key: 'bass', label: 'Bass', color: 'bg-emerald-500', text: 'text-emerald-600' },
          { key: 'chords', label: 'Chords', color: 'bg-indigo-100', text: 'text-gray-900' },
          { key: 'lead', label: 'Melody', color: 'bg-[#f472b6]', text: 'text-[#f472b6]' },
          { key: 'fx', label: 'Texture', color: 'bg-[#67e8f9]', text: 'text-[#67e8f9]' },
        ].map((ch) => {
          const active = isVoiceActive(ch.key);
          return (
            <div
              key={ch.key}
              className={`p-1.5 rounded-md border transition-all flex items-center justify-between ${
                active ? 'bg-gray-100 border-gray-200 shadow-sm' : 'bg-[var(--app-card-1)] border-gray-200 opacity-60'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    active ? `${ch.color} shadow-[0_0_6px_currentColor] scale-125` : 'bg-[#403c35]'
                  }`}
                />
                <span className={`text-[10px] font-bold uppercase ${active ? ch.text : 'text-gray-500'}`}>
                  {ch.label}
                </span>
              </div>
              <span className="text-[8px] text-gray-500 uppercase hidden sm:inline font-semibold">
                {active ? 'TRIG' : 'IDLE'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
