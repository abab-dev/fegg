"""
Standalone Code Editor
Smart search and replace with multiple strategies.
"""

import os
import difflib
from pathlib import Path
from typing import Iterator, Tuple, Optional

try:
    from rapidfuzz.distance import Levenshtein
except ImportError:
    import difflib
    # Create a simple compatibility layer
    class Levenshtein:
        @staticmethod
        def normalized_similarity(a: str, b: str) -> float:
            return difflib.SequenceMatcher(None, a, b).ratio()


class CodeEditor:
    """
    Smart file editor with multiple matching strategies.
    All file paths must be absolute.

    Usage:
        editor = CodeEditor("/path/to/root")
        result = editor.apply_file_edit("/path/to/root/file.py", old_code, new_code)
    """

    def __init__(self, root_path: str = "."):
        self.root = Path(root_path).resolve()

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

    # Matching strategies
    def _match_exact(self, content: str, search: str) -> Iterator[Tuple[int, int]]:
        """Strategy 1: Exact match."""
        start = 0
        while True:
            idx = content.find(search, start)
            if idx == -1:
                break
            yield idx, idx + len(search)
            start = idx + 1

    def _match_line_trimmed(self, content: str, search: str) -> Iterator[Tuple[int, int]]:
        """Strategy 2: Ignore indentation differences."""
        c_lines = content.splitlines(keepends=True)
        s_lines = search.splitlines(keepends=True)

        # Remove trailing empty line from search if present
        if s_lines and s_lines[-1].strip() == "":
            s_lines.pop()

        n_search = len(s_lines)
        if n_search == 0:
            return

        s_trimmed = [l.strip() for l in s_lines]

        # Calculate character offsets for each line
        current_char_idx = 0
        line_offsets = []
        for line in c_lines:
            line_offsets.append(current_char_idx)
            current_char_idx += len(line)
        line_offsets.append(current_char_idx)

        # Find matches
        for i in range(len(c_lines) - n_search + 1):
            match = True
            for j in range(n_search):
                if c_lines[i + j].strip() != s_trimmed[j]:
                    match = False
                    break
            if match:
                yield line_offsets[i], line_offsets[i + n_search]

    def _match_block_anchor(self, content: str, search: str) -> Iterator[Tuple[int, int]]:
        """Strategy 3: Fuzzy match middle lines if start/end match."""
        c_lines = content.splitlines(keepends=True)
        s_lines = search.splitlines(keepends=True)

        if len(s_lines) < 3:
            return

        first_search = s_lines[0].strip()
        last_search = s_lines[-1].strip()

        # Calculate character offsets
        current_char_idx = 0
        line_offsets = []
        for line in c_lines:
            line_offsets.append(current_char_idx)
            current_char_idx += len(line)
        line_offsets.append(current_char_idx)

        # Find all possible matches (start and end lines)
        candidates = []
        for i in range(len(c_lines)):
            if c_lines[i].strip() == first_search:
                limit = min(len(c_lines), i + len(s_lines) * 2)
                for j in range(i + 2, limit):
                    if c_lines[j].strip() == last_search:
                        candidates.append((i, j))
                        break

        # Score each candidate based on middle line similarity
        best_candidate = None
        max_score = 0.0

        for start_line, end_line in candidates:
            c_middle = c_lines[start_line + 1 : end_line]
            s_middle = s_lines[1:-1]

            # Skip if length difference is too large
            if abs(len(c_middle) - len(s_middle)) > len(s_middle) * 0.5:
                continue

            # Calculate similarity score
            total_score = 0
            comparisons = min(len(c_middle), len(s_middle))

            if comparisons == 0:
                score = 1.0
            else:
                for k in range(comparisons):
                    try:
                        dist = Levenshtein.normalized_similarity(
                            c_middle[k].strip(), s_middle[k].strip()
                        )
                    except:
                        # Fallback to simple ratio
                        dist = Levenshtein.normalized_similarity(
                            c_middle[k].strip(), s_middle[k].strip()
                        )
                    total_score += dist
                score = total_score / comparisons

            if score > max_score:
                max_score = score
                best_candidate = (start_line, end_line)

        # Accept best candidate if score is good enough
        threshold = 0.3 if len(candidates) > 1 else 0.0
        if best_candidate and max_score >= threshold:
            s_idx, e_idx = best_candidate
            yield line_offsets[s_idx], line_offsets[e_idx + 1]

    def _match_whitespace_normalized(self, content: str, search: str) -> Iterator[Tuple[int, int]]:
        """Strategy 4: Collapse all whitespace to single space for comparison."""
        def normalize(text: str) -> str:
            import re
            return re.sub(r'\s+', ' ', text).strip()

        normalized_search = normalize(search)
        lines = content.splitlines(keepends=True)

        # Single line match
        for i, line in enumerate(lines):
            if normalize(line) == normalized_search:
                start = sum(len(lines[j]) for j in range(i))
                yield start, start + len(line)

        # Multi-line match
        search_lines = search.splitlines()
        if len(search_lines) > 1:
            for i in range(len(lines) - len(search_lines) + 1):
                block = lines[i:i + len(search_lines)]
                if normalize(''.join(block)) == normalized_search:
                    start = sum(len(lines[j]) for j in range(i))
                    end = start + sum(len(l) for l in block)
                    yield start, end

    def _match_indentation_flexible(self, content: str, search: str) -> Iterator[Tuple[int, int]]:
        """Strategy 5: Match ignoring consistent indentation differences."""
        def remove_common_indent(text: str) -> str:
            lines = text.splitlines()
            non_empty = [l for l in lines if l.strip()]
            if not non_empty:
                return text
            min_indent = min(len(l) - len(l.lstrip()) for l in non_empty)
            return '\n'.join(l[min_indent:] if len(l) > min_indent else l for l in lines)

        normalized_search = remove_common_indent(search)
        content_lines = content.splitlines(keepends=True)
        search_lines = search.splitlines()

        for i in range(len(content_lines) - len(search_lines) + 1):
            block = content_lines[i:i + len(search_lines)]
            block_text = ''.join(block)
            if remove_common_indent(block_text.rstrip('\n')) == normalized_search.rstrip('\n'):
                start = sum(len(content_lines[j]) for j in range(i))
                end = start + len(block_text)
                yield start, end

    def apply_file_edit(self, path: str, old_code: str, new_code: str, replace_all: bool = False) -> str:
        """
        Apply edit to file using smart matching strategies.

        Args:
            path: Absolute path to file.
            old_code: Code to replace (exact copy from read_file).
            new_code: New code to insert.
            replace_all: If True, replace all occurrences (default: False).
        """
        # Validate path
        try:
            target = self._validate_path(path)
        except ValueError as e:
            return f"Error: {e}"

        if not target.exists():
            return f"Error: File not found: {path}"

        try:
            content = target.read_text(encoding="utf-8")
        except Exception:
            return "Error: Could not read file (binary?)"

        # Try each strategy in order (most strict first)
        strategies = [
            ("exact", self._match_exact),
            ("trimmed", self._match_line_trimmed),
            ("whitespace", self._match_whitespace_normalized),
            ("indentation", self._match_indentation_flexible),
            ("anchor", self._match_block_anchor),
        ]

        found_start, found_end = -1, -1
        used_strategy = ""

        for name, strategy in strategies:
            matches = list(strategy(content, old_code))
            if len(matches) == 1:
                found_start, found_end = matches[0]
                used_strategy = name
                break
            elif len(matches) > 1:
                return f"Error: Found {len(matches)} matches. Provide more context."

        if found_start == -1:
            return f"Error: Could not find matching code in {path}"

        # Apply the edit
        new_content = content[:found_start] + new_code + content[found_end:]

        try:
            target.write_text(new_content, encoding="utf-8")
        except Exception as e:
            return f"Error saving file: {e}"

        # Generate diff
        diff = difflib.unified_diff(
            content.splitlines(keepends=True),
            new_content.splitlines(keepends=True),
            fromfile=f"a/{target.name}",
            tofile=f"b/{target.name}",
            n=3,
        )

        return f"Successfully edited {path} using '{used_strategy}' strategy:\n" + "".join(diff)