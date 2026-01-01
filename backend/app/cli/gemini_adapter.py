"""
Gemini CLI adapter.

Handles command building and session management for Google's Gemini CLI.
"""

import hashlib
import json
from pathlib import Path
from typing import Any, Optional

from app.cli.base import (
    CLIAdapter,
    CLICapabilities,
    CLIType,
    SessionDiscoveryConfig,
    SessionInfo,
)
from app.config import settings


class GeminiAdapter(CLIAdapter):
    """
    Adapter for Gemini CLI.

    Gemini CLI stores sessions in ~/.gemini/tmp/{project-hash}/chats/*.json
    using single JSON files (not JSONL).

    Key differences from Claude:
    - Uses --approval-mode instead of --permission-mode
    - Uses --allowed-tools (with hyphen) instead of --allowedTools
    - Uses positional prompt for headless mode instead of -p flag
    - Uses -o for output format instead of --output-format
    - Session files are single JSON objects, not JSONL
    - Uses SHA256 hash for project paths

    Supports:
    - Session resume via --resume
    - Approval modes via --approval-mode
    - Tool allowlists via --allowed-tools
    - Output formats via -o
    """

    @property
    def cli_type(self) -> CLIType:
        return CLIType.GEMINI

    @property
    def display_name(self) -> str:
        return "Gemini CLI"

    @property
    def command_name(self) -> str:
        return settings.gemini_command

    @property
    def capabilities(self) -> CLICapabilities:
        return CLICapabilities(
            supports_headless=True,
            supports_resume=True,
            supports_session_id=False,  # Gemini doesn't support --session-id
            supports_tool_allowlist=True,
            supports_permission_modes=True,
            supports_max_turns=False,  # Gemini doesn't have --max-turns
            output_format="stream-json",
        )

    @property
    def discovery_config(self) -> SessionDiscoveryConfig:
        return SessionDiscoveryConfig(
            base_dir=Path.home() / ".gemini",
            session_pattern="tmp/*/chats/*.json",
            file_extension="json",
            uses_project_hash=True,
            date_based_dirs=False,
        )

    def _map_permission_mode(self, mode: Optional[str]) -> Optional[str]:
        """
        Map generic permission modes to Gemini's approval modes.

        Gemini uses:
        - 'default': Prompt for approval
        - 'auto_edit': Auto-approve edit tools
        - 'yolo': Auto-approve all tools
        """
        if mode is None:
            return None

        mapping = {
            "default": "default",
            "plan": "default",  # Gemini doesn't have a plan mode, use default
            "acceptEdits": "auto_edit",
            "bypassPermissions": "yolo",
        }
        return mapping.get(mode, mode)

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
        """Build Gemini CLI interactive command."""
        args = [self.command_name]

        # Resume session if specified
        # Expects the full UUID from get_resume_id_from_file()
        if resume_session:
            args.extend(["--resume", resume_session])

        # Approval mode (Gemini's permission equivalent)
        mode = self._map_permission_mode(permission_mode)
        if mode:
            args.extend(["--approval-mode", mode])

        # Allowed tools (Gemini uses --allowed-tools with hyphen)
        if allowed_tools:
            for tool in allowed_tools:
                args.extend(["--allowed-tools", tool])

        # Model
        if model:
            args.extend(["--model", model])

        return args

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
        Build Gemini CLI headless command.

        Gemini uses positional prompt for headless mode.
        """
        # Gemini headless: positional prompt comes after options
        args = [self.command_name]

        # Output format (use -o flag)
        fmt = output_format or "stream-json"
        args.extend(["-o", fmt])

        # Resume session if specified
        if resume_session:
            args.extend(["--resume", resume_session])

        # Approval mode
        mode = self._map_permission_mode(permission_mode)
        if mode:
            args.extend(["--approval-mode", mode])

        # Allowed tools
        if allowed_tools:
            for tool in allowed_tools:
                args.extend(["--allowed-tools", tool])

        # Model
        if model:
            args.extend(["--model", model])

        # Prompt is positional at the end
        args.append(prompt)

        return args

    def parse_session_file(self, file_path: Path) -> dict[str, Any]:
        """
        Parse a Gemini session JSON file.

        Gemini uses single JSON files, not JSONL.
        """
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        return {
            "messages": data.get("messages", []),
            "format": "json",
            "session_id": data.get("sessionId"),
            "project_hash": data.get("projectHash"),
            "start_time": data.get("startTime"),
            "last_updated": data.get("lastUpdated"),
            "summary": data.get("summary"),
        }

    def extract_session_info(self, data: dict[str, Any]) -> SessionInfo:
        """Extract normalized session info from parsed Gemini session data."""
        messages = data.get("messages", [])

        # Count user/assistant messages
        message_count = sum(
            1 for msg in messages if msg.get("type") in ("user", "gemini")
        )

        # Find model from gemini messages
        model = None
        for msg in messages:
            if msg.get("type") == "gemini":
                # Gemini stores model differently, may need adjustment
                model = msg.get("model")
                if model:
                    break

        return SessionInfo(
            session_id=data.get("session_id", ""),
            title=data.get("summary"),
            model=model,
            start_time=data.get("start_time"),
            end_time=data.get("last_updated"),
            message_count=message_count,
            cwd=None,  # Gemini doesn't store cwd in session
            git_branch=None,
            cli_version=None,
        )

    def encode_path(self, local_path: str) -> str:
        """
        Encode a local path to Gemini's format.

        Gemini uses SHA256 hash of the normalized path.
        """
        normalized = str(Path(local_path).resolve())
        return hashlib.sha256(normalized.encode()).hexdigest()

    def decode_path(self, encoded: str) -> Optional[str]:
        """
        Decode a Gemini-encoded path.

        Hash-based encoding is one-way, so we can't decode.
        Returns None - the path must be stored in sidecar metadata.
        """
        return None

    def get_sessions_dir(self, repo_path: str) -> Path:
        """
        Get the directory where Gemini stores sessions for a repo.

        Gemini uses: ~/.gemini/tmp/{hash}/chats/
        """
        config = self.discovery_config
        encoded = self.encode_path(repo_path)
        return config.base_dir / "tmp" / encoded / "chats"

    def get_resume_session_id(self, session_id: str) -> str:
        """
        Extract the session ID format needed for --resume.

        Note: This method extracts the short UUID from the filename, but
        Gemini CLI actually requires the full UUID from inside the session file.
        Use get_resume_id_from_file() when you have access to the file path.

        Args:
            session_id: Our session ID (usually the filename stem)

        Returns:
            The short UUID from the filename (may not work for resume!)
        """
        # Extract the last segment after the last hyphen
        # session-2025-12-15T21-28-a51b3ff5 -> a51b3ff5
        if "-" in session_id:
            return session_id.rsplit("-", 1)[-1]
        return session_id

    def get_resume_id_from_file(self, file_path: Path, session_id: str) -> str:
        """
        Extract the full session UUID from the Gemini session file.

        Gemini stores the full UUID inside the session JSON file as 'sessionId'.
        The --resume flag requires this full UUID, not the truncated one in the filename.

        Args:
            file_path: Path to the session JSON file
            session_id: Our session ID (filename stem, used as fallback)

        Returns:
            The full UUID from the session file, or fallback to short UUID
        """
        try:
            data = self.parse_session_file(file_path)
            internal_id = data.get("session_id")
            if internal_id:
                return internal_id
        except Exception:
            pass

        # Fallback to extracting from filename
        return self.get_resume_session_id(session_id)
