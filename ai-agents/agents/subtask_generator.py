import json
from langchain_core.prompts import ChatPromptTemplate
from agents.rag_query import _create_llm

SUBTASK_PROMPT = ChatPromptTemplate.from_template(
    """أنت مهندس برمجيات ومحلل نظم ذكي (AI Tech Lead).
المهمة الرئيسية هي: {title}
التفاصيل/الوصف: {description}

المطلوب:
قم بتقسيم هذه المهمة الرئيسية إلى 4 إلى 6 مهام فرعية (Subtasks) دقيقة، عملية، وقابلة للتنفيذ المباشر.
أرجع الإجابة فقط بتنسيق JSON (مصفوفة نصوص فقط تحتوي على عناوين المهام الفرعية)، على سبيل المثال:
["تحليل متطلبات قاعدة البيانات وتصميم الجداول", "بناء واجهات البرمجة API ومسارات التحقق", "تطوير مكونات الواجهة الأمامية وربطها بالبيانات", "كتابة اختبارات الوحدة والتحقق من الأداء"]

لا تضف أي نص أو شرح آخر خارج مصفوفة الـ JSON.
"""
)

def _keyword_fallback(title: str) -> list:
    t_low = title.lower()
    if "api" in t_low or "backend" in t_low or "endpoint" in t_low or "auth" in t_low or "login" in t_low:
        return [
            f"Define API data schema and authentication flow for: {title}",
            "Implement input validation, JWT handling and security middleware",
            "Develop core business logic and secure database queries",
            "Write automated integration tests for endpoint responses"
        ]
    elif "ui" in t_low or "design" in t_low or "frontend" in t_low or "button" in t_low or "view" in t_low or "component" in t_low:
        return [
            f"Create responsive UI wireframe/layout for: {title}",
            "Implement interactive state management and React hooks",
            "Integrate with API endpoints and handle loading/error states",
            "Perform accessibility (A11y) audit and cross-browser testing"
        ]
    elif "fix" in t_low or "bug" in t_low or "error" in t_low or "issue" in t_low:
        return [
            f"Reproduce issue and isolate root cause for: {title}",
            "Analyze stack trace and related component dependencies",
            "Implement unit test reproducing the failure condition",
            "Apply fix and verify no regressions in adjacent modules"
        ]
    else:
        return [
            f"Requirement gathering & architectural specification for: {title}",
            "Implementation of core functionality and data flow",
            "Integration testing and UI/API verification",
            "Code review, optimization, and final deployment check"
        ]

def generate_subtasks(title: str, description: str = "") -> list:
    llm = _create_llm()
    if not llm:
        return _keyword_fallback(title)

    try:
        chain = SUBTASK_PROMPT | llm
        result = chain.invoke({"title": title, "description": description or "No additional description provided."})
        text = result.content.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        subtasks = json.loads(text.strip())
        if isinstance(subtasks, list) and all(isinstance(s, str) for s in subtasks):
            return subtasks
        return [str(s) for s in subtasks]
    except Exception as e:
        print(f"[Subtask Generator] Error fallback used: {e}")
        return _keyword_fallback(title)
