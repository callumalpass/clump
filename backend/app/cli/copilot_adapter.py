"""
GitHub Copilot CLI adapter.

Handles command building and session management for GitHub's Copilot CLI.
"""

import json
import logging
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


class CopilotAdapter(CLIAdapter):
    """
    Adapter for GitHub Copilot CLI.

    This adapter supports the standalone `copilot` CLI (the "Copilot Agent"),
    which replaces the deprecated `gh copilot` extension.

    Copilot stores sessions in:
    - ~/.copilot/session-state/ (current sessions, v0.0.342+ format)
    - ~/.copilot/history-session-state/ (legacy sessions, auto-migrated on resume)

    The storage format isn't publicly documented, so parsing is best-effort.

    Supported flags (as of v0.0.381):
    - --yolo / --allow-all: Bypass all permission prompts
    - --allow-all-paths: Approve access to all paths
    - --allow-tool <spec>: Allow specific tools (glob patterns like shell(npm *))
    - --deny-tool <spec>: Deny specific tools
    - --available-tools, --excluded-tools: Filter model capabilities
    - --disable-parallel-tools-execution: Run tools sequentially
    - --resume <session_id>: Resume a session
    - --continue: Resume most recently closed session
    - --model <model>: Specify model to use (also via /model command)
    - --prompt <text>: Run in non-interactive (-p) mode
    - --share / --share-gist: Export session as markdown
    - --screen-reader: Enable screen reader mode with text labels
    - --stream off: Disable token-by-token streaming
    - --silent: Suppress stats output for scripting
    - --banner: Display startup banner
    - --agent <agent>: Explicitly invoke a custom agent
    - --additional-mcp-config: Augment MCP config via JSON or @path
    - --disable-mcp-server: Disable specific MCP servers
    - --enable-all-github-mcp-tools: Enable all GitHub tools

    Slash commands (interactive mode):
    - /login: Authenticate with GitHub
    - /user [list | show | switch]: Manage user accounts
    - /session: View session details
    - /clear (alias: /new): Clear conversation history
    - /compact: Auto-compact at 95% token limit
    - /context: Visualize token usage
    - /model: Open picker or set model directly
    - /share: Save session as markdown or gist
    - /usage: View premium request usage, session time, token use per model
    - /agent: Invoke custom agent
    - /delegate: Delegate task asynchronously (creates PR with branch)
    - /mcp add: Configure MCP servers
    - /exit, /quit (alias: /q): Exit session

    Recent features (v0.0.375-v0.0.381):
    - Session format overhaul (v0.0.342): Cleaner decoupled storage
    - Reasoning toggle (Ctrl+T) for supported models
    - Auto-compaction at 95% token limit with /compact command
    - Multi-line input (Kitty protocol + /terminal-setup for others)
    - Image support via drag & drop and paste (text and images)
    - Custom agent support from ~/.copilot/agents/, .github/agents/, org .github repo
    - Built-in web_fetch tool for web content retrieval
    - Shell history prefix navigation with ! prefix + up arrow
    - /new alias for /clear command
    - Ghost text shows correct alias for slash commands
    - Task tool subagents can process images
    - Remote session loading via GraphQL ID
    - Abort signals propagate to sub-agents
    - Bundled grep/glob tools using ripgrep
    - File read with view_range parameter for files >10MB
    - Large tool outputs written to disk
    - Timeline UI with collapsible items (Ctrl+R/Ctrl+E to expand)

    Available models:
    - Claude Sonnet 4.5 (default), Opus 4.5, Sonnet 4, Haiku 4.5
    - GPT variants

    Authentication:
    - OAuth via device code (default)
    - Personal Access Token (PAT) with "Copilot Requests" permission
    - GH_TOKEN or GITHUB_TOKEN env vars (precedence order)
    - COPILOT_GITHUB_TOKEN (takes precedence)
    - GITHUB_ASKPASS for authentication
    - GH_HOST for GitHub Enterprise logins

    Configuration:
    - Config file: ~/.copilot/config (log_level: none/error/warning/info/debug/all)
    - MCP config: ~/.copilot/mcp-config.json
    - Custom agents: ~/.copilot/agents/, .github/agents/, org's .github repo
    """

    @property
    def cli_type(self) -> CLIType:
        return CLIType.COPILOT

    @property
    def display_name(self) -> str:
        return "GitHub Copilot CLI"

    @property
    def command_name(self) -> str:
        return settings.copilot_command

    @property
    def capabilities(self) -> CLICapabilities:
        return CLICapabilities(
            supports_headless=True,
            supports_resume=True,
            supports_session_id=False,
            supports_tool_allowlist=True,
            supports_permission_modes=True,
            supports_max_turns=False,
            output_format="text",
        )

    @property
    def discovery_config(self) -> SessionDiscoveryConfig:
        return SessionDiscoveryConfig(
            base_dir=Path.home() / ".copilot",
            session_pattern="session-state/**/*",
            file_extension="json",
            uses_project_hash=False,
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
        """Build Copilot CLI interactive command."""
        args = [self.command_name]

        if resume_session:
            args.extend(["--resume", resume_session])

        # Map tool approvals if provided
        args.extend(self._build_tool_approval_args(allowed_tools, disallowed_tools, permission_mode))

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
        Build Copilot CLI headless command.

        Copilot exposes programmatic mode via -p/--prompt.
        Output is plain text (no structured JSON).
        """
        args = [self.command_name, "--prompt", prompt]

        if resume_session:
            args.extend(["--resume", resume_session])

        # Map tool approvals if provided
        args.extend(self._build_tool_approval_args(allowed_tools, disallowed_tools, permission_mode))

        if model:
            args.extend(["--model", model])

        return args

    def _build_tool_approval_args(
        self,
        allowed_tools: Optional[list[str]],
        disallowed_tools: Optional[list[str]],
        permission_mode: Optional[str],
    ) -> list[str]:
        """
        Map clump's tool allow/deny inputs to Copilot CLI flags.

        Copilot supports:
        - --allow-all-tools (or --yolo)
        - --allow-tool <spec>
        - --deny-tool <spec>
        """
        args: list[str] = []

        if permission_mode == "bypassPermissions":
            # --yolo is an alias for --allow-all-tools in newer versions (0.0.381+)
            args.append("--yolo")
        if permission_mode == "acceptEdits":
            args.extend(["--allow-tool", "write"])

        def normalize_tool(tool: str) -> Optional[str]:
            tool = tool.strip()
            if not tool:
                return None
            if tool.lower() == "bash":
                return "shell"
            if tool.lower().startswith("bash(") and tool.endswith(")"):
                inner = tool[5:-1]
                inner = inner.replace(":*", "").strip()
                if not inner:
                    return "shell"
                return f"shell({inner})"
            lowered = tool.lower()
            if "write" in lowered:
                return "write"
            if tool.startswith("shell(") or tool == "shell":
                return tool
            # Assume tool is already a copilot tool/MCP spec
            if "(" in tool or tool.isidentifier():
                return tool
            return None

        if allowed_tools:
            for tool in allowed_tools:
                normalized = normalize_tool(tool)
                if normalized:
                    args.extend(["--allow-tool", normalized])

        if disallowed_tools:
            for tool in disallowed_tools:
                normalized = normalize_tool(tool)
                if normalized:
                    args.extend(["--deny-tool", normalized])

        return args

    def parse_session_file(self, file_path: Path) -> dict[str, Any]:
        """
        Parse a Copilot session file (JSON or JSONL).

        Returns:
            Dictionary with 'messages' list and any metadata found.
        """
        data = self._load_session_data(file_path)
        metadata = {}

        if isinstance(data, dict):
            metadata["session_id"] = (
                data.get("id")
                or data.get("session_id")
                or data.get("sessionId")
                or data.get("conversation_id")
                or data.get("conversationId")
            )
            metadata["start_time"] = data.get("start_time") or data.get("created_at") or data.get("createdAt")
            metadata["end_time"] = data.get("end_time") or data.get("updated_at") or data.get("updatedAt")
            metadata["cwd"] = self._find_path_in_data(data)
            metadata["model"] = data.get("model") or data.get("modelId") or data.get("model_name")
            metadata["cli_version"] = data.get("cli_version") or data.get("version")
            metadata["git_branch"] = data.get("git_branch") or data.get("branch")

        return {
            "messages": self._extract_entries(data),
            "format": "json",
            **metadata,
        }

    def extract_session_info(self, data: dict[str, Any]) -> SessionInfo:
        """Extract normalized session info from parsed Copilot session data."""
        messages = data.get("messages") or []
        message_count = 0
        model = data.get("model")
        start_time = data.get("start_time")
        end_time = data.get("end_time")

        for entry in messages:
            role = self._normalize_role(entry.get("role") or entry.get("type") or entry.get("speaker"))
            if role in ("user", "assistant"):
                message_count += 1

            if not model:
                model = entry.get("model") or entry.get("modelId") or entry.get("model_name")

            timestamp = entry.get("timestamp") or entry.get("created_at")
            if timestamp:
                end_time = timestamp
                if not start_time:
                    start_time = timestamp

        return SessionInfo(
            session_id=data.get("session_id") or data.get("id") or "",
            title=data.get("title") or data.get("summary"),
            model=model,
            start_time=start_time,
            end_time=end_time,
            message_count=message_count,
            cwd=self._find_path_in_data(data)
            or data.get("cwd")
            or data.get("workingDirectory")
            or data.get("projectPath")
            or data.get("workspacePath"),
            git_branch=data.get("git_branch"),
            cli_version=data.get("cli_version"),
        )

    def encode_path(self, local_path: str) -> str:
        """
        Encode a local path for Copilot.

        Copilot sessions are not organized by repo path, so we reuse
        Claude's encoding format for sidecar consistency.
        """
        from app.storage import encode_path as claude_encode

        return claude_encode(local_path)

    def decode_path(self, encoded: str) -> Optional[str]:
        """
        Decode a Copilot encoded path.

        Copilot doesn't encode paths, so this is best-effort.
        """
        from app.storage import decode_path as claude_decode

        return claude_decode(encoded)

    def _load_session_data(self, file_path: Path) -> Any:
        if file_path.suffix == ".jsonl":
            entries = []
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            entries.append(json.loads(line))
                        except json.JSONDecodeError:
                            continue
            except OSError as e:
                logger.warning("Failed to read Copilot session file %s: %s", file_path, e)
            return entries

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            logger.warning("Failed to parse Copilot session file %s: %s", file_path, e)
            return {}

    def _extract_entries(self, data: Any) -> list[dict[str, Any]]:
        if isinstance(data, list):
            return [entry for entry in data if isinstance(entry, dict)]
        if isinstance(data, dict):
            for key in ("messages", "timeline", "events", "history", "items", "conversation"):
                entries = data.get(key)
                if isinstance(entries, list):
                    return [entry for entry in entries if isinstance(entry, dict)]
        return []

    def _find_path_in_data(self, data: Any) -> Optional[str]:
        path_keys = {
            "cwd",
            "workdir",
            "workingDirectory",
            "working_directory",
            "projectPath",
            "project_path",
            "repoPath",
            "repo_path",
            "rootPath",
            "root_path",
            "workspacePath",
            "workspace_path",
            "workspaceRoot",
        }

        stack = [data]
        visited = 0
        max_nodes = 2000

        while stack and visited < max_nodes:
            current = stack.pop()
            visited += 1

            if isinstance(current, dict):
                for key, value in current.items():
                    if key in path_keys and isinstance(value, str) and value:
                        return value
                    if isinstance(value, (dict, list)):
                        stack.append(value)
            elif isinstance(current, list):
                for item in current:
                    if isinstance(item, (dict, list)):
                        stack.append(item)

        return None

    def _normalize_role(self, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        lowered = value.lower()
        if "user" in lowered or "human" in lowered:
            return "user"
        if "assistant" in lowered or "copilot" in lowered or "ai" in lowered:
            return "assistant"
        return None
