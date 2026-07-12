"""OpenAI Realtime API (Voice & Audio Streaming) orchestration for Septimus OS.

Provides:
  1. Ephemeral Client Secrets (`create_realtime_session`) for low-latency WebRTC/WebSocket connection from the browser.
  2. Server-side WebSocket Relay (`realtime_voice_proxy`) with function calling / RAG tool execution.
"""
import asyncio
import json
from typing import Any, Dict, List, Optional

import aiohttp
from fastapi import WebSocket, WebSocketDisconnect

from config import OPENAI_API_KEY
from providers import _active_provider
from knowledge import retrieve_context


REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17"
OPENAI_REALTIME_WS_URL = f"wss://api.openai.com/v1/realtime?model={REALTIME_MODEL}"
OPENAI_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions"

DEFAULT_VOICE_INSTRUCTIONS = """
أنت المساعد الذكي الصوتي لنظام Septimus OS. تتحدث بنبرة احترافية، ودودة، وواضحة.
يمكنك التحدث باللغة العربية أو الإنجليزية حسب لغة المستخدم.
إذا سأل المستخدم عن سياسات ومستندات العمل في المؤسسة أو بيانات المعرفة، استخدم أداة `query_knowledge_base` للبحث والإجابة بناءً على السياق فقط.
كن موجزاً ومباشراً في إجاباتك الصوتية.
"""

# Available tools for OpenAI Realtime voice sessions
REALTIME_TOOLS = [
    {
        "type": "function",
        "name": "query_knowledge_base",
        "description": "البحث واسترجاع السياق والمعلومات من قاعدة المعرفة الخاصة بفريق العمل ومستندات Septimus OS.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "سؤال البحث أو الكلمات المفتاحية باللغة العربية أو الإنجليزية",
                }
            },
            "required": ["query"],
        },
    }
]


def _get_openai_key_for_workspace(workspace_id: str) -> Optional[str]:
    p = _active_provider(workspace_id)
    if p and p.get("provider") == "openai" and p.get("apiKey"):
        return p.get("apiKey").strip()
    return OPENAI_API_KEY


async def create_realtime_session(
    workspace_id: str,
    voice: str = "alloy",
    instructions: Optional[str] = None,
) -> Dict[str, Any]:
    """Create an ephemeral session with OpenAI Realtime API to obtain a client_secret token.
    This allows frontend WebRTC / WebSocket audio streaming without exposing the backend API key.
    """
    api_key = _get_openai_key_for_workspace(workspace_id)
    if not api_key:
        raise ValueError("No active OpenAI API key found for this workspace.")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": REALTIME_MODEL,
        "modalities": ["audio", "text"],
        "voice": voice,
        "instructions": instructions or DEFAULT_VOICE_INSTRUCTIONS,
        "turn_detection": {"type": "server_vad"},
        "tools": REALTIME_TOOLS,
        "tool_choice": "auto",
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(OPENAI_SESSIONS_URL, headers=headers, json=payload, timeout=10) as res:
            if res.status != 200:
                err_text = await res.text()
                raise RuntimeError(f"OpenAI Realtime session error ({res.status}): {err_text}")
            return await res.json()


async def execute_voice_tool_call(workspace_id: str, call_id: str, name: str, arguments_json: str) -> Dict[str, Any]:
    """Execute a function call requested by the OpenAI Realtime model during voice chat."""
    try:
        args = json.loads(arguments_json) if arguments_json else {}
    except Exception as e:
        args = {}

    if name == "query_knowledge_base":
        query = args.get("query", "")
        print(f"[voice_realtime] Tool query_knowledge_base called with query: '{query}' for workspace {workspace_id}")
        context = retrieve_context(workspace_id, query, k=3)
        result_text = context if context else "لا توجد مستندات مطابقة لسؤالك في قاعدة المعرفة حالياً."
    else:
        result_text = f"Tool {name} not recognized or not implemented yet."

    return {
        "type": "conversation.item.create",
        "item": {
            "type": "function_call_output",
            "call_id": call_id,
            "output": result_text,
        }
    }


async def realtime_voice_proxy(client_ws: WebSocket, workspace_id: str, voice: str = "alloy"):
    """Bidirectional WebSocket proxy relay connecting client browser <-> OpenAI Realtime API.
    Intersects and executes function calling (`query_knowledge_base`) server-side.
    """
    api_key = _get_openai_key_for_workspace(workspace_id)
    if not api_key:
        await client_ws.close(code=4001, reason="OpenAI API key not configured")
        return

    try:
        import websockets
    except ImportError:
        await client_ws.close(code=1011, reason="websockets package missing on server")
        return

    headers = {
        "Authorization": f"Bearer {api_key}",
        "OpenAI-Beta": "realtime=v1",
    }

    try:
        async with websockets.connect(OPENAI_REALTIME_WS_URL, extra_headers=headers) as openai_ws:
            # Send session configuration on connect
            session_update = {
                "type": "session.update",
                "session": {
                    "modalities": ["audio", "text"],
                    "voice": voice,
                    "instructions": DEFAULT_VOICE_INSTRUCTIONS,
                    "turn_detection": {"type": "server_vad"},
                    "tools": REALTIME_TOOLS,
                    "tool_choice": "auto",
                }
            }
            await openai_ws.send(json.dumps(session_update))

            async def client_to_openai():
                try:
                    while True:
                        data = await client_ws.receive_text()
                        await openai_ws.send(data)
                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    print(f"[voice_realtime proxy] client->openai error: {e}")

            async def openai_to_client():
                try:
                    async for message in openai_ws:
                        try:
                            event = json.loads(message)
                        except Exception:
                            await client_ws.send_text(message)
                            continue

                        # Intercept function calling events
                        if event.get("type") == "response.function_call_arguments.done":
                            call_id = event.get("call_id")
                            name = event.get("name")
                            args_str = event.get("arguments")
                            if call_id and name:
                                tool_response = await execute_voice_tool_call(workspace_id, call_id, name, args_str)
                                await openai_ws.send(json.dumps(tool_response))
                                # Trigger OpenAI response creation after submitting tool output
                                await openai_ws.send(json.dumps({"type": "response.create"}))

                        # Forward all events to client
                        await client_ws.send_text(message)
                except Exception as e:
                    print(f"[voice_realtime proxy] openai->client error: {e}")

            await asyncio.gather(client_to_openai(), openai_to_client(), return_exceptions=True)

    except Exception as e:
        print(f"[voice_realtime proxy] connection terminated: {e}")
    finally:
        try:
            await client_ws.close()
        except Exception:
            pass
