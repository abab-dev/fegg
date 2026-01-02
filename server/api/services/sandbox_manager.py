"""
Sandbox Manager - Thin wrapper around e2b_sandbox.sandbox.SandboxManager

This module re-exports from the existing e2b_sandbox module
to maintain API compatibility with the routers.
"""
from .agent_runner import (
    get_sandbox_manager,
    create_sandbox_for_session,
    get_user_sandbox,
    destroy_user_sandbox,
    cleanup_all_sandboxes,
)

# Re-export for router compatibility
async def create_sandbox(session_id: str, user_id: str = None) -> tuple[str, str]:
    """Create sandbox - wrapper for router."""
    # If user_id not provided, use session_id as user_id
    uid = user_id or session_id
    return await create_sandbox_for_session(session_id, uid)

async def get_sandbox(session_id: str) -> object:
    """Get sandbox - wrapper for router."""
    user_sandbox = await get_user_sandbox(session_id)
    return user_sandbox.sandbox

async def destroy_sandbox(sandbox_id: str) -> None:
    """Destroy sandbox by ID - best effort."""
    # We track by user_id, so this is a no-op
    # Actual cleanup happens via user_id
    pass

async def cleanup_all() -> None:
    """Cleanup all sandboxes."""
    await cleanup_all_sandboxes()
