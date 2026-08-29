const fs = require('fs');

let header = fs.readFileSync('src/components/StudioHeader.tsx', 'utf8');

if (!header.includes('toggleTheme')) {
  header = header.replace(
    /const \{ trackTitle \} = props;/,
    "const { trackTitle } = props;\n  const [isDark, setIsDark] = React.useState(false);\n  React.useEffect(() => {\n    if (document.documentElement.classList.contains('dark')) setIsDark(true);\n  }, []);\n  const toggleTheme = () => {\n    const next = !isDark;\n    setIsDark(next);\n    if (next) document.documentElement.classList.add('dark');\n    else document.documentElement.classList.remove('dark');\n  };\n"
  );
  
  header = header.replace(
    /import React from 'react';/,
    "import React from 'react';\nimport { Moon, Sun } from 'lucide-react';"
  );
  
  header = header.replace(
    /<button\n\s*onClick=\{onOpenPresets\}/,
    `<button
            onClick={toggleTheme}
            className="p-1.5 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 text-gray-700 hover:text-gray-900 transition-colors"
            title="Toggle Theme"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>\n          <button\n            onClick={onOpenPresets}`
  );
  
  fs.writeFileSync('src/components/StudioHeader.tsx', header);
  console.log('Header updated');
}
