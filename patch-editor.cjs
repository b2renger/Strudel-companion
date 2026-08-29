const fs = require('fs');

let file = fs.readFileSync('src/components/CodeEditor.tsx', 'utf8');

file = file.replace(/'bg-\[\#faeed9\] text-white shadow-sm'/g, "'bg-cyan-500 text-white shadow-sm'");
file = file.replace(/'bg-\[\#faeed9\] text-white'/g, "'bg-cyan-500 text-white'");
file = file.replace(/'bg-\[\#faeed9\]\/20 text-gray-900'/g, "'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400'");
file = file.replace(/hover:bg-\[\#faeed9\]\/20/g, "hover:bg-cyan-500/20");
file = file.replace(/border-\[\#faeed9\]\/30/g, "border-cyan-500/30");
file = file.replace(/border-\[\#faeed9\]\/40/g, "border-cyan-500/40");

// Also there is 'bg-pink-500 text-gray-900' that got changed to text-white earlier, let's make sure it's correct.
// Actually 'bg-pink-500 text-gray-900' is fine in light mode but text-white is better.
// In CodeEditor line 592: 'bg-pink-500 text-gray-900 shadow-sm' - wait earlier I replaced 'text-black' with 'text-white' globally, not 'text-gray-900'.
// Let's check:
console.log("Patched CodeEditor");
fs.writeFileSync('src/components/CodeEditor.tsx', file);
