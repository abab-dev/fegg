"""Agent router - message handling and SSE streaming"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from server.api.database import get_db, Session, Message, async_session
from server.api.models import MessageCreate, MessageResponse
from server.api.auth import get_current_user
from server.api.services.agent_runner import stream_agent_events

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
    
    if session.status != "ready":
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
    
    # Store pending message with user_id
    _pending_messages[session_id] = (user_id, body.content)
    
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
    
    user_id, message = pending
    
    async def generate():
        assistant_content = ""
        try:
            async for event in stream_agent_events(user_id, message):
                # Accumulate user_message content for saving
                if event["type"] == "user_message":
                    assistant_content += event.get("content", "")
                
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
                
                # Mark session as ready
                result = await db2.execute(select(Session).where(Session.id == session_id))
                session = result.scalar_one_or_none()
                if session:
                    session.status = "ready"
                    session.last_activity = datetime.utcnow()
                
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
