"""Agent-level RBAC — a single, auditable capability matrix.

Source of truth for which TOOLS each agent TYPE may ever use. This is
defense-in-depth on top of the per-user-role checks already living inside each
tool: even if a tool is mistakenly wired to the wrong agent in `_build_tools`,
`enforce()` strips it and logs a security event. The whole policy is readable
in one place instead of scattered across an if/elif chain.

Pure-python (no langchain import) so it can be unit-tested offline.
"""
from __future__ import annotations

# Read-only tools every agent may use. Reading knowledge and listing facts is
# harmless in any agent context.
COMMON_TOOLS = {
    "search_knowledge",
    "list_institutional_facts",
}

# Writing to long-term institutional memory steers every future agent run in the
# workspace, so it is a capability, not a baseline. Keeping it in COMMON_TOOLS
# meant this matrix — the "outer boundary" — granted memory writes to every agent
# type, leaving the per-user role check inside each tool as the only gate.
MEMORY_WRITE_TOOLS = {
    "save_institutional_fact",
    "delete_institutional_fact",
}

# Agent families whose job legitimately includes recording institutional policy.
# A specialist answering HR questions has no business rewriting the workspace's
# standing facts; the supervisor and the monolithic agent do.
_MEMORY_WRITERS = {"supervisor", "monolithic"}

# Domain tools per agent family. Role gating (member vs admin/manager) still
# happens inside each tool and in _build_tools; this matrix is the OUTER
# boundary that decides which tools even belong to an agent type.
_DOMAIN: dict[str, set[str]] = {
    "hr": {"get_hr_policy", "get_attendance_summary", "get_my_leave_balance", "decide_leave_request", "draft_offer_letter"},
    "crm": {"get_crm_deals", "create_crm_deal", "get_crm_pipeline", "advance_opportunity", "draft_quote_email"},
    "tasks": {"get_tasks", "create_task"},
    "correspondence": {"rewrite_correspondence", "audit_correspondence"},
    "supervisor": {
        "delegate_to_correspondence_specialist",
        "delegate_to_crm_specialist",
        "delegate_to_hr_specialist",
        "delegate_to_tasks_specialist",
    },
    # Finance reads and reasons; it creates nothing. Its answers come from the
    # common tools (knowledge search, institutional facts).
    "finance": set(),
    # Unrecognised agent types get no domain tools at all — see _family.
    "_unknown": set(),
}

# Agent-type aliases → canonical family.
_ALIASES = {
    "hr": "hr", "policy": "hr", "attendance": "hr",
    "crm": "crm", "sales": "crm",
    "tasks": "tasks", "sprint": "tasks", "pm": "tasks",
    "correspondence": "correspondence", "diwan": "correspondence",
    "supervisor": "supervisor", "general": "supervisor", "": "supervisor",
    # Finance shipped in the frontend's AgentType union and in i18n (it has a
    # "Finance Assistant" system prompt) but was never in this table, so it took
    # the old permissive default and ran with the supervisor's delegation tools.
    # It is analysis-only by design: common tools, no domain mutations.
    "finance": "finance",
}


# The narrowest family: common tools only, no domain tools, no memory writes.
# Anything unrecognised lands here.
UNKNOWN_FAMILY = "_unknown"


def _family(agent_type: str) -> str:
    """Map an agent type to its capability family, failing CLOSED.

    This used to default to "supervisor" — the widest family, holding every
    delegation tool. agent_type arrives in the request body, so any value the
    alias table did not recognise handed the caller the largest tool set in the
    system: a typo, a stale frontend constant, or a deliberately crafted
    agent_type. Three names shipped in the UI ("finance", "task", "comm") were
    silently taking that path.

    An unknown type is now the *least* privileged thing in the matrix. A default
    on the permissive side is not a default, it is a bypass.
    """
    return _ALIASES.get((agent_type or "").lower(), UNKNOWN_FAMILY)


def allowed_tools_for(agent_type: str) -> set[str]:
    """Return the full set of tool names permitted for an agent type."""
    at = (agent_type or "").lower()
    if at == "monolithic":
        domain: set[str] = set()
        for k in ("hr", "crm", "tasks", "correspondence"):
            domain |= _DOMAIN[k]
        return COMMON_TOOLS | MEMORY_WRITE_TOOLS | domain
    family = _family(at)
    allowed = COMMON_TOOLS | _DOMAIN.get(family, set())
    if family in _MEMORY_WRITERS:
        allowed |= MEMORY_WRITE_TOOLS
    return allowed


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
