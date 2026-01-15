"""
Codex CLI adapter.

Handles command building and session management for OpenAI's Codex CLI.
"""

import json
import logging
import os
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

logger = logging.getLogger(__name__)


class CodexAdapter(CLIAdapter):
    """
    Adapter for OpenAI Codex CLI.

    Codex CLI is a Rust-based multi-tool (codex-rs) storing sessions in
    ~/.codex/sessions/{year}/{month}/{day}/*.jsonl using JSONL format.
    Sessions are organized by date rather than project path, with working
    directory stored in session metadata.

    Key differences from Claude:
    - Uses 'exec' subcommand for headless mode instead of -p flag
    - Uses -a/--approval-mode instead of --permission-mode
    - Uses sandbox modes instead of tool allowlists
    - Uses 'resume' subcommand (with session UUID from session_meta.id)
    - Uses 'fork' subcommand to create branched sessions
    - Session files are organized by date, not project path
    - Working directory must be specified via -C flag

    Top-level subcommands:
    - codex [OPTIONS] [PROMPT]: Interactive mode (default)
    - codex exec / e: Non-interactive execution
    - codex review: Code review mode
    - codex login / logout: Authentication management
    - codex resume [SESSION_ID]: Resume previous session (UUID or --last)
    - codex fork [SESSION_ID]: Fork a session into new one (UUID or --last)
    - codex apply / a: Apply latest git diff
    - codex mcp: MCP server management (add, remove, status)
    - codex app-server: App server tooling
    - codex sandbox: Platform-specific sandboxing (macOS/Linux/Windows)
    - codex cloud: Codex Cloud tasks (list, new, cancel, delete)
    - codex completion <shell>: Generate shell completions
    - codex features: Inspect feature flags (list, get, set)

    Supported flags (as of latest):
    - Session resume via 'resume' subcommand (UUID or --last)
    - Session fork via 'fork' subcommand (UUID or --last)
    - Approval modes via -a/--approval-mode (suggest, on-request, auto-edit, full-auto)
    - Sandbox modes via -s/--sandbox (read-only, workspace-write, full-access)
    - Full auto mode via --full-auto (low-friction sandboxed automatic execution)
    - Model via --model or -m
    - Profile via --profile or -p
    - Working directory via -C/--cd
    - JSON output via --json (for exec mode, JSONL to stdout)
    - Output last message via -o/--output-last-message <FILE>
    - Output schema via --output-schema <FILE> for structured output
    - Review mode via 'review' subcommand (--base, --commit, --uncommitted)
    - MCP server management via 'mcp' subcommand
    - Image attachments via --image/-i (comma-delimited, supports URLs and files)
    - Web search via --search
    - Inline mode via --no-alt-screen
    - Additional writable dirs via --add-dir
    - OSS provider via --oss
    - Color control via --color (auto, always, never)
    - Feature toggles via --enable/--disable
    - Max turns via --max-turns (for exec mode)
    - Notification relay via --notify <socket>
    - History scrolling via --history-scroll (vim, emacs, nano, none)
    - Config override via -c key=value

    JSONL event stream types (--json mode):
    - thread.started: New thread with thread_id
    - turn.started: Turn initiated by user prompt
    - turn.completed: Turn finished with usage stats
    - turn.failed: Turn error with error details
    - item.started: New item (agent message, command, etc.)
    - item.updated: Item status update
    - item.completed: Item terminal state
    - error: Fatal error event

    ThreadItem types:
    - agent_message: Natural language or JSON response
    - reasoning: Agent reasoning summary (collapsible)
    - command_execution: Shell command (in_progress, completed, failed, declined)
    - file_change: Patch/file modifications (add, delete, update)
    - mcp_tool_call: MCP tool invocation with results/errors
    - web_search: Web search request
    - todo_list: Agent's running to-do list with completed status
    - error: Non-fatal error item

    Session JSONL entry types:
    - session_meta: Session metadata (id, timestamp, cwd, git, cli_version)
    - turn_context: Model info and turn-level usage
    - response_item: Messages and tool calls
    - event_msg: Events (user_message, etc.)
    - compacted: Simplified message summaries
    - usage: Token usage data

    Recent features:
    - exec --max-turns: Limit turns in non-interactive mode
    - Full-auto mode: Agent can execute with minimal friction in sandbox
    - Codex Cloud: Run tasks in the cloud (list, new, cancel, delete)
    - MCP tool server management with add/remove/status commands
    - Feature flags system for experimental features
    - Notification relay for external integrations
    - Improved reasoning display with collapsible sections
    - Session forking with preserved history

    Recent features (Jan 2026):
    - Fork conversation/thread support wired to CLI (#8994)
    - Hot reload MCP servers (#8957)
    - Model client sessions (#9102)
    - App-server --analytics-default-enabled flag (#9118)
    - Config.toml JSON schema generation (#8956)
    - tui.alternate_screen config and --no-alt-screen flag (#8555)
    - Skill popup close with Esc (#9165)
    - MCP servers restriction from requirements.toml (#9101)
    - Response.done event support (#9129)
    - In-flight coalesced tool calls in transcript overlay (#8246)
    - Thread rollback for Esc backtrack (#9140)
    - Tab queue hint in footer (#9138)
    - Hierarchical agent prompt support (#8996)
    - UserInput::Skill in V2 API (#8864)
    - Symlink support for skills discovery (#8801)
    - Malformed rules error reporting in TUI (#9011)
    - WebSocket test flakiness fix (#9169)
    - Paste-burst state machine documentation and deterministic tests (#9020, #9121)
    - Spinner/Esc interrupt fix during MCP startup (#8661)
    - Queued messages during /review fix (#9122)
    - Ollama defaults to Responses API for built-ins (#8798)
    - Config.toml JSON schema validation (#8956)

    Configuration:
    - Config file: $CODEX_HOME/config.toml (default: ~/.codex/config.toml)
    - Config layers: Built-in defaults > User config > Env overrides > CLI -c overrides
    - MCP config: ~/.codex/mcp.json or $CODEX_HOME/mcp.json
    - AGENTS.md: Project-level agent instructions (hierarchical loading)

    Environment variables:
    - CODEX_HOME: Custom Codex home directory
    - CODEX_QUIET_MODE=1: Silence interactive UI
    - CODEX_DISABLE_PROJECT_DOC=1: Skip AGENTS.md loading
    - OPENAI_API_KEY: API key for OpenAI
    - DEBUG=true: Verbose logging with full API details

    Sandbox implementations:
    - macOS: Apple Seatbelt sandboxing with profile files
    - Linux: Docker with iptables firewall rules
    - Windows: Restricted Token sandboxing
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
        base_dir = self._codex_base_dir()
        return SessionDiscoveryConfig(
            base_dir=base_dir,
            session_pattern="sessions/*/*/*/*.jsonl",
            file_extension="jsonl",
            uses_project_hash=False,  # Uses date-based organization
            date_based_dirs=True,
        )

    def _codex_base_dir(self) -> Path:
        codex_home = os.environ.get("CODEX_HOME")
        return Path(codex_home) if codex_home else Path.home() / ".codex"

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
                        # Use `or {}` to handle None values (key exists but value is None)
                        payload = entry.get("payload") or {}
                        metadata["session_id"] = payload.get("id")
                        metadata["start_time"] = payload.get("timestamp")
                        metadata["cwd"] = payload.get("cwd")
                        metadata["cli_version"] = payload.get("cli_version")
                        # Use `or {}` to handle None values
                        git_info = payload.get("git") or {}
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
        # Use `or []` to handle None values (key exists but value is None)
        messages = data.get("messages") or []

        # Count user messages from event_msg entries
        message_count = 0
        model = None
        end_time = None

        for entry in messages:
            entry_type = entry.get("type")

            if entry_type == "event_msg":
                # Use `or {}` to handle None values (key exists but value is None)
                payload = entry.get("payload") or {}
                if payload.get("type") == "user_message":
                    message_count += 1

            if entry_type == "turn_context":
                # Use `or {}` to handle None values (key exists but value is None)
                payload = entry.get("payload") or {}
                model = payload.get("model")

            # Track last timestamp
            timestamp = entry.get("timestamp")
            if timestamp:
                end_time = timestamp

        return SessionInfo(
            # Use `or ""` to handle None values (key exists but value is None)
            session_id=data.get("session_id") or "",
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
        
        TODO: This O(N) scan over all sessions is inefficient. Consider maintaining
        a sidecar index or cache of session->repo mappings to improve performance.
        """
        sessions_dir = self.get_sessions_dir(repo_path)
        matching = []

        if not sessions_dir.exists():
            return matching

        normalized_path = str(Path(repo_path).resolve())

        for session_file in sessions_dir.glob("*/*/*/*.jsonl"):
            try:
                data = self.parse_session_file(session_file)
                if data.get("cwd") == normalized_path:
                    matching.append(session_file)
            except json.JSONDecodeError as e:
                logger.debug(
                    "Skipping malformed Codex session file %s: %s",
                    session_file, e
                )
            except OSError as e:
                logger.warning(
                    "Failed to read Codex session file %s: %s",
                    session_file, e
                )

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

    def get_resume_id_from_file(self, file_path: Path, session_id: str) -> str:
        """
        Extract the session ID needed for 'codex resume' from a session file.

        Codex stores the internal session ID in the session_meta entry's payload.id field.
        The 'codex resume' command requires this internal UUID, which may differ from
        the filename-based ID.

        Args:
            file_path: Path to the session JSONL file
            session_id: Our session ID (filename stem, used as fallback)

        Returns:
            The internal session UUID from the file, or fallback to filename extraction
        """
        try:
            data = self.parse_session_file(file_path)
            internal_id = data.get("session_id")
            if internal_id:
                return internal_id
        except json.JSONDecodeError as e:
            logger.debug(
                "Failed to parse Codex session file %s for resume ID: %s",
                file_path, e
            )
        except OSError as e:
            logger.warning(
                "Failed to read Codex session file %s: %s",
                file_path, e
            )

        # Fallback to extracting from filename
        return self.get_resume_session_id(session_id)
