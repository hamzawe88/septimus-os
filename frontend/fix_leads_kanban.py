import os

file_path = "src/components/crm/LeadsKanban.tsx"
with open(file_path, "r") as f:
    content = f.read()

# Fix the backend update payload and workspace id parsing
content = content.replace('''      const workspaceId = localStorage.getItem("currentWorkspaceId") || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";''',
'''      let workspaceId = localStorage.getItem("currentWorkspaceId");
      if (!workspaceId || workspaceId === "undefined" || workspaceId === "null") {
        workspaceId = "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";
      }''')

# Also fix the payload for apiPut
content = content.replace('''        await apiPut(`/entities/${leadId}?workspace_id=${workspaceId}`, {
          name: entity.name,
          type: entity.type,
          data: updatedData
        });''',
'''        await apiPut(`/entities/${leadId}?workspace_id=${workspaceId}`, {
          data: updatedData
        });''')

with open(file_path, "w") as f:
    f.write(content)
print("Updated LeadsKanban.tsx")

# Also do it for CrmDashboard
file_path = "src/components/crm/CrmDashboard.tsx"
with open(file_path, "r") as f:
    content = f.read()

content = content.replace('''      const workspaceId = localStorage.getItem("currentWorkspaceId") || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";''',
'''      let workspaceId = localStorage.getItem("currentWorkspaceId");
      if (!workspaceId || workspaceId === "undefined" || workspaceId === "null") {
        workspaceId = "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";
      }''')

with open(file_path, "w") as f:
    f.write(content)
print("Updated CrmDashboard.tsx")

