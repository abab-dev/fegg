"""
File Backend Abstraction

Protocol-based interface for file/command operations.
Implementations work identically whether local or in E2B sandbox.

Usage:
    # Local development
    backend = LocalBackend("/path/to/workspace")
    
    # E2B sandbox
    backend = E2BBackend(sandbox, "/home/user/workspace")
    
    # Same interface for both
    content = backend.read_file("src/App.tsx")
    backend.write_file("src/App.tsx", new_content)
    result = backend.run_command("bun run dev")
"""

from typing import Protocol, Optional
from dataclasses import dataclass


class FileBackend(Protocol):
    """
    Protocol defining file/command operations.

    Implementations must provide these methods.
    """

    @property
    def root(self) -> str:
        """Workspace root path."""
        ...

    def read_file(self, path: str) -> str:
        """Read file contents. Path is relative to root."""
        ...

    def write_file(self, path: str, content: str) -> None:
        """Write content to file. Creates parent dirs if needed."""
        ...

    def file_exists(self, path: str) -> bool:
        """Check if file exists."""
        ...

    def list_dir(self, path: str = ".") -> list[str]:
        """List directory contents. Returns relative paths."""
        ...

    def run_command(
        self,
        command: str,
        timeout: int = 30,
        cwd: Optional[str] = None
    ) -> "CommandResult":
        """Run shell command. Returns stdout/stderr/exit_code."""
        ...

    def grep(
        self,
        pattern: str,
        path: str = ".",
        context_lines: int = 2
    ) -> str:
        """Search for pattern in files. Returns matches with context."""
        ...


@dataclass
class CommandResult:
    """Result of a command execution."""
    stdout: str
    stderr: str
    exit_code: int
    
    @property
    def success(self) -> bool:
        return self.exit_code == 0
    
    @property
    def output(self) -> str:
        """Combined stdout + stderr."""
        return self.stdout + ("\n" + self.stderr if self.stderr else "")


class LocalBackend:
    """File backend for local filesystem operations."""
    
    def __init__(self, root_path: str):
        from pathlib import Path
        self._root = Path(root_path).resolve()
        if not self._root.exists():
            self._root.mkdir(parents=True)
    
    @property
    def root(self) -> str:
        return str(self._root)
    
    def _resolve(self, path: str) -> "Path":
        """Resolve relative path to absolute, ensuring within root."""
        from pathlib import Path
        if path.startswith("/"):
            full = Path(path)
        else:
            full = self._root / path

        try:
            full.resolve().relative_to(self._root)
        except ValueError:
            raise ValueError(f"Path outside workspace: {path}")

        return full.resolve()
    
    def read_file(self, path: str) -> str:
        return self._resolve(path).read_text(encoding="utf-8")
    
    def write_file(self, path: str, content: str) -> None:
        full = self._resolve(path)
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text(content, encoding="utf-8")
    
    def file_exists(self, path: str) -> bool:
        return self._resolve(path).exists()
    
    def list_dir(self, path: str = ".") -> list[str]:
        target = self._resolve(path)
        if not target.is_dir():
            return []
        return [p.name for p in target.iterdir()]
    
    def run_command(
        self, 
        command: str, 
        timeout: int = 30,
        cwd: Optional[str] = None
    ) -> CommandResult:
        import subprocess
        
        work_dir = self._resolve(cwd) if cwd else self._root
        
        try:
            result = subprocess.run(
                command,
                shell=True,
                cwd=str(work_dir),
                capture_output=True,
                text=True,
                timeout=timeout
            )
            return CommandResult(
                stdout=result.stdout,
                stderr=result.stderr,
                exit_code=result.returncode
            )
        except subprocess.TimeoutExpired:
            return CommandResult(
                stdout="",
                stderr=f"Command timed out after {timeout}s",
                exit_code=-1
            )
    
    def grep(
        self,
        pattern: str,
        path: str = ".",
        context_lines: int = 2
    ) -> str:
        """Search using grep (or rg if available)."""
        target = self._resolve(path)

        cmd = f'rg --color=never -n -C {context_lines} "{pattern}" "{target}" 2>/dev/null || grep -rn -C {context_lines} "{pattern}" "{target}"'
        result = self.run_command(cmd, timeout=15)

        if result.exit_code == 1:
            return f"No matches found for '{pattern}'"

        return result.stdout


class E2BBackend:
    """File backend for E2B sandbox operations."""
    
    def __init__(self, sandbox, root_path: str = "/home/user/workspace"):
        self._sandbox = sandbox
        self._root = root_path
    
    @property
    def root(self) -> str:
        return self._root
    
    def _resolve(self, path: str) -> str:
        """Resolve relative path to absolute within workspace."""
        if path.startswith("/"):
            return path
        return f"{self._root}/{path}".replace("//", "/")
    
    def read_file(self, path: str) -> str:
        full_path = self._resolve(path)
        return self._sandbox.files.read(full_path)
    
    def write_file(self, path: str, content: str) -> None:
        full_path = self._resolve(path)
        self._sandbox.files.write(full_path, content)
    
    def file_exists(self, path: str) -> bool:
        full_path = self._resolve(path)
        result = self._sandbox.commands.run(f'test -e "{full_path}" && echo "yes" || echo "no"')
        return result.stdout.strip() == "yes"
    
    def list_dir(self, path: str = ".") -> list[str]:
        full_path = self._resolve(path)
        result = self._sandbox.commands.run(f'ls -1 "{full_path}" 2>/dev/null || echo ""')
        if not result.stdout.strip():
            return []
        return result.stdout.strip().split("\n")
    
    def run_command(
        self, 
        command: str, 
        timeout: int = 30,
        cwd: Optional[str] = None
    ) -> CommandResult:
        work_dir = self._resolve(cwd) if cwd else self._root

        full_cmd = f'cd "{work_dir}" && {command}'
        
        try:
            result = self._sandbox.commands.run(full_cmd, timeout=timeout)
            return CommandResult(
                stdout=result.stdout or "",
                stderr=result.stderr or "",
                exit_code=result.exit_code if hasattr(result, 'exit_code') else 0
            )
        except Exception as e:
            return CommandResult(
                stdout="",
                stderr=str(e),
                exit_code=-1
            )
    
    def grep(
        self,
        pattern: str,
        path: str = ".",
        context_lines: int = 2
    ) -> str:
        """Search using grep in sandbox."""
        full_path = self._resolve(path)

        cmd = f'grep -rn -C {context_lines} "{pattern}" "{full_path}" 2>/dev/null || echo "No matches found"'
        result = self.run_command(cmd, timeout=15, cwd="/")

        return result.stdout
