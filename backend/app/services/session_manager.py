"""
PTY Session Manager for Claude Code terminals.

Manages multiple pseudo-terminal sessions running Claude Code,
with WebSocket streaming for real-time output.
"""

import asyncio
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
    ) -> Session:
        """
        Create a new terminal session running Claude Code.

        Args:
            working_dir: Directory to run Claude Code in
            initial_prompt: Optional prompt to send after startup
            analysis_id: Optional linked analysis ID
        """
        session_id = str(uuid4())[:8]

        # Create pseudo-terminal
        pid, fd = pty.fork()

        if pid == 0:
            # Child process
            os.chdir(working_dir)
            os.environ["TERM"] = "xterm-256color"

            # Import here to avoid circular imports
            from app.config import settings

            # Build command args
            args = ["claude"]
            if settings.claude_skip_permissions:
                args.append("--dangerously-skip-permissions")

            os.execvp("claude", args)
        else:
            # Parent process
            # Set non-blocking
            flags = fcntl.fcntl(fd, fcntl.F_GETFL)
            fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

            # Set initial terminal size (80x24)
            self._resize_pty(fd, 24, 80)

            session = Session(
                id=session_id,
                pid=pid,
                fd=fd,
                working_dir=working_dir,
                analysis_id=analysis_id,
            )

            async with self._lock:
                self._sessions[session_id] = session

            # Start reading output
            session._read_task = asyncio.create_task(self._read_loop(session))

            # Send initial prompt after Claude starts
            if initial_prompt:
                asyncio.create_task(self._send_initial_prompt(session, initial_prompt))

            return session

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
                    session.transcript += data.decode("utf-8", errors="replace")

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

    async def get_session(self, session_id: str) -> Session | None:
        """Get a session by ID."""
        return self._sessions.get(session_id)

    async def list_sessions(self) -> list[Session]:
        """List all active sessions."""
        return list(self._sessions.values())


# Global session manager instance
session_manager = SessionManager()
