import re
import sys

files = [
    "src/components/shared/DocumentUploadModal.tsx",
    "src/components/workdocs/KnowledgeBase.tsx",
    "src/components/workflow/WorkflowBuilder.tsx",
    "src/components/workflows/WorkflowBuilder.tsx",
]

for file in files:
    with open(file, 'r') as f:
        content = f.read()
        lines = content.split('\n')
        # find unterminated backticks
        for i, line in enumerate(lines):
            # check if line has unmatched quote or backtick roughly
            if '`' in line and line.count('`') % 2 != 0:
                if "${" not in line and "}" not in line: # rough heuristic
                   print(f"{file}:{i+1}: {line}")
            if '"' in line and line.count('"') % 2 != 0:
                   print(f"{file}:{i+1} DQUOTE: {line}")

