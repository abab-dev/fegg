"""
Async Process Executor with Log Pagination
For LangGraph-based agents with output management.
"""

import asyncio
import os
import re
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional


@dataclass
class CommandLog:
    """Stores command execution log with metadata."""

    cmd_id: str
    command: str
    cwd: str
    exit_code: Optional[int] = None
    stdout_lines: list = field(default_factory=list)
    stderr_lines: list = field(default_factory=list)
    started_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    is_running: bool = True
    pagination_count: int = 0  # Track how many times agent paginated
    # Background execution support
    process: Optional[asyncio.subprocess.Process] = None
    output_buffer: list = field(default_factory=list)  # Real-time output for running processes
    _reader_task: Optional[asyncio.Task] = None


class CommandLogStore:
    """
    LRU store for command logs with TTL eviction.
    Prevents memory bloat from old command outputs.
    """

    def __init__(self, max_entries: int = 50, ttl_minutes: int = 30):
        self._logs: OrderedDict[str, CommandLog] = OrderedDict()
        self.max_entries = max_entries
        self.ttl = timedelta(minutes=ttl_minutes)

    def store(self, log: CommandLog) -> None:
        """Store a log, evicting old entries if needed."""
        self._evict_expired()
        if len(self._logs) >= self.max_entries:
            self._logs.popitem(last=False)  # Remove oldest
        self._logs[log.cmd_id] = log
        self._logs.move_to_end(log.cmd_id)

    def get(self, cmd_id: str) -> Optional[CommandLog]:
        """Get a log by ID, returns None if expired or not found."""
        self._evict_expired()
        log = self._logs.get(cmd_id)
        if log:
            self._logs.move_to_end(cmd_id)  # Mark as recently used
        return log

    def list_recent(self, limit: int = 5) -> list[str]:
        """List recent command IDs."""
        self._evict_expired()
        return list(self._logs.keys())[-limit:]

    def _evict_expired(self) -> None:
        """Remove logs older than TTL."""
        now = datetime.now()
        expired = [
            cid
            for cid, log in self._logs.items()
            if (now - log.started_at) > self.ttl
        ]
        for cid in expired:
            del self._logs[cid]


class AsyncProcessExecutor:
    """
    Async command executor with log pagination for LangGraph agents.

    Features:
    - Async subprocess execution (native asyncio)
    - Truncated output by default (last N lines for failures)
    - On-demand log pagination via read_log()
    - TTL-based log eviction
    - Binary output detection
    - Pagination call limits
    """

    # Known verbose commands - suppress output on success
    NOISY_PATTERNS = [
        r"^(pip|pip3|python -m pip)\s+install",
        r"^npm\s+(install|ci|update)",
        r"^yarn(\s+install)?",
        r"^pnpm\s+install",
        r"^git\s+(clone|pull|fetch)",
        r"^apt(-get)?\s+(install|update)",
        r"^cargo\s+build",
        r"^make\b",
    ]

    # Commands requiring confirmation
    CONFIRM_PATTERNS = [
        r"git\s+push",
        r"git\s+reset\s+--hard",
        r"git\s+clean\s+-[fd]",
        r"git\s+checkout\s+\.",
        r"rm\s+-[rf]",
        r"pip\s+uninstall",
        r"npm\s+publish",
        r"docker\s+(rm|rmi|system\s+prune)",
    ]

    # Blocked commands - never allow
    BLOCKED_PATTERNS = [
        r"sudo\s+",
        r"rm\s+-[rf]*\s+[/~]",           # rm -rf / or ~
        r"rm\s+-[rf]*\s+\.\.",           # rm -rf ..
        r">\s*/dev/",                     # Write to device
        r"chmod\s+777",                   # World writable
        r"curl.*\|\s*(ba)?sh",            # Pipe to shell
        r"wget.*\|\s*(ba)?sh",            # Pipe to shell
        r"mkfs\.",                        # Format filesystem
        r"dd\s+if=",                      # Raw disk write
        r":\(\)\s*\{\s*:\|:\s*&\s*\}",   # Fork bomb
        r">\s*/etc/",                     # Write to /etc
        r"git\s+push.*--force",           # Force push
    ]

    def __init__(
        self,
        root_path: str,
        timeout: int = 120,
        default_tail_lines: int = 40,
        max_pagination_calls: int = 3,
    ):
        self.root = Path(root_path).resolve()
        self.timeout = timeout
        self.default_tail_lines = default_tail_lines
        self.max_pagination_calls = max_pagination_calls
        self.log_store = CommandLogStore()

        if not self.root.exists():
            raise ValueError(f"Root path does not exist: {self.root}")

    def _validate_cwd(self, cwd: Optional[str]) -> Path:
        """Validate cwd is absolute and within root."""
        if cwd is None:
            return self.root

        if not os.path.isabs(cwd):
            raise ValueError(f"cwd must be absolute path. Got: {cwd}")

        cwd_path = Path(cwd).resolve()
        try:
            cwd_path.relative_to(self.root)
        except ValueError:
            raise ValueError(f"cwd outside root ({self.root}). Got: {cwd}")

        if not cwd_path.exists():
            raise ValueError(f"cwd does not exist: {cwd}")

        return cwd_path

    def _is_blocked(self, command: str) -> bool:
        return any(re.search(p, command, re.I) for p in self.BLOCKED_PATTERNS)

    def _needs_confirm(self, command: str) -> bool:
        return any(re.search(p, command, re.I) for p in self.CONFIRM_PATTERNS)

    def _is_noisy(self, command: str) -> bool:
        return any(re.search(p, command, re.I) for p in self.NOISY_PATTERNS)

    def _is_binary(self, text: str) -> bool:
        """Detect binary/garbage output."""
        if not text:
            return False
        # High ratio of non-printable chars = binary
        non_printable = sum(1 for c in text[:1000] if ord(c) < 32 and c not in '\n\r\t')
        return non_printable > len(text[:1000]) * 0.1

    def _format_output(
        self, log: CommandLog, verbose: bool = False
    ) -> dict:
        """Format command output with smart truncation."""
        all_lines = log.stdout_lines + log.stderr_lines
        total_lines = len(all_lines)

        # Check for binary
        sample = "".join(all_lines[:10])
        if self._is_binary(sample):
            return {
                "cmd_id": log.cmd_id,
                "exit_code": log.exit_code,
                "status": "completed",
                "output": "[Binary output detected. Cannot display.]",
                "total_lines": total_lines,
            }

        is_noisy = self._is_noisy(log.command)
        success = log.exit_code == 0

        # Decide what to show
        if verbose:
            # Full output requested
            output = "".join(all_lines)
            truncated = False
        elif success and is_noisy:
            # Noisy command succeeded - minimal output
            output = f"✓ Completed successfully. [{total_lines} lines suppressed]"
            truncated = True
        elif success:
            # Normal success - show last few lines
            tail = all_lines[-10:] if total_lines > 10 else all_lines
            output = "".join(tail)
            truncated = total_lines > 10
        else:
            # Failure - show last N lines (errors at end)
            tail = all_lines[-self.default_tail_lines:] if total_lines > self.default_tail_lines else all_lines
            output = "".join(tail)
            truncated = total_lines > self.default_tail_lines

        result = {
            "cmd_id": log.cmd_id,
            "exit_code": log.exit_code,
            "status": "completed",
            "output": output.rstrip(),
            "total_lines": total_lines,
        }

        if truncated and not (success and is_noisy):
            result["hint"] = f"Use read_log('{log.cmd_id}') to see more. Showing last {len(tail)} of {total_lines} lines."

        return result

    async def run_command(
        self,
        command: str,
        cwd: Optional[str] = None,
        timeout: Optional[int] = None,
        confirmed: bool = False,
        verbose: bool = False,
    ) -> dict:
        """
        Execute a command asynchronously.

        Args:
            command: Shell command to run.
            cwd: Working directory (absolute, within root).
            timeout: Override default timeout.
            confirmed: Allow dangerous commands.
            verbose: Return full output instead of truncated.

        Returns:
            dict with cmd_id, exit_code, output, and pagination hints.
        """
        command = command.strip()
        if not command:
            return {"error": "Empty command"}

        if self._is_blocked(command):
            return {"error": f"BLOCKED: Command matches security blocklist."}

        if self._needs_confirm(command) and not confirmed:
            return {
                "error": "CONFIRMATION REQUIRED",
                "message": f"Command '{command}' requires confirmed=True",
            }

        try:
            effective_cwd = self._validate_cwd(cwd)
        except ValueError as e:
            return {"error": str(e)}

        # Create log entry
        cmd_id = str(uuid.uuid4())[:8]
        log = CommandLog(
            cmd_id=cmd_id,
            command=command,
            cwd=str(effective_cwd),
        )
        self.log_store.store(log)

        effective_timeout = timeout or self.timeout

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                cwd=str(effective_cwd),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, "PYTHONUNBUFFERED": "1", "GIT_TERMINAL_PROMPT": "0"},
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=effective_timeout
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                log.exit_code = -1
                log.stderr_lines = [f"TIMEOUT: Command exceeded {effective_timeout}s\n"]
                log.is_running = False
                log.completed_at = datetime.now()
                return self._format_output(log)

            # Store output
            log.stdout_lines = stdout.decode("utf-8", errors="replace").splitlines(keepends=True)
            log.stderr_lines = stderr.decode("utf-8", errors="replace").splitlines(keepends=True)
            log.exit_code = proc.returncode
            log.is_running = False
            log.completed_at = datetime.now()

            return self._format_output(log, verbose=verbose)

        except Exception as e:
            log.exit_code = -1
            log.stderr_lines = [f"ERROR: {type(e).__name__}: {e}\n"]
            log.is_running = False
            log.completed_at = datetime.now()
            return self._format_output(log)

    async def _stream_output(self, log: CommandLog) -> None:
        """Background task to stream output from running process."""
        if not log.process:
            return
        
        async def read_stream(stream, is_stderr: bool = False):
            while True:
                try:
                    line = await stream.readline()
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace")
                    log.output_buffer.append(decoded)
                    if is_stderr:
                        log.stderr_lines.append(decoded)
                    else:
                        log.stdout_lines.append(decoded)
                except Exception:
                    break
        
        try:
            await asyncio.gather(
                read_stream(log.process.stdout, is_stderr=False),
                read_stream(log.process.stderr, is_stderr=True),
            )
        finally:
            # Process finished
            if log.process.returncode is None:
                await log.process.wait()
            log.exit_code = log.process.returncode
            log.is_running = False
            log.completed_at = datetime.now()

    async def run_background(
        self,
        command: str,
        cwd: Optional[str] = None,
        wait_for_output: float = 2.0,
    ) -> dict:
        """
        Start a command in the background (non-blocking).
        
        Use this for long-running commands like dev servers.
        Returns immediately with cmd_id after capturing initial output.
        
        Args:
            command: Shell command to run.
            cwd: Working directory (absolute, within root).
            wait_for_output: Seconds to wait for initial output (default 2s).
        
        Returns:
            dict with cmd_id, status, initial_output, and detected port/url.
        """
        command = command.strip()
        if not command:
            return {"error": "Empty command"}

        if self._is_blocked(command):
            return {"error": "BLOCKED: Command matches security blocklist."}

        try:
            effective_cwd = self._validate_cwd(cwd)
        except ValueError as e:
            return {"error": str(e)}

        # Kill any previous background process with same command pattern
        # (e.g., kill old npm run dev before starting new one)
        await self._kill_similar_background(command)

        # Create log entry
        cmd_id = str(uuid.uuid4())[:8]
        log = CommandLog(
            cmd_id=cmd_id,
            command=command,
            cwd=str(effective_cwd),
        )
        self.log_store.store(log)

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                cwd=str(effective_cwd),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, "PYTHONUNBUFFERED": "1", "GIT_TERMINAL_PROMPT": "0"},
            )
            
            log.process = proc
            
            # Start background reader task
            log._reader_task = asyncio.create_task(self._stream_output(log))
            
            # Wait briefly to capture initial output
            await asyncio.sleep(wait_for_output)
            
            # Check if process already exited (fast failure)
            if proc.returncode is not None:
                # Process finished quickly - wait for reader to complete
                try:
                    await asyncio.wait_for(log._reader_task, timeout=1.0)
                except asyncio.TimeoutError:
                    pass
                
                return {
                    "cmd_id": cmd_id,
                    "status": "completed",
                    "exit_code": proc.returncode,
                    "output": "".join(log.output_buffer[-30:]).rstrip(),
                    "total_lines": len(log.output_buffer),
                }
            
            # Process still running - return initial output
            initial_output = "".join(log.output_buffer[-30:])
            
            # Try to detect port/URL from output
            url = self._detect_url(initial_output)
            
            result = {
                "cmd_id": cmd_id,
                "status": "running",
                "initial_output": initial_output.rstrip(),
                "lines_captured": len(log.output_buffer),
            }
            
            if url:
                result["url"] = url
                result["hint"] = f"Dev server running at {url}"
            else:
                result["hint"] = f"Process running. Use read_log('{cmd_id}') to check output."
            
            return result

        except Exception as e:
            log.exit_code = -1
            log.stderr_lines = [f"ERROR: {type(e).__name__}: {e}\n"]
            log.is_running = False
            log.completed_at = datetime.now()
            return {
                "cmd_id": cmd_id,
                "status": "error",
                "error": str(e),
            }

    def _detect_url(self, output: str) -> Optional[str]:
        """Detect URL/port from command output."""
        # Common patterns for dev servers
        patterns = [
            r"Local:\s*(https?://[^\s]+)",           # Vite: Local: http://localhost:5173/
            r"http://localhost:(\d+)",               # Generic localhost
            r"http://127\.0\.0\.1:(\d+)",            # 127.0.0.1
            r"Server running (?:at|on)\s*(https?://[^\s]+)",
            r"listening on\s*(https?://[^\s]+)",
        ]
        
        for pattern in patterns:
            match = re.search(pattern, output, re.IGNORECASE)
            if match:
                url = match.group(1)
                # If we captured just a port, build the URL
                if url.isdigit():
                    url = f"http://localhost:{url}"
                return url
        
        return None

    async def _kill_similar_background(self, command: str) -> None:
        """Kill previous background processes running similar commands."""
        # Extract command "signature" (e.g., "npm run dev" -> matches other "npm run dev")
        cmd_words = command.split()[:3]  # First 3 words
        
        for cmd_id in list(self.log_store._logs.keys()):
            log = self.log_store._logs.get(cmd_id)
            if log and log.is_running and log.process:
                existing_words = log.command.split()[:3]
                if cmd_words == existing_words:
                    # Same command type - kill it
                    await self.terminate(cmd_id)

    async def terminate(self, cmd_id: str) -> dict:
        """
        Terminate a running background process.
        
        Args:
            cmd_id: Command ID from run_background result.
        
        Returns:
            dict with status and final output.
        """
        log = self.log_store.get(cmd_id)
        
        if log is None:
            return {"error": f"Command not found: {cmd_id}"}
        
        if not log.is_running:
            return {
                "cmd_id": cmd_id,
                "status": "already_stopped",
                "exit_code": log.exit_code,
            }
        
        if log.process is None:
            return {"error": f"No process reference for: {cmd_id}"}
        
        try:
            # Try graceful termination first
            log.process.terminate()
            
            try:
                await asyncio.wait_for(log.process.wait(), timeout=3.0)
            except asyncio.TimeoutError:
                # Force kill if doesn't respond
                log.process.kill()
                await log.process.wait()
            
            # Cancel reader task
            if log._reader_task and not log._reader_task.done():
                log._reader_task.cancel()
                try:
                    await log._reader_task
                except asyncio.CancelledError:
                    pass
            
            log.is_running = False
            log.exit_code = log.process.returncode
            log.completed_at = datetime.now()
            
            return {
                "cmd_id": cmd_id,
                "status": "terminated",
                "exit_code": log.exit_code,
                "total_lines": len(log.output_buffer),
            }
            
        except Exception as e:
            return {
                "cmd_id": cmd_id,
                "status": "error",
                "error": str(e),
            }

    async def cleanup_all(self) -> dict:
        """Terminate all running background processes. Call on session end."""
        terminated = []
        
        for cmd_id in list(self.log_store._logs.keys()):
            log = self.log_store._logs.get(cmd_id)
            if log and log.is_running and log.process:
                result = await self.terminate(cmd_id)
                terminated.append({
                    "cmd_id": cmd_id,
                    "command": log.command[:50],
                    "result": result.get("status"),
                })
        
        return {
            "terminated_count": len(terminated),
            "processes": terminated,
        }

    def read_log(
        self,
        cmd_id: str,
        offset: Optional[int] = None,
        limit: int = 100,
        from_end: bool = False,
    ) -> dict:
        """
        Read more lines from a command log.

        Args:
            cmd_id: Command ID from run_command result.
            offset: Line number to start from (0-indexed). None = auto (from_end).
            limit: Max lines to return.
            from_end: If True and offset is None, start from end.

        Returns:
            dict with lines, total_lines, and navigation hints.
        """
        log = self.log_store.get(cmd_id)

        if log is None:
            recent = self.log_store.list_recent()
            return {
                "error": f"Log not found or expired: {cmd_id}",
                "recent_ids": recent,
                "hint": "Re-run the command if needed.",
            }

        # Check pagination limit
        log.pagination_count += 1
        if log.pagination_count > self.max_pagination_calls:
            return {
                "error": "Pagination limit reached (3 calls).",
                "hint": "Summarize what you learned and proceed, or re-run command.",
                "cmd_id": cmd_id,
            }

        # For running processes, use output_buffer (real-time)
        # For completed processes, use stdout/stderr lines
        if log.is_running and log.output_buffer:
            all_lines = log.output_buffer
        else:
            all_lines = log.stdout_lines + log.stderr_lines
        
        total = len(all_lines)

        if total == 0:
            status_msg = "still starting..." if log.is_running else ""
            return {"cmd_id": cmd_id, "lines": status_msg, "total_lines": 0, "is_running": log.is_running}


        # Determine offset
        if offset is None:
            if from_end:
                offset = max(0, total - limit)
            else:
                offset = 0

        # Clamp
        offset = max(0, min(offset, total - 1))
        end = min(offset + limit, total)

        lines = all_lines[offset:end]
        output = "".join(lines)

        # Check binary
        if self._is_binary(output):
            return {
                "cmd_id": cmd_id,
                "error": "Binary output detected. Cannot display.",
            }

        result = {
            "cmd_id": cmd_id,
            "lines": output.rstrip(),
            "showing": f"lines {offset + 1}-{end} of {total}",
            "total_lines": total,
            "is_running": log.is_running,
            "pagination_remaining": self.max_pagination_calls - log.pagination_count,
        }

        # Navigation hints
        if offset > 0:
            result["prev"] = f"read_log('{cmd_id}', offset={max(0, offset - limit)})"
        if end < total:
            result["next"] = f"read_log('{cmd_id}', offset={end})"

        return result

    def list_commands(self, limit: int = 5) -> list[dict]:
        """List recent commands with their status."""
        recent_ids = self.log_store.list_recent(limit)
        results = []
        for cmd_id in reversed(recent_ids):  # Most recent first
            log = self.log_store.get(cmd_id)
            if log:
                results.append({
                    "cmd_id": cmd_id,
                    "command": log.command[:50] + ("..." if len(log.command) > 50 else ""),
                    "exit_code": log.exit_code,
                    "is_running": log.is_running,
                    "started_at": log.started_at.isoformat(),
                })
        return results
