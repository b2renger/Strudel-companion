const fs = require('fs');
const path = require('path');

function walkDir(dir) {
  fs.readdirSync(dir).forEach(file => {
    let fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('bg-white')) {
        // We use bg-gray-50 for panels, which in our theme is very light in light mode and dark in dark mode.
        content = content.replace(/bg-white/g, 'bg-[var(--app-card-1)]');
        fs.writeFileSync(fullPath, content);
      }
    }
  });
}
walkDir('src');
console.log('Fixed bg-white');
