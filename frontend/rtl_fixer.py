import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    # Margins & Paddings
    content = re.sub(r'(?<![A-Za-z0-9_-])(-?)ml-([0-9\.]+|px|auto|full)(?![A-Za-z0-9_-])', r'\1ms-\2', content)
    content = re.sub(r'(?<![A-Za-z0-9_-])(-?)mr-([0-9\.]+|px|auto|full)(?![A-Za-z0-9_-])', r'\1me-\2', content)
    content = re.sub(r'(?<![A-Za-z0-9_-])pl-([0-9\.]+|px|auto)(?![A-Za-z0-9_-])', r'ps-\1', content)
    content = re.sub(r'(?<![A-Za-z0-9_-])pr-([0-9\.]+|px|auto)(?![A-Za-z0-9_-])', r'pe-\1', content)

    # Text Alignment
    content = re.sub(r'(?<![A-Za-z0-9_-])text-left(?![A-Za-z0-9_-])', r'text-start', content)
    content = re.sub(r'(?<![A-Za-z0-9_-])text-right(?![A-Za-z0-9_-])', r'text-end', content)

    # Positions
    content = re.sub(r'(?<![A-Za-z0-9_-])(-?)left-([0-9\.]+|px|auto|full)(?![A-Za-z0-9_-])', r'\1start-\2', content)
    content = re.sub(r'(?<![A-Za-z0-9_-])(-?)right-([0-9\.]+|px|auto|full)(?![A-Za-z0-9_-])', r'\1end-\2', content)

    # Borders
    content = re.sub(r'(?<![A-Za-z0-9_-])border-l(?![A-Za-z0-9_-])', r'border-s', content)
    content = re.sub(r'(?<![A-Za-z0-9_-])border-r(?![A-Za-z0-9_-])', r'border-e', content)
    content = re.sub(r'(?<![A-Za-z0-9_-])border-l-([A-Za-z0-9\.-]+)(?![A-Za-z0-9_-])', r'border-s-\1', content)
    content = re.sub(r'(?<![A-Za-z0-9_-])border-r-([A-Za-z0-9\.-]+)(?![A-Za-z0-9_-])', r'border-e-\1', content)

    # Rounded Corners (simple ones)
    content = re.sub(r'(?<![A-Za-z0-9_-])rounded-l(-[A-Za-z0-9]+)?(?![A-Za-z0-9_-])', r'rounded-s\1', content)
    content = re.sub(r'(?<![A-Za-z0-9_-])rounded-r(-[A-Za-z0-9]+)?(?![A-Za-z0-9_-])', r'rounded-e\1', content)
    content = re.sub(r'(?<![A-Za-z0-9_-])rounded-tl(-[A-Za-z0-9]+)?(?![A-Za-z0-9_-])', r'rounded-ss\1', content)
    content = re.sub(r'(?<![A-Za-z0-9_-])rounded-tr(-[A-Za-z0-9]+)?(?![A-Za-z0-9_-])', r'rounded-se\1', content)
    content = re.sub(r'(?<![A-Za-z0-9_-])rounded-bl(-[A-Za-z0-9]+)?(?![A-Za-z0-9_-])', r'rounded-es\1', content)
    content = re.sub(r'(?<![A-Za-z0-9_-])rounded-br(-[A-Za-z0-9]+)?(?![A-Za-z0-9_-])', r'rounded-ee\1', content)

    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith(('.tsx', '.ts')):
            process_file(os.path.join(root, file))

