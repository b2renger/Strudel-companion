const fs = require('fs');

// Patch StudioHeader
let header = fs.readFileSync('src/components/StudioHeader.tsx', 'utf8');

header = header.replace(
  /trackTitle = 'Algorithmic Session',\n\}\) => \{/,
  "trackTitle = 'Algorithmic Session',\n}) => {\n  const [isDark, setIsDark] = React.useState(false);\n  React.useEffect(() => {\n    setIsDark(document.documentElement.classList.contains('dark'));\n  }, []);\n  const toggleTheme = () => {\n    const next = !isDark;\n    setIsDark(next);\n    if (next) document.documentElement.classList.add('dark');\n    else document.documentElement.classList.remove('dark');\n  };\n"
);

header = header.replace(
  /<button\n\s*id="open-presets-btn"/,
  `<button
            onClick={toggleTheme}
            className="p-1.5 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 text-gray-700 hover:text-gray-900 transition-colors"
            title="Toggle Theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>\n          <button\n            id="open-presets-btn"`
);

// Fix text-black and text-gray-900 on buttons
header = header.replace(/text-black font-extrabold/g, "text-white dark:text-gray-900 font-extrabold");
header = header.replace(/'bg-pink-500 text-gray-900 /g, "'bg-pink-500 text-white ");

fs.writeFileSync('src/components/StudioHeader.tsx', header);

// Patch App.tsx (spacing + fixing black buttons)
let app = fs.readFileSync('src/App.tsx', 'utf8');

// Increase space
app = app.replace(/p-3 sm:p-4 flex flex-col gap-3/g, "p-4 sm:p-6 lg:p-8 flex flex-col gap-5 sm:gap-6");
app = app.replace(/gap-3 items-start/g, "gap-5 sm:gap-6 items-start");
app = app.replace(/gap-2/g, "gap-3");

// Fix black buttons
app = app.replace(/bg-cyan-500 text-black/g, "bg-cyan-500 text-white");
app = app.replace(/bg-orange-500 text-white shadow-sm/g, "bg-orange-500 text-white shadow-sm"); // already correct

fs.writeFileSync('src/App.tsx', app);

// Patch AIPromptBar.tsx
let promptBar = fs.readFileSync('src/components/AIPromptBar.tsx', 'utf8');
promptBar = promptBar.replace(/text-black hover:brightness-105/g, "text-white hover:brightness-105");
fs.writeFileSync('src/components/AIPromptBar.tsx', promptBar);

// Patch AILiveCopilot.tsx
let copilot = fs.readFileSync('src/components/AILiveCopilot.tsx', 'utf8');
copilot = copilot.replace(/text-black font-bold/g, "text-white font-bold");
fs.writeFileSync('src/components/AILiveCopilot.tsx', copilot);

// Patch InteractiveCodeHighlighter.tsx
let highlighter = fs.readFileSync('src/components/InteractiveCodeHighlighter.tsx', 'utf8');
highlighter = highlighter.replace(/text-black font-bold/g, "text-white font-bold");
fs.writeFileSync('src/components/InteractiveCodeHighlighter.tsx', highlighter);

// Patch CodeEditor.tsx
let editor = fs.readFileSync('src/components/CodeEditor.tsx', 'utf8');
editor = editor.replace(/text-black/g, "text-white");
fs.writeFileSync('src/components/CodeEditor.tsx', editor);

console.log('Patched');
