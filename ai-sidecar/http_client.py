import aiohttp
from typing import Optional

_global_session: Optional[aiohttp.ClientSession] = None

def get_session() -> aiohttp.ClientSession:
    global _global_session
    if _global_session is None or _global_session.closed:
        _global_session = aiohttp.ClientSession()
    return _global_session

async def close_session():
    global _global_session
    if _global_session and not _global_session.closed:
        await _global_session.close()
