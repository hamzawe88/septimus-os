import re

path = "/Users/hamzwe/Desktop/LPC-BRAIN CORE/septimus-os/frontend/src/components/settings/AppearanceSettings.tsx"

with open(path, "r") as f:
    content = f.read()

replacements = [
    (r'bg-slate-50', r'bg-slate-50 dark:bg-[#121212]'),
    (r'bg-white', r'bg-white dark:bg-[#1e1e1e]'),
    (r'border-slate-200', r'border-slate-200 dark:border-slate-700'),
    (r'border-slate-100', r'border-slate-100 dark:border-slate-800'),
    (r'border-slate-300', r'border-slate-300 dark:border-slate-600'),
    (r'text-slate-900', r'text-slate-900 dark:text-slate-100'),
    (r'text-slate-800', r'text-slate-800 dark:text-slate-200'),
    (r'text-slate-700', r'text-slate-700 dark:text-slate-300'),
    (r'text-slate-600', r'text-slate-600 dark:text-slate-400'),
    (r'text-slate-500', r'text-slate-500 dark:text-slate-400'),
    (r'bg-slate-100', r'bg-slate-100 dark:bg-slate-800'),
    (r'hover:bg-slate-200', r'hover:bg-slate-200 dark:hover:bg-slate-700'),
    (r'hover:bg-slate-100', r'hover:bg-slate-100 dark:hover:bg-slate-800'),
    (r'hover:text-slate-600', r'hover:text-slate-600 dark:hover:text-slate-300'),
]

for old, new in replacements:
    content = re.sub(old, new, content)

with open(path, "w") as f:
    f.write(content)

print("Done")
