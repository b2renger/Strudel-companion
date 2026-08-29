const fs = require('fs');

let tokenInspector = fs.readFileSync('src/components/TokenInspectorModal.tsx', 'utf8');
tokenInspector = tokenInspector.replace(/bg-\[\#0e0e12\]/g, 'bg-white');
tokenInspector = tokenInspector.replace(/bg-\[\#141419\]/g, 'bg-gray-50');
tokenInspector = tokenInspector.replace(/bg-\[\#070709\]/g, 'bg-gray-50');
tokenInspector = tokenInspector.replace(/bg-\[\#111116\]/g, 'bg-white');
tokenInspector = tokenInspector.replace(/bg-\[\#18181c\]/g, 'bg-gray-50');
fs.writeFileSync('src/components/TokenInspectorModal.tsx', tokenInspector);

let highlighter = fs.readFileSync('src/components/InteractiveCodeHighlighter.tsx', 'utf8');
highlighter = highlighter.replace(/bg-\[\#faeed9\]\/20 text-gray-900 border border-\[\#faeed9\]\/60 hover:bg-\[\#faeed9\]\/35 ring-1 ring-\[\#faeed9\]\/30/g, 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 ring-1 ring-indigo-200');
highlighter = highlighter.replace(/bg-\[\#ede0cc\]\/20 text-gray-800 border border-gray-200 hover:bg-\[\#ede0cc\]\/35 ring-1 ring-\[\#ede0cc\]\/20/g, 'bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 ring-1 ring-teal-200');
highlighter = highlighter.replace(/bg-\[\#f472b6\]\/20 text-\[\#f472b6\] border border-\[\#f472b6\]\/60 hover:bg-\[\#f472b6\]\/35 ring-1 ring-\[\#f472b6\]\/30/g, 'bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100 ring-1 ring-pink-200');
highlighter = highlighter.replace(/bg-gray-100 text-gray-600 border border-gray-300 hover:bg-\[\#34302b\]/g, 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200');
highlighter = highlighter.replace(/bg-\[\#f472b6\]\/20 text-\[\#f472b6\] border border-\[\#f472b6\]\/50 hover:bg-\[\#f472b6\]\/30/g, 'bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100');
highlighter = highlighter.replace(/bg-\[\#faeed9\]\/10 text-gray-900 border border-\[\#faeed9\]\/30 hover:bg-\[\#faeed9\]\/20/g, 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100');
highlighter = highlighter.replace(/hover:bg-\[\#faeed9\]\/\[0\.03\]/g, 'hover:bg-gray-50');
highlighter = highlighter.replace(/bg-\[\#faeed9\]\/40 border border-\[\#faeed9\]/g, 'bg-indigo-100 border border-indigo-300');
highlighter = highlighter.replace(/text-\[\#f472b6\]/g, 'text-pink-600');
highlighter = highlighter.replace(/bg-\[\#f472b6\]\/40 border border-\[\#f472b6\]/g, 'bg-pink-100 border border-pink-300');
fs.writeFileSync('src/components/InteractiveCodeHighlighter.tsx', highlighter);

let codeEditor = fs.readFileSync('src/components/CodeEditor.tsx', 'utf8');
codeEditor = codeEditor.replace(/bg-\[\#faeed9\]\/15 text-gray-900 border-\[\#faeed9\]\/40 hover:bg-\[\#faeed9\]\/25/g, 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100');
codeEditor = codeEditor.replace(/bg-\[\#faeed9\]\/20 text-gray-900 border-\[\#faeed9\]\/50 hover:bg-\[\#faeed9\]\/30/g, 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100');
fs.writeFileSync('src/components/CodeEditor.tsx', codeEditor);

let breakdown = fs.readFileSync('src/components/LineByLineBreakdown.tsx', 'utf8');
breakdown = breakdown.replace(/bg-\[\#ff79c6\]\/20 text-\[\#ff79c6\] border-\[\#ff79c6\]\/40/g, 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200');
fs.writeFileSync('src/components/LineByLineBreakdown.tsx', breakdown);

let preset = fs.readFileSync('src/components/PresetSelectorModal.tsx', 'utf8');
preset = preset.replace(/ring-\[\#f27d26\]\/30/g, 'ring-orange-200');
fs.writeFileSync('src/components/PresetSelectorModal.tsx', preset);

console.log('Stragglers fixed');
