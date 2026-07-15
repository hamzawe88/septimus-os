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

        for filename in os.listdir(self.skills_directory):
            if filename.endswith(".md"):
                file_path = os.path.join(self.skills_directory, filename)
                self._parse_skill_file(file_path, filename)
        logger.info(f"✅ Loaded {len(self.registry)} skills from {self.skills_directory}")
        print(f"✅ [DynamicSkillRegistry] Loaded {len(self.registry)} skills from {self.skills_directory}: {[k for k in self.registry.keys()]}")

    def _parse_skill_file(self, file_path: str, filename: str):
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
            "required_parameters": req_params,
            "full_instructions": body
        }

    def sync_with_pgvector(self, workspace_id: str = "default") -> bool:
        """
        نظام الحفظ الهجين مع pgvector: مزامنة المهارات المحملة مع جدول document_embeddings
        لتمكين البحث الدلالي الفوري للوكلاء المتخصصين.
        """
        try:
            from knowledge import save_fact
            for skill_id, data in self.registry.items():
                fact_content = (
                    f"Skill Persona: {data['name']} {data['emoji']}\n"
                    f"Description: {data['description']}\n"
                    f"Required Parameters: {', '.join(data['required_parameters']) if data['required_parameters'] else 'None'}\n"
                    f"Vibe: {data['vibe']}\n"
                    f"Instructions Summary: {data['full_instructions'][:500]}..."
                )
                save_fact(
                    workspace_id=workspace_id,
                    content=fact_content
                )
            logger.info(f"✅ Synced {len(self.registry)} skill personas to pgvector store for workspace '{workspace_id}'.")
            return True
        except Exception as e:
            logger.warning(f"⚠️ pgvector hybrid sync skipped or unavailable: {e}")
            return False

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

    def search_skills(self, query: str, target_persona: Optional[str] = None) -> List[Dict[str, Any]]:
        """Identify matching skills based on target persona or keyword scoring"""
        if target_persona:
            matched = self.get_skill(target_persona)
            if matched:
                return [matched]

        q_lower = query.lower()
        scored = []
        for sid, val in self.registry.items():
            score = 0
            if sid in q_lower or val["name"].lower() in q_lower:
                score += 10
            # Check description keywords
            for word in val["description"].lower().split():
                if len(word) > 3 and word in q_lower:
                    score += 3
            if score > 0:
                scored.append((score, val))

        scored.sort(key=lambda x: x[0], reverse=True)
        results = [item[1] for item in scored]
        # Return at least all skills if none specifically matched, so the LLM has full catalog awareness
        if not results:
            results = list(self.registry.values())
        return results

    def generate_system_prompt(self, target_persona: Optional[str] = None) -> str:
        """توليد برومت النظام الخارق الذي يدمج المهارات ككتلة معرفية للوكيل"""
        base_prompt = (
            "You are an elite Internal Enterprise AI Orchestrator for Septimus OS. "
            "Your intelligence is supercharged with a dynamic catalog of specialized core operational skills "
            "and expert agent personas loaded from our Markdown curriculum registry.\n\n"
            "CORE WORKFLOW PROTOCOL (ReAct Framework):\n"
            "1. **Analyze (Thought)**: Identify which operational skill(s) from the registry match the user's request.\n"
            "2. **Adopt**: Embody the specific vibe, logic, guidelines, and restrictions of that skill/persona.\n"
            "3. **Deliver (Execute)**: Generate deliverables matching the exact schemas, templates (JSON, Markdown, SQL), "
            "and response metrics defined inside the matched skill.\n\n"
            "CRITICAL SECURITY & COMPLIANCE RULES:\n"
            "- Never hallucinate external tools or technical schemas; rely strictly on the loaded skills provided below.\n"
            "- **Parameter Validation Stop-Gate**: If the matched skill requires specific parameters (`required_parameters`) "
            "and the user input or context lacks them, DO NOT guess or hallucinate values. Halt and ask for them explicitly.\n"
            "- **Language Protocol**: Preserve all internal database schemas, API payloads, JSON fields, and technical formulas exactly in English. "
            "When explaining concepts, summarizing advice, or conversing with the executive user, write in commanding, professional Arabic.\n"
            "- **Epistemic Rigor**: Classify assertions clearly (`[VERIFIED]`, `[VERIFIED STATS]`, `[CONFIDENT RECALL]`, `[ASSUMPTION]`).\n\n"
            "=== REGISTERED INTERNAL SKILLS CATALOG ===\n"
        )

        active_skills = self.search_skills("", target_persona)
        for data in active_skills:
            sid = data["id"].upper()
            base_prompt += f"\n[START_SKILL_MODULE: {sid}]\n"
            base_prompt += f"Skill Identity: {data['name']} {data['emoji']}\n"
            base_prompt += f"Strategic Focus: {data['description']}\n"
            base_prompt += f"Execution Vibe: {data['vibe']}\n"
            if data["required_parameters"]:
                base_prompt += f"Mandatory Required Parameters: {', '.join(data['required_parameters'])}\n"
            base_prompt += "--- Detailed Operational Manual ---\n"
            base_prompt += f"{data['full_instructions']}\n"
            base_prompt += f"[END_SKILL_MODULE: {sid}]\n"

        return base_prompt

# Singleton registry loaded on startup
skills_registry = DynamicSkillRegistry()
