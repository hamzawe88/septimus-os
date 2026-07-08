const fs = require('fs');

// Sidebar.tsx
let sidebar = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
sidebar = sidebar.replace(/c\.id/g, 'c.ID');
sidebar = sidebar.replace(/c\.name/g, 'c.Name');
sidebar = sidebar.replace(/c\.type/g, 'c.Type');
if (!sidebar.includes('apiGet')) {
    sidebar = sidebar.replace('import { Lock, Hash', 'import { apiGet } from "@/lib/apiClient";\nimport { Lock, Hash');
}
fs.writeFileSync('src/components/layout/Sidebar.tsx', sidebar);

// ThreadsListSidebar.tsx
let threads = fs.readFileSync('src/components/chat/ThreadsListSidebar.tsx', 'utf8');
threads = threads.replace(/id: String/g, 'ID: String');
fs.writeFileSync('src/components/chat/ThreadsListSidebar.tsx', threads);

// DynamicBoard.tsx
let board = fs.readFileSync('src/components/pm/DynamicBoard.tsx', 'utf8');
board = board.replace(/\$\{token\}/g, '${localStorage.getItem("septimus_token")}');
fs.writeFileSync('src/components/pm/DynamicBoard.tsx', board);

console.log("Fixed with JS");
