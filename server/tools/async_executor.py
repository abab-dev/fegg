
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

    cmd_id: str
    command: str
    cwd: str
    exit_code: Optional[int] = None
    stdout_lines: list = field(default_factory=list)
    stderr_lines: list = field(default_factory=list)
    started_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    is_running: bool = True
    pagination_count: int = 0
    process: Optional[asyncio.subprocess.Process] = None
    output_buffer: list = field(default_factory=list)
    _reader_task: Optional[asyncio.Task] = None


class CommandLogStore:

    def __init__(self, max_entries: int = 50, ttl_minutes: int = 30):
        self._logs: OrderedDict[str, CommandLog] = OrderedDict()
        self.max_entries = max_entries
        self.ttl = timedelta(minutes=ttl_minutes)

    def store(self, log: CommandLog) -> None:
        self._evict_expired()
        if len(self._logs) >= self.max_entries:
            self._logs.popitem(last=False)
        self._logs[log.cmd_id] = log
        self._logs.move_to_end(log.cmd_id)

    def get(self, cmd_id: str) -> Optional[CommandLog]:
        self._evict_expired()
        log = self._logs.get(cmd_id)
        if log:
            self._logs.move_to_end(cmd_id)
        return log

    def list_recent(self, limit: int = 5) -> list[str]:
        self._evict_expired()
        return list(self._logs.keys())[-limit:]

    def _evict_expired(self) -> None:
        now = datetime.now()
        expired = [
            cid
            for cid, log in self._logs.items()
            if (now - log.started_at) > self.ttl
        ]
        for cid in expired:
            del self._logs[cid]


class AsyncProcessExecutor:

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
        if not text:
            return False
        non_printable = sum(1 for c in text[:1000] if ord(c) < 32 and c not in '\n\r\t')
        return non_printable > len(text[:1000]) * 0.1

    def _format_output(
        self, log: CommandLog, verbose: bool = False
    ) -> dict:
        all_lines = log.stdout_lines + log.stderr_lines
        total_lines = len(all_lines)

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
        command = command.strip()
        if not command:
            return {"error": "Empty command"}

        if self._is_blocked(command):
            return {"error": "BLOCKED: Command matches security blocklist."}

        try:
            effective_cwd = self._validate_cwd(cwd)
        except ValueError as e:
            return {"error": str(e)}

        await self._kill_similar_background(command)

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

            log._reader_task = asyncio.create_task(self._stream_output(log))

            await asyncio.sleep(wait_for_output)

            if proc.returncode is not None:
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

            initial_output = "".join(log.output_buffer[-30:])

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
        patterns = [
            r"Local:\s*(https?://[^\s]+)",
            r"http://localhost:(\d+)",
            r"http://127\.0\.0\.1:(\d+)",
            r"Server running (?:at|on)\s*(https?://[^\s]+)",
            r"listening on\s*(https?://[^\s]+)",
        ]
        
        for pattern in patterns:
            match = re.search(pattern, output, re.IGNORECASE)
            if match:
                url = match.group(1)
                if url.isdigit():
                    url = f"http://localhost:{url}"
                return url

        return None

    async def _kill_similar_background(self, command: str) -> None:
        cmd_words = command.split()[:3]
        
        for cmd_id in list(self.log_store._logs.keys()):
            log = self.log_store._logs.get(cmd_id)
            if log and log.is_running and log.process:
                existing_words = log.command.split()[:3]
                if cmd_words == existing_words:
                    await self.terminate(cmd_id)

    async def terminate(self, cmd_id: str) -> dict:
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
            log.process.terminate()

            try:
                await asyncio.wait_for(log.process.wait(), timeout=3.0)
            except asyncio.TimeoutError:
                log.process.kill()
                await log.process.wait()

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
        log = self.log_store.get(cmd_id)

        if log is None:
            recent = self.log_store.list_recent()
            return {
                "error": f"Log not found or expired: {cmd_id}",
                "recent_ids": recent,
                "hint": "Re-run the command if needed.",
            }

        log.pagination_count += 1
        if log.pagination_count > self.max_pagination_calls:
            return {
                "error": "Pagination limit reached (3 calls).",
                "hint": "Summarize what you learned and proceed, or re-run command.",
                "cmd_id": cmd_id,
            }

        if log.is_running and log.output_buffer:
            all_lines = log.output_buffer
        else:
            all_lines = log.stdout_lines + log.stderr_lines
        
        total = len(all_lines)

        if total == 0:
            status_msg = "still starting..." if log.is_running else ""
            return {"cmd_id": cmd_id, "lines": status_msg, "total_lines": 0, "is_running": log.is_running}

        if offset is None:
            if from_end:
                offset = max(0, total - limit)
            else:
                offset = 0

        offset = max(0, min(offset, total - 1))
        end = min(offset + limit, total)

        lines = all_lines[offset:end]
        output = "".join(lines)

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

        if offset > 0:
            result["prev"] = f"read_log('{cmd_id}', offset={max(0, offset - limit)})"
        if end < total:
            result["next"] = f"read_log('{cmd_id}', offset={end})"

        return result

    def list_commands(self, limit: int = 5) -> list[dict]:
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
