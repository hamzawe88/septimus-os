const fs = require('fs');
const files = [
  'frontend/src/components/layout/TopBar.tsx',
  'frontend/src/components/layout/SettingsModal.tsx',
  'frontend/src/components/layout/AttendanceModal.tsx',
  'frontend/src/components/huddles/HuddleWidget.tsx',
  'frontend/src/components/shared/DocumentUploadModal.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // 1. Change background to white in both modes
  content = content.replace(/dark:bg-\[#dfb2e5\]/g, 'dark:bg-white');
  
  // 2. Change various dark text colors to the sidebar color
  content = content.replace(/text-slate-900/g, 'text-[var(--sb-bg)]');
  content = content.replace(/dark:text-slate-100/g, 'dark:text-[var(--sb-bg)]');
  content = content.replace(/dark:text-white/g, 'dark:text-[var(--sb-bg)]');
  content = content.replace(/text-gray-900/g, 'text-[var(--sb-bg)]');
  content = content.replace(/dark:text-gray-100/g, 'dark:text-[var(--sb-bg)]');
  
  // 3. Change subtext/gray colors to a slightly transparent version of sidebar color
  content = content.replace(/text-slate-500/g, 'text-[var(--sb-bg)]/70');
  content = content.replace(/dark:text-slate-400/g, 'dark:text-[var(--sb-bg)]/70');
  content = content.replace(/text-slate-600/g, 'text-[var(--sb-bg)]/80');
  
  // 4. Icons colors: change indigo to sidebar color
  content = content.replace(/text-indigo-500/g, 'text-[var(--sb-bg)]');
  content = content.replace(/text-indigo-600/g, 'text-[var(--sb-bg)]');
  content = content.replace(/dark:text-indigo-400/g, 'dark:text-[var(--sb-bg)]');
  
  fs.writeFileSync(file, content);
}
console.log("Colors updated successfully.");
