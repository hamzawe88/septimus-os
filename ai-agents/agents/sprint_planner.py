import json
from langchain_core.prompts import ChatPromptTemplate
from agents.rag_query import _create_llm

PLANNER_PROMPT = ChatPromptTemplate.from_template(
    """أنت خبير إدارة مشاريع (Scrum Master) ذكي.
لديك سبرنت (Sprint) بسعة {capacity} نقطة قصة (Story Points).
ولديك قائمة المهام التالية (Backlog):
{backlog}

المطلوب:
اختر مجموعة من المهام لملء هذا السبرنت مع مراعاة الأولوية العالية (Priority) وعدم تجاوز السعة الإجمالية.
أرجع الإجابة فقط بتنسيق JSON (مصفوفة من معرفات المهام المختارة)، على سبيل المثال:
["T-1234", "T-5678"]
لا تضف أي نص أو شرح آخر خارج مصفوفة الـ JSON.
"""
)

def plan_sprint(capacity: int, backlog: list) -> list:
    llm = _create_llm()
    if not llm:
        # Fallback heuristic logic if no LLM
        selected = []
        current_pts = 0
        sorted_backlog = sorted(backlog, key=lambda t: t.get('Priority', 0), reverse=True)
        for t in sorted_backlog:
            pts = t.get('StoryPoints') or 0
            if current_pts + pts <= capacity:
                selected.append(t.get('ID'))
                current_pts += pts
        return selected

    try:
        backlog_str = "\n".join([f"ID: {t.get('ID')}, Title: {t.get('Title')}, Priority: {t.get('Priority', 0)}, Points: {t.get('StoryPoints', 0)}" for t in backlog])
        chain = PLANNER_PROMPT | llm
        result = chain.invoke({"capacity": capacity, "backlog": backlog_str})
        text = result.content.strip()
        # Clean markdown codeblocks
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return json.loads(text.strip())
    except Exception as e:
        print(f"[Sprint Planner] Error: {e}")
        return []
