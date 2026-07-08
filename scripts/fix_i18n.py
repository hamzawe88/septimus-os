import os
import re

directory = 'septimus-os/frontend/src'
arabic_pattern = re.compile(r'[\u0600-\u06FF]')
# Match t("key", "fallback") or t('key', 'fallback')
# Group 1: key, Group 2: fallback
t_pattern = re.compile(r't\(\s*(["\'])(.*?)\1\s*,\s*(["\'])(.*?)\3\s*\)')

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if not arabic_pattern.search(content):
        return False

    def replace_t(match):
        quote_key = match.group(1)
        key = match.group(2)
        quote_fallback = match.group(3)
        fallback = match.group(4)
        
        if arabic_pattern.search(fallback):
            # Remove the Arabic fallback, just keep the key
            return f't({quote_key}{key}{quote_key})'
        return match.group(0)

    new_content = t_pattern.sub(replace_t, content)
    
    # Also clean up any direct hardcoded Arabic strings outside of t() if possible, but that's risky.
    # We will just do t() calls for now.

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

modified_count = 0
for root, dirs, files in os.walk(directory):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            if process_file(os.path.join(root, file)):
                modified_count += 1
                print(f"Modified: {file}")

print(f"Total files modified: {modified_count}")
