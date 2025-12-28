"""
Headless Claude Code Analyzer.

Uses Claude Code's non-interactive mode (-p flag) with structured JSON output
for programmatic analysis of issues, PRs, and code.
"""

import asyncio
import asyncio.subprocess
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import AsyncGenerator, Callable
from uuid import uuid4

from app.config import settings

logger = logging.getLogger(__name__)

# Buffer limit for subprocess stdout/stderr streams.
# Large tool outputs (e.g., file reads, grep results) can exceed the default 64KB.
SUBPROCESS_BUFFER_LIMIT_BYTES = 10 * 1024 * 1024  # 10 MB


@dataclass
class SessionMessage:
    """A single message from Claude Code's stream-json output."""

    type: str  # "system", "assistant", "result", "error"
    subtype: str | None = None  # "init", "success", "error", etc.
    content: str | None = None
    session_id: str | None = None
    cost_usd: float | None = None
    duration_ms: int | None = None
    raw: dict = field(default_factory=dict)


@dataclass
class SessionResult:
    """Complete result of a headless session."""

    session_id: str
    result: str
    success: bool
    cost_usd: float = 0.0
    duration_ms: int = 0
    turns: int = 0
    messages: list[SessionMessage] = field(default_factory=list)
    error: str | None = None


class HeadlessAnalyzer:
    """
    Runs Claude Code in headless mode for programmatic sessions.

    Uses -p flag with --output-format stream-json for real-time
    structured output that can be parsed and displayed progressively.
    """

    def __init__(self):
        self._running_sessions: dict[str, asyncio.subprocess.Process] = {}
        # Explicit tracking set - more reliable than process dict for status checks
        self._active_session_ids: set[str] = set()

    def register_running(self, session_id: str) -> None:
        """Register a session as running. Call before starting the session."""
        logger.info("Registering session as running: %s", session_id)
        self._active_session_ids.add(session_id)

    def unregister_running(self, session_id: str) -> None:
        """Unregister a session as running. Call when session completes."""
        logger.info("Unregistering session (completed): %s", session_id)
        self._active_session_ids.discard(session_id)

    def _build_command(
        self,
        prompt: str,
        working_dir: str,
        *,
        session_id: str | None = None,
        resume_session: str | None = None,
        allowed_tools: list[str] | None = None,
        disallowed_tools: list[str] | None = None,
        max_turns: int | None = None,
        permission_mode: str | None = None,
        model: str | None = None,
        system_prompt: str | None = None,
        output_format: str | None = None,
    ) -> list[str]:
        """Build the Claude Code command with all options."""
        cmd = [settings.claude_command, "-p", prompt]

        # Output format
        fmt = output_format or settings.claude_output_format
        cmd.extend(["--output-format", fmt])

        # stream-json requires --verbose when using -p (print mode)
        if fmt == "stream-json":
            cmd.append("--verbose")

        # Session management
        if session_id:
            cmd.extend(["--session-id", session_id])
        if resume_session:
            cmd.extend(["--resume", resume_session])

        # Permission mode
        mode = permission_mode or settings.claude_permission_mode
        if mode == "bypassPermissions":
            cmd.append("--dangerously-skip-permissions")
        elif mode in ("plan", "acceptEdits"):
            cmd.extend(["--permission-mode", mode])

        # Allowed tools
        tools = allowed_tools or settings.get_allowed_tools()
        if tools:
            cmd.extend(["--allowedTools", ",".join(tools)])

        # Disallowed tools
        disabled = disallowed_tools or settings.get_disallowed_tools()
        if disabled:
            cmd.extend(["--disallowedTools", ",".join(disabled)])

        # Max turns
        turns = max_turns if max_turns is not None else settings.claude_max_turns
        if turns > 0:
            cmd.extend(["--max-turns", str(turns)])

        # Model
        m = model or settings.claude_model
        if m:
            cmd.extend(["--model", m])

        # System prompt
        if system_prompt:
            cmd.extend(["--append-system-prompt", system_prompt])

        return cmd

    async def analyze(
        self,
        prompt: str,
        working_dir: str,
        *,
        session_id: str | None = None,
        resume_session: str | None = None,
        allowed_tools: list[str] | None = None,
        disallowed_tools: list[str] | None = None,
        max_turns: int | None = None,
        permission_mode: str | None = None,
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> SessionResult:
        """
        Run a headless session and return the complete result.

        Args:
            prompt: The session prompt
            working_dir: Directory to run Claude Code in
            session_id: Specific UUID to use for this session
            resume_session: Session ID to resume from
            allowed_tools: Tools to auto-approve (overrides config)
            disallowed_tools: Tools to disable (overrides config)
            max_turns: Max agentic turns (overrides config)
            permission_mode: Permission mode (overrides config)
            model: Model to use (overrides config)
            system_prompt: Additional system prompt to append

        Returns:
            SessionResult with complete session data
        """
        messages = []
        async for msg in self.analyze_stream(
            prompt,
            working_dir,
            session_id=session_id,
            resume_session=resume_session,
            allowed_tools=allowed_tools,
            disallowed_tools=disallowed_tools,
            max_turns=max_turns,
            permission_mode=permission_mode,
            model=model,
            system_prompt=system_prompt,
        ):
            messages.append(msg)

        # Extract final result
        result_msg = next(
            (m for m in reversed(messages) if m.type == "result"),
            None,
        )

        if result_msg and result_msg.subtype == "success":
            return SessionResult(
                session_id=result_msg.session_id or "",
                result=result_msg.content or "",
                success=True,
                cost_usd=result_msg.cost_usd or 0.0,
                duration_ms=result_msg.duration_ms or 0,
                messages=messages,
            )
        else:
            error_msg = next(
                (m for m in reversed(messages) if m.type == "error"),
                None,
            )
            return SessionResult(
                session_id="",
                result="",
                success=False,
                error=error_msg.content if error_msg else "Unknown error",
                messages=messages,
            )

    async def analyze_stream(
        self,
        prompt: str,
        working_dir: str,
        *,
        session_id: str | None = None,
        resume_session: str | None = None,
        allowed_tools: list[str] | None = None,
        disallowed_tools: list[str] | None = None,
        max_turns: int | None = None,
        permission_mode: str | None = None,
        model: str | None = None,
        system_prompt: str | None = None,
        output_format: str = "stream-json",
    ) -> AsyncGenerator[SessionMessage, None]:
        """
        Run a headless session and stream results as they arrive.

        Yields SessionMessage objects parsed from stream-json output.
        """
        cmd = self._build_command(
            prompt,
            working_dir,
            session_id=session_id,
            resume_session=resume_session,
            allowed_tools=allowed_tools,
            disallowed_tools=disallowed_tools,
            max_turns=max_turns,
            permission_mode=permission_mode,
            model=model,
            system_prompt=system_prompt,
            output_format=output_format,
        )

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=working_dir,
            limit=SUBPROCESS_BUFFER_LIMIT_BYTES,
        )

        run_id = session_id or str(uuid4())[:8]
        self._running_sessions[run_id] = process

        try:
            # Read stdout line by line (stream-json is newline-delimited)
            while True:
                if process.stdout is None:
                    break

                line = await process.stdout.readline()
                if not line:
                    break

                try:
                    data = json.loads(line.decode("utf-8").strip())
                    yield self._parse_message(data)
                except json.JSONDecodeError:
                    # Non-JSON output (shouldn't happen with stream-json)
                    yield SessionMessage(
                        type="text",
                        content=line.decode("utf-8", errors="replace"),
                    )

            # Check for errors
            await process.wait()
            if process.returncode != 0 and process.stderr:
                stderr = await process.stderr.read()
                if stderr:
                    yield SessionMessage(
                        type="error",
                        content=stderr.decode("utf-8", errors="replace"),
                    )

        finally:
            self._running_sessions.pop(run_id, None)

    def _parse_message(self, data: dict) -> SessionMessage:
        """Parse a JSON message from stream-json output."""
        msg_type = data.get("type", "unknown")
        subtype = data.get("subtype")

        content = None
        if msg_type == "assistant":
            # Assistant message with content
            content = data.get("message", {}).get("content", "")
            if isinstance(content, list):
                # Extract text from content blocks
                content = " ".join(
                    block.get("text", "")
                    for block in content
                    if block.get("type") == "text"
                )
        elif msg_type == "result":
            content = data.get("result", "")

        return SessionMessage(
            type=msg_type,
            subtype=subtype,
            content=content,
            session_id=data.get("session_id"),
            cost_usd=data.get("total_cost_usd"),
            duration_ms=data.get("duration_ms"),
            raw=data,
        )

    async def cancel(self, session_id: str) -> bool:
        """Cancel a running session."""
        process = self._running_sessions.get(session_id)
        if process:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                process.kill()
            return True
        return False

    def list_running(self) -> list[str]:
        """List IDs of running sessions."""
        # Combine both tracking mechanisms for robustness
        all_running = set(self._running_sessions.keys()) | self._active_session_ids
        if all_running:
            logger.debug("list_running: %s", all_running)
        return list(all_running)


# Global analyzer instance
headless_analyzer = HeadlessAnalyzer()
