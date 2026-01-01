"""
File System Tools using FileBackend abstraction.

Works identically on local filesystem or E2B sandbox.
"""

from typing import List, Optional

try:
    from rapidfuzz import process, fuzz
except ImportError:
    import difflib

    class process:
        @staticmethod
        def extract(query, choices, scorer=None, limit=10, score_cutoff=40):
            results = []
            for choice in choices:
                score = difflib.SequenceMatcher(None, query.lower(), choice.lower()).ratio() * 100
                if score >= score_cutoff:
                    results.append((choice, score))
            results.sort(key=lambda x: x[1], reverse=True)
            return results[:limit]

    class fuzz:
        @staticmethod
        def WRatio(s1, s2):
            return difflib.SequenceMatcher(None, s1.lower(), s2.lower()).ratio() * 100


# Import FileBackend protocol - no tight coupling
from e2b_sandbox.backends import FileBackend


class FSTools:
    """
    File system tools using FileBackend abstraction.
    
    Usage:
        from e2b_sandbox.backends import LocalBackend, E2BBackend
        
        # Local
        backend = LocalBackend("/path/to/workspace")
        tools = FSTools(backend)
        
        # E2B
        backend = E2BBackend(sandbox)
        tools = FSTools(backend)
        
        # Same API for both
        tools.read_file("src/App.tsx")
        tools.write_file("src/App.tsx", content)
        tools.grep("useState", "src/")
    """
    
    DEFAULT_IGNORE = {
        ".git", "node_modules", "__pycache__", ".venv", "dist",
        "build", ".idea", ".vscode", ".DS_Store", "venv",
        "package-lock.json", "yarn.lock", "bun.lockb", "bun.lock"
    }
    
    def __init__(self, backend: FileBackend):
        self._backend = backend
    
    @property
    def root(self) -> str:
        """Workspace root path."""
        return self._backend.root
    
    # =========================================================================
    # File Operations
    # =========================================================================
    
    def read_file(self, path: str) -> str:
        """
        Read file contents.
        
        Args:
            path: Relative or absolute path to file.
        """
        try:
            return self._backend.read_file(path)
        except Exception as e:
            return f"Error reading file: {e}"
    
    def write_file(self, path: str, content: str) -> str:
        """
        Write content to file. Creates parent directories if needed.
        
        Args:
            path: Relative or absolute path.
            content: File content to write.
        """
        try:
            self._backend.write_file(path, content)
            return f"✓ Written to {path}"
        except Exception as e:
            return f"Error writing file: {e}"
    
    def list_dir(self, path: str = ".") -> str:
        """
        List directory contents.
        
        Args:
            path: Directory to list (default: workspace root).
        """
        try:
            items = self._backend.list_dir(path)
            if not items:
                return f"Empty or not a directory: {path}"
            return "\n".join(sorted(items))
        except Exception as e:
            return f"Error listing directory: {e}"
    
    def file_exists(self, path: str) -> bool:
        """Check if file exists."""
        return self._backend.file_exists(path)
    
    # =========================================================================
    # Search Operations
    # =========================================================================
    
    def grep(
        self,
        pattern: str,
        path: str = ".",
        context_lines: int = 2
    ) -> str:
        """
        Search for pattern in files.
        
        Args:
            pattern: Search pattern.
            path: File or directory to search (default: workspace root).
            context_lines: Lines of context around matches.
        """
        try:
            result = self._backend.grep(pattern, path, context_lines)
            return f"Query: {pattern}\nPath: {path}\n---\n{result}"
        except Exception as e:
            return f"Search error: {e}"
    
    def fuzzy_find(self, query: str) -> str:
        """
        Fuzzy search for files by name.
        
        Args:
            query: Partial filename to search for.
        """
        try:
            # Get all files recursively
            all_files = self._get_all_files()
            
            if not all_files:
                return f"No files found in workspace"
            
            # Fuzzy match
            results = process.extract(
                query, all_files, scorer=fuzz.WRatio, limit=10, score_cutoff=40
            )
            
            if not results:
                return f"No files matching '{query}'"
            
            output = [f"Matches for '{query}':"]
            for path, score in results:
                output.append(f"  {path} (score: {score:.0f})")
            
            return "\n".join(output)
            
        except Exception as e:
            return f"Search error: {e}"
    
    def _get_all_files(self, path: str = ".") -> List[str]:
        """Recursively get all files, respecting ignore patterns."""
        result = []
        
        def walk(current_path: str):
            try:
                items = self._backend.list_dir(current_path)
                for item in items:
                    if item in self.DEFAULT_IGNORE:
                        continue
                    
                    full_path = f"{current_path}/{item}".replace("./", "")
                    
                    # Check if directory by trying to list it
                    sub_items = self._backend.list_dir(full_path)
                    if sub_items:  # It's a directory
                        walk(full_path)
                    else:
                        result.append(full_path)
            except:
                pass
        
        walk(path)
        return result
    
    # =========================================================================
    # Command Execution
    # =========================================================================
    
    def run(self, command: str, timeout: int = 30) -> str:
        """
        Run shell command in workspace.
        
        Args:
            command: Shell command to execute.
            timeout: Max execution time in seconds.
        """
        result = self._backend.run_command(command, timeout=timeout)
        
        output = result.output.strip()
        if not result.success:
            output = f"[Exit code: {result.exit_code}]\n{output}"
        
        return output
    
    def run_background(self, command: str) -> str:
        """
        Run command in background (for dev servers etc).
        
        Args:
            command: Shell command to run in background.
        """
        # Append & to run in background
        bg_cmd = f"nohup {command} > /tmp/bg_output.log 2>&1 &"
        result = self._backend.run_command(bg_cmd, timeout=5)
        return f"Started in background: {command}"
