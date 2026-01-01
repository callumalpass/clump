"""
Codex CLI adapter.

Handles command building and session management for OpenAI's Codex CLI.
"""

import json
from datetime import datetime
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


class CodexAdapter(CLIAdapter):
    """
    Adapter for OpenAI Codex CLI.

    Codex stores sessions in ~/.codex/sessions/{year}/{month}/{day}/*.jsonl
    using JSONL format similar to Claude.

    Key differences from Claude:
    - Uses 'exec' subcommand for headless mode instead of -p flag
    - Uses -a/--ask-for-approval instead of --permission-mode
    - Uses sandbox modes instead of tool allowlists
    - Uses 'resume' subcommand instead of --resume flag
    - Session files are organized by date, not project path

    Supports:
    - Session resume via 'resume' subcommand
    - Approval policies via -a/--ask-for-approval
    - Sandbox modes via -s/--sandbox
    - JSON output via --json
    """

    @property
    def cli_type(self) -> CLIType:
        return CLIType.CODEX

    @property
    def display_name(self) -> str:
        return "Codex CLI"

    @property
    def command_name(self) -> str:
        return settings.codex_command

    @property
    def capabilities(self) -> CLICapabilities:
        return CLICapabilities(
            supports_headless=True,
            supports_resume=True,
            supports_session_id=False,  # Codex auto-generates session IDs
            supports_tool_allowlist=False,  # Uses sandbox modes instead
            supports_permission_modes=True,  # Via approval policies
            supports_max_turns=False,
            output_format="json",  # Codex uses --json, not stream-json
        )

    @property
    def discovery_config(self) -> SessionDiscoveryConfig:
        return SessionDiscoveryConfig(
            base_dir=Path.home() / ".codex",
            session_pattern="sessions/*/*/*/*.jsonl",
            file_extension="jsonl",
            uses_project_hash=False,  # Uses date-based organization
            date_based_dirs=True,
        )

    def _map_permission_mode(self, mode: Optional[str]) -> Optional[str]:
        """
        Map generic permission modes to Codex's approval policies.

        Codex uses:
        - 'untrusted': Only run trusted commands without asking
        - 'on-failure': Run all, ask on failure
        - 'on-request': Model decides when to ask
        - 'never': Never ask for approval
        """
        if mode is None:
            return None

        mapping = {
            "default": "untrusted",
            "plan": "untrusted",
            "acceptEdits": "on-failure",
            "bypassPermissions": "never",
        }
        return mapping.get(mode, mode)

    def _map_permission_to_sandbox(self, mode: Optional[str]) -> Optional[str]:
        """
        Map permission modes to Codex sandbox modes.

        Codex sandbox modes:
        - 'read-only': No writes allowed
        - 'workspace-write': Write only to workspace
        - 'danger-full-access': No restrictions
        """
        if mode is None:
            return None

        mapping = {
            "default": "workspace-write",
            "plan": "read-only",
            "acceptEdits": "workspace-write",
            "bypassPermissions": "danger-full-access",
        }
        return mapping.get(mode, "workspace-write")

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
        """Build Codex CLI interactive command."""
        args = [self.command_name]

        # Resume session using resume subcommand
        # Expects the UUID from get_resume_id_from_file()
        if resume_session:
            args.extend(["resume", resume_session])
            # When resuming, we don't add other options
            return args

        # Approval policy
        approval = self._map_permission_mode(permission_mode)
        if approval:
            args.extend(["-a", approval])

        # Sandbox mode
        sandbox = self._map_permission_to_sandbox(permission_mode)
        if sandbox:
            args.extend(["-s", sandbox])

        # Model
        if model:
            args.extend(["--model", model])

        # Working directory
        if working_dir:
            args.extend(["-C", working_dir])

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
        Build Codex CLI headless command.

        Codex uses 'exec' subcommand for headless mode.
        """
        args = [self.command_name, "exec"]

        # JSON output
        args.append("--json")

        # Approval policy
        approval = self._map_permission_mode(permission_mode)
        if approval:
            args.extend(["-a", approval])

        # Sandbox mode
        sandbox = self._map_permission_to_sandbox(permission_mode)
        if sandbox:
            args.extend(["-s", sandbox])

        # Model
        if model:
            args.extend(["--model", model])

        # Working directory
        if working_dir:
            args.extend(["-C", working_dir])

        # Prompt is positional at the end
        args.append(prompt)

        return args

    def parse_session_file(self, file_path: Path) -> dict[str, Any]:
        """
        Parse a Codex session JSONL file.

        Codex JSONL structure includes:
        - session_meta: Session metadata
        - response_item: Messages and tool calls
        - event_msg: Events and state changes
        - turn_context: Turn configuration
        """
        messages = []
        metadata = {}

        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    messages.append(entry)

                    # Extract metadata from session_meta entry
                    if entry.get("type") == "session_meta":
                        payload = entry.get("payload", {})
                        metadata["session_id"] = payload.get("id")
                        metadata["start_time"] = payload.get("timestamp")
                        metadata["cwd"] = payload.get("cwd")
                        metadata["cli_version"] = payload.get("cli_version")
                        git_info = payload.get("git", {})
                        if git_info:
                            metadata["git_branch"] = git_info.get("branch")

                except json.JSONDecodeError:
                    continue

        return {
            "messages": messages,
            "format": "jsonl",
            **metadata,
        }

    def extract_session_info(self, data: dict[str, Any]) -> SessionInfo:
        """Extract normalized session info from parsed Codex session data."""
        messages = data.get("messages", [])

        # Count user messages from event_msg entries
        message_count = 0
        model = None
        end_time = None

        for entry in messages:
            entry_type = entry.get("type")

            if entry_type == "event_msg":
                payload = entry.get("payload", {})
                if payload.get("type") == "user_message":
                    message_count += 1

            if entry_type == "turn_context":
                payload = entry.get("payload", {})
                model = payload.get("model")

            # Track last timestamp
            timestamp = entry.get("timestamp")
            if timestamp:
                end_time = timestamp

        return SessionInfo(
            session_id=data.get("session_id", ""),
            title=None,  # Codex doesn't have session summaries
            model=model,
            start_time=data.get("start_time"),
            end_time=end_time,
            message_count=message_count,
            cwd=data.get("cwd"),
            git_branch=data.get("git_branch"),
            cli_version=data.get("cli_version"),
        )

    def encode_path(self, local_path: str) -> str:
        """
        Encode a local path for Codex.

        Codex uses date-based session organization, not path-based.
        This returns a date string for the current date.
        """
        now = datetime.now()
        return f"{now.year}/{now.month:02d}/{now.day:02d}"

    def decode_path(self, encoded: str) -> Optional[str]:
        """
        Decode a Codex path.

        Since Codex uses date-based organization, not path-based,
        we can't decode to a repo path. The cwd is stored in session metadata.
        """
        return None

    def get_sessions_dir(self, repo_path: str) -> Path:
        """
        Get the base directory where Codex stores sessions.

        Note: Codex organizes by date, not by repo path.
        This returns the sessions base directory.
        """
        config = self.discovery_config
        return config.base_dir / "sessions"

    def find_sessions_for_repo(self, repo_path: str) -> list[Path]:
        """
        Find all Codex sessions for a specific repo.

        Since Codex organizes by date, we need to scan all sessions
        and check their cwd metadata.
        """
        sessions_dir = self.get_sessions_dir(repo_path)
        matching = []

        if not sessions_dir.exists():
            return matching

        normalized_path = str(Path(repo_path).resolve())

        for session_file in sessions_dir.glob("*/*/*.jsonl"):
            try:
                data = self.parse_session_file(session_file)
                if data.get("cwd") == normalized_path:
                    matching.append(session_file)
            except Exception:
                continue

        return matching

    def get_resume_session_id(self, session_id: str) -> str:
        """
        Extract the session ID format needed for 'codex resume'.

        Codex session filenames look like:
        rollout-2026-01-01T13-20-18-019b775b-1dc2-7bf1-9681-db60a06cb4cb

        The 'codex resume' command expects just the UUID:
        019b775b-1dc2-7bf1-9681-db60a06cb4cb

        Args:
            session_id: Our session ID (usually the filename stem)

        Returns:
            The UUID suitable for 'codex resume'
        """
        import re

        # Match UUID pattern at end of string
        # UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        uuid_pattern = r'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
        match = re.search(uuid_pattern, session_id, re.IGNORECASE)
        if match:
            return match.group(1)

        # Fallback: return as-is
        return session_id
