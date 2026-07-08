import os
import re

def fix_widget(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Replace specific style={{...}} with nothing, but inject classes into the preceding className
    
    # 1. CRMDealsWidget.tsx
    if "CRMDealsWidget.tsx" in filepath:
        # We know the class names for these elements. 
        # bgLight/borderLight container:
        content = re.sub(
            r'className="([^"]+)"\s*style=\{\{\s*backgroundColor:\s*bgLight,\s*borderColor:\s*borderLight\s*\}\}',
            r'className="\1 dark:bg-slate-800 bg-blue-50 dark:border-slate-700 border-blue-200"',
            content
        )
        # color: primary icon:
        content = re.sub(
            r'className="([^"]+)"\s*style=\{\{\s*color:\s*primary\s*\}\}',
            r'className="\1 text-[var(--primary-hex)]"',
            content
        )
        # color: primary, backgroundColor: bgLight label:
        content = re.sub(
            r'className="([^"]+)"\s*style=\{\{\s*color:\s*primary,\s*backgroundColor:\s*bgLight\s*\}\}',
            r'className="\1 text-[var(--primary-hex)] dark:bg-slate-800 bg-blue-50"',
            content
        )
        # backgroundColor: primary list bullet:
        content = re.sub(
            r'className="([^"]+)"\s*style=\{\{\s*backgroundColor:\s*primary\s*\}\}',
            r'className="\1 bg-[var(--primary-hex)]"',
            content
        )

    # 2. TasksWidget.tsx
    if "TasksWidget.tsx" in filepath:
        content = re.sub(
            r'className="([^"]+)"\s*style=\{\{\s*backgroundColor:\s*bgLight\s*\}\}',
            r'className="\1 dark:bg-slate-800 bg-blue-50"',
            content
        )
        content = re.sub(
            r'className="([^"]+)"\s*style=\{\{\s*color:\s*primary\s*\}\}',
            r'className="\1 text-[var(--primary-hex)]"',
            content
        )
        content = re.sub(
            r'className="([^"]+)"\s*style=\{\{\s*backgroundColor:\s*bgLight,\s*color:\s*primary,\s*borderColor:\s*borderLight\s*\}\}',
            r'className="\1 dark:bg-slate-800 bg-blue-50 text-[var(--primary-hex)] dark:border-slate-700 border-blue-200"',
            content
        )
        # Hover border color:
        content = re.sub(
            r'className="([^"]+)"\s*style=\{\{\s*\'--hover-border-color\':\s*primary\s*\}\s*as\s*React\.CSSProperties\}',
            r'className="\1 hover:border-[var(--primary-hex)]"',
            content
        )

    # 3. FinanceKPIsWidget.tsx
    if "FinanceKPIsWidget.tsx" in filepath:
        content = re.sub(
            r'className="([^"]+)"\s*style=\{\{\s*borderColor:\s*borderLight\s*\}\}',
            r'className="\1 dark:border-slate-700 border-blue-200"',
            content
        )
        content = re.sub(
            r'className="([^"]+)"\s*style=\{\{\s*backgroundColor:\s*bgLight,\s*color:\s*primary\s*\}\}',
            r'className="\1 dark:bg-slate-800 bg-blue-50 text-[var(--primary-hex)]"',
            content
        )
        content = re.sub(
            r'className="([^"]+)"\s*style=\{\{\s*color:\s*primary,\s*backgroundColor:\s*bgLight,\s*borderColor:\s*borderLight\s*\}\}',
            r'className="\1 text-[var(--primary-hex)] dark:bg-slate-800 bg-blue-50 dark:border-slate-700 border-blue-200"',
            content
        )
        content = re.sub(
            r'className="([^"]+)"\s*style=\{\{\s*backgroundColor:\s*bgLight,\s*borderColor:\s*borderLight\s*\}\}',
            r'className="\1 dark:bg-slate-800 bg-blue-50 dark:border-slate-700 border-blue-200"',
            content
        )
        content = re.sub(
            r'className="([^"]+)"\s*style=\{\{\s*color:\s*primary\s*\}\}',
            r'className="\1 text-[var(--primary-hex)]"',
            content
        )

    # All Modals & Views with primaryColor
    content = re.sub(
        r'className="([^"]+)"\s*style=\{\{\s*backgroundColor:\s*primaryColor\s*\}\}',
        r'className="\1 bg-[var(--primary-hex)]"',
        content
    )
    # Fix for icon color in Reports
    content = re.sub(
        r'style=\{\{\s*color:\s*primaryColor\s*\}\}',
        r'className="text-[var(--primary-hex)]"',
        content
    )
    
    with open(filepath, 'w') as f:
        f.write(content)

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            fix_widget(os.path.join(root, file))

print("Done fixing inline styles")
