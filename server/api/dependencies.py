from typing import Dict
from fastapi import Request

from sandbox.sandbox import SandboxManager, UserSandbox
from tools.backend_tools import FileCache


def get_sandbox_manager(request: Request) -> SandboxManager:
    return request.app.state.sandbox_manager


def get_session_caches(request: Request) -> Dict[str, FileCache]:
    return request.app.state.session_caches


def get_pending_messages(request: Request) -> Dict[str, tuple]:
    return request.app.state.pending_messages


def get_or_create_session_cache(
    session_caches: Dict[str, FileCache], session_id: str
) -> FileCache:
    if session_id not in session_caches:
        session_caches[session_id] = FileCache(max_entries=50)
    return session_caches[session_id]


def clear_session_cache(session_caches: Dict[str, FileCache], session_id: str) -> None:
    session_caches.pop(session_id, None)


async def get_user_sandbox(
    sandbox_manager: SandboxManager, user_id: str
) -> UserSandbox:
    user_sandbox = sandbox_manager.get(user_id)
    if not user_sandbox:
        raise ValueError(f"No sandbox for user {user_id}")
    return user_sandbox
