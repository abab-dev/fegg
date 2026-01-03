
import os
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

E2B_TEMPLATE = os.getenv("E2B_TEMPLATE_ID", "599n6agqtub6wrffkd5y")

E2B_TIMEOUT = int(os.getenv("E2B_TIMEOUT", "900"))


@dataclass
class UserSandbox:

    user_id: str
    sandbox: object
    sandbox_id: str = ""
    preview_url: Optional[str] = None
    dev_server_running: bool = False
    workspace_path: str = "/home/user/workspace"
    
    @property
    def thread_id(self) -> str:
        return f"user_{self.user_id}"


class SandboxManager:

    def __init__(self):
        self._sandboxes: dict[str, UserSandbox] = {}
    
    def get_or_create(self, user_id: str) -> UserSandbox:
        if user_id in self._sandboxes:
            return self._sandboxes[user_id]
        
        return self.create(user_id)
    
    def create(self, user_id: str) -> UserSandbox:
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

        self._sync_dynamic_files(sandbox)

        self._sandboxes[user_id] = user_sandbox
        return user_sandbox

    def _sync_dynamic_files(self, sandbox) -> None:
        import pathlib

        template_dir = pathlib.Path(__file__).parent.parent.parent / "templates" / "react-vite-shadcn-ui"

        dynamic_files = [
            "src/styles/globals.css",
        ]
        
        for rel_path in dynamic_files:
            local_path = template_dir / rel_path
            if local_path.exists():
                try:
                    content = local_path.read_text()
                    remote_path = f"/home/user/workspace/{rel_path}"
                    sandbox.files.write(remote_path, content)
                except Exception as e:
                    print(f"Warning: Could not sync {rel_path}: {e}")

    def destroy(self, user_id: str) -> bool:
        if user_id not in self._sandboxes:
            return False
        
        user_sandbox = self._sandboxes.pop(user_id)
        
        try:
            user_sandbox.sandbox.kill()
        except Exception:
            pass

        return True
    
    def destroy_all(self) -> int:
        count = 0
        for user_id in list(self._sandboxes.keys()):
            if self.destroy(user_id):
                count += 1
        return count
    
    def get(self, user_id: str) -> Optional[UserSandbox]:
        return self._sandboxes.get(user_id)
    
    def get_preview_url(self, user_id: str, port: int = 5173) -> Optional[str]:
        user_sandbox = self.get(user_id)
        if not user_sandbox:
            return None
        
        try:
            host = user_sandbox.sandbox.get_host(port)
            return f"https://{host}"
        except Exception:
            return None
    
    def list_users(self) -> list[str]:
        return list(self._sandboxes.keys())
