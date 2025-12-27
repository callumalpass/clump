"""
Services for Clump.

This module provides the core services for:
- process_manager: Interactive PTY-based processes running Claude Code
- headless_analyzer: Programmatic sessions using Claude Code's -p flag
- github_client: GitHub API integration
"""

from app.services.session_manager import process_manager, Process, ProcessManager
from app.services.headless_analyzer import (
    headless_analyzer,
    HeadlessAnalyzer,
    SessionMessage,
    SessionResult,
)
from app.services.github_client import github_client

__all__ = [
    # Process manager (interactive PTY)
    "process_manager",
    "Process",
    "ProcessManager",
    # Headless analyzer (programmatic -p mode)
    "headless_analyzer",
    "HeadlessAnalyzer",
    "SessionMessage",
    "SessionResult",
    # GitHub client
    "github_client",
]
