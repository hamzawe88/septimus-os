import re
import os

files_to_fix = [
    "src/components/org/OrgChartContainer.tsx",
    "src/components/reports/AiReport.tsx",
    "src/components/settings/AISettings.tsx",
    "src/components/settings/ApiKeysSettings.tsx",
    "src/components/settings/RolesSettings.tsx",
    "src/components/settings/WebhooksSettings.tsx",
    "src/components/shared/DocumentUploadModal.tsx",
    "src/components/shared/MessageInput.tsx",
    "src/components/shared/NewChannelModal.tsx",
    "src/components/shared/NewDmModal.tsx",
    "src/components/workdocs/KnowledgeBase.tsx",
    "src/components/workflow/WorkflowBuilder.tsx",
    "src/components/workflows/WorkflowBuilder.tsx"
]

for f in files_to_fix:
    if not os.path.exists(f):
        continue
    with open(f, 'r') as file:
        content = file.read()
    
    # Fix fetchWithAuth(`${API_BASE_URL}... ") -> fetchWithAuth(`${API_BASE_URL}... `)
    content = re.sub(r'(fetchWithAuth\(`\$\{API_BASE_URL\}[^`"]*)"\)', r'\1`)', content)
    content = re.sub(r'(fetchWithAuth\(`\$\{API_BASE_URL\}[^`"]*)",', r'\1`,', content)
    
    # Fix name: "My Visual Workflow`, -> name: "My Visual Workflow",
    content = re.sub(r'name: "My Visual Workflow`,', r'name: "My Visual Workflow",', content)
    
    # Fix workspaceId fallback ` -> "
    content = re.sub(r'\|\| "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e`;', r'|| "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";', content)

    # Write back
    with open(f, 'w') as file:
        file.write(content)

