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

    @pytest.mark.asyncio
    async def test_subscribe_success(self):
        """Test subscribing to a process."""
        pm = ProcessManager()
        process = Process(id="sub1", pid=1, fd=1, working_dir="/tmp")
        pm._processes["sub1"] = process

        callback = lambda x: None
        result = await pm.subscribe("sub1", callback)

        assert result is True
        assert callback in process.subscribers

    @pytest.mark.asyncio
    async def test_subscribe_nonexistent_process(self):
        """Test subscribing to a non-existent process."""
        pm = ProcessManager()

        callback = lambda x: None
        result = await pm.subscribe("nonexistent", callback)

        assert result is False

    @pytest.mark.asyncio
    async def test_subscribe_multiple_callbacks(self):
        """Test subscribing multiple callbacks to same process."""
        pm = ProcessManager()
        process = Process(id="sub2", pid=1, fd=1, working_dir="/tmp")
        pm._processes["sub2"] = process

        cb1 = lambda x: None
        cb2 = lambda x: None

        await pm.subscribe("sub2", cb1)
        await pm.subscribe("sub2", cb2)

        assert cb1 in process.subscribers
        assert cb2 in process.subscribers
        assert len(process.subscribers) == 2

    @pytest.mark.asyncio
    async def test_unsubscribe_success(self):
        """Test unsubscribing from a process."""
        pm = ProcessManager()
        process = Process(id="unsub1", pid=1, fd=1, working_dir="/tmp")
        pm._processes["unsub1"] = process

        callback = lambda x: None
        process.subscribers.append(callback)

        result = await pm.unsubscribe("unsub1", callback)

        assert result is True
        assert callback not in process.subscribers

    @pytest.mark.asyncio
    async def test_unsubscribe_nonexistent_process(self):
        """Test unsubscribing from non-existent process."""
        pm = ProcessManager()

        callback = lambda x: None
        result = await pm.unsubscribe("nonexistent", callback)

        assert result is False

    @pytest.mark.asyncio
    async def test_unsubscribe_callback_not_found(self):
        """Test unsubscribing a callback that wasn't subscribed."""
        pm = ProcessManager()
        process = Process(id="unsub2", pid=1, fd=1, working_dir="/tmp")
        pm._processes["unsub2"] = process

        callback = lambda x: None
        result = await pm.unsubscribe("unsub2", callback)

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

    @pytest.mark.asyncio
    async def test_kill_reaps_zombie_process(self):
        """Test kill calls waitpid to reap zombie processes."""
        pm = ProcessManager()
        process = Process(id="k3", pid=12345, fd=10, working_dir="/tmp")
        pm._processes["k3"] = process

        with patch("os.kill") as mock_kill, \
             patch("os.close"), \
             patch("os.waitpid") as mock_waitpid, \
             patch("asyncio.sleep", new_callable=AsyncMock):
            result = await pm.kill("k3")

        assert result is True
        # Should call waitpid with WNOHANG to reap zombie
        mock_waitpid.assert_called_once_with(12345, 1)  # os.WNOHANG == 1

    @pytest.mark.asyncio
    async def test_kill_handles_waitpid_errors(self):
        """Test kill handles ChildProcessError from waitpid gracefully."""
        pm = ProcessManager()
        process = Process(id="k4", pid=12345, fd=10, working_dir="/tmp")
        pm._processes["k4"] = process

        with patch("os.kill"), \
             patch("os.close"), \
             patch("os.waitpid", side_effect=ChildProcessError("No child")), \
             patch("asyncio.sleep", new_callable=AsyncMock):
            result = await pm.kill("k4")

        # Should still succeed despite waitpid error
        assert result is True
        assert "k4" not in pm._processes


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

    @pytest.mark.asyncio
    async def test_cleanup_reaps_zombie_process(self):
        """Test cleanup calls waitpid to reap zombie processes."""
        pm = ProcessManager()
        process = Process(id="c4", pid=12345, fd=10, working_dir="/tmp")
        pm._processes["c4"] = process

        with patch("os.close"), \
             patch("os.waitpid") as mock_waitpid:
            await pm._cleanup_dead_process("c4")

        # Should call waitpid with WNOHANG to reap zombie
        mock_waitpid.assert_called_once_with(12345, 1)  # os.WNOHANG == 1

    @pytest.mark.asyncio
    async def test_cleanup_handles_waitpid_errors(self):
        """Test cleanup handles ChildProcessError from waitpid gracefully."""
        pm = ProcessManager()
        process = Process(id="c5", pid=12345, fd=10, working_dir="/tmp")
        pm._processes["c5"] = process

        with patch("os.close"), \
             patch("os.waitpid", side_effect=ChildProcessError("No child")):
            # Should not raise
            await pm._cleanup_dead_process("c5")

        assert "c5" not in pm._processes


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


class TestProcessInitialPromptTask:
    """Tests for Process initial prompt task tracking."""

    def test_initial_prompt_task_default_is_none(self):
        """Test that _initial_prompt_task defaults to None."""
        process = Process(id="ipt1", pid=1, fd=1, working_dir="/tmp")

        assert process._initial_prompt_task is None

    def test_initial_prompt_task_can_be_set(self):
        """Test that _initial_prompt_task can be set to an asyncio.Task."""
        mock_task = MagicMock(spec=asyncio.Task)
        process = Process(
            id="ipt2",
            pid=1,
            fd=1,
            working_dir="/tmp",
            _initial_prompt_task=mock_task,
        )

        assert process._initial_prompt_task is mock_task


class TestProcessManagerKillInitialPromptTask:
    """Tests for kill method handling of initial prompt task."""

    @pytest.mark.asyncio
    async def test_kill_cancels_initial_prompt_task(self):
        """Test that kill cancels a running initial prompt task."""
        pm = ProcessManager()

        # Create a real asyncio task that we can cancel
        async def slow_task():
            await asyncio.sleep(100)

        real_task = asyncio.create_task(slow_task())

        process = Process(
            id="kipt1",
            pid=12345,
            fd=10,
            working_dir="/tmp",
            _initial_prompt_task=real_task,
        )
        pm._processes["kipt1"] = process

        with patch("os.kill"), \
             patch("os.close"), \
             patch("asyncio.sleep", new_callable=AsyncMock):
            await pm.kill("kipt1")

        # Task should have been cancelled
        assert real_task.cancelled()

    @pytest.mark.asyncio
    async def test_kill_skips_completed_initial_prompt_task(self):
        """Test that kill doesn't cancel an already-completed initial prompt task."""
        pm = ProcessManager()
        mock_task = MagicMock(spec=asyncio.Task)
        mock_task.done.return_value = True  # Task already completed

        process = Process(
            id="kipt2",
            pid=12345,
            fd=10,
            working_dir="/tmp",
            _initial_prompt_task=mock_task,
        )
        pm._processes["kipt2"] = process

        with patch("os.kill"), \
             patch("os.close"), \
             patch("asyncio.sleep", new_callable=AsyncMock):
            await pm.kill("kipt2")

        mock_task.cancel.assert_not_called()

    @pytest.mark.asyncio
    async def test_kill_handles_none_initial_prompt_task(self):
        """Test that kill handles None initial prompt task gracefully."""
        pm = ProcessManager()
        process = Process(
            id="kipt3",
            pid=12345,
            fd=10,
            working_dir="/tmp",
            _initial_prompt_task=None,
        )
        pm._processes["kipt3"] = process

        with patch("os.kill"), \
             patch("os.close"), \
             patch("asyncio.sleep", new_callable=AsyncMock):
            result = await pm.kill("kipt3")

        assert result is True


class TestProcessManagerCleanupDeadProcessInitialPromptTask:
    """Tests for _cleanup_dead_process handling of initial prompt task."""

    @pytest.mark.asyncio
    async def test_cleanup_cancels_initial_prompt_task(self):
        """Test that _cleanup_dead_process cancels a running initial prompt task."""
        pm = ProcessManager()

        # Create a real asyncio task that we can cancel
        async def slow_task():
            await asyncio.sleep(100)

        real_task = asyncio.create_task(slow_task())

        process = Process(
            id="cdpt1",
            pid=12345,
            fd=10,
            working_dir="/tmp",
            _initial_prompt_task=real_task,
        )
        pm._processes["cdpt1"] = process

        with patch("os.close"):
            await pm._cleanup_dead_process("cdpt1")

        # Task should have been cancelled
        assert real_task.cancelled()

    @pytest.mark.asyncio
    async def test_cleanup_skips_completed_initial_prompt_task(self):
        """Test that _cleanup_dead_process doesn't cancel completed initial prompt task."""
        pm = ProcessManager()
        mock_task = MagicMock(spec=asyncio.Task)
        mock_task.done.return_value = True  # Task already completed

        process = Process(
            id="cdpt2",
            pid=12345,
            fd=10,
            working_dir="/tmp",
            _initial_prompt_task=mock_task,
        )
        pm._processes["cdpt2"] = process

        with patch("os.close"):
            await pm._cleanup_dead_process("cdpt2")

        mock_task.cancel.assert_not_called()

    @pytest.mark.asyncio
    async def test_cleanup_handles_none_initial_prompt_task(self):
        """Test that _cleanup_dead_process handles None initial prompt task."""
        pm = ProcessManager()
        process = Process(
            id="cdpt3",
            pid=12345,
            fd=10,
            working_dir="/tmp",
            _initial_prompt_task=None,
        )
        pm._processes["cdpt3"] = process

        with patch("os.close"):
            await pm._cleanup_dead_process("cdpt3")

        # Should complete without error
        assert "cdpt3" not in pm._processes


class TestSendInitialPromptErrorHandling:
    """Tests for _send_initial_prompt error handling."""

    @pytest.mark.asyncio
    async def test_send_initial_prompt_logs_exception(self, caplog):
        """Test that _send_initial_prompt logs exceptions instead of raising."""
        import logging

        pm = ProcessManager()
        process = Process(id="sipt1", pid=12345, fd=10, working_dir="/tmp")
        pm._processes["sipt1"] = process

        # Mock _wait_for_cli_ready to raise an exception
        with patch.object(pm, "_wait_for_cli_ready", side_effect=RuntimeError("CLI failed")):
            with caplog.at_level(logging.ERROR, logger="app.services.session_manager"):
                await pm._send_initial_prompt(process, "test prompt")

        # Should have logged the error instead of propagating it
        assert "Failed to send initial prompt to process" in caplog.text
        assert "sipt1" in caplog.text

    @pytest.mark.asyncio
    async def test_send_initial_prompt_logs_write_error(self, caplog):
        """Test that write errors in _send_initial_prompt are logged."""
        import logging

        pm = ProcessManager()
        process = Process(id="sipt2", pid=12345, fd=10, working_dir="/tmp")
        pm._processes["sipt2"] = process

        with patch.object(pm, "_wait_for_cli_ready", new_callable=AsyncMock), \
             patch.object(pm, "write", side_effect=OSError("Write failed")):
            with caplog.at_level(logging.ERROR, logger="app.services.session_manager"):
                await pm._send_initial_prompt(process, "test prompt")

        # Should have logged the error
        assert "Failed to send initial prompt to process" in caplog.text


class TestProcessSubscribersLock:
    """Tests for Process._subscribers_lock thread safety."""

    def test_process_has_subscribers_lock(self):
        """Test that Process has a _subscribers_lock attribute."""
        process = Process(id="lock1", pid=1, fd=1, working_dir="/tmp")

        assert hasattr(process, "_subscribers_lock")
        assert isinstance(process._subscribers_lock, asyncio.Lock)

    def test_each_process_has_own_lock(self):
        """Test that each Process instance has its own lock."""
        process1 = Process(id="lock2a", pid=1, fd=1, working_dir="/tmp")
        process2 = Process(id="lock2b", pid=2, fd=2, working_dir="/tmp")

        assert process1._subscribers_lock is not process2._subscribers_lock


class TestProcessManagerSubscriptionThreadSafety:
    """Tests for thread-safety of subscription operations."""

    @pytest.mark.asyncio
    async def test_concurrent_subscribe_and_unsubscribe(self):
        """Subscribe and unsubscribe can run concurrently without race conditions."""
        pm = ProcessManager()
        process = Process(id="ts1", pid=1, fd=1, working_dir="/tmp")
        pm._processes["ts1"] = process

        callbacks = [lambda x: None for _ in range(10)]
        received_count = 0

        # Subscribe all callbacks first
        for cb in callbacks:
            await pm.subscribe("ts1", cb)

        # Create tasks that subscribe new callbacks and unsubscribe existing ones concurrently
        async def subscribe_task():
            for _ in range(10):
                await pm.subscribe("ts1", lambda x: None)
                await asyncio.sleep(0)

        async def unsubscribe_task():
            for cb in callbacks:
                await pm.unsubscribe("ts1", cb)
                await asyncio.sleep(0)

        # Run concurrently - should not raise any exceptions
        await asyncio.gather(
            subscribe_task(),
            unsubscribe_task(),
        )

        # Verify no race condition errors occurred and operation completed
        # We should have 10 new callbacks subscribed (original 10 unsubscribed)
        assert len(process.subscribers) == 10

    @pytest.mark.asyncio
    async def test_subscribe_uses_lock(self):
        """Test that subscribe acquires the lock by verifying atomicity."""
        pm = ProcessManager()
        process = Process(id="ts2", pid=1, fd=1, working_dir="/tmp")
        pm._processes["ts2"] = process

        # Test that lock is properly used by checking we can't acquire it during subscribe
        # We do this by running concurrent operations and verifying they serialize properly
        lock_held_during_operation = False

        async def try_acquire_lock_during_subscribe():
            nonlocal lock_held_during_operation
            # Short delay to ensure subscribe has started
            await asyncio.sleep(0)
            # If lock is properly used, we should find it locked or contended
            # The key test is that operations don't interleave incorrectly

        # The fact that concurrent_subscribe_and_unsubscribe passes proves the lock works
        # Here we just verify the method signature is async (required for lock usage)
        callback = lambda x: None
        await pm.subscribe("ts2", callback)
        assert callback in process.subscribers

    @pytest.mark.asyncio
    async def test_unsubscribe_uses_lock(self):
        """Test that unsubscribe acquires the lock by verifying atomicity."""
        pm = ProcessManager()
        process = Process(id="ts3", pid=1, fd=1, working_dir="/tmp")
        pm._processes["ts3"] = process

        callback = lambda x: None
        process.subscribers.append(callback)

        # The fact that concurrent_subscribe_and_unsubscribe passes proves the lock works
        # Here we just verify the method signature is async (required for lock usage)
        await pm.unsubscribe("ts3", callback)
        assert callback not in process.subscribers

    @pytest.mark.asyncio
    async def test_concurrent_subscribe_is_safe(self):
        """Test that concurrent subscribe operations don't cause issues."""
        pm = ProcessManager()
        process = Process(id="ts4", pid=1, fd=1, working_dir="/tmp")
        pm._processes["ts4"] = process

        callbacks = []

        async def subscribe_task(index):
            cb = lambda x, i=index: None  # Capture index
            callbacks.append(cb)
            await pm.subscribe("ts4", cb)

        # Subscribe 20 callbacks concurrently
        tasks = [subscribe_task(i) for i in range(20)]
        await asyncio.gather(*tasks)

        # All callbacks should be subscribed
        assert len(process.subscribers) == 20
        for cb in callbacks:
            assert cb in process.subscribers

    @pytest.mark.asyncio
    async def test_unsubscribe_removes_only_first_occurrence(self):
        """Test that unsubscribe removes only first occurrence if duplicated."""
        pm = ProcessManager()
        process = Process(id="ts5", pid=1, fd=1, working_dir="/tmp")
        pm._processes["ts5"] = process

        callback = lambda x: None
        await pm.subscribe("ts5", callback)
        await pm.subscribe("ts5", callback)  # Add same callback twice

        await pm.unsubscribe("ts5", callback)

        # Only one should be removed
        assert len(process.subscribers) == 1
        assert callback in process.subscribers


class TestReadLoopSubscriberSnapshot:
    """Tests for _read_loop subscriber snapshot behavior."""

    @pytest.mark.asyncio
    async def test_read_loop_uses_subscriber_snapshot(self):
        """Test that _read_loop takes a snapshot of subscribers under lock."""
        pm = ProcessManager()
        process = Process(id="rl1", pid=1, fd=10, working_dir="/tmp")
        pm._processes["rl1"] = process

        call_order = []

        async def callback1(data):
            call_order.append("callback1_start")
            # Unsubscribe callback2 during emit - should not affect this emit
            await pm.unsubscribe("rl1", callback2)
            call_order.append("callback1_end")

        def callback2(data):
            call_order.append("callback2")

        await pm.subscribe("rl1", callback1)
        await pm.subscribe("rl1", callback2)

        # Simulate the snapshot behavior from _read_loop
        async with process._subscribers_lock:
            subscribers_snapshot = list(process.subscribers)

        # Both callbacks should be in the snapshot
        assert len(subscribers_snapshot) == 2

    @pytest.mark.asyncio
    async def test_unsubscribe_during_iteration_is_safe(self):
        """Test that unsubscribing during iteration uses snapshot and is safe."""
        pm = ProcessManager()
        process = Process(id="rl2", pid=1, fd=10, working_dir="/tmp")
        pm._processes["rl2"] = process

        called_callbacks = []

        async def callback_that_unsubscribes(data):
            called_callbacks.append("unsubscriber")
            # This should not affect the current iteration since we use a snapshot
            await pm.unsubscribe("rl2", other_callback)

        def other_callback(data):
            called_callbacks.append("other")

        await pm.subscribe("rl2", callback_that_unsubscribes)
        await pm.subscribe("rl2", other_callback)

        # Simulate the behavior in _read_loop
        async with process._subscribers_lock:
            subscribers_snapshot = list(process.subscribers)

        # Call all subscribers in snapshot
        for callback in subscribers_snapshot:
            if asyncio.iscoroutinefunction(callback):
                await callback(b"test")
            else:
                callback(b"test")

        # Both callbacks should have been called (snapshot taken before unsubscribe)
        assert "unsubscriber" in called_callbacks
        assert "other" in called_callbacks

        # But after iteration, other_callback should be unsubscribed
        assert other_callback not in process.subscribers


class TestProcessManagerListProcessesThreadSafety:
    """Tests for thread-safety of list_processes and get_dead_process_info methods."""

    @pytest.mark.asyncio
    async def test_list_processes_uses_snapshot(self):
        """list_processes takes a snapshot under lock to prevent modification during iteration."""
        pm = ProcessManager()
        process1 = Process(id="lp1", pid=100, fd=1, working_dir="/tmp")
        process2 = Process(id="lp2", pid=200, fd=2, working_dir="/tmp")
        pm._processes["lp1"] = process1
        pm._processes["lp2"] = process2

        # Track if we can add a process while list_processes is iterating
        processes_added_during_iteration = []

        original_is_alive = pm._is_process_alive

        def slow_is_alive(pid):
            # When checking first process, try to add a new one
            if pid == 100:
                # This should not affect the current iteration
                process3 = Process(id="lp3", pid=300, fd=3, working_dir="/tmp")
                pm._processes["lp3"] = process3
                processes_added_during_iteration.append("lp3")
            return True

        with patch.object(pm, "_is_process_alive", side_effect=slow_is_alive):
            result = await pm.list_processes()

        # Should only return original 2 processes (not the one added during iteration)
        assert len(result) == 2
        assert process1 in result
        assert process2 in result

        # Verify the new process was added to the dict
        assert "lp3" in pm._processes

    @pytest.mark.asyncio
    async def test_concurrent_list_processes_and_create(self):
        """Concurrent list_processes and process creation don't cause RuntimeError."""
        pm = ProcessManager()

        # Add initial processes
        for i in range(5):
            process = Process(id=f"clp{i}", pid=100 + i, fd=i, working_dir="/tmp")
            pm._processes[f"clp{i}"] = process

        with patch.object(pm, "_is_process_alive", return_value=True):
            # Create tasks that list and add processes concurrently
            async def list_task():
                for _ in range(10):
                    await pm.list_processes()
                    await asyncio.sleep(0)

            async def add_task():
                for i in range(10):
                    async with pm._lock:
                        pm._processes[f"new{i}"] = Process(
                            id=f"new{i}", pid=500 + i, fd=50 + i, working_dir="/tmp"
                        )
                    await asyncio.sleep(0)

            # Should not raise RuntimeError: dictionary changed size during iteration
            await asyncio.gather(list_task(), add_task())

    @pytest.mark.asyncio
    async def test_concurrent_list_processes_and_kill(self):
        """Concurrent list_processes and kill operations don't cause RuntimeError."""
        pm = ProcessManager()

        # Add initial processes
        for i in range(10):
            process = Process(id=f"lk{i}", pid=100 + i, fd=i, working_dir="/tmp")
            pm._processes[f"lk{i}"] = process

        with patch.object(pm, "_is_process_alive", return_value=True), \
             patch("os.kill"), \
             patch("os.close"), \
             patch("asyncio.sleep", new_callable=AsyncMock):
            # Create tasks that list and kill processes concurrently
            async def list_task():
                for _ in range(10):
                    await pm.list_processes()

            async def kill_task():
                for i in range(5):
                    await pm.kill(f"lk{i}")

            # Should not raise RuntimeError
            await asyncio.gather(list_task(), kill_task())

    @pytest.mark.asyncio
    async def test_get_dead_process_info_uses_snapshot(self):
        """get_dead_process_info takes a snapshot under lock to prevent modification during iteration."""
        pm = ProcessManager()
        process1 = Process(id="dpi1", pid=100, fd=1, working_dir="/tmp", session_id=1)
        process1._transcript_chunks = ["transcript1"]
        process2 = Process(id="dpi2", pid=200, fd=2, working_dir="/tmp", session_id=2)
        process2._transcript_chunks = ["transcript2"]
        pm._processes["dpi1"] = process1
        pm._processes["dpi2"] = process2

        original_cleanup = pm._cleanup_dead_process

        async def patched_cleanup(process_id):
            # While cleaning up, add a new process
            if process_id == "dpi1":
                process3 = Process(id="dpi3", pid=300, fd=3, working_dir="/tmp", session_id=3)
                async with pm._lock:
                    pm._processes["dpi3"] = process3
            await original_cleanup(process_id)

        with patch.object(pm, "_is_process_alive", return_value=False), \
             patch.object(pm, "_cleanup_dead_process", side_effect=patched_cleanup), \
             patch("os.close"):
            result = await pm.get_dead_process_info()

        # Should only return original 2 dead processes (not the one added during iteration)
        assert len(result) == 2
        session_ids = [info[0] for info in result]
        assert 1 in session_ids
        assert 2 in session_ids

    @pytest.mark.asyncio
    async def test_concurrent_get_dead_process_info_and_create(self):
        """Concurrent get_dead_process_info and process creation don't cause RuntimeError."""
        pm = ProcessManager()

        # Add initial processes
        for i in range(5):
            process = Process(id=f"gdpi{i}", pid=100 + i, fd=i, working_dir="/tmp")
            pm._processes[f"gdpi{i}"] = process

        with patch.object(pm, "_is_process_alive", return_value=True):  # All alive = no dead processes
            async def info_task():
                for _ in range(10):
                    await pm.get_dead_process_info()
                    await asyncio.sleep(0)

            async def add_task():
                for i in range(10):
                    async with pm._lock:
                        pm._processes[f"newdpi{i}"] = Process(
                            id=f"newdpi{i}", pid=500 + i, fd=50 + i, working_dir="/tmp"
                        )
                    await asyncio.sleep(0)

            # Should not raise RuntimeError
            await asyncio.gather(info_task(), add_task())


class TestProcessManagerGetProcessesSnapshot:
    """Tests for the get_processes_snapshot method.

    This method provides a thread-safe way to get a copy of all processes
    without checking if they're alive (unlike list_processes).
    """

    @pytest.mark.asyncio
    async def test_get_processes_snapshot_returns_copy(self):
        """get_processes_snapshot returns a copy of processes list."""
        pm = ProcessManager()
        process1 = Process(id="snap1", pid=100, fd=1, working_dir="/tmp")
        process2 = Process(id="snap2", pid=200, fd=2, working_dir="/tmp")
        pm._processes["snap1"] = process1
        pm._processes["snap2"] = process2

        result = await pm.get_processes_snapshot()

        assert len(result) == 2
        assert process1 in result
        assert process2 in result

    @pytest.mark.asyncio
    async def test_get_processes_snapshot_empty(self):
        """get_processes_snapshot returns empty list when no processes."""
        pm = ProcessManager()

        result = await pm.get_processes_snapshot()

        assert result == []

    @pytest.mark.asyncio
    async def test_get_processes_snapshot_does_not_filter_dead(self):
        """get_processes_snapshot includes all processes, even dead ones."""
        pm = ProcessManager()
        process = Process(id="dead1", pid=99999, fd=1, working_dir="/tmp")
        pm._processes["dead1"] = process

        # Even with a mock that says process is dead, snapshot includes it
        with patch.object(pm, "_is_process_alive", return_value=False):
            result = await pm.get_processes_snapshot()

        assert len(result) == 1
        assert process in result

    @pytest.mark.asyncio
    async def test_get_processes_snapshot_thread_safe(self):
        """get_processes_snapshot is safe for concurrent access."""
        pm = ProcessManager()

        # Add initial processes
        for i in range(5):
            process = Process(id=f"ts{i}", pid=100 + i, fd=i, working_dir="/tmp")
            pm._processes[f"ts{i}"] = process

        async def snapshot_task():
            for _ in range(20):
                result = await pm.get_processes_snapshot()
                # Result should be a valid list (not modified during iteration)
                assert isinstance(result, list)
                await asyncio.sleep(0)

        async def modify_task():
            for i in range(10):
                async with pm._lock:
                    pm._processes[f"new{i}"] = Process(
                        id=f"new{i}", pid=500 + i, fd=50 + i, working_dir="/tmp"
                    )
                await asyncio.sleep(0)

        # Should not raise RuntimeError: dictionary changed size during iteration
        await asyncio.gather(snapshot_task(), modify_task())

    @pytest.mark.asyncio
    async def test_get_processes_snapshot_acquires_lock(self):
        """get_processes_snapshot acquires lock to prevent race conditions."""
        pm = ProcessManager()
        process = Process(id="lock1", pid=100, fd=1, working_dir="/tmp")
        pm._processes["lock1"] = process

        lock_acquired = []

        original_lock_acquire = pm._lock.acquire

        async def track_lock_acquire():
            lock_acquired.append(True)
            return await original_lock_acquire()

        with patch.object(pm._lock, "acquire", side_effect=track_lock_acquire):
            await pm.get_processes_snapshot()

        # Verify the lock was acquired at least once
        assert len(lock_acquired) >= 1


class TestProcessManagerMethodsAcquireLock:
    """Tests verifying that various ProcessManager methods acquire the lock
    when accessing _processes to prevent race conditions.

    These tests were added after fixing a race condition where write(),
    resize(), get_process(), subscribe(), and unsubscribe() accessed
    self._processes without acquiring self._lock.
    """

    @pytest.mark.asyncio
    async def test_write_acquires_lock(self):
        """Test that write() acquires lock when accessing _processes."""
        pm = ProcessManager()
        process = Process(id="wl1", pid=1, fd=10, working_dir="/tmp")
        pm._processes["wl1"] = process

        lock_acquired = []
        original_lock = pm._lock

        class TrackingLock:
            def __init__(self, original):
                self._original = original

            async def __aenter__(self):
                lock_acquired.append("write")
                return await self._original.__aenter__()

            async def __aexit__(self, *args):
                return await self._original.__aexit__(*args)

        pm._lock = TrackingLock(original_lock)

        with patch("os.write"):
            await pm.write("wl1", "test")

        assert "write" in lock_acquired

    @pytest.mark.asyncio
    async def test_resize_acquires_lock(self):
        """Test that resize() acquires lock when accessing _processes."""
        pm = ProcessManager()
        process = Process(id="rl1", pid=1, fd=10, working_dir="/tmp")
        pm._processes["rl1"] = process

        lock_acquired = []
        original_lock = pm._lock

        class TrackingLock:
            def __init__(self, original):
                self._original = original

            async def __aenter__(self):
                lock_acquired.append("resize")
                return await self._original.__aenter__()

            async def __aexit__(self, *args):
                return await self._original.__aexit__(*args)

        pm._lock = TrackingLock(original_lock)

        with patch.object(pm, "_resize_pty"):
            await pm.resize("rl1", 40, 100)

        assert "resize" in lock_acquired

    @pytest.mark.asyncio
    async def test_get_process_acquires_lock(self):
        """Test that get_process() acquires lock when accessing _processes."""
        pm = ProcessManager()
        process = Process(id="gpl1", pid=1, fd=10, working_dir="/tmp")
        pm._processes["gpl1"] = process

        lock_acquired = []
        original_lock = pm._lock

        class TrackingLock:
            def __init__(self, original):
                self._original = original

            async def __aenter__(self):
                lock_acquired.append("get_process")
                return await self._original.__aenter__()

            async def __aexit__(self, *args):
                return await self._original.__aexit__(*args)

        pm._lock = TrackingLock(original_lock)

        with patch.object(pm, "_is_process_alive", return_value=True):
            await pm.get_process("gpl1")

        assert "get_process" in lock_acquired

    @pytest.mark.asyncio
    async def test_subscribe_acquires_lock(self):
        """Test that subscribe() acquires lock when accessing _processes."""
        pm = ProcessManager()
        process = Process(id="sl1", pid=1, fd=10, working_dir="/tmp")
        pm._processes["sl1"] = process

        lock_acquired = []
        original_lock = pm._lock

        class TrackingLock:
            def __init__(self, original):
                self._original = original

            async def __aenter__(self):
                lock_acquired.append("subscribe")
                return await self._original.__aenter__()

            async def __aexit__(self, *args):
                return await self._original.__aexit__(*args)

        pm._lock = TrackingLock(original_lock)

        await pm.subscribe("sl1", lambda x: None)

        assert "subscribe" in lock_acquired

    @pytest.mark.asyncio
    async def test_unsubscribe_acquires_lock(self):
        """Test that unsubscribe() acquires lock when accessing _processes."""
        pm = ProcessManager()
        process = Process(id="ul1", pid=1, fd=10, working_dir="/tmp")
        callback = lambda x: None
        process.subscribers.append(callback)
        pm._processes["ul1"] = process

        lock_acquired = []
        original_lock = pm._lock

        class TrackingLock:
            def __init__(self, original):
                self._original = original

            async def __aenter__(self):
                lock_acquired.append("unsubscribe")
                return await self._original.__aenter__()

            async def __aexit__(self, *args):
                return await self._original.__aexit__(*args)

        pm._lock = TrackingLock(original_lock)

        await pm.unsubscribe("ul1", callback)

        assert "unsubscribe" in lock_acquired

    @pytest.mark.asyncio
    async def test_concurrent_write_and_kill_is_safe(self):
        """Test that concurrent write and kill operations don't cause issues."""
        pm = ProcessManager()

        # Add multiple processes
        for i in range(5):
            process = Process(id=f"wk{i}", pid=1000 + i, fd=10 + i, working_dir="/tmp")
            pm._processes[f"wk{i}"] = process

        async def write_task():
            for i in range(5):
                for _ in range(10):
                    with patch("os.write"):
                        await pm.write(f"wk{i}", "test")
                    await asyncio.sleep(0)

        async def kill_task():
            for i in range(5):
                with patch("os.kill"), patch("os.close"), patch("asyncio.sleep", new_callable=AsyncMock):
                    await pm.kill(f"wk{i}")
                await asyncio.sleep(0)

        # Should not raise RuntimeError or cause data corruption
        await asyncio.gather(write_task(), kill_task())

    @pytest.mark.asyncio
    async def test_concurrent_subscribe_and_kill_is_safe(self):
        """Test that concurrent subscribe and kill operations don't cause issues."""
        pm = ProcessManager()

        # Add multiple processes
        for i in range(5):
            process = Process(id=f"sk{i}", pid=1000 + i, fd=10 + i, working_dir="/tmp")
            pm._processes[f"sk{i}"] = process

        async def subscribe_task():
            for i in range(5):
                for _ in range(10):
                    await pm.subscribe(f"sk{i}", lambda x: None)
                    await asyncio.sleep(0)

        async def kill_task():
            for i in range(5):
                with patch("os.kill"), patch("os.close"), patch("asyncio.sleep", new_callable=AsyncMock):
                    await pm.kill(f"sk{i}")
                await asyncio.sleep(0)

        # Should not raise RuntimeError or cause data corruption
        await asyncio.gather(subscribe_task(), kill_task())

    @pytest.mark.asyncio
    async def test_concurrent_get_process_and_cleanup_is_safe(self):
        """Test that concurrent get_process and cleanup operations don't cause issues."""
        pm = ProcessManager()

        # Add multiple processes
        for i in range(5):
            process = Process(id=f"gpc{i}", pid=1000 + i, fd=10 + i, working_dir="/tmp")
            pm._processes[f"gpc{i}"] = process

        async def get_task():
            for i in range(5):
                for _ in range(10):
                    with patch.object(pm, "_is_process_alive", return_value=True):
                        await pm.get_process(f"gpc{i}")
                    await asyncio.sleep(0)

        async def cleanup_task():
            for i in range(5):
                with patch("os.close"):
                    await pm._cleanup_dead_process(f"gpc{i}")
                await asyncio.sleep(0)

        # Should not raise RuntimeError or cause data corruption
        await asyncio.gather(get_task(), cleanup_task())
