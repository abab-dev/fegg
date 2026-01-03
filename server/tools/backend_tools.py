
from typing import List, Optional, Dict

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
from sandbox.backends import FileBackend


class FileCache:

    def __init__(self, max_entries: int = 50):
        self._cache: Dict[str, str] = {}
        self._access_order: List[str] = []  # For LRU tracking
        self._max_entries = max_entries
    
    def get(self, path: str) -> Optional[str]:
        if path in self._cache:
            # Update access order for LRU
            if path in self._access_order:
                self._access_order.remove(path)
            self._access_order.append(path)
            return self._cache[path]
        return None
    
    def set(self, path: str, content: str) -> None:
        # Evict oldest entries if at capacity
        while len(self._cache) >= self._max_entries and self._access_order:
            oldest = self._access_order.pop(0)
            self._cache.pop(oldest, None)
        
        self._cache[path] = content
        if path in self._access_order:
            self._access_order.remove(path)
        self._access_order.append(path)
    
    def invalidate(self, path: str) -> None:
        self._cache.pop(path, None)
        if path in self._access_order:
            self._access_order.remove(path)
    
    def clear(self) -> None:
        self._cache.clear()
        self._access_order.clear()
    
    def stats(self) -> Dict:
        return {
            "entries": len(self._cache),
            "max_entries": self._max_entries,
            "cached_paths": list(self._cache.keys())
        }


class FSTools:

    DEFAULT_IGNORE = {
        ".git", "node_modules", "__pycache__", ".venv", "dist",
        "build", ".idea", ".vscode", ".DS_Store", "venv",
        "package-lock.json", "yarn.lock", "bun.lockb", "bun.lock"
    }
    
    def __init__(self, backend: FileBackend, cache: Optional[FileCache] = None):
        self._backend = backend
        self._cache = cache or FileCache()
    
    @property
    def root(self) -> str:
        return self._backend.root

    @property
    def cache(self) -> FileCache:
        return self._cache

    def _normalize_path(self, path: str) -> str:
        path = path.lstrip("./").rstrip("/")
        return path

    def read_file(self, path: str) -> str:
        norm_path = self._normalize_path(path)

        cached = self._cache.get(norm_path)
        if cached is not None:
            return cached
        
        try:
            content = self._backend.read_file(path)
            # Cache the content
            self._cache.set(norm_path, content)
            return content
        except Exception as e:
            return f"Error reading file: {e}"
    
    def write_file(self, path: str, content: str) -> str:
        norm_path = self._normalize_path(path)

        try:
            self._backend.write_file(path, content)
            self._cache.set(norm_path, content)
            return f"✓ Written to {path}"
        except Exception as e:
            self._cache.invalidate(norm_path)
            return f"Error writing file: {e}"
    
    def list_dir(self, path: str = ".") -> str:
        try:
            items = self._backend.list_dir(path)
            if not items:
                return f"Empty or not a directory: {path}"
            return "\n".join(sorted(items))
        except Exception as e:
            return f"Error listing directory: {e}"
    
    def file_exists(self, path: str) -> bool:
        return self._backend.file_exists(path)

    def grep(
        self,
        pattern: str,
        path: str = ".",
        context_lines: int = 2
    ) -> str:
        try:
            result = self._backend.grep(pattern, path, context_lines)
            return f"Query: {pattern}\nPath: {path}\n---\n{result}"
        except Exception as e:
            return f"Search error: {e}"
    
    def fuzzy_find(self, query: str) -> str:
        try:
            all_files = self._get_all_files()

            if not all_files:
                return f"No files found in workspace"

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
        result = []
        
        def walk(current_path: str):
            try:
                items = self._backend.list_dir(current_path)
                for item in items:
                    if item in self.DEFAULT_IGNORE:
                        continue
                    
                    full_path = f"{current_path}/{item}".replace("./", "")
                    
                    sub_items = self._backend.list_dir(full_path)
                    if sub_items:  # It's a directory
                        walk(full_path)
                    else:
                        result.append(full_path)
            except:
                pass

        walk(path)
        return result

    def run(self, command: str, timeout: int = 30) -> str:
        result = self._backend.run_command(command, timeout=timeout)
        
        output = result.output.strip()
        if not result.success:
            output = f"[Exit code: {result.exit_code}]\n{output}"
        
        return output
    
    def run_background(self, command: str) -> str:
        bg_cmd = f"nohup {command} > /tmp/bg_output.log 2>&1 &"
        result = self._backend.run_command(bg_cmd, timeout=5)
        return f"Started in background: {command}"
