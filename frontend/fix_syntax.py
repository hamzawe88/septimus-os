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
    if os.path.exists(f):
        with open(f, 'r') as file:
            content = file.read()
        
        # Unterminated string literals often look like: className="some-class
        content = re.sub(r'(className="[^"]*)$', r'\1"', content, flags=re.MULTILINE)
        content = re.sub(r'(className=\'[^\']*)$', r"\1'", content, flags=re.MULTILINE)
        
        # Fix missing commas in object literals or arrays if obvious, but this is harder via regex.
        # It's better if I just print the lines around the errors for manual inspection.
        
        # For now, let's just print out the lines with errors so I can use sed/replace_file_content to fix them accurately.

