const fs = require('fs');

let file = fs.readFileSync('src/components/AIPromptBar.tsx', 'utf8');

// Update Intermediate color and Advanced color text
file = file.replace(/'bg-\[\#ede0cc\] text-black shadow-sm'/, "'bg-cyan-500 text-white shadow-sm'");
file = file.replace(/'bg-pink-500 text-gray-900 shadow-sm'/, "'bg-pink-500 text-white shadow-sm'");

// Update the dot color in the summary
file = file.replace(/'bg-\[\#ede0cc\] shadow-\[0_0_6px_\#ede0cc\]'/, "'bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.6)]'");

// Make the buttons wrap on mobile
file = file.replace(
  /<div className="flex items-center gap-2">\n\s*<button\n\s*type="button"\n\s*onClick=\{/,
  '<div className="flex flex-wrap items-center justify-end gap-2">\n          <button\n            type="button"\n            onClick={'
);

// Shorten the labels for mobile, or keep them and let it wrap.
// We'll change "Beginner" to "Beg", "Intermediate" to "Int", "Advanced" to "Adv" on mobile, full text on sm+
file = file.replace(
  /\{lvl\}\n\s*<\/button>/g,
  `{lvl === 'Beginner' ? <><span className="sm:hidden">Beg</span><span className="hidden sm:inline">Beginner</span></> : lvl === 'Intermediate' ? <><span className="sm:hidden">Int</span><span className="hidden sm:inline">Intermediate</span></> : <><span className="sm:hidden">Adv</span><span className="hidden sm:inline">Advanced</span></>}\n              </button>`
);

fs.writeFileSync('src/components/AIPromptBar.tsx', file);
console.log('Patched AIPromptBar');
