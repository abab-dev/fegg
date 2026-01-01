"""
Agent Runner - Wraps existing frontend_agent with streaming support.

Reuses:
- e2b_sandbox.sandbox.SandboxManager for sandbox lifecycle
- frontend_agent.agent_e2b for agent logic
"""
import sys
from pathlib import Path

# Add project root to path so we can import existing modules
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from typing import AsyncGenerator, Dict, Any

from langchain_core.messages import HumanMessage, AIMessage

# Reuse existing modules
from server.sandbox.sandbox import SandboxManager, UserSandbox
from server.agent.agent_e2b import build_graph

# Singleton sandbox manager
_sandbox_manager = SandboxManager()

def get_sandbox_manager() -> SandboxManager:
    """Get the singleton sandbox manager."""
    return _sandbox_manager

async def create_sandbox_for_session(session_id: str, user_id: str) -> tuple[str, str]:
    """
    Create sandbox for a session using existing SandboxManager.
    Returns (sandbox_id, preview_url).
    """
    # Use user_id as the key (SandboxManager tracks by user)
    user_sandbox = _sandbox_manager.create(user_id)
    
    # Get preview URL
    preview_url = _sandbox_manager.get_preview_url(user_id, port=5173)
    
    return user_sandbox.sandbox_id, preview_url

async def get_user_sandbox(user_id: str) -> UserSandbox:
    """Get sandbox for user."""
    user_sandbox = _sandbox_manager.get(user_id)
    if not user_sandbox:
        raise ValueError(f"No sandbox for user {user_id}")
    return user_sandbox

async def destroy_user_sandbox(user_id: str) -> bool:
    """Destroy sandbox for user."""
    return _sandbox_manager.destroy(user_id)

async def cleanup_all_sandboxes() -> int:
    """Cleanup all sandboxes on shutdown."""
    return _sandbox_manager.destroy_all()

async def stream_agent_events(
    user_id: str,
    message: str
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Stream agent events using the existing agent from server.agent.agent_e2b.
    
    Uses LangGraph astream_events for real-time streaming.
    
    Event types:
    - tool_start: When a tool is being called (except show_user_message)
    - tool_end: When a tool completes (except show_user_message)
    - user_message: The message from show_user_message tool
    - preview_ready: When dev server URL is available
    - done: Agent finished
    """
    # Get user's sandbox
    user_sandbox = await get_user_sandbox(user_id)
    
    # Build graph using existing function
    graph = build_graph(user_sandbox)
    
    # Stream events (skip token streaming - we only use tool events)
    async for event in graph.astream_events(
        {"messages": [HumanMessage(content=message)]},
        version="v2"
    ):
        event_type = event.get("event")
        
        # Skip token streaming - we use show_user_message tool instead
        # if event_type == "on_chat_model_stream":
        #     pass
        
        if event_type == "on_tool_start":
            tool_name = event.get("name", "unknown")
            args = event.get("data", {}).get("input", {})
            
            # Special handling for show_user_message
            if tool_name == "show_user_message":
                # Emit the user message immediately from args
                user_msg = args.get("message", "")
                if user_msg:
                    yield {"type": "user_message", "content": user_msg}
            else:
                yield {
                    "type": "tool_start",
                    "tool": tool_name,
                    "args": args
                }
        
        elif event_type == "on_tool_end":
            tool_name = event.get("name", "unknown")
            
            # Skip tool_end for show_user_message
            if tool_name == "show_user_message":
                continue
            
            output = str(event.get("data", {}).get("output", ""))[:500]
            yield {
                "type": "tool_end",
                "tool": tool_name,
                "result": output
            }
            
            # Check if this was start_dev_server with URL
            if "Preview URL:" in output:
                try:
                    url = output.split("Preview URL:")[1].strip().split()[0]
                    yield {"type": "preview_ready", "url": url}
                except:
                    pass
    
    yield {"type": "done"}

