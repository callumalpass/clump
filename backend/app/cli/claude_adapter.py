"""
Claude Code CLI adapter.

Handles command building and session management for Anthropic's Claude Code CLI.
"""

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


class ClaudeAdapter(CLIAdapter):
    """
    Adapter for Claude Code CLI.

    Claude Code stores sessions in ~/.claude/projects/{encoded-path}/*.jsonl
    using JSONL format (one JSON object per line).

    Supports:
    - Session IDs via --session-id
    - Session resume via --resume
    - Tool allowlists via --allowedTools
    - Permission modes via --permission-mode
    - Max turns via --max-turns
    - MCP configuration via --mcp-config
    """

    @property
    def cli_type(self) -> CLIType:
        return CLIType.CLAUDE

    @property
    def display_name(self) -> str:
        return "Claude Code"

    @property
    def command_name(self) -> str:
        return settings.claude_command

    @property
    def capabilities(self) -> CLICapabilities:
        return CLICapabilities(
            supports_headless=True,
            supports_resume=True,
            supports_session_id=True,
            supports_tool_allowlist=True,
            supports_permission_modes=True,
            supports_max_turns=True,
            supports_mcp=True,
            output_format="stream-json",
        )

    @property
    def discovery_config(self) -> SessionDiscoveryConfig:
        return SessionDiscoveryConfig(
            base_dir=Path.home() / ".claude",
            session_pattern="projects/*/*.jsonl",
            file_extension="jsonl",
            uses_project_hash=True,
            date_based_dirs=False,
        )

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
        mcp_config: Optional[dict[str, Any]] = None,
    ) -> list[str]:
        """Build Claude Code interactive command."""
        args = [self.command_name]

        # Resume session if specified
        if resume_session:
            args.extend(["--resume", resume_session])
        elif session_id:
            # Set a known session ID for new sessions so we can resume later
            args.extend(["--session-id", session_id])

        # Permission mode
        mode = permission_mode or settings.claude_permission_mode
        if mode == "bypassPermissions":
            args.append("--dangerously-skip-permissions")
        elif mode in ("plan", "acceptEdits"):
            args.extend(["--permission-mode", mode])

        # Allowed tools (only if not bypassing permissions)
        if mode != "bypassPermissions":
            tools = allowed_tools or settings.get_allowed_tools()
            if tools:
                args.extend(["--allowedTools", ",".join(tools)])

            # Disallowed tools
            disabled = disallowed_tools or settings.get_disallowed_tools()
            if disabled:
                args.extend(["--disallowedTools", ",".join(disabled)])

        # Max turns
        turns = max_turns if max_turns is not None else settings.claude_max_turns
        if turns > 0:
            args.extend(["--max-turns", str(turns)])

        # Model
        m = model or settings.claude_model
        if m:
            args.extend(["--model", m])

        # MCP configuration
        mcp = mcp_config or settings.get_mcp_config()
        if mcp:
            args.extend(["--mcp-config", json.dumps(mcp)])

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
        mcp_config: Optional[dict[str, Any]] = None,
    ) -> list[str]:
        """Build Claude Code headless command."""
        args = [self.command_name, "-p", prompt]

        # Output format
        fmt = output_format or "stream-json"
        args.extend(["--output-format", fmt])

        # Verbose is required when using stream-json with -p
        if fmt == "stream-json":
            args.append("--verbose")

        # Session ID
        if resume_session:
            args.extend(["--resume", resume_session])
        elif session_id:
            args.extend(["--session-id", session_id])

        # Permission mode
        mode = permission_mode or settings.claude_permission_mode
        if mode == "bypassPermissions":
            args.append("--dangerously-skip-permissions")
        elif mode in ("plan", "acceptEdits"):
            args.extend(["--permission-mode", mode])

        # Allowed tools (only if not bypassing permissions)
        if mode != "bypassPermissions":
            tools = allowed_tools or settings.get_allowed_tools()
            if tools:
                args.extend(["--allowedTools", ",".join(tools)])

            # Disallowed tools
            disabled = disallowed_tools or settings.get_disallowed_tools()
            if disabled:
                args.extend(["--disallowedTools", ",".join(disabled)])

        # Max turns
        turns = max_turns if max_turns is not None else settings.claude_max_turns
        if turns > 0:
            args.extend(["--max-turns", str(turns)])

        # Model
        m = model or settings.claude_model
        if m:
            args.extend(["--model", m])

        # System prompt
        if system_prompt:
            args.extend(["--append-system-prompt", system_prompt])

        # MCP configuration
        mcp = mcp_config or settings.get_mcp_config()
        if mcp:
            args.extend(["--mcp-config", json.dumps(mcp)])

        return args

    def parse_session_file(self, file_path: Path) -> dict[str, Any]:
        """
        Parse a Claude Code JSONL session file.

        Returns:
            Dictionary with 'messages' list containing parsed JSON objects.
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

                    # Extract metadata from first entries
                    if entry.get("type") == "summary":
                        metadata["summary"] = entry.get("summary")
                    elif "version" in entry and not metadata.get("version"):
                        metadata["version"] = entry.get("version")
                    elif "gitBranch" in entry and not metadata.get("git_branch"):
                        metadata["git_branch"] = entry.get("gitBranch")
                    elif "cwd" in entry and not metadata.get("cwd"):
                        metadata["cwd"] = entry.get("cwd")
                except json.JSONDecodeError:
                    continue

        return {
            "messages": messages,
            "format": "jsonl",
            **metadata,
        }

    def extract_session_info(self, data: dict[str, Any]) -> SessionInfo:
        """Extract normalized session info from parsed Claude session data."""
        messages = data.get("messages", [])

        # Find timestamps and model info
        start_time = None
        end_time = None
        model = None
        message_count = 0

        for entry in messages:
            entry_type = entry.get("type")

            if entry_type in ("user", "assistant"):
                message_count += 1
                timestamp = entry.get("timestamp")
                if timestamp:
                    if start_time is None:
                        start_time = timestamp
                    end_time = timestamp

            if entry_type == "assistant":
                msg = entry.get("message", {})
                if isinstance(msg, dict) and msg.get("model"):
                    model = msg["model"]

        return SessionInfo(
            session_id=data.get("session_id", ""),
            title=data.get("summary"),
            model=model,
            start_time=start_time,
            end_time=end_time,
            message_count=message_count,
            cwd=data.get("cwd"),
            git_branch=data.get("git_branch"),
            cli_version=data.get("version"),
        )

    def encode_path(self, local_path: str) -> str:
        """
        Encode a local path to Claude's format.

        Claude replaces forward slashes with dashes.
        Example: /home/user/project -> -home-user-project
        """
        normalized = str(Path(local_path).resolve())
        return normalized.replace("/", "-")

    def decode_path(self, encoded: str) -> Optional[str]:
        """
        Decode a Claude-encoded path back to a local path.

        Example: -home-user-project -> /home/user/project
        """
        if encoded.startswith("-"):
            return encoded.replace("-", "/")
        return "/" + encoded.replace("-", "/")
