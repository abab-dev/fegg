"""
RepoMind Client - Convenience wrapper for all tools
"""

from .fs import FileSystemTools
from .edit import CodeEditor
from .tools import FileSystemSearchTools
from .async_executor import AsyncProcessExecutor
from .git_ops import GitTools


class RepoMind:
    """
    Convenience wrapper that combines all tools.
    Usage:
        rm = RepoMind("/path/to/repo")
        tools = rm.get_tools()  # List of callables for LLM binding
    """

    def __init__(self, repo_path: str = ".", confirm_callback=None):
        self.repo_path = repo_path

        self.fs = FileSystemTools(repo_path)
        self.edit = CodeEditor(repo_path)
        self.search = FileSystemSearchTools(repo_path)

        self.bash = AsyncProcessExecutor(repo_path)

        try:
            self.git = GitTools(repo_path)
        except ValueError:
            self.git = None

    def get_tools(self):
        """
        Returns a list of tool callables for LLM binding.
        Each tool is a bound method with proper signature.
        """
        tools = [
            self.fs.list_files,
            self.fs.read_file,
            self.fs.write_file,
            self.search.fuzzy_find_file,
            self.search.glob_search,
            self.search.grep_string,
            self.edit.apply_file_edit,
        ]

        # Add git tools if available
        if self.git:
            tools.extend(
                [
                    self.git.status,
                    self.git.diff,
                    self.git.log,
                    self.git.show,
                    self.git.blame,
                    self.git.branch,
                ]
            )

        return tools

    def get_tool_info(self):
        """
        Returns tool information for documentation or schema generation.
        """
        info = [
            {
                "name": "list_files",
                "description": "List files and directories in the repository",
                "method": self.fs.list_files,
            },
            {
                "name": "read_file",
                "description": "Read a file with line numbers",
                "method": self.fs.read_file,
            },
            {
                "name": "write_file",
                "description": "Write content to a file",
                "method": self.fs.write_file,
            },
            {
                "name": "fuzzy_find_file",
                "description": "Fuzzy search for files by name",
                "method": self.search.fuzzy_find_file,
            },
            {
                "name": "glob_search",
                "description": "Search files using glob patterns",
                "method": self.search.glob_search,
            },
            {
                "name": "grep_string",
                "description": "Search for text patterns in files",
                "method": self.search.grep_string,
            },
            {
                "name": "apply_file_edit",
                "description": "Apply smart edits to a file",
                "method": self.edit.apply_file_edit,
            },
        ]

        if self.git:
            info.extend(
                [
                    {
                        "name": "git_status",
                        "description": "Show current git status",
                        "method": self.git.status,
                    },
                    {
                        "name": "git_diff",
                        "description": "Show diff of changes",
                        "method": self.git.diff,
                    },
                    {
                        "name": "git_log",
                        "description": "Show commit history",
                        "method": self.git.log,
                    },
                    {
                        "name": "git_show",
                        "description": "Show details of a commit",
                        "method": self.git.show,
                    },
                    {
                        "name": "git_blame",
                        "description": "Show line-by-line blame for a file",
                        "method": self.git.blame,
                    },
                    {
                        "name": "git_branch",
                        "description": "List branches",
                        "method": self.git.branch,
                    },
                ]
            )

        return info
