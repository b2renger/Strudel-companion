const fs = require('fs');
let file = fs.readFileSync('src/App.tsx', 'utf8');
file = file.replace(/'bg-orange-500 text-white shadow-sm'/, "'bg-cyan-500 text-white shadow-sm'");
fs.writeFileSync('src/App.tsx', file);
console.log('Patched App tab');
