"""
Standalone Git Operations
Convenience layer with formatted output for LLM consumption.
"""

import os
import subprocess
from pathlib import Path
from typing import Optional, List


class GitTools:
    """
    Git operations with formatted output for LLM consumption.
    All file paths must be absolute.

    Usage:
        git = GitTools("/path/to/repo")
        print(git.status())
        print(git.diff("/path/to/repo/src/main.py"))
    """

    def __init__(
        self, root_path: str = ".", timeout: int = 30, max_output: int = 30000
    ):
        self.root = Path(root_path).resolve()
        self.timeout = timeout
        self.max_output = max_output

        if not self.root.exists():
            raise ValueError(f"Root path does not exist: {self.root}")

        # Validate git repo
        git_dir = self.root / ".git"
        if not git_dir.exists():
            raise ValueError(f"Not a git repository: {self.root}")

    def get_workspace_root(self) -> str:
        """Returns the absolute path to the workspace root."""
        return str(self.root)

    def _validate_path(self, path: str) -> Path:
        """
        Validate that path is absolute and within root.
        Rejects relative paths.
        """
        if not os.path.isabs(path):
            raise ValueError(
                f"Relative paths not allowed. Use absolute path.\n"
                f"Got: {path}\n"
                f"Workspace root: {self.root}"
            )

        full_path = Path(path).resolve()
        try:
            full_path.relative_to(self.root)
        except ValueError:
            raise ValueError(
                f"Path outside workspace root.\n"
                f"Path: {path}\n"
                f"Root: {self.root}"
            )

        return full_path

    def _run(self, args: List[str], check: bool = False) -> dict:
        """Run git command and return result."""
        try:
            result = subprocess.run(
                ["git"] + args,
                cwd=str(self.root),
                capture_output=True,
                text=True,
                timeout=self.timeout,
                env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
            )

            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode,
            }

        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "stdout": "",
                "stderr": "Timeout",
                "returncode": -1,
            }
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e), "returncode": -1}

    def _truncate(self, text: str, hint: str = "") -> str:
        """Truncate long output with actionable hint."""
        if len(text) <= self.max_output:
            return text

        half = self.max_output // 2
        truncate_msg = "[truncated]"
        if hint:
            truncate_msg = f"[truncated - {hint}]"
        return f"{text[:half]}\n\n... {truncate_msg} ...\n\n{text[-half:]}"

    def status(self) -> str:
        """
        Get current git status.
        Shows branch, staged changes, unstaged changes, and untracked files.
        """
        result = self._run(["status"])

        if not result["success"]:
            return f"Error: {result['stderr']}"

        return self._truncate(result["stdout"])

    def diff(self, path: Optional[str] = None, staged: bool = False) -> str:
        """
        Show diff of changes.

        Args:
            path: Absolute file path to diff (or all files if None).
            staged: If True, show staged changes. Otherwise, show unstaged.
        """
        args = ["diff"]

        if staged:
            args.append("--cached")

        if path:
            try:
                resolved = self._validate_path(path)
                args.append(str(resolved.relative_to(self.root)))
            except ValueError as e:
                return f"Error: {e}"

        result = self._run(args)

        if not result["success"]:
            return f"Error: {result['stderr']}"

        output = result["stdout"].strip()
        if not output:
            return "No changes"
        return self._truncate(output, hint="use diff(path='/specific/file.py') for focused output")

    def log(
        self, count: int = 10, path: Optional[str] = None, oneline: bool = False
    ) -> str:
        """
        Show commit history.

        Args:
            count: Number of commits to show.
            path: Absolute path to show history for.
            oneline: If True, show compact one-line format.
        """
        args = ["log", f"-{count}"]

        if oneline:
            args.append("--oneline")
        else:
            args.extend(["--format=%h %an %ad %s", "--date=short"])

        if path:
            try:
                resolved = self._validate_path(path)
                args.extend(["--", str(resolved.relative_to(self.root))])
            except ValueError as e:
                return f"Error: {e}"

        result = self._run(args)

        if not result["success"]:
            return f"Error: {result['stderr']}. Use git log to find valid commits."

        return result["stdout"].strip() or "No commits"

    def show(self, commit: str = "HEAD") -> str:
        """
        Show details of a specific commit.

        Args:
            commit: Commit hash, branch name, or reference (default: HEAD).
        """
        # Sanitize commit reference
        if not commit.replace("-", "").replace("_", "").replace("/", "").isalnum():
            if commit not in ["HEAD", "HEAD~1", "HEAD~2", "HEAD^"]:
                return "Error: Invalid commit reference"

        result = self._run(["show", commit, "--stat"])

        if not result["success"]:
            return f"Error: {result['stderr']}"

        return self._truncate(result["stdout"])

    def blame(
        self,
        path: str,
        start_line: Optional[int] = None,
        end_line: Optional[int] = None,
    ) -> str:
        """
        Show line-by-line blame for a file.

        Args:
            path: Absolute file path to blame.
            start_line: Optional start line number.
            end_line: Optional end line number.
        """
        try:
            resolved = self._validate_path(path)
        except ValueError as e:
            return f"Error: {e}"

        if not resolved.exists():
            return f"Error: File not found: {path}. Use git log to find when it existed."

        args = ["blame"]

        if start_line and end_line:
            args.extend(["-L", f"{start_line},{end_line}"])
        elif start_line:
            args.extend(["-L", f"{start_line},+20"])

        args.append(str(resolved.relative_to(self.root)))

        result = self._run(args)

        if not result["success"]:
            return f"Error: {result['stderr']}"

        return self._truncate(result["stdout"], hint="use start_line/end_line to focus")

    def branch(self, all: bool = False) -> str:
        """
        List branches.

        Args:
            all: If True, include remote branches.
        """
        args = ["branch", "-v"]

        if all:
            args.append("-a")

        result = self._run(args)

        if not result["success"]:
            return f"Error: {result['stderr']}"

        return result["stdout"].strip() or "No branches"

    def current_branch(self) -> str:
        """Get current branch name."""
        result = self._run(["rev-parse", "--abbrev-ref", "HEAD"])

        if not result["success"]:
            return f"Error: {result['stderr']}"

        return result["stdout"].strip()

    def stash_list(self) -> str:
        """List all stashes."""
        result = self._run(["stash", "list"])

        if not result["success"]:
            return f"Error: {result['stderr']}"

        return result["stdout"].strip() or "No stashes"

    def remote(self) -> str:
        """List remotes with URLs."""
        result = self._run(["remote", "-v"])

        if not result["success"]:
            return f"Error: {result['stderr']}"

        return result["stdout"].strip() or "No remotes configured"

    def last_commit(self) -> str:
        """Get summary of last commit."""
        result = self._run(
            ["log", "-1", "--format=%H%n%an <%ae>%n%ad%n%n%s%n%n%b", "--date=iso"]
        )

        if not result["success"]:
            return f"Error: {result['stderr']}"

        return result["stdout"].strip()

    def changed_files(self, commit: str = "HEAD") -> str:
        """
        List files changed in a commit.

        Args:
            commit: Commit reference (default: HEAD).
        """
        result = self._run(
            ["diff-tree", "--no-commit-id", "--name-status", "-r", commit]
        )

        if not result["success"]:
            return f"Error: {result['stderr']}"

        return result["stdout"].strip() or "No files changed"

    def uncommitted_changes(self) -> str:
        """Get a summary of all uncommitted changes (staged and unstaged)."""
        # Staged files
        staged_result = self._run(["diff", "--cached", "--name-status"])
        # Unstaged files
        unstaged_result = self._run(["diff", "--name-status"])
        # Untracked files
        untracked_result = self._run(["ls-files", "--others", "--exclude-standard"])

        output = []

        if staged_result["stdout"].strip():
            output.append("Staged:\n" + staged_result["stdout"].strip())

        if unstaged_result["stdout"].strip():
            output.append("Unstaged:\n" + unstaged_result["stdout"].strip())

        if untracked_result["stdout"].strip():
            untracked = "\n".join(
                f"??\t{f}" for f in untracked_result["stdout"].strip().split("\n")
            )
            output.append("Untracked:\n" + untracked)

        return "\n\n".join(output) if output else "Working tree clean"
