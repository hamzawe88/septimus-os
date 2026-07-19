"""Conversational ReAct agent used by the /ai/chat endpoint.

Builds workspace-scoped tools, wires them to a LangGraph ReAct agent with
durable Postgres conversation memory, and returns the final reply text.
"""
import json

import requests

from config import BACKEND_URL, DB_DSN, internal_headers
from i18n import language_directive, resolve_lang, system_prompt_for
from reasoning_manual import get_reasoning_directives, get_validation_gate_prompt
from providers import get_active_llm
from observability import check_budget_guardrails, BudgetExceededError, get_langfuse_handler
import knowledge
import agent_rbac



def _queue_approval(workspace_id: str, action_type: str, entity_type: str, data: dict, lang: str) -> str:
    """Defer a write action to the human-in-the-loop approval queue instead of
    executing it. The action runs only when an admin approves it."""
    try:
        res = requests.post(
            f"{BACKEND_URL}/internal/pending-approvals",
            json={
                "agent_name": "chat",
                "action_type": action_type,
                "workspace_id": workspace_id,
                "entity_type": entity_type,
                "data": data,
                "reason": f"AI proposed '{action_type}'; awaiting human approval before execution.",
            },
            headers=internal_headers(),
        )
        if res.status_code in (200, 201):
            return ("أرسلتُ الطلب للموافقة البشرية، وسيُنفَّذ فور اعتماده من مسؤول." if lang == "ar"
                    else "I've queued this for human approval; it will run once an admin approves it.")
        return (f"تعذّر إرسال الطلب للموافقة: {res.text}" if lang == "ar"
                else f"Failed to queue the action for approval: {res.text}")
    except Exception as e:
        return (f"خطأ أثناء إرسال الطلب للموافقة: {e}" if lang == "ar"
                else f"Error queuing the action for approval: {e}")


def _build_tools_raw(workspace_id: str, lang: str, user_role: str = "member", agent_type: str = "general"):
    from langchain_core.tools import tool
    from agents_correspondence import rewrite_official_letter, audit_legal_compliance

    @tool
    def search_knowledge(query: str) -> str:
        """ابحث في مستندات الشركة، المهام، والسياسات عن أي معلومات مفيدة (Search Company Knowledge Base)."""
        try:
            res = requests.get(
                f"{BACKEND_URL}/internal/search/semantic?workspace_id={workspace_id}&q={query}&limit=3",
                headers=internal_headers(),
            )
            if res.status_code == 200:
                results = res.json().get("results", [])
                if not results:
                    return "لا توجد مستندات مطابقة."
                formatted = ""
                for r in results:
                    formatted += f"- [{r['entity_type']}] {r['content']} (Data: {r.get('entity_data')})\n"
                return f"إليك المعلومات التي وجدتها:\n{formatted}"
            return "فشل البحث في قاعدة المعرفة."
        except Exception as e:
            return f"خطأ أثناء البحث: {e}"

    # ── HR Specialist Tools ──────────────────────────────────────────────────
    @tool
    def get_hr_policy() -> str:
        """استرجاع سياسات الموارد البشرية الحالية (Get HR Policy)."""
        try:
            res = requests.get(
                f"{BACKEND_URL}/internal/entities?workspace_id={workspace_id}&type=hr_policy",
                headers=internal_headers(),
            )
            if res.status_code == 200:
                data = res.json()
                if data and data.get("data"):
                    return json.dumps(data["data"], ensure_ascii=False)
            return "لا توجد سياسة موارد بشرية محفوظة."
        except Exception as e:
            return f"خطأ في استرجاع السياسة: {e}"

    @tool
    def get_attendance_summary() -> str:
        """استرجاع ملخص الحضور والانصراف للموظفين (RBAC Protected: Admin/Manager only)."""
        if user_role.lower() not in ("admin", "owner", "manager", "superadmin", "hr"):
            return "عذراً، صلاحيات دورك (Role) لا تسمح باسترجاع تقارير الحضور والانصراف التفصيلية."
        try:
            res = requests.get(
                f"{BACKEND_URL}/internal/entities?workspace_id={workspace_id}&type=attendance",
                headers=internal_headers(),
            )
            if res.status_code == 200:
                data = res.json()
                if data and data.get("data"):
                    return json.dumps(data["data"], ensure_ascii=False)
            return "لا توجد بيانات حضور وانصراف مسجلة حالياً."
        except Exception as e:
            return f"خطأ في استرجاع بيانات الحضور: {e}"

    # ── CRM Specialist Tools ─────────────────────────────────────────────────
    @tool
    def get_crm_deals() -> str:
        """استرجاع صفقات المبيعات وعلاقات العملاء المسجلة (Get CRM Deals/Pipeline)."""
        try:
            res = requests.get(
                f"{BACKEND_URL}/internal/entities?workspace_id={workspace_id}&type=crm_deal",
                headers=internal_headers(),
            )
            if res.status_code == 200:
                data = res.json()
                if data and data.get("data"):
                    return json.dumps(data["data"], ensure_ascii=False)
            return "لا توجد صفقات مبيعات مسجلة حالياً."
        except Exception as e:
            return f"خطأ في استرجاع صفقات المبيعات: {e}"

    @tool
    def create_crm_deal(title: str, value: float, stage: str) -> str:
        """اقترح إنشاء صفقة مبيعات (RBAC Protected & Human Approval Required)."""
        if user_role.lower() not in ("admin", "owner", "manager", "superadmin", "sales"):
            return "عذراً، صلاحيات دورك لا تسمح بإنشاء أو اقتراح صفقات مبيعات جديدة."
        return _queue_approval(
            workspace_id, "Create CRM Deal", "crm_deal",
            {"title": title, "value": value, "stage": stage, "probability": 50},
            lang,
        )

    # ── Tasks Specialist Tools ───────────────────────────────────────────────
    @tool
    def get_tasks() -> str:
        """استرجاع المهام ومشاريع السبرنت الحالية (Get active tasks & sprint items)."""
        try:
            res = requests.get(
                f"{BACKEND_URL}/internal/entities?workspace_id={workspace_id}&type=task",
                headers=internal_headers(),
            )
            if res.status_code == 200:
                data = res.json()
                if data and data.get("data"):
                    return json.dumps(data["data"], ensure_ascii=False)
            return "لا توجد مهام مسجلة حالياً في السبرنت."
        except Exception as e:
            return f"خطأ في استرجاع قائمة المهام: {e}"

    @tool
    def create_task(title: str, description: str) -> str:
        """اقترح إنشاء مهمة جديدة (يتطلب موافقة بشرية قبل التنفيذ) — Propose creating a Task."""
        if user_role.lower() not in ("admin", "owner", "manager", "superadmin", "pm"):
            return "عذراً، صلاحيات دورك لا تسمح باقتراح مهام مشاريع جديدة."
        return _queue_approval(
            workspace_id, "Create Task", "task",
            {"title": title, "description": description, "status": "Todo", "priority": 1, "points": 0},
            lang,
        )

    # ── Correspondence Specialist Tools ──────────────────────────────────────
    @tool
    async def rewrite_correspondence(title: str, content: str, tone: str = "formal_institutional") -> str:
        """صياغة وإعادة كتابة الخطابات والمراسلات السيادية بلغة ديوانية رفيعة والمستوى المطلوب (Redraft correspondence)."""
        res = await rewrite_official_letter(workspace_id, title, content, target_tone=tone, lang=lang)
        return json.dumps(res, ensure_ascii=False)

    @tool
    async def audit_correspondence(title: str, content: str) -> str:
        """التدقيق والمراجعة القانونية والإدارية لخطاب رسمي (Legal & Compliance Audit of Correspondence)."""
        res = await audit_legal_compliance(workspace_id, title, content, lang=lang)
        return json.dumps(res, ensure_ascii=False)

    # ── Supervisor Delegation Tools ──────────────────────────────────────────
    @tool
    async def delegate_to_correspondence_specialist(task_description: str) -> str:
        """فوض استفسار أو مهمة المراسلات السيادية أو صياغة الخطابات إلى وكيل المراسلات المتخصص (Delegate correspondence tasks to Correspondence Specialist Agent)."""
        return await run_chat_agent(
            agent_type="correspondence",
            message=task_description,
            context={"workspace_id": workspace_id, "lang": lang, "user_role": user_role, "stream_id": ""},
            thread_id=f"subagent-correspondence-{workspace_id}",
        )

    @tool
    async def delegate_to_crm_specialist(task_description: str) -> str:
        """فوض استفسار أو مهمة المبيعات وصفقات العملاء إلى وكيل الـ CRM المتخصص (Delegate CRM tasks to CRM Specialist Agent)."""
        return await run_chat_agent(
            agent_type="crm",
            message=task_description,
            context={"workspace_id": workspace_id, "lang": lang, "user_role": user_role, "stream_id": ""},
            thread_id=f"subagent-crm-{workspace_id}",
        )

    @tool
    async def delegate_to_hr_specialist(task_description: str) -> str:
        """فوض استفسار أو مهمة الموارد البشرية والسياسات والحضور إلى وكيل الموارد البشرية المتخصص (Delegate HR tasks to HR Specialist Agent)."""
        return await run_chat_agent(
            agent_type="hr",
            message=task_description,
            context={"workspace_id": workspace_id, "lang": lang, "user_role": user_role, "stream_id": ""},
            thread_id=f"subagent-hr-{workspace_id}",
        )

    @tool
    async def delegate_to_tasks_specialist(task_description: str) -> str:
        """فوض استفسار أو مهمة إدارة المشاريع والمهام إلى وكيل المهام المتخصص (Delegate task/sprint tracking to Tasks Specialist Agent)."""
        return await run_chat_agent(
            agent_type="tasks",
            message=task_description,
            context={"workspace_id": workspace_id, "lang": lang, "user_role": user_role, "stream_id": ""},
            thread_id=f"subagent-tasks-{workspace_id}",
        )

    # ── Institutional Facts / Long-Term Memory Tools ──────────────────────────
    @tool
    def list_institutional_facts() -> str:
        """استعراض حقائق المنشأة والتفضيلات المؤسسية المسجلة في الذاكرة طويلة المدى (List long-term institutional facts)."""
        facts = knowledge.list_facts(workspace_id)
        if not facts:
            return "لا توجد حقائق أو تفضيلات مؤسسية مسجلة حالياً في الذاكرة طويلة المدى."
        lines = [f"- [{f.get('id')}] {f.get('content')}" for f in facts]
        return "حقائق المنشأة والتفضيلات المسجلة:\n" + "\n".join(lines)

    @tool
    def save_institutional_fact(fact_text: str) -> str:
        """حفظ تفضيل مؤسسي أو سياسة دائمة في الذاكرة طويلة المدى للمنشأة عبر pgvector (Save a permanent institutional fact/preference to long-term memory)."""
        if user_role.lower() not in ("admin", "owner", "manager", "superadmin", "hr", "sales", "diwan", "pm"):
            return "عذراً، صلاحيات دورك لا تسمح بتسجيل أو حفظ سياسات وحقائق جديدة في الذاكرة طويلة المدى للمنشأة."
        res = knowledge.save_fact(workspace_id, fact_text)
        if res and res.get("id"):
            return f"تم حفظ الحقيقة/التفضيل المؤسسي بنجاح في الذاكرة طويلة المدى (ID: {res['id']}). ستلتزم كافة وكلاء الذكاء الاصطناعي بهذا التفضيل مستقبلاً."
        return "حدث خطأ أثناء محاولة حفظ الحقيقة المؤسسية."

    @tool
    def delete_institutional_fact(fact_id: str) -> str:
        """حذف حقيقة أو سياسة مؤسسية قديمة من الذاكرة طويلة المدى بواسطة معرف الحقيقة ID (Delete an institutional fact by ID)."""
        if user_role.lower() not in ("admin", "owner", "manager", "superadmin"):
            return "عذراً، يتطلب حذف السياسات أو التفضيلات من الذاكرة طويلة المدى صلاحيات مدير أو مشرف عام."
        success = knowledge.delete_fact(fact_id)
        if success:
            return f"تم حذف الحقيقة المؤسسية (ID: {fact_id}) بنجاح من الذاكرة طويلة المدى."
        return "لم يتم العثور على الحقيقة أو تعذر حذفها."

    def _with_memory_tools(t_list: list) -> list:
        t_list.append(list_institutional_facts)
        if user_role.lower() in ("admin", "owner", "manager", "superadmin", "hr", "sales", "diwan", "pm"):
            t_list.append(save_institutional_fact)
        if user_role.lower() in ("admin", "owner", "manager", "superadmin"):
            t_list.append(delete_institutional_fact)
        return t_list

    # Filter tools based on agent specialty and RBAC role
    at = (agent_type or "general").lower()
    if at in ("hr", "policy", "attendance"):
        tools = [search_knowledge, get_hr_policy]
        if user_role.lower() in ("admin", "owner", "manager", "superadmin", "hr"):
            tools.append(get_attendance_summary)
        return _with_memory_tools(tools)

    if at in ("crm", "sales"):
        tools = [search_knowledge, get_crm_deals]
        if user_role.lower() in ("admin", "owner", "manager", "superadmin", "sales"):
            tools.append(create_crm_deal)
        return _with_memory_tools(tools)

    if at in ("tasks", "sprint", "pm"):
        tools = [search_knowledge, get_tasks]
        if user_role.lower() in ("admin", "owner", "manager", "superadmin", "pm"):
            tools.append(create_task)
        return _with_memory_tools(tools)

    if at in ("correspondence", "diwan"):
        return _with_memory_tools([search_knowledge, rewrite_correspondence, audit_correspondence])

    if at == "monolithic":
        tools = [search_knowledge, get_hr_policy, get_crm_deals, get_tasks, rewrite_correspondence, audit_correspondence]
        if user_role.lower() in ("admin", "owner", "manager", "superadmin"):
            tools.extend([get_attendance_summary, create_crm_deal, create_task])
        return _with_memory_tools(tools)

    # Default: Supervisor / General agent with delegation abilities
    return _with_memory_tools([
        search_knowledge,
        delegate_to_correspondence_specialist,
        delegate_to_crm_specialist,
        delegate_to_hr_specialist,
        delegate_to_tasks_specialist,
    ])


def _build_tools(workspace_id: str, lang: str, user_role: str = "member", agent_type: str = "general"):
    """Assemble the agent's tools, then pass them through the central agent-RBAC
    capability matrix as a fail-closed, auditable boundary (defense-in-depth on
    top of the per-tool role checks)."""
    tools = _build_tools_raw(workspace_id, lang, user_role=user_role, agent_type=agent_type)
    return agent_rbac.enforce(agent_type, tools)


async def _fetch_hr_policy_text(workspace_id: str) -> str:
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{BACKEND_URL}/internal/entities?workspace_id={workspace_id}&type=hr_policy",
                headers=internal_headers(),
            ) as resp:
                if resp.status == 200:
                    p_data = await resp.json()
                    if p_data and p_data.get("data"):
                        return f"\nسياسات الموارد البشرية الحالية (HR Policies): {json.dumps(p_data['data'], ensure_ascii=False)}"
    except Exception as e:
        print(f"Failed to fetch HR policy: {e}")
    return ""


async def run_chat_agent(agent_type: str, message: str, context: dict,
                         thread_id: str, system_prompt=None) -> str:
    """Run the conversational agent and return the final reply text.

    When context carries a `stream_id`, reply tokens are also streamed live to
    the Centrifugo channel `ai_<stream_id>` (best-effort). The returned string
    stays the authoritative reply the caller sends over HTTP.

    Raises on failure so the caller can format a localized error.
    """
    from langgraph.prebuilt import create_react_agent
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    lang = resolve_lang(context.get("lang"))
    workspace_id = context.get("workspace_id")
    user_role = str(context.get("user_role", "member")).lower()
    stream_id = context.get("stream_id")
    channel = f"ai_{stream_id}" if stream_id else None

    # Check budget guardrails before initiating any agent inference
    try:
        check_budget_guardrails(workspace_id, lang)
    except BudgetExceededError as e:
        return str(e)

    llm = await get_active_llm(workspace_id)
    if not llm:
        raise RuntimeError("no active LLM")

    tools = _build_tools(workspace_id, lang, user_role=user_role, agent_type=agent_type)
    if system_prompt:
        sp = f"{system_prompt}\n\n{get_reasoning_directives(agent_type, lang)}\n\n{get_validation_gate_prompt(lang)}"
    else:
        sp = system_prompt_for(agent_type, lang)

    hr_policy_text = ""
    if agent_type.lower() == "hr":
        hr_policy_text = await _fetch_hr_policy_text(workspace_id)

    facts = knowledge.retrieve_institutional_facts(workspace_id, message, k=5)
    facts_text = ""
    if facts:
        facts_items = "\n".join([f"- {f}" for f in facts])
        facts_text = (
            f"\n\n--- الذاكرة المؤسسية وحقائق المنشأة (Institutional Facts & Verified Stats) ---\n"
            f"يرجى الالتزام التام بالسياسات والحقائق المؤسسية التالية في كافة إجاباتك:\n"
            f"{facts_items}\n"
            f"ملاحظة تنبيهية إجبارية (Pre-Execution Guardrail): إذا كانت أي من هذه الحقائق تحتوي على أرقام أو نسب مؤكدة ([VERIFIED STATS])، "
            f"يجب عليك ذكر هذه الأرقام الدقيقة بوضوح في أول إجابتك (Answer First)، مع تقديم نصيحة استباقية لمعالجة أي مواضع خلل أو تأخير تشير إليها تلك الأرقام.\n"
            f"--------------------------------------------------------------------------------\n"
            if lang == "ar" else
            f"\n\n--- Institutional Facts & Verified Stats Guardrails ---\n"
            f"You MUST strictly adhere to the following institutional preferences and verified facts:\n"
            f"{facts_items}\n"
            f"Mandatory Pre-Execution Guardrail: If any fact contains [VERIFIED STATS] regarding bottlenecks or metrics, "
            f"you MUST explicitly state these verified figures at the very beginning of your answer (Answer First), "
            f"followed by proactive advisory recommendations on resolving those bottlenecks.\n"
            f"----------------------------------------------------\n"
        )

    reasoning_hint = ("فكّر (Reason) قبل الإجابة واستخدم الأدوات المتاحة متى دعت الحاجة."
                      if lang == "ar"
                      else "Reason before answering and use the available tools whenever needed.")
    system_message = (f"{sp}\nContext: {json.dumps(context, ensure_ascii=False)}\n"
                      f"{facts_text}{hr_policy_text}\n\n{language_directive(lang)} {reasoning_hint}")


    # Durable conversation memory in Postgres keyed by thread_id.
    async with AsyncPostgresSaver.from_conn_string(DB_DSN) as memory:
        # langgraph-checkpoint-postgres >=3 exposes async setup as .setup()
        await memory.setup()
        # langgraph >=1.0 renamed state_modifier -> prompt
        agent = create_react_agent(llm, tools=tools, checkpointer=memory, prompt=system_message)

        # Enforce maximum ReAct iterations (recursion_limit) to prevent runaway inference loops
        config = {
            "configurable": {"thread_id": thread_id},
            "recursion_limit": 8,
        }
        # Optional Langfuse tracing; None (the default) leaves `config` untouched.
        # Token-usage tracking is handled by the callback attached to the model
        # in get_active_llm, so it fires here too without extra wiring.
        langfuse_handler = get_langfuse_handler(
            workspace_id,
            user_id=context.get("user_id"),
            session_id=thread_id,
            tags=[f"agent:{agent_type}", f"lang:{lang}"],
        )
        if langfuse_handler is not None:
            config["callbacks"] = [langfuse_handler]
        inputs = {"messages": [("user", message)]}

        if channel:
            return await _run_streaming(agent, inputs, config, channel)

        final_reply = ""
        async for event in agent.astream(inputs, config, stream_mode="values"):
            msg = event["messages"][-1]
            if type(msg).__name__ == "AIMessage" and not getattr(msg, "tool_calls", None):
                final_reply = msg.content
    return final_reply


async def _run_streaming(agent, inputs, config, channel: str) -> str:
    """Stream token deltas of the final assistant message to `channel` and
    return the accumulated reply. Falls back cleanly if message-mode streaming
    isn't available."""
    from realtime import publish

    final_reply = ""
    try:
        async for chunk, _meta in agent.astream(inputs, config, stream_mode="messages"):
            # Only stream the assistant's natural-language tokens — skip tool
            # call chunks (empty content) and tool result messages.
            name = type(chunk).__name__
            delta = getattr(chunk, "content", "")
            if "AIMessage" in name and isinstance(delta, str) and delta:
                final_reply += delta
                await publish(channel, {"type": "token", "delta": delta})
    except Exception as e:
        # Fall back to a single non-streamed pass so the reply is never lost.
        print(f"[chat] streaming failed ({e}); falling back to non-streamed run")
        final_reply = ""
        async for event in agent.astream(inputs, config, stream_mode="values"):
            msg = event["messages"][-1]
            if type(msg).__name__ == "AIMessage" and not getattr(msg, "tool_calls", None):
                final_reply = msg.content

    await publish(channel, {"type": "done", "reply": final_reply})
    return final_reply
