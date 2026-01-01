"""Sessions router - CRUD for user sessions"""
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from server.api.database import get_db, Session
from server.api.models import SessionResponse
from server.api.auth import get_current_user
from server.api.services.sandbox_manager import create_sandbox
from server.api.services.agent_runner import destroy_user_sandbox

router = APIRouter(prefix="/sessions", tags=["sessions"])

@router.post("", response_model=SessionResponse)
async def create_session(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new session with E2B sandbox."""
    session_id = str(uuid.uuid4())
    user_id = current_user["id"]
    
    # Create session in creating state
    session = Session(
        id=session_id,
        user_id=user_id,
        status="creating"
    )
    db.add(session)
    await db.commit()
    
    try:
        # Create E2B sandbox (keyed by user_id for SandboxManager)
        sandbox_id, preview_url = await create_sandbox(session_id, user_id)
        
        # Update session with sandbox info
        session.sandbox_id = sandbox_id
        session.preview_url = preview_url
        session.status = "ready"
        await db.commit()
        await db.refresh(session)
        
    except Exception as e:
        session.status = "error"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to create sandbox: {e}")
    
    return SessionResponse(
        id=session.id,
        user_id=session.user_id,
        sandbox_id=session.sandbox_id,
        preview_url=session.preview_url,
        status=session.status,
        created_at=session.created_at
    )

@router.get("", response_model=List[SessionResponse])
async def list_sessions(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all sessions for current user."""
    result = await db.execute(
        select(Session)
        .where(Session.user_id == current_user["id"])
        .order_by(Session.created_at.desc())
    )
    sessions = result.scalars().all()
    
    return [
        SessionResponse(
            id=s.id, user_id=s.user_id, sandbox_id=s.sandbox_id,
            preview_url=s.preview_url, status=s.status, created_at=s.created_at
        ) for s in sessions
    ]

@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific session."""
    result = await db.execute(
        select(Session).where(
            Session.id == session_id,
            Session.user_id == current_user["id"]
        )
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return SessionResponse(
        id=session.id, user_id=session.user_id, sandbox_id=session.sandbox_id,
        preview_url=session.preview_url, status=session.status, created_at=session.created_at
    )

@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a session and terminate sandbox."""
    user_id = current_user["id"]
    
    result = await db.execute(
        select(Session).where(
            Session.id == session_id,
            Session.user_id == user_id
        )
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Terminate sandbox (by user_id)
    try:
        await destroy_user_sandbox(user_id)
    except Exception:
        pass  # Best effort cleanup
    
    # Update session status
    session.status = "terminated"
    await db.commit()
    
    return {"status": "terminated"}
