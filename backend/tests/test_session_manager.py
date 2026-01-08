"""
Tests for the session_manager module.

Tests cover:
- Process dataclass and its transcript management
- ProcessManager class methods for process lifecycle management
"""

import asyncio
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, AsyncMock, patch, PropertyMock

from app.services.session_manager import (
    Process,
    ProcessManager,
    CLI_READY_PATTERNS,
    INITIAL_PTY_ROWS,
    INITIAL_PTY_COLS,
    PTY_READ_BUFFER_SIZE,
)
from app.cli import CLIType


class TestProcess:
    """Tests for the Process dataclass."""

    def test_process_creation_with_defaults(self):
        """Test creating a Process with minimal required fields."""
        process = Process(
            id="test123",
            pid=12345,
            fd=3,
            working_dir="/home/user/project",
        )

        assert process.id == "test123"
        assert process.pid == 12345
        assert process.fd == 3
        assert process.working_dir == "/home/user/project"
        assert process.session_id is None
        assert process.cli_type == CLIType.CLAUDE
        assert process._transcript_chunks == []
        assert process._transcript_cache is None
        assert process._transcript_bytes_cache is None
        assert process.subscribers == []
        assert process._read_task is None
        assert process.claude_session_id is None
        assert process.allowed_tools == []
        assert process.permission_mode == "default"
        assert process.max_turns == 0
        assert process.model == ""

    def test_process_creation_with_all_fields(self):
        """Test creating a Process with all fields specified."""
        created = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        mock_task = MagicMock()
        callback = lambda x: None

        process = Process(
            id="abc12345",
            pid=99999,
            fd=5,
            working_dir="/var/repos/myapp",
            created_at=created,
            session_id=42,
            cli_type=CLIType.GEMINI,
            _transcript_chunks=["hello", " world"],
            _transcript_cache="hello world",
            _transcript_bytes_cache=b"hello world",
            subscribers=[callback],
            _read_task=mock_task,
            claude_session_id="session-uuid-123",
            allowed_tools=["Read", "Write", "Bash"],
            permission_mode="plan",
            max_turns=50,
            model="claude-3-opus",
        )

        assert process.id == "abc12345"
        assert process.pid == 99999
        assert process.fd == 5
        assert process.working_dir == "/var/repos/myapp"
        assert process.created_at == created
        assert process.session_id == 42
        assert process.cli_type == CLIType.GEMINI
        assert process._transcript_chunks == ["hello", " world"]
        assert process._transcript_cache == "hello world"
        assert process._transcript_bytes_cache == b"hello world"
        assert process.subscribers == [callback]
        assert process._read_task == mock_task
        assert process.claude_session_id == "session-uuid-123"
        assert process.allowed_tools == ["Read", "Write", "Bash"]
        assert process.permission_mode == "plan"
        assert process.max_turns == 50
        assert process.model == "claude-3-opus"


class TestProcessTranscript:
    """Tests for Process transcript management."""

    def test_append_transcript_single_chunk(self):
        """Test appending a single chunk to transcript."""
        process = Process(id="t1", pid=1, fd=1, working_dir="/tmp")

        process.append_transcript("Hello, world!")

        assert process._transcript_chunks == ["Hello, world!"]
        assert process._transcript_cache is None  # Cache should be invalidated

    def test_append_transcript_multiple_chunks(self):
        """Test appending multiple chunks to transcript."""
        process = Process(id="t2", pid=1, fd=1, working_dir="/tmp")

        process.append_transcript("First ")
        process.append_transcript("Second ")
        process.append_transcript("Third")

        assert process._transcript_chunks == ["First ", "Second ", "Third"]

    def test_append_transcript_invalidates_cache(self):
        """Test that appending invalidates the cached transcript."""
        process = Process(id="t3", pid=1, fd=1, working_dir="/tmp")
        process._transcript_cache = "old cache"
        process._transcript_bytes_cache = b"old cache"

        process.append_transcript("new data")

        assert process._transcript_cache is None
        assert process._transcript_bytes_cache is None

    def test_transcript_property_builds_from_chunks(self):
        """Test that transcript property joins chunks correctly."""
        process = Process(id="t4", pid=1, fd=1, working_dir="/tmp")
        process._transcript_chunks = ["Hello", ", ", "World", "!"]

        result = process.transcript

        assert result == "Hello, World!"
        assert process._transcript_cache == "Hello, World!"

    def test_transcript_property_caches_result(self):
        """Test that transcript property caches the result."""
        process = Process(id="t5", pid=1, fd=1, working_dir="/tmp")
        process._transcript_chunks = ["test"]

        # First access builds cache
        _ = process.transcript
        assert process._transcript_cache == "test"

        # Modify chunks directly (bypassing append_transcript)
        process._transcript_chunks.append(" more")

        # Should return cached value, not rebuilt string
        assert process.transcript == "test"

    def test_transcript_property_empty_chunks(self):
        """Test transcript property with no chunks."""
        process = Process(id="t6", pid=1, fd=1, working_dir="/tmp")

        assert process.transcript == ""

    def test_transcript_bytes_property(self):
        """Test that transcript_bytes returns UTF-8 encoded bytes."""
        process = Process(id="t7", pid=1, fd=1, working_dir="/tmp")
        process._transcript_chunks = ["Hello ", "World!"]

        result = process.transcript_bytes

        assert result == b"Hello World!"
        assert process._transcript_bytes_cache == b"Hello World!"

    def test_transcript_bytes_property_caches(self):
        """Test that transcript_bytes caches the result."""
        process = Process(id="t8", pid=1, fd=1, working_dir="/tmp")
        process._transcript_chunks = ["test"]

        # First access builds cache
        _ = process.transcript_bytes
        assert process._transcript_bytes_cache == b"test"

        # Verify cache is used
        process._transcript_chunks.append(" more")
        assert process.transcript_bytes == b"test"

    def test_transcript_bytes_with_unicode(self):
        """Test transcript_bytes handles unicode correctly."""
        process = Process(id="t9", pid=1, fd=1, working_dir="/tmp")
        process._transcript_chunks = ["Hello ", "🌍", " World"]

        result = process.transcript_bytes

        assert result == "Hello 🌍 World".encode("utf-8")

    def test_transcript_length_with_cache(self):
        """Test transcript_length when cache exists."""
        process = Process(id="t10", pid=1, fd=1, working_dir="/tmp")
        process._transcript_chunks = ["abc", "def"]
        process._transcript_cache = "abcdef"  # Pre-populated cache

        assert process.transcript_length == 6

    def test_transcript_length_without_cache(self):
        """Test transcript_length computes from chunks when no cache."""
        process = Process(id="t11", pid=1, fd=1, working_dir="/tmp")
        process._transcript_chunks = ["abc", "defgh", "i"]

        assert process.transcript_length == 9
        # Should not build cache just for length calculation
        assert process._transcript_cache is None

    def test_transcript_length_empty(self):
        """Test transcript_length with no chunks."""
        process = Process(id="t12", pid=1, fd=1, working_dir="/tmp")

        assert process.transcript_length == 0


class TestProcessManagerInit:
    """Tests for ProcessManager initialization."""

    def test_init_creates_empty_processes(self):
        """Test that init creates an empty processes dict."""
        pm = ProcessManager()

        assert pm._processes == {}

    def test_init_creates_lock(self):
        """Test that init creates an asyncio lock."""
        pm = ProcessManager()

        assert isinstance(pm._lock, asyncio.Lock)

    def test_processes_property(self):
        """Test the processes property returns the internal dict."""
        pm = ProcessManager()
        mock_process = MagicMock()
        pm._processes["test"] = mock_process

        assert pm.processes == {"test": mock_process}


class TestProcessManagerSubscription:
    """Tests for ProcessManager subscription methods."""

    def test_subscribe_success(self):
        """Test subscribing to a process."""
        pm = ProcessManager()
        process = Process(id="sub1", pid=1, fd=1, working_dir="/tmp")
        pm._processes["sub1"] = process

        callback = lambda x: None
        result = pm.subscribe("sub1", callback)

        assert result is True
        assert callback in process.subscribers

    def test_subscribe_nonexistent_process(self):
        """Test subscribing to a non-existent process."""
        pm = ProcessManager()

        callback = lambda x: None
        result = pm.subscribe("nonexistent", callback)

        assert result is False

    def test_subscribe_multiple_callbacks(self):
        """Test subscribing multiple callbacks to same process."""
        pm = ProcessManager()
        process = Process(id="sub2", pid=1, fd=1, working_dir="/tmp")
        pm._processes["sub2"] = process

        cb1 = lambda x: None
        cb2 = lambda x: None

        pm.subscribe("sub2", cb1)
        pm.subscribe("sub2", cb2)

        assert cb1 in process.subscribers
        assert cb2 in process.subscribers
        assert len(process.subscribers) == 2

    def test_unsubscribe_success(self):
        """Test unsubscribing from a process."""
        pm = ProcessManager()
        process = Process(id="unsub1", pid=1, fd=1, working_dir="/tmp")
        pm._processes["unsub1"] = process

        callback = lambda x: None
        process.subscribers.append(callback)

        result = pm.unsubscribe("unsub1", callback)

        assert result is True
        assert callback not in process.subscribers

    def test_unsubscribe_nonexistent_process(self):
        """Test unsubscribing from non-existent process."""
        pm = ProcessManager()

        callback = lambda x: None
        result = pm.unsubscribe("nonexistent", callback)

        assert result is False

    def test_unsubscribe_callback_not_found(self):
        """Test unsubscribing a callback that wasn't subscribed."""
        pm = ProcessManager()
        process = Process(id="unsub2", pid=1, fd=1, working_dir="/tmp")
        pm._processes["unsub2"] = process

        callback = lambda x: None
        result = pm.unsubscribe("unsub2", callback)

        assert result is False


class TestProcessManagerWrite:
    """Tests for ProcessManager.write method."""

    @pytest.mark.asyncio
    async def test_write_success(self):
        """Test writing to a process successfully."""
        pm = ProcessManager()
        process = Process(id="w1", pid=1, fd=10, working_dir="/tmp")
        pm._processes["w1"] = process

        with patch("os.write") as mock_write:
            result = await pm.write("w1", "Hello")

        assert result is True
        mock_write.assert_called_once_with(10, b"Hello")

    @pytest.mark.asyncio
    async def test_write_nonexistent_process(self):
        """Test writing to a non-existent process."""
        pm = ProcessManager()

        result = await pm.write("nonexistent", "Hello")

        assert result is False

    @pytest.mark.asyncio
    async def test_write_os_error(self):
        """Test writing when os.write raises OSError."""
        pm = ProcessManager()
        process = Process(id="w2", pid=1, fd=10, working_dir="/tmp")
        pm._processes["w2"] = process

        with patch("os.write", side_effect=OSError("Broken pipe")):
            result = await pm.write("w2", "Hello")

        assert result is False


class TestProcessManagerResize:
    """Tests for ProcessManager.resize method."""

    @pytest.mark.asyncio
    async def test_resize_success(self):
        """Test resizing a process terminal."""
        pm = ProcessManager()
        process = Process(id="r1", pid=1, fd=10, working_dir="/tmp")
        pm._processes["r1"] = process

        with patch.object(pm, "_resize_pty") as mock_resize:
            result = await pm.resize("r1", 40, 100)

        assert result is True
        mock_resize.assert_called_once_with(10, 40, 100)

    @pytest.mark.asyncio
    async def test_resize_nonexistent_process(self):
        """Test resizing a non-existent process."""
        pm = ProcessManager()

        result = await pm.resize("nonexistent", 40, 100)

        assert result is False

    @pytest.mark.asyncio
    async def test_resize_os_error(self):
        """Test resize when _resize_pty raises OSError."""
        pm = ProcessManager()
        process = Process(id="r2", pid=1, fd=10, working_dir="/tmp")
        pm._processes["r2"] = process

        with patch.object(pm, "_resize_pty", side_effect=OSError("Invalid fd")):
            result = await pm.resize("r2", 40, 100)

        assert result is False


class TestProcessManagerGetProcess:
    """Tests for ProcessManager.get_process method."""

    @pytest.mark.asyncio
    async def test_get_process_success(self):
        """Test getting an existing alive process."""
        pm = ProcessManager()
        process = Process(id="g1", pid=12345, fd=10, working_dir="/tmp")
        pm._processes["g1"] = process

        with patch.object(pm, "_is_process_alive", return_value=True):
            result = await pm.get_process("g1")

        assert result == process

    @pytest.mark.asyncio
    async def test_get_process_nonexistent(self):
        """Test getting a non-existent process."""
        pm = ProcessManager()

        result = await pm.get_process("nonexistent")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_process_dead_triggers_cleanup(self):
        """Test getting a dead process triggers cleanup."""
        pm = ProcessManager()
        process = Process(id="g2", pid=12345, fd=10, working_dir="/tmp")
        pm._processes["g2"] = process

        with patch.object(pm, "_is_process_alive", return_value=False), \
             patch.object(pm, "_cleanup_dead_process", new_callable=AsyncMock) as mock_cleanup:
            result = await pm.get_process("g2")

        assert result is None
        mock_cleanup.assert_called_once_with("g2")


class TestProcessManagerListProcesses:
    """Tests for ProcessManager.list_processes method."""

    @pytest.mark.asyncio
    async def test_list_processes_empty(self):
        """Test listing when no processes exist."""
        pm = ProcessManager()

        result = await pm.list_processes()

        assert result == []

    @pytest.mark.asyncio
    async def test_list_processes_all_alive(self):
        """Test listing when all processes are alive."""
        pm = ProcessManager()
        p1 = Process(id="l1", pid=100, fd=1, working_dir="/tmp")
        p2 = Process(id="l2", pid=200, fd=2, working_dir="/tmp")
        pm._processes["l1"] = p1
        pm._processes["l2"] = p2

        with patch.object(pm, "_is_process_alive", return_value=True):
            result = await pm.list_processes()

        assert len(result) == 2
        assert p1 in result
        assert p2 in result

    @pytest.mark.asyncio
    async def test_list_processes_some_dead(self):
        """Test listing cleans up dead processes."""
        pm = ProcessManager()
        alive_process = Process(id="alive", pid=100, fd=1, working_dir="/tmp")
        dead_process = Process(id="dead", pid=200, fd=2, working_dir="/tmp")
        pm._processes["alive"] = alive_process
        pm._processes["dead"] = dead_process

        def is_alive(pid):
            return pid == 100

        with patch.object(pm, "_is_process_alive", side_effect=is_alive), \
             patch.object(pm, "_cleanup_dead_process", new_callable=AsyncMock) as mock_cleanup:
            result = await pm.list_processes()

        assert len(result) == 1
        assert result[0] == alive_process
        mock_cleanup.assert_called_once_with("dead")


class TestProcessManagerKill:
    """Tests for ProcessManager.kill method."""

    @pytest.mark.asyncio
    async def test_kill_success(self):
        """Test killing a process successfully."""
        pm = ProcessManager()
        process = Process(id="k1", pid=12345, fd=10, working_dir="/tmp")
        # Create a proper async task mock that can be awaited after cancel
        async def mock_coro():
            raise asyncio.CancelledError()
        mock_task = asyncio.create_task(asyncio.sleep(100))  # Long sleep that will be cancelled
        process._read_task = mock_task
        pm._processes["k1"] = process

        with patch("os.kill") as mock_kill, \
             patch("os.close") as mock_close, \
             patch("asyncio.sleep", new_callable=AsyncMock):
            result = await pm.kill("k1")

        assert result is True
        assert "k1" not in pm._processes
        assert mock_task.cancelled()
        # Should call SIGTERM then SIGKILL
        assert mock_kill.call_count == 2
        mock_close.assert_called_once_with(10)

    @pytest.mark.asyncio
    async def test_kill_nonexistent_process(self):
        """Test killing a non-existent process."""
        pm = ProcessManager()

        result = await pm.kill("nonexistent")

        assert result is False

    @pytest.mark.asyncio
    async def test_kill_handles_os_errors(self):
        """Test kill handles OSError gracefully."""
        pm = ProcessManager()
        process = Process(id="k2", pid=12345, fd=10, working_dir="/tmp")
        pm._processes["k2"] = process

        with patch("os.kill", side_effect=OSError("No such process")), \
             patch("os.close", side_effect=OSError("Bad file descriptor")), \
             patch("asyncio.sleep", new_callable=AsyncMock):
            result = await pm.kill("k2")

        # Should still succeed despite errors
        assert result is True
        assert "k2" not in pm._processes


class TestProcessManagerCleanupDeadProcess:
    """Tests for ProcessManager._cleanup_dead_process method."""

    @pytest.mark.asyncio
    async def test_cleanup_dead_process_removes_from_dict(self):
        """Test cleanup removes process from dict."""
        pm = ProcessManager()
        process = Process(id="c1", pid=12345, fd=10, working_dir="/tmp")
        pm._processes["c1"] = process

        with patch("os.close"):
            await pm._cleanup_dead_process("c1")

        assert "c1" not in pm._processes

    @pytest.mark.asyncio
    async def test_cleanup_dead_process_cancels_read_task(self):
        """Test cleanup cancels the read task."""
        pm = ProcessManager()
        process = Process(id="c2", pid=12345, fd=10, working_dir="/tmp")
        # Create a proper async task that can be awaited after cancel
        mock_task = asyncio.create_task(asyncio.sleep(100))  # Long sleep that will be cancelled
        process._read_task = mock_task
        pm._processes["c2"] = process

        with patch("os.close"):
            await pm._cleanup_dead_process("c2")

        assert mock_task.cancelled()

    @pytest.mark.asyncio
    async def test_cleanup_dead_process_closes_fd(self):
        """Test cleanup closes the file descriptor."""
        pm = ProcessManager()
        process = Process(id="c3", pid=12345, fd=10, working_dir="/tmp")
        pm._processes["c3"] = process

        with patch("os.close") as mock_close:
            await pm._cleanup_dead_process("c3")

        mock_close.assert_called_once_with(10)

    @pytest.mark.asyncio
    async def test_cleanup_nonexistent_process(self):
        """Test cleanup handles non-existent process gracefully."""
        pm = ProcessManager()

        # Should not raise
        await pm._cleanup_dead_process("nonexistent")


class TestProcessManagerIsProcessAlive:
    """Tests for ProcessManager._is_process_alive method."""

    def test_is_process_alive_true(self):
        """Test process is alive when os.kill succeeds."""
        pm = ProcessManager()

        with patch("os.kill") as mock_kill:
            mock_kill.return_value = None  # No exception = process exists
            result = pm._is_process_alive(12345)

        assert result is True
        mock_kill.assert_called_once_with(12345, 0)

    def test_is_process_alive_false(self):
        """Test process is dead when os.kill raises OSError."""
        pm = ProcessManager()

        with patch("os.kill", side_effect=OSError("No such process")):
            result = pm._is_process_alive(12345)

        assert result is False


class TestProcessManagerGetDeadProcessInfo:
    """Tests for ProcessManager.get_dead_process_info method."""

    @pytest.mark.asyncio
    async def test_get_dead_process_info_empty(self):
        """Test with no processes."""
        pm = ProcessManager()

        result = await pm.get_dead_process_info()

        assert result == []

    @pytest.mark.asyncio
    async def test_get_dead_process_info_all_alive(self):
        """Test with all processes alive."""
        pm = ProcessManager()
        process = Process(id="d1", pid=12345, fd=10, working_dir="/tmp")
        pm._processes["d1"] = process

        with patch.object(pm, "_is_process_alive", return_value=True):
            result = await pm.get_dead_process_info()

        assert result == []
        assert "d1" in pm._processes  # Should not be cleaned up

    @pytest.mark.asyncio
    async def test_get_dead_process_info_returns_dead_info(self):
        """Test returns info for dead processes and cleans them up."""
        pm = ProcessManager()
        dead_process = Process(
            id="dead",
            pid=12345,
            fd=10,
            working_dir="/home/user/repo",
            session_id=42,
            claude_session_id="session-uuid",
            cli_type=CLIType.CLAUDE,
        )
        dead_process._transcript_chunks = ["test transcript"]
        pm._processes["dead"] = dead_process

        with patch.object(pm, "_is_process_alive", return_value=False), \
             patch.object(pm, "_cleanup_dead_process", new_callable=AsyncMock):
            result = await pm.get_dead_process_info()

        assert len(result) == 1
        session_id, transcript, claude_session_id, working_dir, cli_type = result[0]
        assert session_id == 42
        assert transcript == "test transcript"
        assert claude_session_id == "session-uuid"
        assert working_dir == "/home/user/repo"
        assert cli_type == CLIType.CLAUDE


class TestProcessManagerReadPty:
    """Tests for ProcessManager._read_pty method."""

    def test_read_pty_success(self):
        """Test reading from PTY successfully."""
        pm = ProcessManager()

        with patch("os.read", return_value=b"Hello, World!"):
            result = pm._read_pty(10)

        assert result == b"Hello, World!"

    def test_read_pty_os_error(self):
        """Test reading from PTY when OSError occurs."""
        pm = ProcessManager()

        with patch("os.read", side_effect=OSError("Bad file descriptor")):
            result = pm._read_pty(10)

        assert result == b""

    def test_read_pty_blocking_error(self):
        """Test reading from PTY when BlockingIOError occurs."""
        pm = ProcessManager()

        with patch("os.read", side_effect=BlockingIOError("Would block")):
            result = pm._read_pty(10)

        assert result == b""


class TestProcessManagerResizePty:
    """Tests for ProcessManager._resize_pty method."""

    def test_resize_pty_calls_ioctl(self):
        """Test that resize_pty calls ioctl with correct parameters."""
        pm = ProcessManager()

        with patch("fcntl.ioctl") as mock_ioctl:
            pm._resize_pty(10, 40, 120)

        mock_ioctl.assert_called_once()
        args = mock_ioctl.call_args
        assert args[0][0] == 10  # fd
        # args[0][1] is TIOCSWINSZ
        # args[0][2] is the packed struct


class TestCLIReadyPatterns:
    """Tests for CLI_READY_PATTERNS constant."""

    def test_cli_ready_patterns_not_empty(self):
        """Test that ready patterns list is not empty."""
        assert len(CLI_READY_PATTERNS) > 0

    def test_cli_ready_patterns_contains_box_drawing(self):
        """Test that ready patterns include box drawing characters."""
        assert "│" in CLI_READY_PATTERNS
        assert "╭" in CLI_READY_PATTERNS

    def test_cli_ready_patterns_contains_prompt_indicators(self):
        """Test that ready patterns include prompt indicators."""
        assert ">" in CLI_READY_PATTERNS
        assert "?" in CLI_READY_PATTERNS
        assert "❯" in CLI_READY_PATTERNS


class TestModuleConstants:
    """Tests for module-level constants."""

    def test_initial_pty_dimensions(self):
        """Test initial PTY dimensions are reasonable."""
        assert INITIAL_PTY_ROWS > 0
        assert INITIAL_PTY_COLS > 0
        assert INITIAL_PTY_ROWS <= 100  # Sanity check
        assert INITIAL_PTY_COLS <= 500  # Sanity check

    def test_pty_read_buffer_size(self):
        """Test PTY read buffer size is reasonable."""
        assert PTY_READ_BUFFER_SIZE > 0
        assert PTY_READ_BUFFER_SIZE <= 65536  # Sanity check


class TestProcessManagerConcurrency:
    """Tests for ProcessManager concurrency behavior."""

    @pytest.mark.asyncio
    async def test_concurrent_kills_are_safe(self):
        """Test that concurrent kill operations don't cause issues."""
        pm = ProcessManager()

        # Add multiple processes
        for i in range(5):
            process = Process(id=f"p{i}", pid=1000 + i, fd=10 + i, working_dir="/tmp")
            pm._processes[f"p{i}"] = process

        with patch("os.kill"), \
             patch("os.close"), \
             patch("asyncio.sleep", new_callable=AsyncMock):
            # Kill all concurrently
            tasks = [pm.kill(f"p{i}") for i in range(5)]
            results = await asyncio.gather(*tasks)

        assert all(results)
        assert len(pm._processes) == 0

    @pytest.mark.asyncio
    async def test_double_kill_is_safe(self):
        """Test that killing the same process twice doesn't error."""
        pm = ProcessManager()
        process = Process(id="dk1", pid=12345, fd=10, working_dir="/tmp")
        pm._processes["dk1"] = process

        with patch("os.kill"), \
             patch("os.close"), \
             patch("asyncio.sleep", new_callable=AsyncMock):
            result1 = await pm.kill("dk1")
            result2 = await pm.kill("dk1")

        assert result1 is True
        assert result2 is False  # Already killed


class TestProcessCLIType:
    """Tests for Process CLI type handling."""

    def test_default_cli_type_is_claude(self):
        """Test that default CLI type is CLAUDE."""
        process = Process(id="cli1", pid=1, fd=1, working_dir="/tmp")

        assert process.cli_type == CLIType.CLAUDE

    def test_cli_type_gemini(self):
        """Test setting CLI type to GEMINI."""
        process = Process(id="cli2", pid=1, fd=1, working_dir="/tmp", cli_type=CLIType.GEMINI)

        assert process.cli_type == CLIType.GEMINI

    def test_cli_type_codex(self):
        """Test setting CLI type to CODEX."""
        process = Process(id="cli3", pid=1, fd=1, working_dir="/tmp", cli_type=CLIType.CODEX)

        assert process.cli_type == CLIType.CODEX
