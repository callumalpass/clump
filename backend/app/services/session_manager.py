"""
PTY Session Manager for Claude Code terminals.

Manages multiple pseudo-terminal sessions running Claude Code,
with WebSocket streaming for real-time output.

Uses Claude Code CLI flags for fine-grained permission control:
- --allowedTools: Auto-approve specific tools
- --permission-mode: Control permission behavior (plan, acceptEdits, etc.)
- --max-turns: Limit agentic execution depth
- --model: Select Claude model
- --resume: Continue previous session
"""

import asyncio

# Initial PTY dimensions (larger default for modern displays)
# Frontend will send actual dimensions once terminal component mounts
INITIAL_PTY_ROWS = 30
INITIAL_PTY_COLS = 120
import os
import pty
import signal
import struct
import fcntl
import termios
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable
from uuid import uuid4


@dataclass
class Session:
    """Represents an active terminal session."""

    id: str
    pid: int
    fd: int
    working_dir: str
    created_at: datetime = field(default_factory=datetime.utcnow)
    analysis_id: int | None = None
    transcript: str = ""
    subscribers: list[Callable[[bytes], None]] = field(default_factory=list)
    _read_task: asyncio.Task | None = field(default=None, repr=False)

    # Claude Code session ID (extracted from output for resume support)
    claude_session_id: str | None = None

    # Session configuration
    allowed_tools: list[str] = field(default_factory=list)
    permission_mode: str = "default"
    max_turns: int = 0
    model: str = ""


class SessionManager:
    """Manages multiple PTY sessions running Claude Code."""

    def __init__(self):
        self._sessions: dict[str, Session] = {}
        self._lock = asyncio.Lock()

    @property
    def sessions(self) -> dict[str, Session]:
        return self._sessions

    async def create_session(
        self,
        working_dir: str,
        initial_prompt: str | None = None,
        analysis_id: int | None = None,
        *,
        allowed_tools: list[str] | None = None,
        disallowed_tools: list[str] | None = None,
        permission_mode: str | None = None,
        max_turns: int | None = None,
        model: str | None = None,
        resume_session: str | None = None,
    ) -> Session:
        """
        Create a new terminal session running Claude Code.

        Args:
            working_dir: Directory to run Claude Code in
            initial_prompt: Optional prompt to send after startup
            analysis_id: Optional linked analysis ID
            allowed_tools: Tools to auto-approve (overrides config)
            disallowed_tools: Tools to disable (overrides config)
            permission_mode: Permission mode (overrides config)
            max_turns: Max agentic turns (overrides config)
            model: Model to use (overrides config)
            resume_session: Claude Code session ID to resume
        """
        session_id = str(uuid4())[:8]

        # Generate a Claude Code session ID (full UUID) that we can use to resume later
        # We pass this to Claude Code via --session-id so we know it from the start
        claude_session_id = str(uuid4()) if not resume_session else None

        # Import here to avoid circular imports
        from app.config import settings

        # Build command args with proper flags
        args = self._build_command_args(
            settings,
            allowed_tools=allowed_tools,
            disallowed_tools=disallowed_tools,
            permission_mode=permission_mode,
            max_turns=max_turns,
            model=model,
            resume_session=resume_session,
            claude_session_id=claude_session_id,
        )

        # Create pseudo-terminal
        pid, fd = pty.fork()

        if pid == 0:
            # Child process
            os.chdir(working_dir)
            # Set terminal environment for Claude Code compatibility
            os.environ["TERM"] = "xterm-256color"
            os.environ["COLORTERM"] = "truecolor"
            os.environ["LANG"] = os.environ.get("LANG", "en_US.UTF-8")
            os.environ["LC_ALL"] = os.environ.get("LC_ALL", "en_US.UTF-8")
            # Force color and interactive mode detection
            os.environ["FORCE_COLOR"] = "1"
            os.environ["CI"] = ""  # Unset CI to prevent non-interactive detection
            os.environ["TERM_PROGRAM"] = "xterm"
            # Ensure proper columns/lines are set
            os.environ["COLUMNS"] = "120"
            os.environ["LINES"] = "30"
            os.execvp("claude", args)
        else:
            # Parent process
            # Set non-blocking
            flags = fcntl.fcntl(fd, fcntl.F_GETFL)
            fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

            # Set initial terminal size (frontend will send actual size once mounted)
            self._resize_pty(fd, INITIAL_PTY_ROWS, INITIAL_PTY_COLS)

            session = Session(
                id=session_id,
                pid=pid,
                fd=fd,
                working_dir=working_dir,
                analysis_id=analysis_id,
                allowed_tools=allowed_tools or settings.get_allowed_tools(),
                permission_mode=permission_mode or settings.claude_permission_mode,
                max_turns=max_turns if max_turns is not None else settings.claude_max_turns,
                model=model or settings.claude_model,
                # Set Claude session ID - either our generated one or the one being resumed
                claude_session_id=claude_session_id or resume_session,
            )

            async with self._lock:
                self._sessions[session_id] = session

            # Start reading output
            session._read_task = asyncio.create_task(self._read_loop(session))

            # Send initial prompt after Claude starts
            if initial_prompt:
                asyncio.create_task(self._send_initial_prompt(session, initial_prompt))

            return session

    def _build_command_args(
        self,
        settings,
        *,
        allowed_tools: list[str] | None = None,
        disallowed_tools: list[str] | None = None,
        permission_mode: str | None = None,
        max_turns: int | None = None,
        model: str | None = None,
        resume_session: str | None = None,
        claude_session_id: str | None = None,
        mcp_config: dict | None = None,
    ) -> list[str]:
        """Build Claude Code command arguments with proper flags."""
        import json

        args = [settings.claude_command]

        # Resume session if specified
        if resume_session:
            args.extend(["--resume", resume_session])
        elif claude_session_id:
            # Set a known session ID for new sessions so we can resume later
            args.extend(["--session-id", claude_session_id])

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

    async def _send_initial_prompt(self, session: Session, prompt: str):
        """Send initial prompt after Claude Code starts and is ready."""
        # Wait for Claude to initialize and show the prompt
        await asyncio.sleep(2.0)

        # Send the prompt as if user typed it, then press Enter
        await self.write(session.id, prompt)
        await asyncio.sleep(0.1)
        await self.write(session.id, "\n")

    async def _read_loop(self, session: Session):
        """Continuously read from PTY and broadcast to subscribers."""
        loop = asyncio.get_event_loop()

        while True:
            try:
                # Read from PTY in executor to not block
                data = await loop.run_in_executor(
                    None, self._read_pty, session.fd
                )

                if data:
                    decoded = data.decode("utf-8", errors="replace")
                    session.transcript += decoded

                    # Notify all subscribers
                    for callback in session.subscribers:
                        try:
                            callback(data)
                        except Exception:
                            pass

                await asyncio.sleep(0.01)  # Small delay to prevent busy loop

            except OSError:
                # PTY closed
                break
            except asyncio.CancelledError:
                break

    def _read_pty(self, fd: int) -> bytes:
        """Read available data from PTY (blocking call for executor)."""
        try:
            return os.read(fd, 4096)
        except (OSError, BlockingIOError):
            return b""

    def _resize_pty(self, fd: int, rows: int, cols: int):
        """Resize the PTY."""
        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

    async def write(self, session_id: str, data: str) -> bool:
        """Write input to a session."""
        session = self._sessions.get(session_id)
        if not session:
            return False

        try:
            os.write(session.fd, data.encode())
            return True
        except OSError:
            return False

    async def resize(self, session_id: str, rows: int, cols: int) -> bool:
        """Resize a session's terminal."""
        session = self._sessions.get(session_id)
        if not session:
            return False

        try:
            self._resize_pty(session.fd, rows, cols)
            return True
        except OSError:
            return False

    def subscribe(self, session_id: str, callback: Callable[[bytes], None]) -> bool:
        """Subscribe to session output."""
        session = self._sessions.get(session_id)
        if not session:
            return False

        session.subscribers.append(callback)
        return True

    def unsubscribe(self, session_id: str, callback: Callable[[bytes], None]) -> bool:
        """Unsubscribe from session output."""
        session = self._sessions.get(session_id)
        if not session:
            return False

        try:
            session.subscribers.remove(callback)
            return True
        except ValueError:
            return False

    async def kill(self, session_id: str) -> bool:
        """Kill a session."""
        async with self._lock:
            session = self._sessions.pop(session_id, None)

        if not session:
            return False

        # Cancel read task
        if session._read_task:
            session._read_task.cancel()
            try:
                await session._read_task
            except asyncio.CancelledError:
                pass

        # Kill process
        try:
            os.kill(session.pid, signal.SIGTERM)
            await asyncio.sleep(0.1)
            os.kill(session.pid, signal.SIGKILL)
        except OSError:
            pass

        # Close file descriptor
        try:
            os.close(session.fd)
        except OSError:
            pass

        return True

    def _is_process_alive(self, pid: int) -> bool:
        """Check if a process is still running."""
        try:
            os.kill(pid, 0)  # Signal 0 doesn't kill, just checks
            return True
        except OSError:
            return False

    async def get_session(self, session_id: str) -> Session | None:
        """Get a session by ID."""
        session = self._sessions.get(session_id)
        if session and not self._is_process_alive(session.pid):
            # Session process died - clean it up
            await self._cleanup_dead_session(session_id)
            return None
        return session

    async def list_sessions(self) -> list[Session]:
        """List all active sessions, cleaning up dead ones."""
        dead_sessions = []
        alive_sessions = []

        for session_id, session in self._sessions.items():
            if self._is_process_alive(session.pid):
                alive_sessions.append(session)
            else:
                dead_sessions.append(session_id)

        # Clean up dead sessions
        for session_id in dead_sessions:
            await self._cleanup_dead_session(session_id)

        return alive_sessions

    async def _cleanup_dead_session(self, session_id: str):
        """Clean up a session whose process has died."""
        async with self._lock:
            session = self._sessions.pop(session_id, None)

        if not session:
            return

        # Cancel read task
        if session._read_task:
            session._read_task.cancel()
            try:
                await session._read_task
            except asyncio.CancelledError:
                pass

        # Close file descriptor
        try:
            os.close(session.fd)
        except OSError:
            pass

    async def get_dead_session_info(self) -> list[tuple[int, str, str | None]]:
        """
        Check for and return info about dead sessions for database cleanup.
        Returns list of (analysis_id, transcript, claude_session_id) for dead sessions.
        """
        dead_info = []
        dead_sessions = []

        for session_id, session in self._sessions.items():
            if not self._is_process_alive(session.pid):
                if session.analysis_id:
                    dead_info.append((
                        session.analysis_id,
                        session.transcript,
                        session.claude_session_id
                    ))
                dead_sessions.append(session_id)

        # Clean up dead sessions
        for session_id in dead_sessions:
            await self._cleanup_dead_session(session_id)

        return dead_info


# Global session manager instance
session_manager = SessionManager()
