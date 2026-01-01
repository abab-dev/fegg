"""
E2B Sandbox Integration

This module provides E2B sandbox management and tool adapters
for running the frontend agent in a hosted environment.
"""

from .sandbox import SandboxManager, UserSandbox

__all__ = ["SandboxManager", "UserSandbox"]
