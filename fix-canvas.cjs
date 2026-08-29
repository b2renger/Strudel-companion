const fs = require('fs');

let content = fs.readFileSync('src/components/PatternVisualizer.tsx', 'utf8');

content = content.replace(
  /isEvalFresh \? '#d1fae5' : '#e6e2da'/g,
  "isEvalFresh ? (document.documentElement.classList.contains('dark') ? '#064e3b' : '#d1fae5') : (document.documentElement.classList.contains('dark') ? '#404040' : '#e6e2da')"
);

content = content.replace(
  /isEvalFresh \? '#d1fae5' : document.documentElement.classList.contains\('dark'\) \? '#404040' : '#e6e2da'/g,
  "isEvalFresh ? (document.documentElement.classList.contains('dark') ? '#064e3b' : '#d1fae5') : (document.documentElement.classList.contains('dark') ? '#404040' : '#e6e2da')"
);

fs.writeFileSync('src/components/PatternVisualizer.tsx', content);
console.log('Canvas fixed');
