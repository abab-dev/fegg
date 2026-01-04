from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey, create_engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base, relationship

from .config import DATABASE_URL

DB_PATH = Path(__file__).parent / "fegg.db"

# NOTE: We ensure the correct async drivers are used for each database type.
# Defaults to local SQLite if DATABASE_URL is not set or indicates sqlite.

url = DATABASE_URL
if "sqlite" in url:
    # Force absolute path for local development reliability
    final_url = f"sqlite+aiosqlite:///{DB_PATH}"
    engine = create_async_engine(final_url, echo=False)
    
elif url.startswith("postgres://") or url.startswith("postgresql://"):
    # Supabase/Postgres requires asyncpg
    final_url = url.replace("postgres://", "postgresql+asyncpg://")
    final_url = final_url.replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(final_url, echo=False)
    
elif url.startswith("mysql://"):
    # MySQL requires aiomysql
    final_url = url.replace("mysql://", "mysql+aiomysql://")
    engine = create_async_engine(final_url, echo=False)

else:
    # Fallback/Direct usage
    engine = create_async_engine(url, echo=False)

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
    title = Column(String, nullable=True)
    status = Column(String, default="creating")
    created_at = Column(DateTime, default=datetime.utcnow)
    last_activity = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", back_populates="sessions")
    messages = relationship("Message", back_populates="session")


class Message(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    steps = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    session = relationship("Session", back_populates="messages")


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
