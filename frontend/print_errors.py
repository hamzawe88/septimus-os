import sys

errors = [
    ("src/components/org/OrgChartContainer.tsx", 106),
    ("src/components/reports/AiReport.tsx", 70),
    ("src/components/settings/AISettings.tsx", 65),
    ("src/components/settings/ApiKeysSettings.tsx", 44),
    ("src/components/settings/RolesSettings.tsx", 42),
    ("src/components/settings/WebhooksSettings.tsx", 40),
    ("src/components/shared/DocumentUploadModal.tsx", 134),
    ("src/components/shared/MessageInput.tsx", 78),
    ("src/components/shared/NewChannelModal.tsx", 30),
    ("src/components/shared/NewDmModal.tsx", 72),
    ("src/components/workdocs/KnowledgeBase.tsx", 173),
    ("src/components/workflow/WorkflowBuilder.tsx", 99),
    ("src/components/workflows/WorkflowBuilder.tsx", 153)
]

for file, line in errors:
    try:
        with open(file, 'r') as f:
            lines = f.readlines()
            start = max(0, line - 3)
            end = min(len(lines), line + 3)
            print(f"\n--- {file} (Line {line}) ---")
            for i in range(start, end):
                print(f"{i+1}: {lines[i].rstrip()}")
    except Exception as e:
        print(f"Failed to read {file}: {e}")
