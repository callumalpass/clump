"""
PTY Process Manager for Claude Code terminals.

Manages multiple pseudo-terminal processes running Claude Code,
with WebSocket streaming for real-time output.

Uses Claude Code CLI flags for fine-grained permission control:
- --allowedTools: Auto-approve specific tools
- --permission-mode: Control permission behavior (plan, acceptEdits, etc.)
- --max-turns: Limit agentic execution depth
- --model: Select Claude model
- --resume: Continue previous session
"""

import asyncio
import fcntl
import json
import logging
import os
import pty
import signal
import struct
import termios
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, TypedDict
from uuid import uuid4

logger = logging.getLogger(__name__)

from app.config import Settings

# Initial PTY dimensions (larger default for modern displays)
# Frontend will send actual dimensions once terminal component mounts
INITIAL_PTY_ROWS = 30
INITIAL_PTY_COLS = 120

# Timing constants for PTY operations
CLAUDE_INIT_POLL_INTERVAL_SECS = 0.05  # Polling interval when waiting for Claude to be ready
CLAUDE_INIT_MAX_WAIT_SECS = 10.0  # Maximum time to wait for Claude to initialize
CLAUDE_INIT_FALLBACK_SECS = 0.5  # Fallback delay if detection fails quickly
PROMPT_ENTER_DELAY_SECS = 0.1  # Delay between typing prompt and pressing Enter
READ_LOOP_POLL_INTERVAL_SECS = 0.01  # Polling interval for read loop to prevent busy waiting
SIGTERM_SIGKILL_DELAY_SECS = 0.1  # Grace period between SIGTERM and SIGKILL

# Patterns that indicate Claude Code is ready for input
# These appear in the terminal output when Claude has finished initializing
CLAUDE_READY_PATTERNS = [
    "│",  # Box drawing character from Claude's UI
    "╭",  # Top corner of Claude's prompt box
    ">",  # Simple prompt indicator
    "?",  # Query prompt
]

# Buffer size for reading from PTY file descriptor
PTY_READ_BUFFER_SIZE = 4096


class McpServerConfig(TypedDict, total=False):
    """Configuration for a single MCP server.

    Attributes:
        type: Transport type (e.g., "http", "stdio").
        url: Server URL for HTTP transport.
        headers: HTTP headers (e.g., for authorization).
        command: Command to run for stdio transport.
        args: Command arguments for stdio transport.
    """

    type: str
    url: str
    headers: dict[str, str]
    command: str
    args: list[str]


# Type alias for MCP configuration dict mapping server names to their configs
McpConfig = dict[str, McpServerConfig]


@dataclass
class Process:
    """Represents an active PTY process running Claude Code."""

    id: str
    pid: int
    fd: int
    working_dir: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    session_id: int | None = None  # Links to Session (formerly Analysis) record

    # Transcript stored as list of chunks for O(1) append instead of O(n) string concat
    _transcript_chunks: list[str] = field(default_factory=list)
    # Cached versions to avoid repeated joins/encodes
    _transcript_cache: str | None = field(default=None, repr=False)
    _transcript_bytes_cache: bytes | None = field(default=None, repr=False)

    subscribers: list[Callable[[bytes], None]] = field(default_factory=list)
    _read_task: asyncio.Task | None = field(default=None, repr=False)

    # Claude Code session ID (extracted from output for resume support)
    claude_session_id: str | None = None

    # Process configuration
    allowed_tools: list[str] = field(default_factory=list)
    permission_mode: str = "default"
    max_turns: int = 0
    model: str = ""

    def append_transcript(self, data: str) -> None:
        """Append data to transcript efficiently using list accumulation."""
        self._transcript_chunks.append(data)
        # Invalidate caches
        self._transcript_cache = None
        self._transcript_bytes_cache = None

    @property
    def transcript(self) -> str:
        """Get the full transcript as a string (cached)."""
        if self._transcript_cache is None:
            self._transcript_cache = "".join(self._transcript_chunks)
        return self._transcript_cache

    @property
    def transcript_bytes(self) -> bytes:
        """Get the full transcript as UTF-8 bytes (cached)."""
        if self._transcript_bytes_cache is None:
            self._transcript_bytes_cache = self.transcript.encode("utf-8", errors="replace")
        return self._transcript_bytes_cache

    @property
    def transcript_length(self) -> int:
        """Get the current transcript length without building full string."""
        if self._transcript_cache is not None:
            return len(self._transcript_cache)
        return sum(len(chunk) for chunk in self._transcript_chunks)


class ProcessManager:
    """Manages multiple PTY processes running Claude Code."""

    def __init__(self):
        self._processes: dict[str, Process] = {}
        self._lock = asyncio.Lock()

    @property
    def processes(self) -> dict[str, Process]:
        return self._processes

    async def create_process(
        self,
        working_dir: str,
        initial_prompt: str | None = None,
        session_id: int | None = None,
        *,
        allowed_tools: list[str] | None = None,
        disallowed_tools: list[str] | None = None,
        permission_mode: str | None = None,
        max_turns: int | None = None,
        model: str | None = None,
        resume_session: str | None = None,
    ) -> Process:
        """
        Create a new PTY process running Claude Code.

        Args:
            working_dir: Directory to run Claude Code in
            initial_prompt: Optional prompt to send after startup
            session_id: Optional linked Session ID
            allowed_tools: Tools to auto-approve (overrides config)
            disallowed_tools: Tools to disable (overrides config)
            permission_mode: Permission mode (overrides config)
            max_turns: Max agentic turns (overrides config)
            model: Model to use (overrides config)
            resume_session: Claude Code session ID to resume
        """
        process_id = str(uuid4())[:8]

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

        # Validate working directory exists before forking
        if not os.path.isdir(working_dir):
            raise ValueError(f"Working directory does not exist: {working_dir}")

        # Create pseudo-terminal
        pid, fd = pty.fork()

        if pid == 0:
            # Child process - wrap in try/except to capture errors
            try:
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
                # Ensure proper columns/lines are set (using module constants)
                os.environ["COLUMNS"] = str(INITIAL_PTY_COLS)
                os.environ["LINES"] = str(INITIAL_PTY_ROWS)
                os.execvp("claude", args)
            except Exception as e:
                # Write error to stderr so it can be captured
                import sys
                sys.stderr.write(f"Failed to start claude: {e}\n")
                sys.stderr.flush()
                os._exit(1)
        else:
            # Parent process
            # Set non-blocking
            flags = fcntl.fcntl(fd, fcntl.F_GETFL)
            fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

            # Set initial terminal size (frontend will send actual size once mounted)
            self._resize_pty(fd, INITIAL_PTY_ROWS, INITIAL_PTY_COLS)

            process = Process(
                id=process_id,
                pid=pid,
                fd=fd,
                working_dir=working_dir,
                session_id=session_id,
                allowed_tools=allowed_tools or settings.get_allowed_tools(),
                permission_mode=permission_mode or settings.claude_permission_mode,
                max_turns=max_turns if max_turns is not None else settings.claude_max_turns,
                model=model or settings.claude_model,
                # Set Claude session ID - either our generated one or the one being resumed
                claude_session_id=claude_session_id or resume_session,
            )

            async with self._lock:
                self._processes[process_id] = process

            # Start reading output
            process._read_task = asyncio.create_task(self._read_loop(process))

            # Send initial prompt after Claude starts
            if initial_prompt:
                asyncio.create_task(self._send_initial_prompt(process, initial_prompt))

            return process

    def _build_command_args(
        self,
        settings: Settings,
        *,
        allowed_tools: list[str] | None = None,
        disallowed_tools: list[str] | None = None,
        permission_mode: str | None = None,
        max_turns: int | None = None,
        model: str | None = None,
        resume_session: str | None = None,
        claude_session_id: str | None = None,
        mcp_config: McpConfig | None = None,
    ) -> list[str]:
        """Build Claude Code command arguments with proper flags."""
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

    async def _send_initial_prompt(self, process: Process, prompt: str):
        """Send initial prompt after Claude Code starts and is ready."""
        # Wait for Claude to initialize by detecting ready patterns in output
        await self._wait_for_claude_ready(process)

        # Send the prompt as if user typed it, then press Enter
        # Use \r (carriage return) like a real terminal Enter key, not \n (line feed)
        await self.write(process.id, prompt)
        await asyncio.sleep(PROMPT_ENTER_DELAY_SECS)
        await self.write(process.id, "\r")

    async def _wait_for_claude_ready(self, process: Process):
        """
        Wait for Claude Code to be ready for input by detecting UI patterns.

        Uses pattern matching on the terminal output instead of a fixed delay.
        Falls back to a short delay if patterns aren't detected within timeout.
        """
        start_time = asyncio.get_event_loop().time()
        last_transcript_len = 0

        while True:
            elapsed = asyncio.get_event_loop().time() - start_time

            # Check if we've exceeded max wait time
            if elapsed >= CLAUDE_INIT_MAX_WAIT_SECS:
                logger.warning(
                    "Claude ready detection timed out after %.1fs for process %s",
                    elapsed, process.id
                )
                break

            # Check transcript for ready patterns
            current_transcript = process.transcript
            if current_transcript:
                # Look for any ready pattern in the output
                for pattern in CLAUDE_READY_PATTERNS:
                    if pattern in current_transcript:
                        logger.debug(
                            "Claude ready detected after %.2fs for process %s (pattern: %r)",
                            elapsed, process.id, pattern
                        )
                        # Small additional delay to ensure UI is fully rendered
                        await asyncio.sleep(0.1)
                        return

            # If transcript hasn't changed and we've waited a bit, use fallback
            current_len = process.transcript_length
            if elapsed >= CLAUDE_INIT_FALLBACK_SECS and current_len == last_transcript_len:
                # No new output for a while, assume ready
                logger.debug(
                    "Claude ready (no new output) after %.2fs for process %s",
                    elapsed, process.id
                )
                return

            last_transcript_len = current_len
            await asyncio.sleep(CLAUDE_INIT_POLL_INTERVAL_SECS)

    async def _read_loop(self, process: Process):
        """Continuously read from PTY and broadcast to subscribers."""
        loop = asyncio.get_event_loop()

        while True:
            try:
                # Read from PTY in executor to not block
                data = await loop.run_in_executor(
                    None, self._read_pty, process.fd
                )

                if data:
                    decoded = data.decode("utf-8", errors="replace")
                    # Use append_transcript for O(1) performance instead of O(n) string concat
                    process.append_transcript(decoded)

                    # Notify all subscribers
                    for callback in process.subscribers:
                        try:
                            callback(data)
                        except Exception:
                            logger.exception("PTY subscriber callback failed for process %s", process.id)

                await asyncio.sleep(READ_LOOP_POLL_INTERVAL_SECS)

            except OSError:
                # PTY closed
                break
            except asyncio.CancelledError:
                break

    def _read_pty(self, fd: int) -> bytes:
        """Read available data from PTY (blocking call for executor)."""
        try:
            return os.read(fd, PTY_READ_BUFFER_SIZE)
        except (OSError, BlockingIOError):
            return b""

    def _resize_pty(self, fd: int, rows: int, cols: int):
        """Resize the PTY."""
        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

    async def write(self, process_id: str, data: str) -> bool:
        """Write input to a process."""
        process = self._processes.get(process_id)
        if not process:
            return False

        try:
            os.write(process.fd, data.encode())
            return True
        except OSError:
            return False

    async def resize(self, process_id: str, rows: int, cols: int) -> bool:
        """Resize a process's terminal."""
        process = self._processes.get(process_id)
        if not process:
            return False

        try:
            self._resize_pty(process.fd, rows, cols)
            return True
        except OSError:
            return False

    def subscribe(self, process_id: str, callback: Callable[[bytes], None]) -> bool:
        """Subscribe to process output."""
        process = self._processes.get(process_id)
        if not process:
            return False

        process.subscribers.append(callback)
        return True

    def unsubscribe(self, process_id: str, callback: Callable[[bytes], None]) -> bool:
        """Unsubscribe from process output."""
        process = self._processes.get(process_id)
        if not process:
            return False

        try:
            process.subscribers.remove(callback)
            return True
        except ValueError:
            return False

    async def kill(self, process_id: str) -> bool:
        """Kill a process."""
        async with self._lock:
            process = self._processes.pop(process_id, None)

        if not process:
            return False

        # Cancel read task
        if process._read_task:
            process._read_task.cancel()
            try:
                await process._read_task
            except asyncio.CancelledError:
                pass

        # Kill process
        try:
            os.kill(process.pid, signal.SIGTERM)
            await asyncio.sleep(SIGTERM_SIGKILL_DELAY_SECS)
            os.kill(process.pid, signal.SIGKILL)
        except OSError:
            pass

        # Close file descriptor
        try:
            os.close(process.fd)
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

    async def get_process(self, process_id: str) -> Process | None:
        """Get a process by ID."""
        process = self._processes.get(process_id)
        if process and not self._is_process_alive(process.pid):
            # Process died - clean it up
            await self._cleanup_dead_process(process_id)
            return None
        return process

    async def list_processes(self) -> list[Process]:
        """List all active processes, cleaning up dead ones."""
        dead_processes = []
        alive_processes = []

        for process_id, process in self._processes.items():
            if self._is_process_alive(process.pid):
                alive_processes.append(process)
            else:
                dead_processes.append(process_id)

        # Clean up dead processes
        for process_id in dead_processes:
            await self._cleanup_dead_process(process_id)

        return alive_processes

    async def _cleanup_dead_process(self, process_id: str):
        """Clean up a process that has died."""
        async with self._lock:
            process = self._processes.pop(process_id, None)

        if not process:
            return

        # Cancel read task
        if process._read_task:
            process._read_task.cancel()
            try:
                await process._read_task
            except asyncio.CancelledError:
                pass

        # Close file descriptor
        try:
            os.close(process.fd)
        except OSError:
            pass

    async def get_dead_process_info(self) -> list[tuple[int | None, str, str | None, str]]:
        """
        Check for and return info about dead processes for database cleanup.
        Returns list of (session_id, transcript, claude_session_id, working_dir) for dead processes.
        """
        dead_info = []
        dead_processes = []

        for process_id, process in self._processes.items():
            if not self._is_process_alive(process.pid):
                dead_info.append((
                    process.session_id,
                    process.transcript,
                    process.claude_session_id,
                    process.working_dir,
                ))
                dead_processes.append(process_id)

        # Clean up dead processes
        for process_id in dead_processes:
            await self._cleanup_dead_process(process_id)

        return dead_info


# Global process manager instance
process_manager = ProcessManager()
