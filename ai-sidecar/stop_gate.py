"""Parameter Stop-Gate resolution — pure logic, no langchain.

Split out of agents_orchestrator so it can be unit-tested offline (same stance
as agent_rbac.py). The Stop-Gate's contract is the whole point of the module:
fill a required parameter only when the query states it unambiguously, and
otherwise report it as missing rather than guess.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List

logger = logging.getLogger("stop_gate")

# A bare reference like "#T-123" or "#45" in free text.
_BARE_ID_RE = re.compile(r"#(?:[A-Z]{1,3}-)?\d+", re.IGNORECASE)


def resolve_required_parameters(required: List[str], context_parameters: Dict[str, Any],
                                query: str) -> List[str]:
    """Fill required parameters the query states explicitly; return the rest.

    The Stop-Gate exists to stop the agent guessing — so it must not guess
    either. The previous version assigned the first `#123` found in the text to
    *any* parameter whose name ended in "id", which meant a request mentioning a
    ticket number could silently populate `letter_id`, and a request carrying two
    references silently took the first. Both are exactly the failure the gate
    advertises that it prevents.

    Two ways a value is accepted, in order:
      1. Named explicitly — `letter_id: 42`, `letter_id=42`. Unambiguous.
      2. A single bare reference (`#L-42`) when exactly ONE parameter is still
         unresolved and the query contains exactly ONE such token. With no
         ambiguity left there is nothing to guess.
    Anything else falls through to the gate and is asked for.
    """
    missing: List[str] = []
    unresolved: List[str] = []

    for req_param in required:
        if context_parameters.get(req_param):
            continue
        # re.escape: parameter names come from skill front-matter, and an
        # unescaped one would corrupt the pattern rather than match it.
        named = re.search(rf"{re.escape(req_param)}\s*[:=]\s*([A-Za-z0-9_-]+)", query, re.IGNORECASE)
        if named:
            context_parameters[req_param] = named.group(1)
        else:
            unresolved.append(req_param)

    if len(unresolved) == 1:
        candidates = _BARE_ID_RE.findall(query)
        if len(candidates) == 1:
            param = unresolved[0]
            context_parameters[param] = candidates[0]
            logger.info(f"[Stop-Gate] resolved '{param}' from the query's single reference {candidates[0]}")
            return missing
        if len(candidates) > 1:
            logger.info(
                f"[Stop-Gate] {len(candidates)} references in the query "
                f"({', '.join(candidates)}) — refusing to pick one for '{unresolved[0]}'"
            )

    missing.extend(unresolved)
    return missing
