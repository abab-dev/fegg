from pydantic import BaseModel, EmailStr
from typing import Optional, Literal
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class SessionCreate(BaseModel):
    pass  # No body needed, just creates a new session

class SessionResponse(BaseModel):
    id: str
    user_id: str
    sandbox_id: Optional[str]
    preview_url: Optional[str]
    status: Literal["pending", "creating", "ready", "busy", "error", "terminated"]
    created_at: datetime

class MessageCreate(BaseModel):
    content: str

class MessageResponse(BaseModel):
    id: int
    session_id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime

class AgentEvent(BaseModel):
    type: Literal["token", "tool_start", "tool_end", "preview_ready", "error", "done"]
    content: Optional[str] = None
    tool: Optional[str] = None
    args: Optional[dict] = None
    result: Optional[str] = None
    url: Optional[str] = None
    message: Optional[str] = None
