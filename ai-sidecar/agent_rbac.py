"""Agent-level RBAC — a single, auditable capability matrix.

Source of truth for which TOOLS each agent TYPE may ever use. This is
defense-in-depth on top of the per-user-role checks already living inside each
tool: even if a tool is mistakenly wired to the wrong agent in `_build_tools`,
`enforce()` strips it and logs a security event. The whole policy is readable
in one place instead of scattered across an if/elif chain.

Pure-python (no langchain import) so it can be unit-tested offline.
"""
from __future__ import annotations

# Tools every agent may use: knowledge search + long-term institutional memory.
COMMON_TOOLS = {
    "search_knowledge",
    "list_institutional_facts",
    "save_institutional_fact",
    "delete_institutional_fact",
}

# Domain tools per agent family. Role gating (member vs admin/manager) still
# happens inside each tool and in _build_tools; this matrix is the OUTER
# boundary that decides which tools even belong to an agent type.
_DOMAIN: dict[str, set[str]] = {
    "hr": {"get_hr_policy", "get_attendance_summary"},
    "crm": {"get_crm_deals", "create_crm_deal"},
    "tasks": {"get_tasks", "create_task"},
    "correspondence": {"rewrite_correspondence", "audit_correspondence"},
    "supervisor": {
        "delegate_to_correspondence_specialist",
        "delegate_to_crm_specialist",
        "delegate_to_hr_specialist",
        "delegate_to_tasks_specialist",
    },
}

# Agent-type aliases → canonical family.
_ALIASES = {
    "hr": "hr", "policy": "hr", "attendance": "hr",
    "crm": "crm", "sales": "crm",
    "tasks": "tasks", "sprint": "tasks", "pm": "tasks",
    "correspondence": "correspondence", "diwan": "correspondence",
    "supervisor": "supervisor", "general": "supervisor", "": "supervisor",
}


def _family(agent_type: str) -> str:
    return _ALIASES.get((agent_type or "").lower(), "supervisor")


def allowed_tools_for(agent_type: str) -> set[str]:
    """Return the full set of tool names permitted for an agent type."""
    at = (agent_type or "").lower()
    if at == "monolithic":
        domain: set[str] = set()
        for k in ("hr", "crm", "tasks", "correspondence"):
            domain |= _DOMAIN[k]
        return COMMON_TOOLS | domain
    return COMMON_TOOLS | _DOMAIN.get(_family(at), set())


def enforce(agent_type: str, tools, log=None):
    """Fail-closed filter: keep only tools permitted for this agent type,
    log every denial. `tools` is a list of objects exposing `.name`
    (langchain tools) or `.__name__`. Returns the filtered list.
    """
    allowed = allowed_tools_for(agent_type)
    kept, denied = [], []
    for t in tools:
        name = getattr(t, "name", None) or getattr(t, "__name__", None) or str(t)
        if name in allowed:
            kept.append(t)
        else:
            denied.append(name)
    if denied:
        msg = (f"[agent-rbac] DENIED tool(s) {denied} for agent_type={agent_type!r} "
               f"— not in the capability matrix (defense-in-depth strip).")
        (log or print)(msg)
    return kept


def describe_capabilities() -> dict[str, list[str]]:
    """Auditable dump of the whole matrix (for docs / a `/agents/capabilities` view)."""
    families = ["hr", "crm", "tasks", "correspondence", "supervisor", "monolithic"]
    return {f: sorted(allowed_tools_for(f)) for f in families}
