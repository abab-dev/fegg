from .agent_runner import (
    get_sandbox_manager,
    create_sandbox_for_session,
    get_user_sandbox,
    destroy_user_sandbox,
    cleanup_all_sandboxes,
)


async def create_sandbox(session_id: str, user_id: str = None) -> tuple[str, str]:
    uid = user_id or session_id
    return await create_sandbox_for_session(session_id, uid)


async def get_sandbox(session_id: str) -> object:
    user_sandbox = await get_user_sandbox(session_id)
    return user_sandbox.sandbox


async def destroy_sandbox(sandbox_id: str) -> None:
    pass


async def cleanup_all() -> None:
    await cleanup_all_sandboxes()
