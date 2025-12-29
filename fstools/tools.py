import os
import subprocess
import glob as glob_module
from pathlib import Path
from typing import List, Literal, Optional

try:
    from rapidfuzz import process, fuzz
except ImportError:
    # Fallback if rapidfuzz is not installed
    import difflib

    class process:
        @staticmethod
        def extract(query, choices, scorer=None, limit=10, score_cutoff=40):
            results = []
            for choice in choices:
                score = (
                    difflib.SequenceMatcher(None, query.lower(), choice.lower()).ratio()
                    * 100
                )
                if score >= score_cutoff:
                    results.append((choice, score))
            results.sort(key=lambda x: x[1], reverse=True)
            return results[:limit]

    class fuzz:
        @staticmethod
        def WRatio(s1, s2):
            return difflib.SequenceMatcher(None, s1.lower(), s2.lower()).ratio() * 100


class FileSystemSearchTools:
    """
    A self-contained toolkit for file system search operations.
    Securely restricted to a specific root directory.
    All paths must be absolute.
    """

    def __init__(self, root_path: str = "."):
        self.root = Path(root_path).resolve()
        self.default_ignore = {
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
            "package-lock.json",
            "yarn.lock",
            "bun.lockb",
        }

    def get_workspace_root(self) -> str:
        """Returns the absolute path to the workspace root."""
        return str(self.root)

    def _validate_path(self, path: str) -> Path:
        """Validate that path is absolute and within root."""
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

    def _get_all_files(self) -> List[str]:
        """Fast walker to get all ABSOLUTE file paths."""
        file_list = []
        for root, dirs, files in os.walk(self.root):
            dirs[:] = [d for d in dirs if d not in self.default_ignore]
            for file in files:
                if file in self.default_ignore:
                    continue
                full_path = Path(root) / file
                file_list.append(str(full_path))  # Absolute path
        return file_list

    def fuzzy_find_file(self, query: str) -> str:
        """
        Fuzzy searches for a file path. Simulates 'fzf'.
        Useful when you know the approximate filename but not the full path.
        Returns ABSOLUTE paths.

        Args:
            query: Search query for filename.
        """
        all_files = self._get_all_files()
        results = process.extract(
            query, all_files, scorer=fuzz.WRatio, limit=10, score_cutoff=40
        )

        if not results:
            return f"No files found matching '{query}' in {self.root}"

        output = [f"Workspace: {self.root}", "Matches (absolute paths):"]
        for match_tuple in results:
            path_str = match_tuple[0]
            score = match_tuple[1]
            output.append(f"  {path_str} (score: {score:.0f})")
        return "\n".join(output)

    def glob_search(self, pattern: str, path: Optional[str] = None) -> str:
        """
        Fast file pattern matching using glob.
        Returns ABSOLUTE paths.

        Args:
            pattern: Glob pattern (e.g. '**/*.py', 'src/comp*').
            path: Absolute directory to search in (default: workspace root).
        """
        try:
            # Default to root if no path provided
            if path is None:
                target_path = self.root
            else:
                target_path = self._validate_path(path)

            if not target_path.is_dir():
                return f"Error: Not a directory: {target_path}"

            # Construct full search pattern
            search_pattern = str(target_path / pattern)

            # Use recursive=True if pattern contains **
            recursive = "**" in pattern
            matches = glob_module.glob(search_pattern, recursive=recursive)

            # Filter and format - return ABSOLUTE paths
            abs_matches = []
            for m in matches:
                p = Path(m)
                if p.is_file():
                    # Check ignores
                    if any(part in self.default_ignore for part in p.parts):
                        continue
                    abs_matches.append(str(p))

            if not abs_matches:
                return f"No files found matching '{pattern}' in {target_path}"

            # Sort for stability
            abs_matches.sort()

            output = [f"Workspace: {self.root}", f"Pattern: {pattern}", "---"]

            if len(abs_matches) > 100:
                output.extend(abs_matches[:100])
                output.append(f"\n... ({len(abs_matches) - 100} more files. Use a more specific pattern.)")
            else:
                output.extend(abs_matches)

            return "\n".join(output)

        except ValueError as e:
            return f"Error: {e}"
        except Exception as e:
            return f"Error executing glob: {e}"

    def grep_string(
        self,
        query: str,
        path: Optional[str] = None,
        context_lines: int = 2,
    ) -> str:
        """
        Search for text patterns in files using ripgrep.
        
        Args:
            query: Search pattern. Use | for alternatives (e.g., "auth|login|session").
                   Special regex characters are treated literally unless you use |.
            path: File or directory to search (default: workspace root).
                  Can be a single file OR a directory - both work!
            context_lines: Lines of context around each match (default: 2, max: 5).
        
        Returns matching lines with surrounding context.
        - Automatically respects .gitignore
        - Results capped at 50 matches
        - Case-sensitive by default
        
        Examples:
            grep_string("handleAuth")
            grep_string("worker|queue|scaling", "/path/to/packages/cli")
            grep_string("execute", "/path/to/file.ts", context_lines=0)
        """
        try:
            # Default to root if no path provided
            if path is None:
                target_path = self.root
            else:
                target_path = self._validate_path(path)
                
            # Check if path exists
            if not target_path.exists():
                return f"Error: Path does not exist: {target_path}"
                
        except ValueError as e:
            return f"Error: {e}"

        # Check if rg is available
        has_rg = subprocess.run(
            ["which", "rg"], capture_output=True
        ).returncode == 0

        if not has_rg:
            return "Error: ripgrep (rg) is not installed. Please install it: https://github.com/BurntSushi/ripgrep"

        # Clamp context lines to reasonable range
        context_lines = max(0, min(5, context_lines))
        
        # Build command
        command = [
            "rg",
            "--color=never",
            "--line-number",
            "--no-heading",
            "--max-count=50",  # Cap results per file
        ]
        
        # Add context if requested
        if context_lines > 0:
            command.extend([f"--context={context_lines}"])
        
        # Handle single file vs directory differently
        is_file = target_path.is_file()
        
        if not is_file:
            # Directory search - add ignore patterns
            command.extend([
                "--hidden",
                "-g", "!.git",
                "-g", "!node_modules", 
                "-g", "!__pycache__",
                "-g", "!.venv",
                "-g", "!venv",
                "-g", "!dist",
                "-g", "!build",
                "-g", "!*.lock",
                "-g", "!*.lockb",
            ])
        
        # Add query and path
        command.extend([query, str(target_path)])

        try:
            result = subprocess.run(
                command, 
                capture_output=True, 
                text=True, 
                timeout=15
            )

            if result.returncode == 1:
                # No matches (rg returns 1 for no matches)
                return f"No matches found for '{query}' in {target_path}"
            if result.returncode == 2:
                # Error
                return f"Search error: {result.stderr.strip()}"

            lines = result.stdout.strip().split("\n")
            
            # Build output
            output_lines = [
                f"Workspace: {self.root}",
                f"Query: {query}",
                f"Path: {target_path}",
                "---"
            ]

            # Limit total output lines to prevent context window explosion
            max_lines = 150
            if len(lines) > max_lines:
                output_lines.extend(lines[:max_lines])
                output_lines.append(
                    f"\n... ({len(lines) - max_lines} more lines. "
                    f"Use a more specific path or query to narrow results.)"
                )
            else:
                output_lines.extend(lines)

            return "\n".join(output_lines)

        except subprocess.TimeoutExpired:
            return (
                "Search timed out after 15s. "
                "Try a more specific query or narrower path."
            )
        except Exception as e:
            return f"Search error: {e}"

