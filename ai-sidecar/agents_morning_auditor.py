"""Morning Brief Proactive Auditor Agent."""
import asyncio
import json
import logging
import os

from langchain_core.messages import SystemMessage, HumanMessage
from providers import get_active_llm
from reasoning_manual import get_identity_directive
from i18n import language_directive, resolve_lang

logger = logging.getLogger("agents_morning_auditor")

# The frontend gives up after 60s (MorningBriefModal). Budget well inside that:
# get_active_llm (provider lookup + budget check) runs BEFORE the guarded call
# and can add several seconds, and the Centrifugo publish adds more — so cap the
# generation itself at 40s to leave comfortable margin. Failing here publishes a
# message we control over the same channel instead of the generic frontend
# timeout, and stops a hung model generating after nobody is listening.
_BRIEF_TIMEOUT_SECONDS = float(os.getenv("MORNING_BRIEF_TIMEOUT_SECONDS", "40"))


async def generate_morning_brief(data: dict) -> str:
    """Generate the morning brief markdown report.

    Optimised for latency, because a caller (and the 8 AM push) waits on this in
    real time. The previous version injected the full high-stakes reasoning
    manual + validation gate into the system prompt of a summarisation task, then
    called the strong tier with no timeout and no output cap — three multipliers
    on generation time that together blew past the 60s frontend budget. The brief
    is a bounded summary, so it gets a focused prompt, an output-length cap, and a
    hard timeout.
    """
    workspace_id = data.get("workspace_id")
    user_role = data.get("user_role", "member")
    projects = data.get("projects", [])
    recent_tasks = data.get("recent_tasks", [])
    stuck_tasks = data.get("stuck_tasks", [])
    attendance = data.get("attendance", [])
    entities = data.get("entities", [])
    canonical_tasks = data.get("tasks", [])

    # Honor the requester's UI language. The brief is pushed straight to the user
    # over Centrifugo with no downstream translation step, so a hard-coded "ar"
    # meant an English-interface user got an Arabic report. The instruction body
    # below stays Arabic (it is model-facing), while language_directive(lang)
    # controls the language the user actually reads.
    lang = resolve_lang(data.get("lang"))

    system_prompt = f"""{get_identity_directive(lang)}

أنت المدقق الاستباقي (Proactive Auditor) في نظام Septimus OS. حلّل البيانات التشغيلية أدناه واستخرج أهم الرؤى واكتشف الشذوذ (مهام راكدة، تأخّر حضور، صفقات معلقة، فواتير متأخرة).

دور مستلم التقرير: {user_role}. لدور 'admin'/'manager' قدّم ملخصاً استراتيجياً بالأولويات والصفقات؛ لدور 'member' ملخصاً مبسطاً بالمهام.

قواعد إلزامية:
- ابدأ بالنتيجة مباشرة (Answer First)، بلا مقدمات.
- استند للأرقام الواردة فقط؛ لا تخترع بيانات غير موجودة، وإن كانت البيانات فارغة فاذكر ذلك بإيجاز.
- **الإيجاز**: 120–200 كلمة كحد أقصى، تنسيق Markdown، نقاط قصيرة، رموز تعبيرية بحذر.

{language_directive(lang)}"""

    def _minify_data(data: dict) -> dict:
        """Minify data dictionary to reduce LLM context window size."""
        def extract_keys(item_list, keys):
            return [{k: item.get(k) for k in keys if k in item} for item in item_list]

        return {
            "projects": extract_keys(data.get("projects", []), ["id", "name", "status"]),
            "recent_tasks": extract_keys(data.get("recent_tasks", []), ["id", "title", "status", "priority", "created_at"]),
            "stuck_tasks": extract_keys(data.get("stuck_tasks", []), ["id", "title", "status", "priority", "updated_at"]),
            "attendance": extract_keys(data.get("attendance", []), ["user_id", "status", "check_in", "check_out", "date"]),
        }

    def _flatten_entities(raw_entities: list, raw_tasks: list | None = None) -> dict:
        """Turn backend Entity records into per-type summaries.

        The backend sends unified `entities`, each shaped
        `{id, entity_type, data: {...}, created_at, ...}` — the human-readable
        fields (title, status, value, stage, due_date) live INSIDE `data`, not at
        the top level. The old minifier read `type`/`title`/`status` from the top
        level and got nothing but nulls, so every brief was data-blind. Here we
        read `entity_type` and pull the salient fields out of `data`.
        """
        buckets = {"overdue_tasks": [], "overdue_invoices": [], "new_deals": [], "other": []}
        for task in raw_tasks or []:
            if not isinstance(task, dict):
                continue
            buckets["overdue_tasks"].append({
                "title": task.get("Title") or task.get("title") or "(بدون عنوان)",
                "status": task.get("Status") or task.get("status"),
                "priority": task.get("Priority") or task.get("priority"),
                "due_date": task.get("DueDate") or task.get("due_date"),
            })
        for e in raw_entities or []:
            if not isinstance(e, dict):
                continue
            etype = (e.get("entity_type") or e.get("type") or "").lower()
            d = e.get("data") or {}
            if not isinstance(d, dict):
                d = {}
            title = d.get("title") or d.get("name") or d.get("subject") or "(بدون عنوان)"
            if etype == "task":
                buckets["overdue_tasks"].append(
                    {"title": title, "status": d.get("status"), "priority": d.get("priority"),
                     "due_date": d.get("due_date")})
            elif etype in ("finance_invoice", "invoice"):
                buckets["overdue_invoices"].append(
                    {"title": title, "amount": d.get("amount") or d.get("total"),
                     "currency": d.get("currency"), "due_date": d.get("due_date")})
            elif etype == "crm_opportunity":
                buckets["new_deals"].append(
                    {"title": d.get("company") or title, "value": d.get("value"),
                     "stage": d.get("stage") or d.get("status")})
            else:
                buckets["other"].append({"type": etype, "title": title})
        return buckets

    # Build the data payload string for the LLM
    minified = _minify_data(data)
    buckets = _flatten_entities(entities, canonical_tasks)
    minified["actionable_entities"] = buckets

    data_str = f"""
البيانات التشغيلية المستخرجة:
- المهام المتأخرة (تجاوزت موعدها): {len(buckets['overdue_tasks'])}
- الفواتير المتأخرة: {len(buckets['overdue_invoices'])}
- فرص المبيعات الحالية: {len(buckets['new_deals'])}
- المشاريع (إن وُجدت): {len(projects)} · المهام الحديثة: {len(recent_tasks)} · الراكدة: {len(stuck_tasks)} · سجلات الحضور: {len(attendance)}

البيانات التفصيلية (JSON):
{json.dumps(minified, ensure_ascii=False, default=str)}
"""

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=data_str)
    ]

    def _msg(ar: str, en: str) -> str:
        return ar if lang == "ar" else en

    try:
        # Fast tier: this is a bounded ~200-word summary that a caller waits on in
        # real time, not deep multi-step reasoning. The strong tier (a heavier,
        # often local model) was the dominant contributor to the timeout.
        llm = await get_active_llm(workspace_id, tier="fast")
    except Exception as e:
        logger.error(f"Failed to obtain LLM for morning brief: {e}")
        return _msg(
            "⚠️ تعذّر إعداد الموجز: لم يُضبط مزوّد الذكاء الاصطناعي لبيئة العمل. راجع الإعدادات.",
            "⚠️ Could not prepare the brief: no AI provider is configured for this workspace.",
        )
    if llm is None:
        return _msg(
            "⚠️ لا يوجد مزوّد ذكاء اصطناعي نشط. راجع إعدادات النظام → الذكاء الاصطناعي.",
            "⚠️ No active AI provider. Check System settings → AI.",
        )

    try:
        # Hard cap so a slow local model fails inside the frontend's window with a
        # message we own, rather than letting the request hang.
        response = await asyncio.wait_for(llm.ainvoke(messages), timeout=_BRIEF_TIMEOUT_SECONDS)
        return response.content
    except asyncio.TimeoutError:
        logger.warning(f"Morning brief timed out after {_BRIEF_TIMEOUT_SECONDS}s for ws={workspace_id}")
        return _msg(
            "⏳ تعذّر إكمال الموجز الصباحي في الوقت المتاح — قد يكون النموذج الحالي بطيئاً. "
            "جرّب مزوّداً/نموذجاً أسرع من إعدادات الذكاء الاصطناعي، أو أعد المحاولة بعد قليل.",
            "⏳ The morning brief didn't finish in time — the current model may be slow. "
            "Try a faster provider/model in AI settings, or retry shortly.",
        )
    except Exception as e:
        logger.error(f"Failed to generate morning brief: {e}")
        return _msg(
            "⚠️ عذراً، تعذّر توليد الموجز حالياً. يرجى المحاولة مرة أخرى.",
            "⚠️ Sorry, the brief could not be generated right now. Please try again.",
        )
