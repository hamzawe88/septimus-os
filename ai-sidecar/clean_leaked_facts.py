import asyncio
import os
from knowledge import list_facts, delete_fact

def clean():
    workspace_id = os.environ.get("WORKSPACE_ID", "")
    if not workspace_id:
        raise SystemExit("WORKSPACE_ID is required")
    facts = list_facts(workspace_id)
    print(f"Found {len(facts)} facts.")
    for f in facts:
        if "Skill Persona:" in f.get("content", ""):
            print(f"Deleting leaked skill: {f['id']}")
            delete_fact(workspace_id, f['id'])
    print("Done")

if __name__ == "__main__":
    clean()
