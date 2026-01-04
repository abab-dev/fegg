import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from ..database import get_db, Session, Message, async_session
from ..models import MessageCreate, MessageResponse, SessionUpdate, SessionResponse
from ..auth import get_current_user
from ..services.agent_runner import (
    stream_agent_events,
    get_user_sandbox,
    destroy_user_sandbox,
)
from ..services.sandbox_manager import create_sandbox

router = APIRouter(prefix="/sessions", tags=["agent"])

_pending_messages: dict[str, tuple[str, str, bool]] = {}

# Tools shown in the UI activity feed
VISIBLE_TOOLS = {
    "read_file",
    "write_file",
    "list_files",
    "grep_search",
    "fuzzy_find",
    "run_command",
}


@router.post("/{session_id}/message")
async def send_message(
    session_id: str,
    body: MessageCreate,
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

    if session.status == "busy":
        raise HTTPException(status_code=409, detail="Session is busy")

    if session.status not in ["pending", "ready"]:
        raise HTTPException(
            status_code=400, detail=f"Session not ready: {session.status}"
        )

    message = Message(session_id=session_id, role="user", content=body.content)
    db.add(message)

    session.status = "busy"
    session.last_activity = datetime.utcnow()
    await db.commit()

    needs_sandbox = session.sandbox_id is None
    _pending_messages[session_id] = (user_id, body.content, needs_sandbox)

    return {"status": "processing", "stream_url": f"/sessions/{session_id}/sse"}


@router.get("/{session_id}/sse")
async def stream_events(
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

    pending = _pending_messages.get(session_id)
    if not pending:
        raise HTTPException(status_code=400, detail="No pending message")

    user_id, message, needs_sandbox = pending

    async def generate():
        assistant_content = ""
        preview_url = None
        collected_steps = []
        step_counter = 0

        try:
            # Step 1: Create sandbox if needed and get preview URL
            if needs_sandbox:
                try:
                    sandbox_id, preview_url = await create_sandbox(session_id, user_id)

                    async with async_session() as db2:
                        result = await db2.execute(
                            select(Session).where(Session.id == session_id)
                        )
                        sess = result.scalar_one_or_none()
                        if sess:
                            sess.sandbox_id = sandbox_id
                            sess.preview_url = preview_url
                        await db2.commit()

                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'message': f'Failed to create sandbox: {e}'})}\n\n"
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                    return
            else:
                # Get existing preview URL from DB
                async with async_session() as db2:
                    result = await db2.execute(
                        select(Session).where(Session.id == session_id)
                    )
                    sess = result.scalar_one_or_none()
                    if sess and sess.preview_url:
                        preview_url = sess.preview_url

            # Step 2: Send preview URL immediately so frontend shows it
            if preview_url:
                yield f"data: {json.dumps({'type': 'preview_url', 'url': preview_url})}\n\n"

            tool_step_map = {}

            # Step 3: Stream agent events
            async for event in stream_agent_events(user_id, session_id, message):
                if event["type"] == "token":
                    assistant_content += event.get("content", "")
                    yield f"data: {json.dumps(event)}\n\n"

                elif event["type"] == "user_message":
                    assistant_content += event.get("content", "")
                    yield f"data: {json.dumps(event)}\n\n"

                elif event["type"] == "tool_start":
                    tool_name = event.get("tool", "")

                    if tool_name in VISIBLE_TOOLS:
                        step_counter += 1
                        step_id = f"step-{step_counter}"

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
                        else:
                            title = tool_name.replace("_", " ").title()

                        step = {
                            "id": step_id,
                            "type": "tool",
                            "title": title,
                            "status": "running",
                        }
                        collected_steps.append(step)
                        tool_step_map[tool_name] = step_id

                        yield f"data: {json.dumps({'type': 'tool_start', 'tool': tool_name, 'step': step})}\n\n"

                elif event["type"] == "tool_end":
                    tool_name = event.get("tool", "")

                    if tool_name in VISIBLE_TOOLS:
                        step_id = tool_step_map.get(tool_name)
                        if step_id:
                            for step in collected_steps:
                                if step["id"] == step_id:
                                    step["status"] = "done"
                                    break

                        yield f"data: {json.dumps({'type': 'tool_end', 'tool': tool_name, 'step_id': step_id})}\n\n"

                elif event["type"] == "done":
                    # Agent finished - send done event
                    yield f"data: {json.dumps({'type': 'done', 'preview_url': preview_url})}\n\n"

                elif event["type"] == "error":
                    yield f"data: {json.dumps(event)}\n\n"

            # Save assistant message to DB
            async with async_session() as db2:
                if assistant_content or collected_steps:
                    msg = Message(
                        session_id=session_id,
                        role="assistant",
                        content=assistant_content,
                        steps=json.dumps(collected_steps) if collected_steps else None,
                    )
                    db2.add(msg)

                result = await db2.execute(
                    select(Session).where(Session.id == session_id)
                )
                sess = result.scalar_one_or_none()
                if sess:
                    sess.status = "ready"
                    sess.last_activity = datetime.utcnow()
                    if preview_url:
                        sess.preview_url = preview_url

                await db2.commit()

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            async with async_session() as db2:
                result = await db2.execute(
                    select(Session).where(Session.id == session_id)
                )
                sess = result.scalar_one_or_none()
                if sess:
                    sess.status = "ready"
                await db2.commit()
        finally:
            _pending_messages.pop(session_id, None)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{session_id}/messages")
async def list_messages(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).where(
            Session.id == session_id, Session.user_id == current_user["id"]
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
        {
            "id": m.id,
            "session_id": m.session_id,
            "role": m.role,
            "content": m.content,
            "steps": json.loads(m.steps) if m.steps else None,
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]


@router.patch("/{session_id}")
async def update_session(
    session_id: str,
    update: SessionUpdate,
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

    if update.title is not None:
        session.title = update.title

    await db.commit()
    return session


@router.delete("/{session_id}")
async def delete_session(
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

    await db.execute(delete(Message).where(Message.session_id == session_id))
    await db.delete(session)
    await db.commit()

    return {"status": "deleted"}


@router.get("/{session_id}/download")
async def download_session_code(
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

    try:
        try:
            user_sandbox = await get_user_sandbox(current_user["id"])
        except Exception:
            # Sandbox likely died or doesn't exist
            raise HTTPException(
                status_code=410,
                detail="Project session expired. Sandbox is no longer active.",
            )

        # Ensure workspace directory exists
        user_sandbox.sandbox.commands.run("mkdir -p /home/user/workspace")

        # Force remove any existing tar
        user_sandbox.sandbox.commands.run("rm -f /tmp/project.tar.gz")

        # Create tarball
        exec_result = user_sandbox.sandbox.commands.run(
            "tar -czf /tmp/project.tar.gz --exclude node_modules --exclude dist --exclude *e2b.Dockerfile --exclude *e2b.toml --exclude .git .",
            cwd="/home/user/workspace",
        )

        if exec_result.exit_code != 0:
            print(f"Tar failed: {exec_result.stderr}")
            raise HTTPException(
                status_code=500, detail="Failed to compress project files"
            )

        try:
            # Read as bytes
            file_data = user_sandbox.sandbox.files.read(
                "/tmp/project.tar.gz", format="bytes"
            )
        except Exception as e:
            print(f"Read failed: {e}")
            raise HTTPException(
                status_code=500, detail="Failed to read generated archive"
            )

        return Response(
            content=bytes(file_data),
            media_type="application/gzip",
            headers={
                "Content-Disposition": f"attachment; filename=project-{session_id}.tar.gz"
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Download error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to download: {str(e)}")


@router.post("/{session_id}/stop")
async def stop_generation(
    session_id: str, current_user: dict = Depends(get_current_user)
):
    # In MVP, client closing connection handles the stop.
    # We just expose this endpoint if we need explicit state reset in DB if busy.
    return {"status": "ok"}
