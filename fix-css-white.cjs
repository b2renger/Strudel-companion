const fs = require('fs');

let css = fs.readFileSync('src/index.css', 'utf8');

// Remove white/black override from @theme
css = css.replace(/--color-white: var\(--color-white-override\);\n/g, '');
css = css.replace(/--color-black: var\(--color-black-override\);\n/g, '');

// Remove from :root and :root.dark
css = css.replace(/--color-white-override: #ffffff;\n/g, '');
css = css.replace(/--color-black-override: #000000;\n/g, '');
css = css.replace(/--color-white-override: #0a0a0a;\n/g, '');
css = css.replace(/--color-black-override: #ffffff;\n/g, '');

fs.writeFileSync('src/index.css', css);
console.log('Fixed CSS');
