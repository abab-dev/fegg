"""FeGG API - Main FastAPI application"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.api.config import CORS_ORIGINS
from server.api.database import init_db
from server.api.routers import auth, sessions, agent
from server.api.services.sandbox_manager import cleanup_all

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    await init_db()
    print("Database initialized")
    yield
    # Shutdown
    await cleanup_all()
    print("Sandboxes cleaned up")

app = FastAPI(
    title="FeGG API",
    description="Frontend Generator Platform API",
    version="0.1.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(agent.router)

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
