"""Database setup with SQLAlchemy async"""
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey, create_engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base, relationship

from .config import DATABASE_URL

# For SQLite, use the api directory
DB_PATH = Path(__file__).parent / "fegg.db"

# Async engine - works with SQLite, PostgreSQL, etc.
# For SQLite: sqlite+aiosqlite:///./fegg.db
# For Turso: libsql+aiosqlite://...
# For PostgreSQL: postgresql+asyncpg://...

if "sqlite" in DATABASE_URL:
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{DB_PATH}",
        echo=False,
    )
else:
    engine = create_async_engine(DATABASE_URL, echo=False)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    sessions = relationship("Session", back_populates="user")


class Session(Base):
    __tablename__ = "sessions"
    
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    sandbox_id = Column(String, nullable=True)
    preview_url = Column(String, nullable=True)
    status = Column(String, default="creating")  # creating, ready, busy, error, terminated
    created_at = Column(DateTime, default=datetime.utcnow)
    last_activity = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", back_populates="sessions")
    messages = relationship("Message", back_populates="session")


class Message(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    role = Column(String, nullable=False)  # user, assistant
    content = Column(Text, nullable=False)
    steps = Column(Text, nullable=True)  # JSON array of tool steps for persistence
    created_at = Column(DateTime, default=datetime.utcnow)
    
    session = relationship("Session", back_populates="messages")


async def init_db():
    """Create all tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to get database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
