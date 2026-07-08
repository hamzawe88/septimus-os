import re
import os

def fix_file(path, replacements):
    with open(path, 'r') as f:
        content = f.read()
    
    for old, new in replacements:
        content = re.sub(old, new, content)
        
    with open(path, 'w') as f:
        f.write(content)

# DynamicBoard.tsx
fix_file('/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/pm/DynamicBoard.tsx', [
    (r'Authorization: `Bearer \$\{token\}`', r'Authorization: `Bearer ${localStorage.getItem("septimus_token")}`')
])

# Sidebar.tsx
sidebar_path = '/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/layout/Sidebar.tsx'
with open(sidebar_path, 'r') as f:
    content = f.read()
if 'apiGet' not in content:
    content = content.replace('import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";', 'import { fetchWithAuth, API_BASE_URL, apiGet } from "@/lib/apiClient";')
content = re.sub(r'\bc\.id\b', 'c.ID', content)
content = re.sub(r'\bc\.name\b', 'c.Name', content)
content = re.sub(r'\bc\.type\b', 'c.Type', content)
with open(sidebar_path, 'w') as f:
    f.write(content)

# ThreadsListSidebar.tsx
threads_path = '/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/chat/ThreadsListSidebar.tsx'
with open(threads_path, 'r') as f:
    content = f.read()
content = re.sub(r'id: String\(i\)', 'ID: String(i)', content)
with open(threads_path, 'w') as f:
    f.write(content)

print("Fixed.")
