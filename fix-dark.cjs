const fs = require('fs');

let css = fs.readFileSync('src/index.css', 'utf8');

css = css.replace(/:root\.dark \{[\s\S]*?\}/, `:root.dark {
  /* Dark mode (Inverted mapping) */
  --color-gray-50-override: #0a0a0a;
  --color-gray-100-override: #121212;
  --color-gray-200-override: #262626;
  --color-gray-300-override: #404040;
  --color-gray-400-override: #525252;
  --color-gray-500-override: #737373;
  --color-gray-600-override: #8c8c8c;
  --color-gray-700-override: #a3a3a3;
  --color-gray-800-override: #c2c2c2;
  --color-gray-900-override: #d4d4d4;
  --color-gray-950-override: #e5e5e5;
  
  --app-bg: #000000;
  --app-card-1: #0f0f0f;
  --app-card-2: #141414;
  --app-card-3: #1a1a1a;
  --app-border: #262626;
  --app-border-hover: #404040;
}`);

fs.writeFileSync('src/index.css', css);
console.log('Fixed dark theme colors');
