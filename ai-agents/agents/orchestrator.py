"""
Septimus OS — LangGraph AI Orchestrator
حقيقي وكامل بدلاً من Mock
"""
import os
import json
import asyncio
from typing import TypedDict, Optional

# LangGraph
try:
    from langgraph.graph import StateGraph, END
    LANGGRAPH_AVAILABLE = True
except ImportError:
    LANGGRAPH_AVAILABLE = False
    print("[Orchestrator] ⚠️ langgraph not installed — using fallback mode")

# LLM selection
def create_llm():
    """يختار أفضل LLM متاح بناءً على متغيرات البيئة"""
    if os.getenv("OPENAI_API_KEY"):
        try:
            from langchain_openai import ChatOpenAI
            print("[Orchestrator] Using OpenAI GPT-3.5-turbo")
            return ChatOpenAI(model="gpt-3.5-turbo", temperature=0.2)
        except ImportError:
            pass

    if os.getenv("GOOGLE_API_KEY"):
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            print("[Orchestrator] Using Google Gemini 1.5 Flash")
            return ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.2)
        except ImportError:
            pass

    print("[Orchestrator] ⚠️ No LLM API key found — using local mock mode")
    return None


# ─── State Schema ─────────────────────────────────────────────────────────────

class OrchestratorState(TypedDict):
    event_type: str          # "TASK_TRANSITIONED", "MESSAGE_CREATED", etc.
    event_data: dict         # Raw event payload from NATS
    analysis: str            # Output from Analyst Agent
    proposal: dict           # Structured proposal from Strategy Agent
    review_approved: bool    # Output from Reviewer Agent
    final_message: str       # Human-readable output
    channel_id: str          # Target channel for the reply


# ─── Agent Nodes ──────────────────────────────────────────────────────────────

def analyst_node(state: OrchestratorState) -> OrchestratorState:
    """
    Analyst Agent: يفهم بيانات الحدث ويُلخصها
    """
    llm = create_llm()
    event_type = state["event_type"]
    event_data = state["event_data"]

    context = json.dumps(event_data, ensure_ascii=False, indent=2)
    prompt = f"""أنت محلل مشاريع ذكي في نظام Septimus OS.
تم استلام حدث من النوع: {event_type}
بيانات الحدث:
{context}

قم بتحليل هذا الحدث وأعطِ ملاحظات مختصرة (3 جمل فقط):
1. ماذا حدث؟
2. ما هو التأثير المتوقع؟
3. هل هناك شيء يستدعي الانتباه؟"""

    if llm:
        try:
            response = llm.invoke(prompt)
            analysis = response.content
        except Exception as e:
            print(f"[Analyst] LLM error: {e}")
            analysis = _fallback_analysis(event_type, event_data)
    else:
        analysis = _fallback_analysis(event_type, event_data)

    print(f"[Analyst Agent] ✅ Analysis complete")
    return {**state, "analysis": analysis}


def strategy_node(state: OrchestratorState) -> OrchestratorState:
    """
    Strategy Agent: يُشكّل مقترحاً بناءً على التحليل
    """
    llm = create_llm()
    analysis = state["analysis"]
    event_type = state["event_type"]
    event_data = state["event_data"]

    prompt = f"""أنت استراتيجي مشاريع في نظام Septimus OS.
بناءً على هذا التحليل:
{analysis}

اقترح إجراءً محدداً يمكن للفريق اتخاذه. 
أجب بصيغة JSON فقط:
{{
  "title": "عنوان المقترح",
  "description": "وصف تفصيلي للإجراء المقترح",
  "priority": "high|medium|low",
  "action_type": "assign_task|create_task|notify|none"
}}"""

    if llm:
        try:
            response = llm.invoke(prompt)
            content = response.content.strip()
            # Extract JSON if wrapped in markdown
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            proposal = json.loads(content)
        except Exception as e:
            print(f"[Strategy] LLM/Parse error: {e}")
            proposal = _fallback_proposal(event_type, event_data)
    else:
        proposal = _fallback_proposal(event_type, event_data)

    print(f"[Strategy Agent] ✅ Proposal: {proposal.get('title', 'N/A')}")
    return {**state, "proposal": proposal}


def reviewer_node(state: OrchestratorState) -> OrchestratorState:
    """
    Reviewer Agent: يراجع المقترح ويقرر الموافقة
    """
    proposal = state["proposal"]
    analysis = state["analysis"]

    # Auto-approve logic based on priority
    action_type = proposal.get("action_type", "none")
    priority = proposal.get("priority", "low")

    # Auto-approve if low-risk actions or low priority
    if action_type == "none":
        approved = False
    elif priority == "high" and action_type == "assign_task":
        approved = True  # High priority task assignments auto-approved
    elif priority in ["medium", "low"]:
        approved = True  # Medium/low risk actions auto-approved
    else:
        approved = True  # Default: approve

    print(f"[Reviewer Agent] {'✅ Approved' if approved else '❌ Rejected'}")

    # Build final message
    if approved and proposal.get("title"):
        final_message = (
            f"📊 **AI Orchestrator Analysis**\n\n"
            f"**Event**: {state['event_type']}\n\n"
            f"**Analysis**:\n{analysis}\n\n"
            f"**💡 Proposed Action**: {proposal.get('title', '')}\n"
            f"{proposal.get('description', '')}\n\n"
            f"*Priority: {priority.upper()} | Action: {action_type}*"
        )
    else:
        final_message = f"📊 **AI Analysis**: {analysis}"

    return {**state, "review_approved": approved, "final_message": final_message}


def should_publish(state: OrchestratorState) -> str:
    """Conditional edge: publish only if review approved"""
    return "publish" if state["review_approved"] else "skip"


# ─── Fallback Responses ───────────────────────────────────────────────────────

def _fallback_analysis(event_type: str, event_data: dict) -> str:
    """Used when no LLM is available"""
    if event_type == "TASK_TRANSITIONED":
        title = event_data.get("title", "Unknown Task")
        new_status = event_data.get("new_status", "unknown")
        return (
            f"المهمة '{title}' انتقلت إلى حالة '{new_status}'. "
            f"تم تسجيل هذا الانتقال في سجل المشروع. "
            f"يُنصح بمراجعة العمل المنجز للتأكد من جودته."
        )
    elif event_type == "MESSAGE_CREATED":
        return "رسالة جديدة تم استلامها في النظام. يتم معالجتها من قبل فريق الذكاء الاصطناعي."
    else:
        return f"حدث جديد من النوع {event_type} تم تسجيله في النظام."


def _fallback_proposal(event_type: str, event_data: dict) -> dict:
    """Used when no LLM is available"""
    if event_type == "TASK_TRANSITIONED":
        new_status = event_data.get("new_status", "")
        if new_status == "done":
            return {
                "title": "مراجعة إنجاز المهمة",
                "description": "تأكد من استيفاء معايير القبول ووثّق الدروس المستفادة.",
                "priority": "medium",
                "action_type": "notify"
            }
    return {
        "title": "متابعة الحدث",
        "description": "مراجعة الحدث وتحديد الإجراء المناسب.",
        "priority": "low",
        "action_type": "none"
    }


# ─── LangGraph Workflow Builder ───────────────────────────────────────────────

def build_orchestrator_graph():
    """بناء الـ LangGraph StateGraph للـ AI Orchestrator"""
    if not LANGGRAPH_AVAILABLE:
        return None

    workflow = StateGraph(OrchestratorState)

    # Add nodes
    workflow.add_node("analyst", analyst_node)
    workflow.add_node("strategy", strategy_node)
    workflow.add_node("reviewer", reviewer_node)

    # Entry point
    workflow.set_entry_point("analyst")

    # Sequential edges
    workflow.add_edge("analyst", "strategy")
    workflow.add_edge("strategy", "reviewer")

    # Conditional: reviewer decides if we publish
    workflow.add_conditional_edges(
        "reviewer",
        should_publish,
        {
            "publish": END,  # Final message is set, caller handles publishing
            "skip": END,
        }
    )

    return workflow.compile()


# Singleton compiled graph
_graph = None

def get_graph():
    global _graph
    if _graph is None:
        _graph = build_orchestrator_graph()
    return _graph


# ─── Public API ───────────────────────────────────────────────────────────────

async def run_agent_team(event_data: dict, event_type: str = "UNKNOWN", channel_id: str = "") -> str:
    """
    Main entry point for the AI Agent Team.
    Returns the final message to be published to the channel.
    """
    print(f"\n{'─'*50}")
    print(f"[Orchestrator] 🚀 Starting AI Agent Team")
    print(f"[Orchestrator] Event: {event_type}")
    print(f"{'─'*50}")

    initial_state: OrchestratorState = {
        "event_type": event_type,
        "event_data": event_data,
        "analysis": "",
        "proposal": {},
        "review_approved": False,
        "final_message": "",
        "channel_id": channel_id,
    }

    graph = get_graph()

    if graph:
        # Use LangGraph for real execution
        try:
            # LangGraph invoke is sync for now (async support varies by version)
            result = graph.invoke(initial_state)
            final_message = result.get("final_message", "")
            print(f"[Orchestrator] ✅ LangGraph execution complete")
            return final_message
        except Exception as e:
            print(f"[Orchestrator] LangGraph error: {e} — using fallback")

    # Fallback: run agents manually without LangGraph
    state = initial_state
    state = analyst_node(state)
    state = strategy_node(state)
    state = reviewer_node(state)

    print(f"[Orchestrator] ✅ Fallback execution complete")
    return state.get("final_message", "")
