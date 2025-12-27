"""
Headless Claude Code Analyzer.

Uses Claude Code's non-interactive mode (-p flag) with structured JSON output
for programmatic analysis of issues, PRs, and code.
"""

import asyncio
import json
import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from typing import AsyncGenerator, Callable
from uuid import uuid4

from app.config import settings


@dataclass
class AnalysisMessage:
    """A single message from Claude Code's stream-json output."""

    type: str  # "system", "assistant", "result", "error"
    subtype: str | None = None  # "init", "success", "error", etc.
    content: str | None = None
    session_id: str | None = None
    cost_usd: float | None = None
    duration_ms: int | None = None
    raw: dict = field(default_factory=dict)


@dataclass
class AnalysisResult:
    """Complete result of a headless analysis."""

    session_id: str
    result: str
    success: bool
    cost_usd: float = 0.0
    duration_ms: int = 0
    turns: int = 0
    messages: list[AnalysisMessage] = field(default_factory=list)
    error: str | None = None


class HeadlessAnalyzer:
    """
    Runs Claude Code in headless mode for programmatic analysis.

    Uses -p flag with --output-format stream-json for real-time
    structured output that can be parsed and displayed progressively.
    """

    def __init__(self):
        self._running_analyses: dict[str, subprocess.Popen] = {}

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
    ) -> AnalysisResult:
        """
        Run a headless analysis and return the complete result.

        Args:
            prompt: The analysis prompt
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
            AnalysisResult with complete analysis data
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
            return AnalysisResult(
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
            return AnalysisResult(
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
    ) -> AsyncGenerator[AnalysisMessage, None]:
        """
        Run a headless analysis and stream results as they arrive.

        Yields AnalysisMessage objects parsed from stream-json output.
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
        )

        analysis_id = session_id or str(uuid4())[:8]
        self._running_analyses[analysis_id] = process

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
                    yield AnalysisMessage(
                        type="text",
                        content=line.decode("utf-8", errors="replace"),
                    )

            # Check for errors
            await process.wait()
            if process.returncode != 0 and process.stderr:
                stderr = await process.stderr.read()
                if stderr:
                    yield AnalysisMessage(
                        type="error",
                        content=stderr.decode("utf-8", errors="replace"),
                    )

        finally:
            self._running_analyses.pop(analysis_id, None)

    def _parse_message(self, data: dict) -> AnalysisMessage:
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

        return AnalysisMessage(
            type=msg_type,
            subtype=subtype,
            content=content,
            session_id=data.get("session_id"),
            cost_usd=data.get("total_cost_usd"),
            duration_ms=data.get("duration_ms"),
            raw=data,
        )

    async def cancel(self, analysis_id: str) -> bool:
        """Cancel a running analysis."""
        process = self._running_analyses.get(analysis_id)
        if process:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                process.kill()
            return True
        return False

    def list_running(self) -> list[str]:
        """List IDs of running analyses."""
        return list(self._running_analyses.keys())


# Global analyzer instance
headless_analyzer = HeadlessAnalyzer()
