import os
from pathlib import Path
from typing import List, Optional, Union


class FileSystemTools:
    """
    Basic file system operations: List, Read, Write.
    Restricted to a specific root directory for security.
    All paths must be absolute.
    """

    def __init__(self, root_path: str = "."):
        self.root = Path(root_path).resolve()
        # Common directories to ignore during listing
        self.ignore_patterns = {
            ".git",
            "node_modules",
            "__pycache__",
            ".venv",
            "dist",
            "build",
            ".idea",
            ".vscode",
            ".DS_Store",
            "venv",
        }

    def get_workspace_root(self) -> str:
        """Returns the absolute path to the workspace root."""
        return str(self.root)

    def _validate_path(self, path: str) -> Path:
        """
        Validate that path is absolute and within root.
        Rejects relative paths entirely.
        """
        if not os.path.isabs(path):
            raise ValueError(
                f"Relative paths not allowed. Use absolute path.\n"
                f"Got: {path}\n"
                f"Hint: Workspace root is {self.root}"
            )

        full_path = Path(path).resolve()
        try:
            full_path.relative_to(self.root)
        except ValueError:
            raise ValueError(
                f"Access denied: Path is outside workspace root.\n"
                f"Path: {path}\n"
                f"Root: {self.root}"
            )

        return full_path

    def list_files(self, path: Optional[str] = None, depth: int = 1) -> str:
        """
        Lists files and directories at the given path.
        Returns ABSOLUTE paths for all entries.

        Args:
            path: Absolute path to directory (default: workspace root).
            depth: How many levels deep to list (default: 1).
        """
        try:
            # Default to root if no path provided
            if path is None:
                target_dir = self.root
            else:
                target_dir = self._validate_path(path)

            if not target_dir.exists():
                return f"Error: Directory does not exist: {target_dir}"
            if not target_dir.is_dir():
                return f"Error: Not a directory: {target_dir}"

            output = [f"Workspace: {self.root}", f"Listing: {target_dir}", "---"]
            start_level = len(target_dir.parts)

            for root, dirs, files in os.walk(target_dir):
                # Calculate current depth
                current_level = len(Path(root).parts)
                if current_level - start_level >= depth:
                    # Clear dirs to stop walking deeper
                    dirs[:] = []
                    continue

                # Filter ignored directories
                dirs[:] = [d for d in dirs if d not in self.ignore_patterns]

                # Sort for consistent output
                dirs.sort()
                files.sort()

                root_path = Path(root)

                for d in dirs:
                    abs_path = root_path / d
                    output.append(f"DIR  {abs_path}/")
                for f in files:
                    if f in self.ignore_patterns:
                        continue
                    abs_path = root_path / f
                    output.append(f"FILE {abs_path}")

            if len(output) == 3:  # Only header lines
                return "Directory is empty."

            return "\n".join(output)

        except ValueError as e:
            return f"Error: {e}"
        except Exception as e:
            return f"Error listing files: {e}"

    def read_file(
        self,
        path: str,
        start_line: int = 1,
        limit: int = 2000,
        offset: Optional[Union[int, str]] = None,
    ) -> str:
        """
        Reads the content of a file.

        Args:
            path: Absolute path to the file.
            start_line: The line number to start reading from (1-based).
            limit: Maximum number of lines to read.
            offset: Alias for start_line (provided for Agent compatibility).
        """
        try:
            target_file = self._validate_path(path)

            if not target_file.exists():
                return f"Error: File '{path}' not found."
            if not target_file.is_file():
                return f"Error: '{path}' is not a file."

            # Handle the 'offset' vs 'start_line' confusion
            # If offset is provided, it overrides start_line
            if offset is not None:
                try:
                    start_line = int(offset)
                except ValueError:
                    pass  # Keep default start_line if offset is junk

            # Ensure reasonable bounds
            start_line = max(1, start_line)

            with open(target_file, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()

            total_lines = len(lines)

            if start_line > total_lines:
                return f"Error: Start line {start_line} exceeds file length ({total_lines} lines)."

            # Calculate slice indices (0-based)
            start_index = start_line - 1
            end_index = start_index + limit

            selected_lines = lines[start_index:end_index]

            output = [f"File: {path}"]
            if start_line > 1:
                output.append(f"... (skipped first {start_line - 1} lines) ...")

            output.append("---")

            # Format with line numbers
            for i, line in enumerate(selected_lines):
                line_num = start_line + i
                output.append(f"{line_num:4d} | {line.rstrip()}")

            output.append("---")

            if end_index < total_lines:
                output.append(
                    f"... (truncated. Total lines: {total_lines}. Use start_line={end_index + 1} to read more)"
                )

            return "\n".join(output)

        except Exception as e:
            return f"Error reading file: {e}"

    def write_file(self, path: str, content: str) -> str:
        """
        Writes content to a file. Overwrites if exists.

        Args:
            path: Absolute path to the file.
            content: The full string content to write.
        """
        try:
            target_file = self._validate_path(path)

            # Check if overwriting
            overwrite_info = ""
            if target_file.exists():
                try:
                    with open(target_file, "r", encoding="utf-8", errors="replace") as f:
                        old_lines = len(f.readlines())
                    overwrite_info = f" [OVERWRITTEN: was {old_lines} lines]"
                except Exception:
                    overwrite_info = " [OVERWRITTEN]"

            # Create parent directories if they don't exist
            target_file.parent.mkdir(parents=True, exist_ok=True)

            with open(target_file, "w", encoding="utf-8") as f:
                f.write(content)

            new_lines = content.count('\n') + (1 if content and not content.endswith('\n') else 0)
            return f"Successfully wrote {len(content)} chars ({new_lines} lines) to {path}{overwrite_info}"

        except ValueError as e:
            return f"Error: {e}"
        except Exception as e:
            return f"Error writing file: {e}"


