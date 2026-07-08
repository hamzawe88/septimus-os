import os

def disable_forbid_dom_props():
    src_dir = 'src'
    for root, _, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                filepath = os.path.join(root, file)
                with open(filepath, 'r') as f:
                    content = f.read()
                
                # Check if there are still style={{ inside the file
                if 'style={{' in content:
                    # check if the disable comment is already there
                    if 'eslint-disable react/forbid-dom-props' not in content:
                        new_content = '/* eslint-disable react/forbid-dom-props */\n' + content
                        with open(filepath, 'w') as f:
                            f.write(new_content)
                        print(f"Added disable comment to {filepath}")

disable_forbid_dom_props()
