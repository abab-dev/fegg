"""
E2B Sandbox Manager

Handles sandbox lifecycle: creation, port exposure, destruction.
One sandbox per user with session persistence.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

# Template path for uploading
TEMPLATE_PATH = Path(__file__).parent.parent / "frontend_agent" / "template" / "react-vite-shadcn-ui"

# E2B Configuration
E2B_TIMEOUT = int(os.getenv("E2B_TIMEOUT", "900"))  # 15 minutes default


@dataclass
class UserSandbox:
    """Represents a user's active sandbox session."""
    
    user_id: str
    sandbox: object  # e2b Sandbox instance
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
    
    Usage:
        manager = SandboxManager()
        user_sandbox = manager.create("user123")
        # ... use sandbox ...
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
        """Create a new sandbox for user with template pre-loaded."""
        from e2b_code_interpreter import Sandbox
        
        # Destroy existing if any
        if user_id in self._sandboxes:
            self.destroy(user_id)
        
        # Create new sandbox with extended timeout
        sandbox = Sandbox.create(timeout=E2B_TIMEOUT)
        
        user_sandbox = UserSandbox(
            user_id=user_id,
            sandbox=sandbox,
            sandbox_id=sandbox.sandbox_id,
        )
        
        # Initialize sandbox with ripgrep and workspace
        self._setup_sandbox(user_sandbox)
        
        self._sandboxes[user_id] = user_sandbox
        return user_sandbox
    
    def _setup_sandbox(self, user_sandbox: UserSandbox) -> None:
        """Set up sandbox with ripgrep and workspace directory."""
        sandbox = user_sandbox.sandbox
        
        # Install ripgrep
        sandbox.commands.run(
            "sudo apt-get update -qq && sudo apt-get install -y ripgrep",
            timeout=120
        )
        
        # Create workspace directory
        sandbox.commands.run(f"mkdir -p {user_sandbox.workspace_path}")
    
    def upload_template(self, user_id: str) -> int:
        """Upload template files to user's sandbox. Returns file count."""
        user_sandbox = self.get(user_id)
        if not user_sandbox:
            raise ValueError(f"No sandbox for user: {user_id}")
        
        return self._upload_directory(
            user_sandbox.sandbox,
            TEMPLATE_PATH,
            user_sandbox.workspace_path
        )
    
    def _upload_directory(
        self, 
        sandbox, 
        local_path: Path, 
        remote_path: str,
        exclude: set = None
    ) -> int:
        """Upload a directory to sandbox, excluding certain patterns."""
        exclude = exclude or {"node_modules", ".git", "__pycache__", ".venv", "dist"}
        
        uploaded = 0
        for item in local_path.rglob("*"):
            # Skip excluded directories
            if any(ex in item.parts for ex in exclude):
                continue
            
            if item.is_file():
                rel_path = item.relative_to(local_path)
                remote_file = f"{remote_path}/{rel_path}"
                
                try:
                    content = item.read_text(encoding="utf-8")
                    sandbox.files.write(remote_file, content)
                    uploaded += 1
                except UnicodeDecodeError:
                    # Binary file
                    content = item.read_bytes()
                    sandbox.files.write(remote_file, content)
                    uploaded += 1
                except Exception:
                    pass  # Skip problematic files
        
        return uploaded
    
    def destroy(self, user_id: str) -> bool:
        """Destroy sandbox for user."""
        if user_id not in self._sandboxes:
            return False
        
        user_sandbox = self._sandboxes.pop(user_id)
        
        try:
            user_sandbox.sandbox.kill()
        except Exception:
            pass  # Best effort
        
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
