"""Agent router - message handling and SSE streaming"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db, Session, Message, async_session
from ..models import MessageCreate, MessageResponse
from ..auth import get_current_user
from ..services.agent_runner import stream_agent_events
from ..services.sandbox_manager import create_sandbox

router = APIRouter(prefix="/sessions", tags=["agent"])

# In-memory pending messages (session_id -> (user_id, message content))
_pending_messages: dict[str, tuple[str, str]] = {}

# Tools to show in the UI - all tools for full visibility
VISIBLE_TOOLS = {
    "read_file", "write_file", "list_files",
    "grep_search", "fuzzy_find",
    "run_command", "start_dev_server", "check_dev_server", "get_preview_url",
}


@router.post("/{session_id}/message")
async def send_message(
    session_id: str,
    body: MessageCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Send a message to the agent. Triggers processing."""
    user_id = current_user["id"]
    
    # Verify session belongs to user
    result = await db.execute(
        select(Session).where(
            Session.id == session_id,
            Session.user_id == user_id
        )
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.status == "busy":
        raise HTTPException(status_code=409, detail="Session is busy")
    
    # Allow pending (no sandbox yet) or ready sessions
    if session.status not in ["pending", "ready"]:
        raise HTTPException(status_code=400, detail=f"Session not ready: {session.status}")
    
    # Store user message
    message = Message(
        session_id=session_id,
        role="user",
        content=body.content
    )
    db.add(message)
    
    # Mark session as busy
    session.status = "busy"
    session.last_activity = datetime.utcnow()
    await db.commit()
    
    # Store pending message with user_id and needs_sandbox flag
    needs_sandbox = session.sandbox_id is None
    _pending_messages[session_id] = (user_id, body.content, needs_sandbox)
    
    return {"status": "processing", "stream_url": f"/sessions/{session_id}/sse"}

@router.get("/{session_id}/sse")
async def stream_events(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """SSE endpoint for streaming agent events."""
    # Verify session
    result = await db.execute(
        select(Session).where(
            Session.id == session_id,
            Session.user_id == current_user["id"]
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get pending message with user_id
    pending = _pending_messages.get(session_id)
    if not pending:
        raise HTTPException(status_code=400, detail="No pending message")
    
    user_id, message, needs_sandbox = pending
    
    async def generate():
        assistant_content = ""
        preview_url = None
        collected_steps = []  # Collect steps for persistence
        step_counter = 0
        
        try:
            # If sandbox doesn't exist, create it now (silently - no status events)
            if needs_sandbox:
                try:
                    sandbox_id, preview_url = await create_sandbox(session_id, user_id)
                    
                    # Update session in DB with sandbox info
                    async with async_session() as db2:
                        result = await db2.execute(select(Session).where(Session.id == session_id))
                        session = result.scalar_one_or_none()
                        if session:
                            session.sandbox_id = sandbox_id
                            session.preview_url = preview_url
                        await db2.commit()
                    
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': f'Failed to create sandbox: {e}'})}\n\n"
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                    return
            
            # Stream agent events
            preview_emitted = False
            tool_step_map = {}  # Track tool call IDs for status updates
            
            async for event in stream_agent_events(user_id, session_id, message):
                # Accumulate user_message content for saving
                if event["type"] == "user_message":
                    assistant_content += event.get("content", "")
                    yield f"data: {json.dumps(event)}\n\n"
                
                elif event["type"] == "tool_start":
                    tool_name = event.get("tool", "")
                    
                    # Only show visible tools (read/write file)
                    if tool_name in VISIBLE_TOOLS:
                        step_counter += 1
                        step_id = f"step-{step_counter}"
                        
                        # Create friendly title
                        args = event.get("args", {})
                        path = args.get("path", "")
                        filename = path.split("/")[-1] if path else ""
                        
                        if tool_name == "write_file":
                            title = f"Edited {filename}" if filename else "Edited file"
                        elif tool_name == "read_file":
                            title = f"Read {filename}" if filename else "Read file"
                        elif tool_name == "list_files":
                            title = f"Checked {path}" if path else "Checked folder"
                        elif tool_name == "grep_search":
                            pattern = args.get("pattern", "")
                            title = f"Searched '{pattern[:20]}{'...' if len(pattern) > 20 else ''}'"
                        elif tool_name == "fuzzy_find":
                            query = args.get("query", "")
                            title = f"Finding '{query}'"
                        elif tool_name == "run_command":
                            cmd = args.get("command", "")[:25]
                            title = f"Running {cmd}{'...' if len(args.get('command', '')) > 25 else ''}"
                        elif tool_name == "start_dev_server":
                            title = "Starting dev server"
                        elif tool_name == "check_dev_server":
                            title = "Checking server"
                        elif tool_name == "get_preview_url":
                            title = "Getting preview URL"
                        else:
                            title = tool_name.replace("_", " ").title()
                        
                        step = {
                            "id": step_id,
                            "type": "tool",
                            "title": title,
                            "status": "running"
                        }
                        collected_steps.append(step)
                        tool_step_map[tool_name] = step_id
                        
                        yield f"data: {json.dumps({'type': 'tool_start', 'tool': tool_name, 'step': step})}\n\n"
                
                elif event["type"] == "tool_end":
                    tool_name = event.get("tool", "")
                    
                    # Only emit for visible tools
                    if tool_name in VISIBLE_TOOLS:
                        step_id = tool_step_map.get(tool_name)
                        if step_id:
                            # Update step status
                            for step in collected_steps:
                                if step["id"] == step_id:
                                    step["status"] = "done"
                                    break
                        
                        yield f"data: {json.dumps({'type': 'tool_end', 'tool': tool_name, 'step_id': step_id})}\n\n"

                # Capture preview URL from preview_ready or done event
                elif event["type"] == "preview_ready":
                    preview_url = event.get("url")
                    preview_emitted = True
                    
                    # Add preview step
                    step_counter += 1
                    preview_step = {
                        "id": f"step-{step_counter}",
                        "type": "preview",
                        "title": "Preview Ready",
                        "url": preview_url,
                        "status": "done"
                    }
                    collected_steps.append(preview_step)
                    
                    yield f"data: {json.dumps({'type': 'preview_ready', 'url': preview_url, 'step': preview_step})}\n\n"
                
                elif event["type"] == "done":
                    url = event.get("preview_url")
                    if url:
                        preview_url = url
                    
                    # Ensure preview is sent before done if we have it
                    if not preview_emitted and preview_url:
                        step_counter += 1
                        preview_step = {
                            "id": f"step-{step_counter}",
                            "type": "preview",
                            "title": "Preview Ready",
                            "url": preview_url,
                            "status": "done"
                        }
                        collected_steps.append(preview_step)
                        yield f"data: {json.dumps({'type': 'preview_ready', 'url': preview_url, 'step': preview_step})}\n\n"
                        preview_emitted = True

                    yield f"data: {json.dumps(event)}\n\n"
                
                elif event["type"] == "error":
                    yield f"data: {json.dumps(event)}\n\n"
            
            # Save assistant message with steps to DB
            async with async_session() as db2:
                if assistant_content or collected_steps:
                    msg = Message(
                        session_id=session_id,
                        role="assistant",
                        content=assistant_content,
                        steps=json.dumps(collected_steps) if collected_steps else None
                    )
                    db2.add(msg)

                # Mark session as ready and update preview URL if set
                result = await db2.execute(select(Session).where(Session.id == session_id))
                session = result.scalar_one_or_none()
                if session:
                    session.status = "ready"
                    session.last_activity = datetime.utcnow()
                    if preview_url:
                        session.preview_url = preview_url

                await db2.commit()
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            # Mark session as ready on error
            async with async_session() as db2:
                result = await db2.execute(select(Session).where(Session.id == session_id))
                session = result.scalar_one_or_none()
                if session:
                    session.status = "ready"
                await db2.commit()
        finally:
            # Clear pending message
            _pending_messages.pop(session_id, None)
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

@router.get("/{session_id}/messages")
async def list_messages(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all messages for a session, including persisted tool steps."""
    # Verify session
    result = await db.execute(
        select(Session).where(
            Session.id == session_id,
            Session.user_id == current_user["id"]
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")
    
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at)
    )
    messages = result.scalars().all()
    
    # Return messages with steps parsed from JSON
    return [
        {
            "id": m.id,
            "session_id": m.session_id,
            "role": m.role,
            "content": m.content,
            "steps": json.loads(m.steps) if m.steps else None,
            "created_at": m.created_at.isoformat()
        } for m in messages
    ]
