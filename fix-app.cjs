const fs = require('fs');

let app = fs.readFileSync('src/App.tsx', 'utf8');

// The main layout background is controlled by `bg-neutral-950 text-neutral-100` right now!
app = app.replace(
  /className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col selection:bg-amber-500\/30 selection:text-amber-200"/,
  'className="min-h-screen bg-[var(--app-bg)] text-gray-900 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-900"'
);

// We need to also add an initial theme setup in a script or in App mount to prevent flash, but for now we can just mount it.

fs.writeFileSync('src/App.tsx', app);
console.log('App updated');
