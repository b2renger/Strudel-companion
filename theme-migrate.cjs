const fs = require('fs');
const path = require('path');

const replaceMap = [
  // Canvases & specific hex codes
  [/['"]#0c0c0e['"]/g, "'#f6f4f0'"],
  [/['"]#141312['"]/g, "'#fcfaf7'"],
  [/['"]#282521['"]/g, "'#e6e2da'"],
  [/['"]#3d3832['"]/g, "'#dcd7ce'"],
  [/['"]#064e3b['"]/g, "'#d1fae5'"],
  [/['"]#00f5a0['"]/g, "'#059669'"], // emerald-600
  [/['"]#ff2a85['"]/g, "'#db2777'"], // pink-600
  [/['"]#faeed9['"]/g, "'#111827'"], // gray-900
  [/rgba\(0,\s*245,\s*160/g, 'rgba(5,150,105'],
  [/rgba\(255,\s*42,\s*133/g, 'rgba(219,39,119'],

  // Backgrounds
  [/bg-\[\#0c0c0e\]/g, 'bg-[#f6f4f0]'],
  [/bg-\[\#111114\]/g, 'bg-white'],
  [/bg-\[\#1c1b18\]/g, 'bg-white'],
  [/bg-\[\#191816\]/g, 'bg-[#fbfaf8]'],
  [/bg-\[\#141312\]/g, 'bg-[#fcfaf7]'],
  [/bg-\[\#252320\]/g, 'bg-gray-100'],
  [/bg-\[\#2a2723\]/g, 'bg-gray-100'],
  [/bg-\[\#34302a\]/g, 'bg-gray-200'],
  [/bg-\[\#38332d\]/g, 'bg-gray-200'],
  [/bg-\[\#4a443c\]/g, 'bg-gray-300'],
  [/bg-\[\#070708\]/g, 'bg-[#f9f8f6]'],
  [/bg-\[\#0e0e11\]/g, 'bg-[#f4f2ee]'],
  [/hover:bg-\[\#252320\]/g, 'hover:bg-gray-100'],
  [/hover:bg-\[\#34302a\]/g, 'hover:bg-gray-200'],
  [/hover:bg-\[\#38332d\]/g, 'hover:bg-gray-200'],
  
  [/bg-white\/5/g, 'bg-black/5'],
  [/bg-white\/10/g, 'bg-black/10'],
  [/bg-white\/15/g, 'bg-black/10'],
  [/bg-white\/20/g, 'bg-black/20'],
  [/hover:bg-white\/5/g, 'hover:bg-black/5'],
  [/hover:bg-white\/10/g, 'hover:bg-black/10'],
  [/hover:bg-white\/15/g, 'hover:bg-black/10'],

  // Borders
  [/border-\[\#e8decb\]\/[0-9]+/g, 'border-gray-200'],
  [/border-\[\#38332d\]/g, 'border-gray-200'],
  [/border-\[\#4a443c\]/g, 'border-gray-300'],
  [/border-\[\#ede0cc\]\/[0-9]+/g, 'border-gray-200'],
  [/border-white\/5/g, 'border-gray-100'],
  [/border-white\/10/g, 'border-gray-200'],
  [/border-white\/15/g, 'border-gray-200'],
  [/border-white\/20/g, 'border-gray-300'],
  [/divide-\[\#e8decb\]\/[0-9]+/g, 'divide-gray-200'],
  [/divide-white\/5/g, 'divide-gray-100'],
  [/divide-white\/10/g, 'divide-gray-200'],
  
  // Text colors
  [/text-\[\#faeed9\]/g, 'text-gray-900'],
  [/text-\[\#ede0cc\]/g, 'text-gray-800'],
  [/text-\[\#c5bcb0\]/g, 'text-gray-700'],
  [/text-\[\#a89f91\]/g, 'text-gray-600'],
  [/text-\[\#8c8375\]/g, 'text-gray-500'],
  [/text-\[\#736a5d\]/g, 'text-gray-500'],
  [/text-\[\#403c35\]/g, 'text-gray-400'],
  [/text-white/g, 'text-gray-900'],
  [/text-zinc-100/g, 'text-gray-900'],
  [/text-zinc-200/g, 'text-gray-800'],
  [/text-zinc-300/g, 'text-gray-700'],
  [/text-zinc-400/g, 'text-gray-600'],
  [/text-zinc-500/g, 'text-gray-500'],
  [/text-zinc-600/g, 'text-gray-400'],
  [/text-zinc-700/g, 'text-gray-400'],
  
  [/hover:text-\[\#faeed9\]/g, 'hover:text-gray-900'],
  [/hover:text-white/g, 'hover:text-gray-900'],

  // Accents Green
  [/text-\[\#00f5a0\]/g, 'text-emerald-600'],
  [/bg-\[\#00f5a0\]/g, 'bg-emerald-500'],
  [/border-\[\#00f5a0\]/g, 'border-emerald-500'],
  [/ring-\[\#00f5a0\]/g, 'ring-emerald-500'],
  [/from-\[\#00f5a0\]/g, 'from-emerald-500'],
  [/to-\[\#00f5a0\]/g, 'to-emerald-500'],
  [/hover:text-\[\#00f5a0\]/g, 'hover:text-emerald-600'],
  [/hover:border-\[\#00f5a0\]/g, 'hover:border-emerald-500'],
  
  // Accents Pink
  [/text-\[\#ff2a85\]/g, 'text-pink-600'],
  [/bg-\[\#ff2a85\]/g, 'bg-pink-500'],
  [/border-\[\#ff2a85\]/g, 'border-pink-500'],
  [/ring-\[\#ff2a85\]/g, 'ring-pink-500'],
  [/from-\[\#ff2a85\]/g, 'from-pink-500'],
  [/to-\[\#ff2a85\]/g, 'to-pink-500'],
  [/hover:text-\[\#ff2a85\]/g, 'hover:text-pink-600'],
  [/hover:border-\[\#ff2a85\]/g, 'hover:border-pink-500'],

  // Legacy fallback accents
  [/text-\[\#f27d26\]/g, 'text-orange-600'],
  [/bg-\[\#f27d26\]/g, 'bg-orange-500'],
  [/border-\[\#f27d26\]/g, 'border-orange-500'],
  
  [/text-\[\#22c55e\]/g, 'text-emerald-600'],
  [/bg-\[\#22c55e\]/g, 'bg-emerald-500'],
  [/border-\[\#22c55e\]/g, 'border-emerald-500'],
  
  [/text-\[\#8be9fd\]/g, 'text-indigo-600'],
  [/bg-\[\#8be9fd\]/g, 'bg-indigo-500'],
  [/border-\[\#8be9fd\]/g, 'border-indigo-500'],

  [/text-\[\#bd93f9\]/g, 'text-purple-600'],
  [/bg-\[\#bd93f9\]/g, 'bg-purple-500'],
  [/border-\[\#bd93f9\]/g, 'border-purple-500'],
  
  // Specific fix for editor caret and selection
  [/selection:bg-emerald-500\/30 selection:text-gray-900/g, 'selection:bg-emerald-500/30 selection:text-emerald-900'],
];

function walkDir(dir) {
  fs.readdirSync(dir).forEach(file => {
    let fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts') || fullPath.endsWith('.css') || fullPath.endsWith('.html')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;
      replaceMap.forEach(([regex, replacement]) => {
        content = content.replace(regex, replacement);
      });
      
      // Fixes for buttons that had dark text on light backgrounds that are now dark buttons
      content = content.replace(/bg-emerald-500 text-black/g, 'bg-emerald-500 text-white');
      content = content.replace(/bg-pink-500 text-black/g, 'bg-pink-500 text-white');
      content = content.replace(/bg-orange-500 text-black/g, 'bg-orange-500 text-white');
      content = content.replace(/bg-emerald-400 text-black/g, 'bg-emerald-500 text-white');
      
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content);
      }
    }
  });
}

walkDir('./src');
if (fs.existsSync('./index.html')) {
  let html = fs.readFileSync('./index.html', 'utf8');
  html = html.replace(/bg-\[\#0c0c0e\]/g, 'bg-[#f6f4f0]');
  fs.writeFileSync('./index.html', html);
}
console.log('Migration complete');
