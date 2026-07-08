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
  
  // Replace the modal sidebar/input backgrounds to white
  content = content.replace(/bg-slate-50/g, 'bg-white');
  content = content.replace(/bg-gray-50/g, 'bg-white');
  
  content = content.replace(/dark:bg-slate-800\/80/g, 'dark:bg-white');
  content = content.replace(/dark:bg-slate-800\/50/g, 'dark:bg-white');
  
  // Replace hover dark mode to a light hover
  content = content.replace(/dark:hover:bg-slate-800/g, 'dark:hover:bg-slate-100');
  content = content.replace(/dark:hover:bg-slate-700/g, 'dark:hover:bg-slate-100');
  
  // Replace active tab dark mode to a light active
  content = content.replace(/dark:bg-slate-800/g, 'dark:bg-white');
  
  // Actually, for active tabs (bg-slate-200), we replaced its dark mode with dark:bg-white above, 
  // let's change bg-slate-200 dark:bg-white to bg-slate-100 dark:bg-slate-100 for tabs?
  // Let's just leave them as bg-slate-200 dark:bg-slate-200 so it's a gray highlight.
  content = content.replace(/bg-slate-200 dark:bg-white/g, 'bg-slate-100 dark:bg-slate-100');
  content = content.replace(/bg-slate-100 dark:bg-white/g, 'bg-slate-50 dark:bg-slate-50');

  // Fix borders so they are visible in dark mode
  content = content.replace(/dark:border-slate-700/g, 'dark:border-slate-200');
  content = content.replace(/dark:border-slate-800/g, 'dark:border-slate-200');
  content = content.replace(/dark:border-gray-800/g, 'dark:border-gray-200');

  fs.writeFileSync(file, content);
}
console.log("Gray backgrounds removed.");
