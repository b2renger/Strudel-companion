const fs = require('fs');
const path = require('path');

function walkDir(dir) {
  fs.readdirSync(dir).forEach(file => {
    let fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;
      
      content = content.replace(/bg-\[\#fcfaf7\]/g, 'bg-white');
      content = content.replace(/bg-\[\#fbfaf8\]/g, 'bg-gray-50');
      content = content.replace(/bg-\[\#f9f8f6\]/g, 'bg-gray-100');
      
      // Canvas colors for PatternVisualizer
      content = content.replace(/'#fcfaf7'/g, "document.documentElement.classList.contains('dark') ? '#0a0a0a' : '#fcfaf7'");
      content = content.replace(/'#e6e2da'/g, "document.documentElement.classList.contains('dark') ? '#404040' : '#e6e2da'");
      content = content.replace(/'#dcd7ce'/g, "document.documentElement.classList.contains('dark') ? '#525252' : '#dcd7ce'");
      
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content);
      }
    }
  });
}

walkDir('./src');
console.log('Hexes replaced');
