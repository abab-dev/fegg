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
        
        try:
            # If sandbox doesn't exist, create it now with status events
            if needs_sandbox:
                yield f"data: {json.dumps({'type': 'status', 'message': 'Setting up environment...'})}\n\n"
                
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
                    
                    yield f"data: {json.dumps({'type': 'status', 'message': 'Environment ready'})}\n\n"
                    
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': f'Failed to create sandbox: {e}'})}\n\n"
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                    return
            
            # Stream agent events
            preview_emitted = False
            async for event in stream_agent_events(user_id, session_id, message):
                # Accumulate user_message content for saving
                if event["type"] == "user_message":
                    assistant_content += event.get("content", "")

                # Capture preview URL from preview_ready or done event
                if event["type"] == "preview_ready":
                    preview_url = event.get("url")
                    preview_emitted = True
                elif event["type"] == "done":
                    url = event.get("preview_url")
                    if url:
                        preview_url = url
                    
                    # Ensure preview is sent before done if we have it
                    if not preview_emitted and preview_url:
                        yield f"data: {json.dumps({'type': 'preview_ready', 'url': preview_url})}\n\n"
                        preview_emitted = True

                yield f"data: {json.dumps(event)}\n\n"
            
            # Save assistant message to DB using new session
            async with async_session() as db2:
                if assistant_content:
                    msg = Message(
                        session_id=session_id,
                        role="assistant",
                        content=assistant_content
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
    """Get all messages for a session."""
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
    
    return [
        MessageResponse(
            id=m.id, session_id=m.session_id, role=m.role,
            content=m.content, created_at=m.created_at
        ) for m in messages
    ]
