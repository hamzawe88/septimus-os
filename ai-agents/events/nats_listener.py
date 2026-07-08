import os
import json
import nats
import asyncio
import aiohttp
import os.path
from nats.errors import ConnectionClosedError, TimeoutError, NoServersError

# ─── Initialize RAG Engine ────────────────────────────────────────────────────
try:
    from agents.rag_engine import DocumentProcessor
    rag_engine = DocumentProcessor()
    print("[NATS Listener] ✅ RAG Engine initialized")
except ImportError as e:
    print(f"[NATS Listener] ⚠️ RAG Engine not loaded: {e}")
    rag_engine = None

# ─── Initialize AI Orchestrator ───────────────────────────────────────────────
try:
    from agents.orchestrator import run_agent_team
    print("[NATS Listener] ✅ AI Orchestrator ready")
except ImportError as e:
    print(f"[NATS Listener] ⚠️ AI Orchestrator not loaded: {e}")
    run_agent_team = None

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:4000")


# ─── Helper: Post AI message back to Go Backend ───────────────────────────────

async def post_ai_message(channel_id: str, content: str, agent_role: str = "AI Orchestrator"):
    """Sends an AI-generated message to the Go backend system endpoint."""
    payload = {
        "channel_id": channel_id,
        "content": content,
        "is_ai_generated": True,
        "ai_agent_role": agent_role,
        "ai_proposal": None,
    }
    async with aiohttp.ClientSession() as session:
        try:
            resp = await session.post(
                f"{BACKEND_URL}/api/v1/system/messages",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10),
            )
            print(f"[NATS Listener] AI message sent → status {resp.status}")
        except Exception as e:
            print(f"[NATS Listener] ⚠️ Failed to post AI message: {e}")


# ─── Message Handler ─────────────────────────────────────────────────────────

async def message_handler(msg):
    """Handles events.messages.created — triggers AI analysis on @AI mentions"""
    try:
        data = json.loads(msg.data.decode())
        print(f"[MSG Handler] Received: {msg.subject} → {data.get('content', '')[:80]}")
        await msg.ack()

        content = data.get("content", "")
        channel_id = data.get("channel_id", "")

        if "@AI" in content or "@ai" in content or "ai" in content.lower():
            print("[MSG Handler] 🤖 AI mention detected — triggering Orchestrator")

            if run_agent_team:
                reply = await run_agent_team(
                    event_data=data,
                    event_type="MESSAGE_CREATED",
                    channel_id=channel_id,
                )
            else:
                reply = f"🤖 **Septimus AI**: '{content}' — AI Engine is initializing, please try again shortly."

            if reply:
                await post_ai_message(channel_id, reply, "AI Assistant")

    except Exception as e:
        print(f"[MSG Handler] Error: {e}")


# ─── Task Event Handler ───────────────────────────────────────────────────────

async def task_event_handler(msg):
    """Handles events.tasks.updated — runs AI Project Auditor on task transitions"""
    try:
        data = json.loads(msg.data.decode())
        print(f"[Task Handler] Received: {msg.subject} → type={data.get('type')}")
        await msg.ack()

        event_type = data.get("type")
        new_status = data.get("new_status")
        channel_id = data.get("channel_id", "00000000-0000-0000-0000-000000000000")

        # Only trigger AI analysis on meaningful transitions
        interesting_transitions = {"done", "blocked", "review"}
        if event_type == "TASK_TRANSITIONED" and new_status in interesting_transitions:
            print(f"[Task Handler] 🔍 Interesting transition: → {new_status}")

            if run_agent_team:
                reply = await run_agent_team(
                    event_data=data,
                    event_type=event_type,
                    channel_id=channel_id,
                )
            else:
                title = data.get("title", "Unknown Task")
                reply = (
                    f"📊 **Project Auditor** | Task: _{title}_\n"
                    f"Status changed to **{new_status}**. "
                    f"Team velocity appears stable. No critical bottlenecks detected."
                )

            if reply:
                await post_ai_message(channel_id, reply, "Project Auditor")

        # Always trigger workflow engine for task transitions
        if event_type == "TASK_TRANSITIONED":
            from handlers_bridge import trigger_workflows
            await trigger_workflows("task.transitioned", data)

    except Exception as e:
        print(f"[Task Handler] Error: {e}")


# ─── Document Event Handler ───────────────────────────────────────────────────

async def document_event_handler(msg):
    """Handles document.uploaded — embeds document into ChromaDB via RAG engine"""
    try:
        data = json.loads(msg.data.decode())
        print(f"[Doc Handler] Received: {msg.subject}")
        await msg.ack()

        doc_id = data.get("document_id")
        file_path = data.get("file_path")
        channel_id = data.get("channel_id", "")

        if not file_path:
            print("[Doc Handler] ⚠️ No file_path in event")
            return

        # Resolve absolute path relative to backend uploads dir
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        abs_path = os.path.join(base_dir, "backend-core", file_path.lstrip("./"))

        print(f"[Doc Handler] Processing: {abs_path}")

        if not os.path.exists(abs_path):
            print(f"[Doc Handler] ⚠️ File not found: {abs_path}")
            return

        if rag_engine:
            success = rag_engine.process_file(abs_path, {
                "entity_id": doc_id,
                "document_id": doc_id,
                "channel_id": channel_id,
            })
            status = "✅ ready for questions" if success else "❌ processing failed"
            print(f"[Doc Handler] Document {doc_id}: {status}")

            # Notify the channel that the document is processed
            if channel_id and success:
                notify_msg = (
                    f"📄 **Document Processed**\n"
                    f"The uploaded document has been indexed and is now **ready for AI-powered Q&A**.\n"
                    f"Click **Doc Chat** in the top bar to ask questions about it!"
                )
                await post_ai_message(channel_id, notify_msg, "RAG Engine")
        else:
            print("[Doc Handler] ⚠️ RAG Engine not available")

    except Exception as e:
        print(f"[Doc Handler] Error: {e}")


# ─── Main NATS Listener ───────────────────────────────────────────────────────

async def start_nats_listener():
    """Connects to NATS JetStream and subscribes to all Septimus OS events."""
    nats_url = os.getenv("NATS_URL", "nats://localhost:4222")
    print(f"\n[NATS Listener] 🔌 Connecting to {nats_url}...")

    retry_delay = 2
    while True:
        try:
            nc = await nats.connect(
                nats_url,
                reconnect_time_wait=2,
                max_reconnect_attempts=10,
            )
            js = nc.jetstream()
            print(f"[NATS Listener] ✅ Connected to NATS")

            # Create/ensure stream exists
            try:
                await js.add_stream(
                    name="COMPANY_OS_EVENTS",
                    subjects=["events.>"],
                )
            except Exception as e:
                print(f"[NATS Listener] Stream note: {e}")  # May already exist

            # Subscribe to Message Events (JetStream — durable)
            await js.subscribe(
                "events.messages.created",
                durable="ai-message-consumer",
                cb=message_handler,
            )

            # Subscribe to Task Events (JetStream — durable)
            await js.subscribe(
                "events.tasks.updated",
                durable="ai-task-consumer",
                cb=task_event_handler,
            )

            # Subscribe to Document Uploads (plain NATS — fire-and-forget)
            await nc.subscribe("document.uploaded", cb=document_event_handler)

            print("[NATS Listener] 🎯 Listening on:")
            print("  • events.messages.created")
            print("  • events.tasks.updated")
            print("  • document.uploaded")
            print("[NATS Listener] 🚀 AI Agent Team is LIVE\n")

            # Keep alive
            while True:
                await asyncio.sleep(60)

        except (ConnectionClosedError, NoServersError) as e:
            print(f"[NATS Listener] ⚠️ Connection lost: {e} — retrying in {retry_delay}s")
            await asyncio.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, 30)  # Exponential backoff

        except asyncio.CancelledError:
            print("[NATS Listener] Shutting down gracefully")
            break

        except Exception as e:
            print(f"[NATS Listener] Unexpected error: {e} — retrying in {retry_delay}s")
            await asyncio.sleep(retry_delay)
