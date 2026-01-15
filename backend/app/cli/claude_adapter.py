"""
Claude Code CLI adapter.

Handles command building and session management for Anthropic's Claude Code CLI.
"""

import json
import os
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

    Supports (as of v2.1.6):
    - Session IDs via --session-id
    - Session resume via --resume (supports custom session IDs with --session-id)
    - Session forking via --fork-session
    - Tool allowlists via --allowedTools (with wildcard patterns like `Bash(npm *)`)
    - Tool denylists via --disallowedTools (including Task(AgentName) syntax)
    - Permission modes via --permission-mode (plan, acceptEdits)
    - Permission bypass via --dangerously-skip-permissions
    - Max turns via --max-turns
    - Model selection via --model (supports opus, sonnet, haiku aliases)
    - System prompt via --append-system-prompt or --system-prompt-file
    - Output formats via --output-format (text, json, stream-json)
    - MCP configuration via --mcp-config with --mcp-debug for debugging
    - Available tools via --tools (interactive mode tool restriction)
    - Additional directories via --add-dir
    - Max budget via --max-budget-usd
    - Agent selection via --agent <agent-name>
    - Claude in Chrome integration via browser extension

    Recent features (v2.1.x - Jan 2026):
    - Skills hot-reload from .claude/skills directories with auto-discovery
    - Nested skill discovery from subdirectory .claude/skills folders
    - Prompt-based hooks with LLM-driven decision making
    - Skills and slash commands unified system
    - Language setting for response language configuration
    - Tool hook execution timeout increased to 10 minutes
    - /config search functionality for filtering settings
    - /stats date range filtering with `r` to cycle periods (7 days, 30 days, all)
    - context_window.used_percentage and remaining_percentage fields in status line
    - Rate limit warning requires 70% usage after weekly reset
    - Unified Ctrl+B backgrounding for bash commands and agents
    - MCP list_changed notifications for dynamic tool updates
    - Plugin autoupdate via FORCE_AUTOUPDATE_PLUGINS env var
    - Large bash/tool outputs saved to disk instead of truncated (30K char limit)
    - Named sessions with /rename command
    - Thinking blocks display toggle (Ctrl+O)
    - Shell snapshots moved from /tmp to ~/.claude for reliability
    - LSP tool for code intelligence (go-to-definition, find references, hover docs)
    - /teleport and /remote-env for remote session management
    - Skill forking with context: fork in frontmatter
    - Real-time thinking block display in Ctrl+O transcript mode
    - Improved sed in-place edits rendered as file edits with diff preview
    - Chrome MCP beta header auto-injection when using Claude-in-Chrome tools
    - Large transcript file safety: 10MB memory limit with tail-reading for oversized files
    - Symlink path resolution before deny rule checking (CVE-2025-59829 fix)
    - Permission rule validation on save with malformed rule detection
    - Bash command wildcard patterns at any position (e.g., `Bash(npm *)`)
    - Updates section in /doctor showing auto-update channel and npm versions
    - Automatic skill discovery from nested .claude/skills directories in subdirectories
    - Improved @ autocomplete with icons for different suggestion types
    - Task notification display capped at 3 lines with overflow summary
    - Terminal title set to "Claude Code" on startup for better window identification
    - Improved terminal rendering stability preventing cursor state corruption
    - OAuth token refresh on "Help improve Claude" setting fetch
    - Clickable destination selector for VSCode permission requests
    - Source path metadata for images dragged onto terminal
    - Clickable hyperlinks for file paths in tool output (OSC 8 terminals)
    - Shift+Tab shortcut in plan mode for "auto-accept edits" option
    - Agent type field in SessionStart hook input
    - Memory leak fix for tree-sitter parse trees
    - API context overflow handling for background tasks (30K char truncation)

    Hook system events:
    - PreToolUse, PostToolUse: Tool invocation hooks (updatedInput support)
    - Stop, SubagentStop: Session completion hooks
    - SessionStart, SessionEnd: Session lifecycle hooks (agent_type populated)
    - UserPromptSubmit: User input hooks
    - PreCompact: Context compaction hooks
    - Notification: Alert hooks
    - once: true config for single-execution hooks

    Environment variables:
    - CLAUDE_CONFIG_DIR: Override config directory
    - CLAUDE_CODE_TMPDIR: Override temp directory
    - CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: Disable background tasks
    - CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS: Override file read token limit
    - CLAUDE_CODE_SHELL: Override automatic shell detection
    - CLAUDE_CODE_SHELL_PREFIX: Wrap shell commands
    - CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: Freeze working directory
    - CLAUDE_BASH_NO_LOGIN: Skip login shell for Bash tool
    - FORCE_AUTOUPDATE_PLUGINS: Allow plugin autoupdate when main auto-updater is disabled
    - IS_DEMO: Hide email and organization from UI for streaming/recording
    - DISABLE_INTERLEAVED_THINKING: Opt out of thinking blocks
    - CLAUDE_CODE_AUTO_CONNECT_IDE: Disable IDE auto-connection
    - CLAUDE_CODE_EXIT_AFTER_STOP_DELAY: Auto-exit SDK mode after idle duration
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
            output_format="stream-json",
        )

    def _claude_base_dir(self) -> Path:
        config_dir = os.environ.get("CLAUDE_CONFIG_DIR")
        return Path(config_dir) if config_dir else Path.home() / ".claude"

    @property
    def discovery_config(self) -> SessionDiscoveryConfig:
        base_dir = self._claude_base_dir()
        return SessionDiscoveryConfig(
            base_dir=base_dir,
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
        # Use `or []` to handle None values (key exists but value is None)
        messages = data.get("messages") or []

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
                # Use `or {}` to handle None values (key exists but value is None)
                msg = entry.get("message") or {}
                if isinstance(msg, dict) and msg.get("model"):
                    model = msg["model"]

        return SessionInfo(
            # Use `or ""` to handle None values (key exists but value is None)
            session_id=data.get("session_id") or "",
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

        Claude replaces forward slashes and underscores with dashes.
        Example: /home/user/my_project -> -home-user-my-project
        """
        normalized = str(Path(local_path).resolve())
        return normalized.replace("/", "-").replace("_", "-")

    def decode_path(self, encoded: str) -> Optional[str]:
        """
        Decode a Claude-encoded path back to a local path.

        Example: -home-user-project -> /home/user/project

        Note: This must match storage.decode_path behavior for consistency.
        """
        if encoded.startswith("-"):
            return "/" + encoded[1:].replace("-", "/")
        return encoded.replace("-", "/")
