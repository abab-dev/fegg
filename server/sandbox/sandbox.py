"""
E2B Sandbox Manager

Handles sandbox lifecycle: creation, port exposure, destruction.
One sandbox per user with session persistence.

Uses custom Bun-based template: react-vite-shadcn-bun
- Pre-installed: Bun 1.3.5, React 19, Vite 7, Shadcn/ui
- Workspace: /home/user/workspace (with node_modules ready)
"""

import os
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

E2B_TEMPLATE = os.getenv("E2B_TEMPLATE_ID", "599n6agqtub6wrffkd5y")

E2B_TIMEOUT = int(os.getenv("E2B_TIMEOUT", "900"))


@dataclass
class UserSandbox:
    """Represents a user's active sandbox session."""

    user_id: str
    sandbox: object
    sandbox_id: str = ""
    preview_url: Optional[str] = None
    dev_server_running: bool = False
    workspace_path: str = "/home/user/workspace"
    
    @property
    def thread_id(self) -> str:
        """Unique thread ID for LangGraph checkpointing."""
        return f"user_{self.user_id}"


class SandboxManager:
    """
    Manages E2B sandboxes with 1 sandbox per user limit.
    
    Uses pre-baked template with all dependencies installed.
    Sandbox creation is ~3.7s with everything ready to go.
    
    Usage:
        manager = SandboxManager()
        user_sandbox = manager.create("user123")
        # Workspace already has React + Shadcn template with node_modules
        manager.destroy("user123")
    """
    
    def __init__(self):
        self._sandboxes: dict[str, UserSandbox] = {}
    
    def get_or_create(self, user_id: str) -> UserSandbox:
        """Get existing sandbox or create new one for user."""
        if user_id in self._sandboxes:
            return self._sandboxes[user_id]
        
        return self.create(user_id)
    
    def create(self, user_id: str) -> UserSandbox:
        """
        Create a new sandbox for user with pre-baked template.
        
        Template includes:
        - Bun 1.3.5 runtime
        - React 19 + Vite 7 + Shadcn/ui
        - All npm dependencies pre-installed
        - Workspace at /home/user/workspace
        """
        from e2b_code_interpreter import Sandbox

        if user_id in self._sandboxes:
            self.destroy(user_id)

        sandbox = Sandbox.create(
            template=E2B_TEMPLATE,
            timeout=E2B_TIMEOUT
        )

        user_sandbox = UserSandbox(
            user_id=user_id,
            sandbox=sandbox,
            sandbox_id=sandbox.sandbox_id,
        )

        self._sandboxes[user_id] = user_sandbox
        return user_sandbox
    
    def destroy(self, user_id: str) -> bool:
        """Destroy sandbox for user."""
        if user_id not in self._sandboxes:
            return False
        
        user_sandbox = self._sandboxes.pop(user_id)
        
        try:
            user_sandbox.sandbox.kill()
        except Exception:
            pass

        return True
    
    def destroy_all(self) -> int:
        """Destroy all sandboxes. Call on shutdown."""
        count = 0
        for user_id in list(self._sandboxes.keys()):
            if self.destroy(user_id):
                count += 1
        return count
    
    def get(self, user_id: str) -> Optional[UserSandbox]:
        """Get sandbox for user if exists."""
        return self._sandboxes.get(user_id)
    
    def get_preview_url(self, user_id: str, port: int = 5173) -> Optional[str]:
        """Get public preview URL for user's sandbox."""
        user_sandbox = self.get(user_id)
        if not user_sandbox:
            return None
        
        try:
            host = user_sandbox.sandbox.get_host(port)
            return f"https://{host}"
        except Exception:
            return None
    
    def list_users(self) -> list[str]:
        """List all users with active sandboxes."""
        return list(self._sandboxes.keys())
