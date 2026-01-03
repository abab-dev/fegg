
from typing import AsyncGenerator, Dict, Any, Optional
from langchain_core.messages import HumanMessage, AIMessage
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from sandbox.sandbox import SandboxManager, UserSandbox
from agent.agent_e2b import build_graph
from tools.backend_tools import FileCache

from ..database import async_session, Message

MAX_ITERATIONS = 100

_sandbox_manager = SandboxManager()

_session_caches: Dict[str, FileCache] = {}


def get_sandbox_manager() -> SandboxManager:
    return _sandbox_manager


def get_session_cache(session_id: str) -> FileCache:
    if session_id not in _session_caches:
        _session_caches[session_id] = FileCache(max_entries=50)
    return _session_caches[session_id]


def clear_session_cache(session_id: str) -> None:
    _session_caches.pop(session_id, None)


async def create_sandbox_for_session(session_id: str, user_id: str) -> tuple[str, str]:
    user_sandbox = _sandbox_manager.create(user_id)

    preview_url = _sandbox_manager.get_preview_url(user_id, port=5173)

    return user_sandbox.sandbox_id, preview_url


async def get_user_sandbox(user_id: str) -> UserSandbox:
    user_sandbox = _sandbox_manager.get(user_id)
    if not user_sandbox:
        raise ValueError(f"No sandbox for user {user_id}")
    return user_sandbox


async def destroy_user_sandbox(user_id: str) -> bool:
    return _sandbox_manager.destroy(user_id)


async def cleanup_all_sandboxes() -> int:
    return _sandbox_manager.destroy_all()


async def stream_agent_events(
    user_id: str, session_id: str, message: str
) -> AsyncGenerator[Dict[str, Any], None]:
    user_sandbox = await get_user_sandbox(user_id)
    config = {"recursion_limit": MAX_ITERATIONS}

    file_cache = get_session_cache(session_id)

    graph = build_graph(user_sandbox, file_cache=file_cache)

    messages = []
    async with async_session() as db:
        result = await db.execute(
            select(Message)
            .where(Message.session_id == session_id)
            .order_by(Message.created_at)
        )
        history = result.scalars().all()

        for msg in history:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            else:
                messages.append(AIMessage(content=msg.content))

    messages.append(HumanMessage(content=message))

    preview_url = None

    async for event in graph.astream_events(
        {"messages": messages}, config=config, version="v2"
    ):
        event_type = event.get("event")

        if event_type == "on_tool_start":
            tool_name = event.get("name", "unknown")
            args = event.get("data", {}).get("input", {})

            if tool_name == "show_user_message":
                user_msg = args.get("message", "")
                if user_msg:
                    yield {"type": "user_message", "content": user_msg}
            else:
                yield {"type": "tool_start", "tool": tool_name, "args": args}

        elif event_type == "on_tool_end":
            tool_name = event.get("name", "unknown")

            if tool_name == "show_user_message":
                continue

            output = str(event.get("data", {}).get("output", ""))[:500]
            yield {"type": "tool_end", "tool": tool_name, "result": output}

            if "Preview URL:" in output:
                try:
                    url = output.split("Preview URL:")[1].strip().split()[0]
                    preview_url = url
                    yield {"type": "preview_ready", "url": url}
                except:
                    pass

    yield {"type": "done", "preview_url": preview_url}
