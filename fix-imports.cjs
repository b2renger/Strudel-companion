const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');

if (!app.includes('Play, Square, Music, Sparkles, Terminal, BookOpen, Layers')) {
  app = app.replace(
    /import \{ Music, Sparkles, Terminal, BookOpen, Layers \} from 'lucide-react';/,
    "import { Play, Square, Music, Sparkles, Terminal, BookOpen, Layers } from 'lucide-react';"
  );
  fs.writeFileSync('src/App.tsx', app);
}
console.log('Fixed imports');
