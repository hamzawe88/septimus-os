const fs = require('fs');
const file = 'frontend/src/components/layout/RightSidebar.tsx';

let content = fs.readFileSync(file, 'utf8');

// Replace text colors
content = content.replace(/text-gray-900/g, 'text-[var(--sb-bg)]');
content = content.replace(/text-gray-800/g, 'text-[var(--sb-bg)]');
content = content.replace(/text-gray-500/g, 'text-[var(--sb-bg)]/70');

// Backgrounds
content = content.replace(/bg-gray-50/g, 'bg-white');
content = content.replace(/bg-gray-100/g, 'bg-slate-50');

// Borders
content = content.replace(/border-gray-200/g, 'border-slate-200');
content = content.replace(/border-gray-100/g, 'border-slate-100');

// Primary colors (purple -> sidebar)
content = content.replace(/text-purple-600/g, 'text-[var(--sb-bg)]');
content = content.replace(/bg-purple-100/g, 'bg-slate-100');
content = content.replace(/bg-purple-600/g, 'bg-[var(--sb-bg)]');
content = content.replace(/bg-purple-400/g, 'bg-[var(--sb-bg)]/60');
content = content.replace(/focus:border-purple-500/g, 'focus:border-[var(--sb-bg)]');
content = content.replace(/focus:ring-purple-200/g, 'focus:ring-[var(--sb-bg)]/30');

// The sender bubble background
content = content.replace(/bg-blue-600/g, 'bg-[var(--sb-bg)]');

fs.writeFileSync(file, content);
console.log("RightSidebar colors updated.");
