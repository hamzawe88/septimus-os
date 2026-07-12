"""Realtime streaming to the browser via Centrifugo's HTTP publish API.

Best-effort: token streaming is a UX nicety layered on top of the authoritative
HTTP `{reply}` response, so publish failures are swallowed and never break chat.
"""
import aiohttp

from config import CENTRIFUGO_API_KEY, CENTRIFUGO_API_URL


async def publish(channel: str, data: dict) -> None:
    """Publish a JSON payload to a Centrifugo channel. Never raises."""
    try:
        async with aiohttp.ClientSession() as session:
            await session.post(
                f"{CENTRIFUGO_API_URL}/publish",
                json={"channel": channel, "data": data},
                headers={"X-API-Key": CENTRIFUGO_API_KEY},
                timeout=aiohttp.ClientTimeout(total=5),
            )
    except Exception as e:
        # Streaming is optional; the caller still returns the full reply over HTTP.
        print(f"[realtime] publish to {channel} failed: {e}")
