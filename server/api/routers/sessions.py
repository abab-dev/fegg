import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db, Session
from ..models import SessionResponse
from ..auth import get_current_user
from ..services.agent_runner import destroy_user_sandbox

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse)
async def create_session(
    current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    session_id = str(uuid.uuid4())
    user_id = current_user["id"]

    session = Session(id=session_id, user_id=user_id, status="pending")
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return SessionResponse(
        id=session.id,
        user_id=session.user_id,
        sandbox_id=session.sandbox_id,
        preview_url=session.preview_url,
        status=session.status,
        created_at=session.created_at,
    )


@router.get("", response_model=List[SessionResponse])
async def list_sessions(
    current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Session)
        .where(Session.user_id == current_user["id"])
        .order_by(Session.created_at.desc())
    )
    sessions = result.scalars().all()

    return [
        SessionResponse(
            id=s.id,
            user_id=s.user_id,
            sandbox_id=s.sandbox_id,
            preview_url=s.preview_url,
            status=s.status,
            created_at=s.created_at,
        )
        for s in sessions
    ]


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(
            Session.id == session_id, Session.user_id == current_user["id"]
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionResponse(
        id=session.id,
        user_id=session.user_id,
        sandbox_id=session.sandbox_id,
        preview_url=session.preview_url,
        status=session.status,
        created_at=session.created_at,
    )


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user["id"]

    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        await destroy_user_sandbox(user_id)
    except Exception:
        pass

    session.status = "terminated"
    await db.commit()

    return {"status": "terminated"}


from ..services.agent_runner import get_user_sandbox


@router.get("/{session_id}/files")
async def list_files(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all files in the session's sandbox workspace."""
    user_id = current_user["id"]

    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        sandbox = await get_user_sandbox(user_id)
    except ValueError:
        return {"files": []}

    try:
        result = sandbox.sandbox.commands.run(
            f"find {sandbox.workspace_path} -type f 2>/dev/null | "
            f"grep -v node_modules | grep -v '.git/' | grep -v '/dist/' | "
            f"sed 's|{sandbox.workspace_path}/||' | sort",
            timeout=15,
        )
        files = [
            f.strip()
            for f in result.stdout.strip().split("\n")
            if f.strip() and not f.startswith(".")
        ]

        exclude = {"bun.lock", "package-lock.json", "LICENSE", ".gitignore", "e2b.toml"}
        files = [
            f
            for f in files
            if f.split("/")[-1] not in exclude and not f.endswith(".Dockerfile")
        ]

        return {"files": files}
    except Exception as e:
        import logging

        logging.error(f"Failed to list files for session {session_id}: {e}")
        return {"files": []}


@router.get("/{session_id}/files/{file_path:path}")
async def get_file_content(
    session_id: str,
    file_path: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the content of a specific file from the sandbox."""
    user_id = current_user["id"]

    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        sandbox = await get_user_sandbox(user_id)
    except ValueError:
        raise HTTPException(
            status_code=404, detail="No active sandbox for this session"
        )

    try:
        full_path = f"{sandbox.workspace_path}/{file_path}"
        result = sandbox.sandbox.commands.run(f"cat '{full_path}'", timeout=10)
        return {"path": file_path, "content": result.stdout}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")


from pydantic import BaseModel


class FileUpdate(BaseModel):
    content: str


@router.put("/{session_id}/files/{file_path:path}")
async def update_file_content(
    session_id: str,
    file_path: str,
    body: FileUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the content of a file in the sandbox."""
    user_id = current_user["id"]

    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        sandbox = await get_user_sandbox(user_id)
    except ValueError:
        raise HTTPException(
            status_code=404, detail="No active sandbox for this session"
        )

    try:
        full_path = f"{sandbox.workspace_path}/{file_path}"

        sandbox.sandbox.files.write(full_path, body.content)
        return {"status": "ok", "path": file_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write file: {e}")
