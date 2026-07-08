import re

with open('frontend/src/app/globals.css', 'r') as f:
    css = f.read()

# 1. Add new variables to :root
root_addition = """
  --border-color: rgba(0,0,0,0.08);
  --border-strong: #E8E8E8;
  --bg-primary: #FFFFFF;
  --bg-secondary: #F8F8F8;
  --text-primary: #1D1C1D;
  --text-secondary: #616061;
"""
css = css.replace('--radius-lg:         12px;\n}', f'--radius-lg:         12px;\n{root_addition}\n}}')

# 2. Add .dark block right after :root
dark_block = """
.dark {
  --sb-bg:             #19171D;
  --sb-hover:          rgba(255,255,255,0.06);
  --sb-active-bg:      #1164A3;
  --sb-text:           #D1D2D3;
  --sb-text-active:    #FFFFFF;
  --sb-text-muted:     #ABABAD;
  --sb-divider:        rgba(255,255,255,0.05);

  --tb-bg:             #121016;
  --tb-border:         rgba(255,255,255,0.05);

  --chat-bg:           #1A1D21;
  --chat-text:         #D1D2D3;
  --chat-hover-bg:     #222529;

  --border-color:      rgba(255,255,255,0.08);
  --border-strong:     #35373B;
  
  --purple-bg:         #2B092A;
  --purple-border:     #4A154B;

  --bg-primary:        #1A1D21;
  --bg-secondary:      #222529;
  --text-primary:      #D1D2D3;
  --text-secondary:    #ABABAD;
}
"""
css = css.replace('}\n\n/* ================================================================', f'}}\n{dark_block}\n/* ================================================================')

# 3. Replace hardcoded colors with variables
replacements = {
    'rgba(0,0,0,0.08)': 'var(--border-color)',
    '#fff': 'var(--bg-primary)',
    '#FFFFFF': 'var(--bg-primary)',
    '#F8F8F8': 'var(--bg-secondary)',
    '#F1F1F1': 'var(--bg-secondary)',
    '#E8E8E8': 'var(--border-strong)',
    '#1D1C1D': 'var(--text-primary)',
    '#616061': 'var(--text-secondary)',
    '#97979A': 'var(--text-secondary)'
}

# Special manual fixes for places where we might break things
# e.g., we don't want to replace #fff in gradients or logos if they must remain white
# Actually, the logo text should be white.
# We'll replace with regex but carefully on specific classes.

css = css.replace('.channel-header {\n  height: 49px;\n  border-bottom: 1px solid #E8E8E8;\n  background: #fff;', '.channel-header {\n  height: 49px;\n  border-bottom: 1px solid var(--border-strong);\n  background: var(--chat-bg);')
css = css.replace('color: #1D1C1D;', 'color: var(--text-primary);')
css = css.replace('color: #616061;', 'color: var(--text-secondary);')
css = css.replace('color: #97979A;', 'color: var(--text-secondary);')
css = css.replace('background: #fff;', 'background: var(--bg-primary);')
css = css.replace('border-bottom: 1px solid #E8E8E8;', 'border-bottom: 1px solid var(--border-strong);')
css = css.replace('border: 1px solid #E8E8E8', 'border: 1px solid var(--border-strong)')
css = css.replace('background: #F1F1F1;', 'background: var(--bg-secondary);')
css = css.replace('background: #F8F8F8', 'background: var(--bg-secondary)')
css = css.replace('border: 2px solid #C4C4C4;', 'border: 2px solid var(--border-strong);')
css = css.replace('border: 1px solid #C4C4C4;', 'border: 1px solid var(--border-strong);')
css = css.replace('border-top: 1px solid #E8E8E8;', 'border-top: 1px solid var(--border-strong);')
css = css.replace('* { border-color: rgba(0,0,0,0.08); }', '* { border-color: var(--border-color); }')
css = css.replace('background: #1D1C1D', 'background: var(--text-primary)') # Just in case

# Fix the modal close button which was using #1D1C1D on hover
css = css.replace('.modal-close-btn:hover { background: var(--bg-secondary); color: var(--text-primary); }', '.modal-close-btn:hover { background: var(--bg-secondary); color: var(--text-primary); }')

# Fix text-fill-color transparent
# .msg-author-ai { ... -webkit-text-fill-color: transparent; } should NOT be touched.

with open('frontend/src/app/globals.css', 'w') as f:
    f.write(css)

print("Done updating CSS")
