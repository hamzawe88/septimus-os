import os
import re

IGNORE_DIRS = {'node_modules', '.next', '.git', 'venv'}
def extract_ts_functions(content):
    funcs = re.findall(r'(?:export\s+)?(?:async\s+)?(?:function|const)\s+([a-zA-Z0-9_]+)\s*=?\s*(?:\([^)]*\))(?:\s*=>|\s*\{)', content)
    return funcs

def extract_go_functions(content):
    funcs = re.findall(r'func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(', content)
    return funcs

def extract_py_functions(content):
    funcs = re.findall(r'def\s+([a-zA-Z0-9_]+)\s*\(', content)
    return funcs

os.makedirs("docs/deep_analysis", exist_ok=True)
with open("docs/deep_analysis/codebase_reference.md", "w") as out:
    out.write("# Septimus OS Deep Codebase Analysis\n\n")
    out.write("This document contains a file-by-file, function-by-function analysis of the entire codebase.\n\n")
    
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for file in files:
            if file.endswith((".ts", ".tsx", ".go", ".py")):
                path = os.path.join(root, file)
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        content = f.read()
                except Exception:
                    continue
                
                out.write(f"## File: `{path}`\n")
                if path.endswith((".ts", ".tsx")):
                    funcs = extract_ts_functions(content)
                elif path.endswith(".go"):
                    funcs = extract_go_functions(content)
                elif path.endswith(".py"):
                    funcs = extract_py_functions(content)
                else:
                    funcs = []
                
                if funcs:
                    out.write("### Functions/Components:\n")
                    for fn in set(funcs):
                        out.write(f"- `{fn}`\n")
                else:
                    out.write("*No explicit functions detected or file is purely declarative.*\n")
                
                # Brief line count
                out.write(f"- **Lines of Code**: {len(content.splitlines())}\n\n")

print("Docs generated in docs/deep_analysis/codebase_reference.md")
