from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .database import init_db
from .routers import auth, sessions, agent
from sandbox.sandbox import SandboxManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialize and cleanup shared state."""

    await init_db()
    app.state.sandbox_manager = SandboxManager()
    app.state.session_caches = {}
    app.state.pending_messages = {}

    yield

    destroyed = app.state.sandbox_manager.destroy_all()
    print(f"Cleaned up {destroyed} sandboxes")
    app.state.session_caches.clear()
    app.state.pending_messages.clear()


app = FastAPI(
    title="FeGG API",
    description="Frontend Generator Platform API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(agent.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
