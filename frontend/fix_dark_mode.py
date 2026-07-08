import os

file_path = "src/app/globals.css"
with open(file_path, "r") as f:
    content = f.read()

# Replace the .dark variables block
old_dark = """.dark {
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
}"""

new_dark = """.dark {
  --sb-bg:             #19171D !important;
  --sb-hover:          rgba(255,255,255,0.06) !important;
  --sb-active-bg:      #1164A3 !important;
  --sb-text:           #D1D2D3 !important;
  --sb-text-active:    #FFFFFF !important;
  --sb-text-muted:     #ABABAD !important;
  --sb-divider:        rgba(255,255,255,0.05) !important;

  --tb-bg:             #121016 !important;
  --tb-border:         rgba(255,255,255,0.05) !important;

  --chat-bg:           #1A1D21 !important;
  --chat-text:         #D1D2D3 !important;
  --chat-hover-bg:     #222529 !important;

  --border-color:      rgba(255,255,255,0.08) !important;
  --border-strong:     #35373B !important;
  
  --purple-bg:         #2B092A !important;
}"""

if old_dark in content:
    content = content.replace(old_dark, new_dark)
    with open(file_path, "w") as f:
        f.write(content)
    print("Fixed globals.css dark mode variables with !important")
else:
    print("Could not find the exact .dark block")
