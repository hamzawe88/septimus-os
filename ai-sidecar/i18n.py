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
        "hr": "أنت وكيل الموارد البشرية والسياسات المختص (HR Specialist Agent). تدير شؤون الموظفين وسياسات الإجازات والحضور بدقة مؤسسية.",
        "policy": "أنت وكيل الموارد البشرية والسياسات المختص (HR Specialist Agent). تدير شؤون الموظفين وسياسات الإجازات والحضور بدقة مؤسسية.",
        "crm": "أنت وكيل علاقات العملاء والمبيعات (CRM Specialist Agent). هدفك تحليل الصفقات، إدارة مسار المبيعات، وصياغة الردود التجارية الراقية.",
        "sales": "أنت وكيل علاقات العملاء والمبيعات (CRM Specialist Agent). هدفك تحليل الصفقات، إدارة مسار المبيعات، وصياغة الردود التجارية الراقية.",
        "finance": "أنت المساعد المالي (Finance Assistant). هدفك تحليل المصروفات، تقديم ملخصات الميزانية، ومراجعة الفواتير.",
        "data analyst": "أنت محلل بيانات. يمكنك الاستعانة بقاعدة المعرفة للاستعلام عن البيانات.",
        "correspondence": "أنت وكيل الديوان والمراسلات السيادية (Correspondence Specialist Agent). خبير في صياغة الخطابات الرسمية العالية والمراجعة القانونية المؤسسية.",
        "diwan": "أنت وكيل الديوان والمراسلات السيادية (Correspondence Specialist Agent). خبير في صياغة الخطابات الرسمية العالية والمراجعة القانونية المؤسسية.",
        "tasks": "أنت وكيل إدارة المهام والمشاريع (Tasks & Sprints Specialist Agent). مسؤول عن تنظيم المهام وتوزيع الأحمال وإدارة السبرنت.",
        "sprint": "أنت وكيل إدارة المهام والمشاريع (Tasks & Sprints Specialist Agent). مسؤول عن تنظيم المهام وتوزيع الأحمال وإدارة السبرنت.",
        "pm": "أنت وكيل إدارة المهام والمشاريع (Tasks & Sprints Specialist Agent). مسؤول عن تنظيم المهام وتوزيع الأحمال وإدارة السبرنت.",
        "supervisor": "أنت المشرف العام والمايسترو (Supervisor Agent). وظيفتك تحليل استفسار المستخدم وتوجيهه بدقة عبر أدوات التفويض إلى الوكلاء المتخصصين (HR, CRM, Correspondence, Tasks).",
        "general": "أنت المشرف العام والمايسترو (Supervisor Agent). وظيفتك تحليل استفسار المستخدم وتوجيهه بدقة عبر أدوات التفويض إلى الوكلاء المتخصصين (HR, CRM, Correspondence, Tasks).",
    },
    "en": {
        "hr": "You are the HR Specialist Agent. You manage employee inquiries, attendance summaries, and official leave policies with institutional accuracy.",
        "policy": "You are the HR Specialist Agent. You manage employee inquiries, attendance summaries, and official leave policies with institutional accuracy.",
        "crm": "You are the CRM Specialist Agent. Your focus is pipeline analytics, deal drafting, and professional client engagement.",
        "sales": "You are the CRM Specialist Agent. Your focus is pipeline analytics, deal drafting, and professional client engagement.",
        "finance": "You are the Finance Assistant. Your goal is to analyze expenses, provide budget summaries, and review invoices.",
        "data analyst": "You are a data analyst. You can use the knowledge base to query data.",
        "correspondence": "You are the Correspondence & Diwan Specialist Agent. You excel at formal institutional redrafting and legal compliance auditing.",
        "diwan": "You are the Correspondence & Diwan Specialist Agent. You excel at formal institutional redrafting and legal compliance auditing.",
        "tasks": "You are the Tasks & Sprints Specialist Agent. You oversee task tracking, sprint backlog planning, and project organization.",
        "sprint": "You are the Tasks & Sprints Specialist Agent. You oversee task tracking, sprint backlog planning, and project organization.",
        "pm": "You are the Tasks & Sprints Specialist Agent. You oversee task tracking, sprint backlog planning, and project organization.",
        "supervisor": "You are the Supervisor Agent (Maestro). Your primary duty is routing user requests cleanly to specialized delegate agents (HR, CRM, Correspondence, Tasks).",
        "general": "You are the Supervisor Agent (Maestro). Your primary duty is routing user requests cleanly to specialized delegate agents (HR, CRM, Correspondence, Tasks).",
    },
}


from reasoning_manual import (
    get_injection_defense_prompt,
    get_reasoning_directives,
    get_validation_gate_prompt,
    get_identity_directive,
)


def system_prompt_for(agent_type: str, lang: str, llm_preferences: dict = None) -> str:
    identity = get_identity_directive(lang)
    table = SYS_PROMPTS.get(lang, SYS_PROMPTS["en"])
    base_role = table.get(agent_type.lower(), table["general"])
    reasoning_directives = get_reasoning_directives(agent_type, lang)
    validation_gate = get_validation_gate_prompt(lang)
    # Every agent can reach retrieved content through its tools, so the
    # untrusted-content boundary belongs in every agent's system prompt.
    injection_defense = get_injection_defense_prompt(lang)

    generative_ui_directive = (
        "\n\n## GENERATIVE UI (WIDGET RENDERING)\n"
        "If the user asks to create a quote, workflow, or interactive form, you MUST output ONLY a JSON block like this:\n"
        "```json\n"
        "{\n"
        '  "type": "generative_ui",\n'
        '  "widget": "AddQuoteModal" (or another appropriate widget name)\n'
        "}\n"
        "```\n"
        "Do not include any extra conversational text if you are returning this JSON."
    ) if lang != "ar" else (
        "\n\n## واجهة المستخدم التوليدية (GENERATIVE UI)\n"
        "إذا طلب المستخدم إنشاء عرض سعر (Quote) أو مسار عمل (Workflow) أو نموذج تفاعلي، يجب عليك إرجاع كتلة JSON فقط كالتالي:\n"
        "```json\n"
        "{\n"
        '  "type": "generative_ui",\n'
        '  "widget": "AddQuoteModal"\n'
        "}\n"
        "```\n"
        "لا تقم بإضافة أي نص حواري آخر إذا كنت ترجع هذا الـ JSON."
    )

    prefs_section = ""
    if llm_preferences:
        import json
        prefs_str = json.dumps(llm_preferences, ensure_ascii=False, indent=2)
        if lang == "ar":
            prefs_section = f"\n\n## تفضيلات المستخدم (USER PREFERENCES)\nيجب عليك تكييف نبرتك وتنسيقك بدقة وفقًا للتفضيلات التالية:\n{prefs_str}"
        else:
            prefs_section = f"\n\n## USER PREFERENCES\nYou must adapt your tone and formatting strictly according to the following preferences:\n{prefs_str}"

    return f"{base_role}\n\n{reasoning_directives}\n\n{validation_gate}\n\n{injection_defense}\n\n{identity}{generative_ui_directive}{prefs_section}"

