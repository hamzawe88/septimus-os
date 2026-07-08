import re
import os

def fix_file(filepath, replacements):
    with open(filepath, 'r') as f:
        content = f.read()
    
    for old, new in replacements:
        content = content.replace(old, new)
        
    with open(filepath, 'w') as f:
        f.write(content)

# page.tsx
fix_file('/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/app/page.tsx', [
    ('c.id || c.ID', 'c.ID'),
    ('c.name || c.Name', 'c.Name'),
    ('c.description || c.Description', 'c.Description'),
    ('messages.map((rawMsg: Record<string, unknown>) => {', 'messages.map((rawMsg: any) => {')
])

# Sidebar.tsx
fix_file('/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/layout/Sidebar.tsx', [
    ('import { Hash, Lock, Search, Settings, CheckSquare, ListTodo, Columns, Network, MessageSquare, MoreHorizontal } from "lucide-react";', 
     'import { Hash, Lock, Search, Settings, CheckSquare, ListTodo, Columns, Network, MessageSquare, MoreHorizontal } from "lucide-react";\nimport { apiGet } from "@/lib/apiClient";'),
    ('c.type === "PUBLIC"', 'c.Type === "PUBLIC"'),
    ('c.type === "PRIVATE"', 'c.Type === "PRIVATE"'),
    ('c.type === "DM"', 'c.Type === "DM"'),
    ('c.id ===', 'c.ID ==='),
    ('key={c.id}', 'key={c.ID}'),
    ('c.name', 'c.Name')
])

# ThreadsListSidebar.tsx
fix_file('/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/chat/ThreadsListSidebar.tsx', [
    ('id: String(i)', 'ID: String(i)')
])

# TopBar.tsx
fix_file('/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/layout/TopBar.tsx', [
    ('filter((n: Record<string, unknown>) => !n.isRead)', 'filter((n: any) => !n.isRead)')
])

# DynamicBoard.tsx
fix_file('/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/pm/DynamicBoard.tsx', [
    ('headers: { Authorization: `Bearer ${token}` }', 'headers: { Authorization: `Bearer ${localStorage.getItem("septimus_token")}` }')
])

# CommandMenu.tsx
fix_file('/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/shared/CommandMenu.tsx', [
    ('c.name', 'c.Name'),
    ('c.id', 'c.ID')
])

print("Fixed TS errors.")
