const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(
  /class="bg-\[\#141312\] text-\[\#f4eee6\] font-sans antialiased overflow-x-hidden selection:bg-\[\#ff2a85\]\/30 selection:text-\[\#faeed9\]"/,
  'class="font-sans antialiased overflow-x-hidden"'
);

fs.writeFileSync('index.html', html);
console.log('Index updated');
