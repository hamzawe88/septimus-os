import sys

errors = [
    ("src/components/workflow/WorkflowBuilder.tsx", 208),
    ("src/components/workflows/WorkflowBuilder.tsx", 166),
    ("src/components/shared/DocumentUploadModal.tsx", 134),
    ("src/components/workdocs/KnowledgeBase.tsx", 173)
]

for file, line in errors:
    try:
        with open(file, 'r') as f:
            lines = f.readlines()
            start = max(0, line - 10)
            end = min(len(lines), line + 3)
            print(f"\n--- {file} (Line {line}) ---")
            for i in range(start, end):
                print(f"{i+1}: {lines[i].rstrip()}")
    except Exception as e:
        print(f"Failed to read {file}: {e}")
