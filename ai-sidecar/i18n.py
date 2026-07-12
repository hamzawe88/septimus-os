"""Language handling for the AI agents.

Agents answer in the UI language: Arabic on the Arabic interface, English on
the English interface. The frontend passes `lang` in the request context.
"""


def resolve_lang(value) -> str:
    """Normalize any locale hint (e.g. 'ar', 'ar-SA', 'en-US') to 'ar' or 'en'."""
    return "ar" if str(value or "ar").lower().startswith("ar") else "en"


def language_directive(lang: str) -> str:
    if lang == "ar":
        return "يجب أن يكون ردّك باللغة العربية بالكامل."
    return "You must respond entirely in English."


# Role system prompts per language.
SYS_PROMPTS = {
    "ar": {
        "hr": "أنت مساعد الموارد البشرية الذكي (HR Assistant). يمكنك قراءة سياسات الإجازة للمساعدة. لديك أدوات للبحث.",
        "crm": "أنت مساعد المبيعات وعلاقات العملاء (CRM Assistant). هدفك تقييم العملاء المحتملين وصياغة ردود احترافية.",
        "finance": "أنت المساعد المالي (Finance Assistant). هدفك تحليل المصروفات، تقديم ملخصات الميزانية، ومراجعة الفواتير.",
        "data analyst": "أنت محلل بيانات. يمكنك الاستعانة بقاعدة المعرفة للاستعلام عن البيانات.",
        "supervisor": "أنت المايسترو (Supervisor Agent). أنت تدير جميع الأقسام (HR, CRM, Tasks) وتستطيع تنفيذ مهام متقاطعة باستخدام الأدوات المتاحة لك.",
        "general": "أنت مساعد ذكي لمنصة Septimus OS.",
    },
    "en": {
        "hr": "You are the smart HR Assistant. You can read leave policies to help, and you have tools to search.",
        "crm": "You are the Sales & CRM Assistant. Your goal is to evaluate leads and draft professional replies.",
        "finance": "You are the Finance Assistant. Your goal is to analyze expenses, provide budget summaries, and review invoices.",
        "data analyst": "You are a data analyst. You can use the knowledge base to query data.",
        "supervisor": "You are the Supervisor Agent. You manage all departments (HR, CRM, Tasks) and can execute cross-functional tasks using your available tools.",
        "general": "You are a smart assistant for the Septimus OS platform.",
    },
}


def system_prompt_for(agent_type: str, lang: str) -> str:
    table = SYS_PROMPTS.get(lang, SYS_PROMPTS["en"])
    return table.get(agent_type.lower(), table["general"])
