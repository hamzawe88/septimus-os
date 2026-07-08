import os
import re

src_dir = 'src'

# 1. Fix imports & duplicate classNames
for root, _, files in os.walk(src_dir):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
            
            # Fix imports
            content = content.replace('@/lib/LocalizationContext', '@/contexts/LocalizationContext')
            
            # Fix duplicate className inside JSX elements
            # e.g., className="w-5 h-5" className="text-[var(--primary-hex)]"
            # It's better to just replace `className="([^"]+)"\s+className="([^"]+)"` with `className="\1 \2"`
            # We can run it multiple times until no matches
            while True:
                new_content = re.sub(r'className="([^"]+)"\s+className="([^"]+)"', r'className="\1 \2"', content)
                if new_content == content:
                    break
                content = new_content
            
            with open(filepath, 'w') as f:
                f.write(content)

