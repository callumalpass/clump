"""
Base classes and types for CLI adapters.

Defines the abstract interface that all CLI adapters must implement.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional


class CLIType(str, Enum):
    """Supported CLI tool types."""

    CLAUDE = "claude"
    GEMINI = "gemini"
    CODEX = "codex"


@dataclass
class CLICapabilities:
    """
    Describes what features a CLI supports.

    Used to conditionally enable/disable UI elements and features
    based on the selected CLI's capabilities.
    """

    supports_headless: bool = True
    """Whether the CLI supports non-interactive/batch mode."""

    supports_resume: bool = True
    """Whether sessions can be resumed after completion."""

    supports_session_id: bool = True
    """Whether a custom session ID can be specified."""

    supports_tool_allowlist: bool = True
    """Whether specific tools can be allowed/denied."""

    supports_permission_modes: bool = True
    """Whether permission modes (plan, acceptEdits, etc.) are supported."""

    supports_max_turns: bool = True
    """Whether max turns can be limited."""

    output_format: str = "stream-json"
    """Default output format for headless mode."""


@dataclass
class SessionDiscoveryConfig:
    """
    Configuration for discovering sessions from a CLI's storage location.

    Each CLI stores sessions in different locations with different formats.
    """

    base_dir: Path
    """Base directory for session storage (e.g., ~/.claude)."""

    session_pattern: str
    """Glob pattern relative to base_dir (e.g., 'projects/*/*.jsonl')."""

    file_extension: str
    """File extension for session files ('jsonl' or 'json')."""

    uses_project_hash: bool = True
    """Whether sessions are organized by hashed project path."""

    date_based_dirs: bool = False
    """Whether sessions are organized by date (e.g., sessions/2025/01/)."""


@dataclass
class SessionInfo:
    """
    Normalized session information extracted from a session file.

    Provides a common format for session metadata regardless of CLI.
    """

    session_id: str
    """Unique session identifier (usually UUID)."""

    title: Optional[str] = None
    """Session title or summary."""

    model: Optional[str] = None
    """Model used for the session."""

    start_time: Optional[str] = None
    """ISO timestamp when session started."""

    end_time: Optional[str] = None
    """ISO timestamp when session ended."""

    message_count: int = 0
    """Number of conversation turns."""

    cwd: Optional[str] = None
    """Working directory for the session."""

    git_branch: Optional[str] = None
    """Git branch if applicable."""

    cli_version: Optional[str] = None
    """Version of the CLI tool used."""


class CLIAdapter(ABC):
    """
    Abstract base class for CLI tool adapters.

    Each supported CLI (Claude, Gemini, Codex) implements this interface
    to provide consistent behavior for command building, session discovery,
    and output parsing.

    Implementations should be stateless and thread-safe.
    """

    @property
    @abstractmethod
    def cli_type(self) -> CLIType:
        """Return the CLI type enum value."""
        ...

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Return human-readable name for the CLI."""
        ...

    @property
    @abstractmethod
    def command_name(self) -> str:
        """Return the CLI executable name (e.g., 'claude', 'gemini', 'codex')."""
        ...

    @property
    @abstractmethod
    def capabilities(self) -> CLICapabilities:
        """Return the CLI's capabilities."""
        ...

    @property
    @abstractmethod
    def discovery_config(self) -> SessionDiscoveryConfig:
        """Return configuration for session discovery."""
        ...

    @abstractmethod
    def build_interactive_command(
        self,
        working_dir: str,
        *,
        session_id: Optional[str] = None,
        resume_session: Optional[str] = None,
        allowed_tools: Optional[list[str]] = None,
        disallowed_tools: Optional[list[str]] = None,
        permission_mode: Optional[str] = None,
        max_turns: Optional[int] = None,
        model: Optional[str] = None,
    ) -> list[str]:
        """
        Build command arguments for interactive (PTY) mode.

        Args:
            working_dir: Directory to run the CLI in.
            session_id: Session ID to use for new sessions.
            resume_session: Session ID to resume.
            allowed_tools: Tools to auto-approve.
            disallowed_tools: Tools to deny.
            permission_mode: Permission handling mode.
            max_turns: Maximum number of agentic turns.
            model: Model to use.

        Returns:
            List of command arguments suitable for os.execvp().
        """
        ...

    @abstractmethod
    def build_headless_command(
        self,
        prompt: str,
        working_dir: str,
        *,
        session_id: Optional[str] = None,
        resume_session: Optional[str] = None,
        allowed_tools: Optional[list[str]] = None,
        disallowed_tools: Optional[list[str]] = None,
        permission_mode: Optional[str] = None,
        max_turns: Optional[int] = None,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        output_format: Optional[str] = None,
    ) -> list[str]:
        """
        Build command arguments for headless (non-interactive) mode.

        Args:
            prompt: The prompt to send to the CLI.
            working_dir: Directory to run the CLI in.
            session_id: Session ID to use.
            resume_session: Session ID to resume.
            allowed_tools: Tools to auto-approve.
            disallowed_tools: Tools to deny.
            permission_mode: Permission handling mode.
            max_turns: Maximum number of agentic turns.
            model: Model to use.
            system_prompt: Additional system prompt.
            output_format: Output format (json, stream-json, text).

        Returns:
            List of command arguments suitable for subprocess.
        """
        ...

    @abstractmethod
    def parse_session_file(self, file_path: Path) -> dict[str, Any]:
        """
        Parse a session file into a dictionary.

        Args:
            file_path: Path to the session file.

        Returns:
            Dictionary containing parsed session data.
            Structure varies by CLI but should include 'messages' key.
        """
        ...

    @abstractmethod
    def extract_session_info(self, data: dict[str, Any]) -> SessionInfo:
        """
        Extract normalized session info from parsed session data.

        Args:
            data: Parsed session data from parse_session_file().

        Returns:
            SessionInfo with normalized fields.
        """
        ...

    @abstractmethod
    def encode_path(self, local_path: str) -> str:
        """
        Encode a local path to the format used by this CLI for storage.

        Args:
            local_path: Absolute path to encode.

        Returns:
            Encoded path string (e.g., '-home-user-project').
        """
        ...

    @abstractmethod
    def decode_path(self, encoded: str) -> Optional[str]:
        """
        Decode an encoded path back to a local path.

        Args:
            encoded: Encoded path string.

        Returns:
            Decoded absolute path, or None if decoding is not possible
            (e.g., for hash-based encoding).
        """
        ...

    def get_sessions_dir(self, repo_path: str) -> Path:
        """
        Get the directory where sessions for a repo are stored.

        Args:
            repo_path: Absolute path to the repository.

        Returns:
            Path to the sessions directory.
        """
        config = self.discovery_config
        encoded = self.encode_path(repo_path)
        if config.uses_project_hash:
            return config.base_dir / "projects" / encoded
        return config.base_dir / "sessions"

    def get_sidecar_path(self, session_id: str, repo_path: str) -> Path:
        """
        Get the path to the sidecar metadata file for a session.

        Sidecar files are stored in ~/.clump/projects/ regardless of CLI.

        Args:
            session_id: The session UUID.
            repo_path: Absolute path to the repository.

        Returns:
            Path to the sidecar JSON file.
        """
        from app.storage import get_encoded_path

        encoded = get_encoded_path(repo_path)
        clump_dir = Path.home() / ".clump" / "projects" / encoded
        return clump_dir / f"{session_id}.json"

    def get_resume_session_id(self, session_id: str) -> str:
        """
        Convert a session ID to the format expected by the CLI's resume command.

        Different CLIs expect different session ID formats:
        - Claude: Full UUID
        - Gemini: Short UUID from filename
        - Codex: Full UUID extracted from filename

        Default implementation returns the session_id unchanged.
        Override in subclasses if the CLI expects a different format.

        Args:
            session_id: Our session ID (usually the filename stem)

        Returns:
            Session ID in the format the CLI expects for resume
        """
        return session_id

    def get_resume_id_from_file(self, file_path: Path, session_id: str) -> str:
        """
        Extract the resume session ID from a session file.

        Some CLIs (like Gemini) store the internal session ID inside the file,
        which differs from the filename. This method reads the file to extract
        the actual ID needed for resuming.

        Default implementation just calls get_resume_session_id().
        Override in subclasses that need to read the file.

        Args:
            file_path: Path to the session file
            session_id: Our session ID (usually the filename stem)

        Returns:
            Session ID in the format the CLI expects for resume
        """
        return self.get_resume_session_id(session_id)
