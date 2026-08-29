const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');

// I need to insert the Transport & Tempo bar right after <main ...>
const insertionPoint = '<main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-5 sm:gap-6 font-mono">';
const transportBar = `
        {/* Transport & Tempo Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--app-card-1)] p-3 sm:p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={handleTogglePlay}
              className={\`px-4 py-2 rounded-lg text-sm font-bold font-mono flex items-center gap-2 transition-all shadow-sm active:scale-95 uppercase tracking-wide \${
                isPlaying
                  ? 'bg-pink-500 text-white shadow-[0_0_12px_rgba(219,39,119,0.4)] border border-pink-500'
                  : 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(5,150,105,0.35)] border border-emerald-500 hover:bg-emerald-500/90'
              }\`}
            >
              {isPlaying ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  <span>STOP</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>PLAY</span>
                </>
              )}
            </button>
            <button
              onClick={() => {
                if (isPlaying) handleTogglePlay();
                audioEngine.hush();
              }}
              className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 text-gray-700 hover:text-gray-900 text-sm font-mono flex items-center gap-1.5 transition-colors uppercase"
            >
              Hush
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Tempo</span>
            <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
              <input
                type="number"
                min={30}
                max={280}
                value={bpm}
                onChange={(e) => handleBpmChange(Number(e.target.value))}
                className="w-12 bg-transparent text-sm font-mono font-bold text-gray-900 text-right focus:outline-none focus:text-emerald-600"
              />
              <span className="text-[11px] text-pink-600 font-bold">BPM</span>
            </div>
          </div>
        </div>
`;

if (!app.includes('Transport & Tempo Bar')) {
  app = app.replace(insertionPoint, insertionPoint + transportBar);
  
  // Make sure App imports Play and Square from lucide-react if not already
  if (!app.includes('Play,') && !app.includes(' Play ')) {
    app = app.replace(/import \{ (.*) \} from 'lucide-react';/, "import { Play, Square, $1 } from 'lucide-react';");
  }

  fs.writeFileSync('src/App.tsx', app);
  console.log('App patched');
}
