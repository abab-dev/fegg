from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .database import init_db
from .routers import auth, sessions, agent
from .services.sandbox_manager import cleanup_all

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    print("Database initialized")
    yield
    await cleanup_all()
    print("Sandboxes cleaned up")

app = FastAPI(
    title="FeGG API",
    description="Frontend Generator Platform API",
    version="0.1.0",
    lifespan=lifespan
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
