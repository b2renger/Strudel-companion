const fs = require('fs');
const path = require('path');

function replaceTokens(content) {
  content = content.replace(/bg-pink-500\/15 text-pink-600 border-pink-500\/40 hover:bg-pink-500\/25/g, 'bg-pink-500/10 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 border-pink-500/30 hover:bg-pink-500/20');
  content = content.replace(/bg-emerald-500\/15 text-emerald-600 border-emerald-500\/40 hover:bg-emerald-500\/25/g, 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20');
  
  content = content.replace(/bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100/g, 'bg-gray-100 text-gray-900 border-gray-200 hover:bg-gray-200');
  
  content = content.replace(/bg-emerald-500\/20 text-emerald-600 border-emerald-500\/50 hover:bg-emerald-500\/30/g, 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20');
  content = content.replace(/bg-pink-500\/20 text-pink-600 border-pink-500\/50 hover:bg-pink-500\/30/g, 'bg-pink-500/10 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 border-pink-500/30 hover:bg-pink-500/20');
  
  // Highligher specific colors
  content = content.replace(/bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 ring-1 ring-teal-200/g, 'bg-gray-100 text-gray-900 border border-gray-200 hover:bg-gray-200 ring-1 ring-gray-200');
  content = content.replace(/bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 ring-1 ring-indigo-200/g, 'bg-gray-100 text-gray-900 border border-gray-200 hover:bg-gray-200 ring-1 ring-gray-200');
  content = content.replace(/bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100 ring-1 ring-pink-200/g, 'bg-pink-500/10 dark:bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500/30 hover:bg-pink-500/20 ring-1 ring-pink-500/30');
  
  return content;
}

['src/components/CodeEditor.tsx', 'src/components/InteractiveCodeHighlighter.tsx', 'src/components/TokenInspectorModal.tsx'].forEach(file => {
  if (fs.existsSync(file)) {
    fs.writeFileSync(file, replaceTokens(fs.readFileSync(file, 'utf8')));
  }
});
console.log('Tokens updated');
