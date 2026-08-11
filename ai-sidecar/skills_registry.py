import os
import sys
import json
import yaml
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger("skills_registry")

class DynamicSkillRegistry:
    """
    نظام ديناميكي لقراءة ملفات المعرفة والمناهج (Markdown)
    وتحويلها إلى مهارات حية وسجل مناهج مؤسسي يتعرف عليها أي وكيل ذكي.
    """
    def __init__(self, skills_directory: Optional[str] = None):
        if not skills_directory:
            # Check standard container path first, fallback to local development paths
            paths_to_check = [
                "/app/skills_catalog",
                os.path.join(os.path.dirname(os.path.abspath(__file__)), "skills_catalog"),
                "./skills_catalog"
            ]
            for p in paths_to_check:
                if os.path.exists(p):
                    skills_directory = p
                    break
            if not skills_directory:
                skills_directory = "/app/skills_catalog"

        self.skills_directory = skills_directory
        self.registry: Dict[str, Dict[str, Any]] = {}
        self.load_skills_from_directory()

    def load_skills_from_directory(self):
        """تقوم بالمرور على مجلد الملفات وقراءتها بشكل تفصيلي"""
        if not os.path.exists(self.skills_directory):
            logger.warning(f"⚠️ Skills directory '{self.skills_directory}' not found. Creating empty registry.")
            try:
                os.makedirs(self.skills_directory, exist_ok=True)
            except Exception as e:
                logger.error(f"Could not create skills directory: {e}")
            return

        # Walk subdirectories too: personas are organised by domain
        # (finance/, sales/, marketing/, pm/) alongside the top-level sovereign
        # skills. The subfolder name is the fallback domain when a file omits it.
        for root, _dirs, files in os.walk(self.skills_directory):
            folder = os.path.basename(root)
            for filename in files:
                if filename.endswith(".md"):
                    file_path = os.path.join(root, filename)
                    default_domain = folder if root != self.skills_directory else "sovereign"
                    self._parse_skill_file(file_path, filename, default_domain)
        by_domain = {}
        for v in self.registry.values():
            by_domain[v["domain"]] = by_domain.get(v["domain"], 0) + 1
        logger.info(f"✅ Loaded {len(self.registry)} skills from {self.skills_directory}")
        print(f"✅ [DynamicSkillRegistry] Loaded {len(self.registry)} skills across domains: {by_domain}")

    def _parse_skill_file(self, file_path: str, filename: str, default_domain: str = "sovereign"):
        """تفصيص وتفكيك ملف الـ Markdown واستخراج الـ Metadata والمحتوى"""
        try:
            with open(file_path, "r", encoding="utf-8") as file:
                content = file.read()
        except Exception as e:
            logger.error(f"Error reading skill file {filename}: {e}")
            return

        skill_id = filename.replace(".md", "").lower()
        metadata = {}
        body = content

        # التحقق من وجود ترويسة YAML (بين علامات ---)
        if content.startswith("---"):
            try:
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    metadata = yaml.safe_load(parts[1]) or {}
                    body = parts[2].strip()
            except Exception as e:
                logger.warning(f"⚠️ Failed to parse YAML front matter in {filename}: {e}")

        # Extract required parameters list if provided in YAML metadata
        req_params = metadata.get("required_parameters", [])
        if isinstance(req_params, str):
            req_params = [p.strip() for p in req_params.split(",") if p.strip()]

        # حفظ المهارة في السجل المركزي للأنظمة الداخلية
        self.registry[skill_id] = {
            "id": skill_id,
            "name": metadata.get("name", skill_id.replace("-", " ").replace("_", " ").title()),
            "description": metadata.get("description", "Internal operational skill and sovereign persona."),
            "vibe": metadata.get("vibe", "Professional sovereign executor."),
            "emoji": metadata.get("emoji", "🤖"),
            # domain groups personas by business area; specialist maps the domain
            # to a Septimus chat agent (finance/crm/tasks) or "system" when no
            # dedicated specialist exists (marketing) → handled by the orchestrator.
            "domain": metadata.get("domain", default_domain),
            "specialist": metadata.get("specialist", "system"),
            "required_parameters": req_params,
            "full_instructions": body
        }

    # NOTE: skill personas are deliberately NOT synced into pgvector as
    # institutional facts. Doing so polluted RAG retrieval — persona text (e.g.
    # "Sovereign Analytics Tracker") came back as workspace knowledge and bled
    # into the specialist chat agents. `clean_leaked_facts.py` exists to purge
    # rows from that era. The former `sync_with_pgvector()` was a no-op kept
    # only to preserve its startup call site; both are now removed.

    def get_skill(self, skill_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a specific skill by id (case-insensitive)"""
        if not skill_id:
            return None
        sid = skill_id.lower().replace("-", "_")
        if sid in self.registry:
            return self.registry[sid]
        # Check partial or name match
        for key, val in self.registry.items():
            if key == skill_id.lower() or val["name"].lower() == skill_id.lower():
                return val
        return None

    def personas_for_domain(self, domain: str) -> List[Dict[str, Any]]:
        """All personas in a business domain (finance/sales/marketing/pm/sovereign)."""
        d = (domain or "").lower()
        return [v for v in self.registry.values() if v.get("domain") == d]

    def domains(self) -> Dict[str, int]:
        """Persona count per domain — for the /agents/capabilities audit view."""
        out: Dict[str, int] = {}
        for v in self.registry.values():
            out[v.get("domain", "sovereign")] = out.get(v.get("domain", "sovereign"), 0) + 1
        return out

    def search_skills(self, query: str, target_persona: Optional[str] = None,
                      domain: Optional[str] = None) -> List[Dict[str, Any]]:
        """Identify matching skills by persona, keyword scoring, and optional domain.

        `domain` scopes the search to one specialist's catalogue (e.g. a CRM agent
        only sees `sales` personas). With no domain the whole catalogue is
        searched — this is the system-wide orchestrator view.
        """
        if target_persona:
            matched = self.get_skill(target_persona)
            if matched:
                return [matched]

        pool = self.personas_for_domain(domain) if domain else list(self.registry.values())
        q_lower = query.lower()
        scored = []
        for val in pool:
            score = 0
            if val["id"] in q_lower or val["name"].lower() in q_lower:
                score += 10
            for word in val["description"].lower().split():
                if len(word) > 3 and word in q_lower:
                    score += 3
            if score > 0:
                scored.append((score, val))

        scored.sort(key=lambda x: x[0], reverse=True)
        results = [item[1] for item in scored]
        # Fall back to the (domain-scoped) full list so the LLM keeps catalogue awareness.
        if not results:
            results = pool
        return results

    # Shared compliance rules, appended to both the single-persona and the router
    # system prompts.
    _COMMON_RULES = (
        "\nCRITICAL RULES:\n"
        "- Rely strictly on the skill(s) defined above; never invent external tools or schemas.\n"
        "- Parameter Stop-Gate: if a required parameter is missing, halt and ask for it — never guess.\n"
        "- Language: keep DB schemas, JSON fields, and formulas in English; converse in professional Arabic.\n"
        "- Epistemic rigor: label load-bearing assertions ([VERIFIED], [VERIFIED STATS], [ASSUMPTION]).\n"
    )

    def generate_system_prompt(self, target_persona: Optional[str] = None,
                               domain: Optional[str] = None) -> str:
        """Build the orchestrator system prompt.

        Two distinct modes, because conflating them produced the "I am all skills"
        bug: when no specific persona was selected, the prompt used to load EVERY
        skill module and instruct the model to embody all of them, so a user who
        opened e.g. a CRM agent got a generic "I am the sovereign system, I do
        analytics AND legal AND PM AND accounts" identity instead of one focused
        specialist.

        - A resolved persona → the agent IS that single specialist, and is told
          not to present itself as anything else.
        - No resolved persona → a router that picks ONE specialist for the request.
          `domain` scopes the routing menu to one business area (e.g. a CRM agent
          only routes among `sales` personas); without it the router sees the
          whole catalogue (the system-wide orchestrator).
        """
        resolved = self.get_skill(target_persona) if target_persona else None

        if resolved:
            prompt = (
                f"You are **{resolved['name']}** {resolved['emoji']}, a specialized Septimus OS agent. "
                f"You operate ONLY within this role. Do not introduce yourself as a general or sovereign "
                f"assistant, and do not claim to perform other specialties.\n\n"
                f"Strategic Focus: {resolved['description']}\n"
                f"Execution Vibe: {resolved['vibe']}\n"
            )
            if resolved["required_parameters"]:
                prompt += f"Mandatory Required Parameters: {', '.join(resolved['required_parameters'])}\n"
            prompt += "--- Operational Manual ---\n" + resolved["full_instructions"] + "\n"
            return prompt + self._COMMON_RULES

        # Router mode — do NOT impersonate every skill at once.
        pool = self.personas_for_domain(domain) if domain else list(self.registry.values())
        scope = f" for the {domain} domain" if domain else ""
        router = (
            f"You are the Septimus OS orchestrator (a ROUTER){scope}. You are not a single specialist and "
            "you must NOT claim to personally perform every skill or introduce yourself as a bundle of all "
            "capabilities. For each request: pick the ONE specialist below that best fits and answer AS "
            "that specialist. If the request is a greeting or too vague to route, reply briefly and ask "
            "which area the user needs — do not enumerate everything you can do.\n\n"
            "AVAILABLE SPECIALISTS (route to exactly one):\n"
        )
        for data in pool:
            router += f"- {data['name']} {data['emoji']}: {data['description']}\n"
        return router + self._COMMON_RULES

# Singleton registry loaded on startup
skills_registry = DynamicSkillRegistry()
