const fs = require('fs');

let header = fs.readFileSync('src/components/StudioHeader.tsx', 'utf8');

// Remove transport buttons block
header = header.replace(
  /\{\/\* Transport Buttons \*\/\}\s*<div className="flex items-center gap-2 text-xs">[\s\S]*?<\/div>\s*\{\/\* Cycle status \*\/\}/,
  "{/* Cycle status */}"
);

// Remove tempo block
header = header.replace(
  /\{\/\* Tempo Box \*\/\}\s*<div className="flex flex-col">[\s\S]*?<\/div>\s*\{\/\* Scale \/ Key info \*\/\}/,
  "{/* Scale / Key info */}"
);

// We need to also remove onTogglePlay, onBpmChange, etc from props if they are unused, but for now it's fine if they just aren't used in the component, or we can leave them.
// Let's remove them from the UI.
fs.writeFileSync('src/components/StudioHeader.tsx', header);
console.log('Header patched');
