"""
Services for Clump.

This module provides the core services for:
- session_manager: Interactive PTY-based terminal sessions with Claude Code
- headless_analyzer: Programmatic analysis using Claude Code's -p flag
- github_client: GitHub API integration
"""

from app.services.session_manager import session_manager, Session, SessionManager
from app.services.headless_analyzer import (
    headless_analyzer,
    HeadlessAnalyzer,
    AnalysisMessage,
    AnalysisResult,
)
from app.services.github_client import github_client

__all__ = [
    # Session manager (interactive PTY)
    "session_manager",
    "Session",
    "SessionManager",
    # Headless analyzer (programmatic -p mode)
    "headless_analyzer",
    "HeadlessAnalyzer",
    "AnalysisMessage",
    "AnalysisResult",
    # GitHub client
    "github_client",
]
