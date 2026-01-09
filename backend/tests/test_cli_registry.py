"""Tests for CLI adapter registry functions.

These tests focus on the registry module's core functionality:
- Adapter retrieval and caching
- Thread-safety of adapter creation
- CLI installation detection
- Registry utility functions
"""

import concurrent.futures
import threading
import pytest
from unittest.mock import patch

from app.cli import (
    CLIAdapter,
    CLIType,
    get_adapter,
    get_all_adapters,
    get_default_adapter,
    is_cli_installed,
    get_installed_adapters,
    get_adapter_by_command,
    get_cli_info,
    clear_adapter_cache,
)
from app.cli.claude_adapter import ClaudeAdapter
from app.cli.gemini_adapter import GeminiAdapter
from app.cli.codex_adapter import CodexAdapter


@pytest.fixture(autouse=True)
def clean_adapter_cache():
    """Clear adapter cache before and after each test for isolation."""
    clear_adapter_cache()
    yield
    clear_adapter_cache()


class TestGetAdapter:
    """Tests for get_adapter function."""

    def test_get_adapter_by_enum_claude(self):
        """Can get Claude adapter by CLIType enum."""
        adapter = get_adapter(CLIType.CLAUDE)
        assert isinstance(adapter, ClaudeAdapter)
        assert adapter.cli_type == CLIType.CLAUDE

    def test_get_adapter_by_enum_gemini(self):
        """Can get Gemini adapter by CLIType enum."""
        adapter = get_adapter(CLIType.GEMINI)
        assert isinstance(adapter, GeminiAdapter)
        assert adapter.cli_type == CLIType.GEMINI

    def test_get_adapter_by_enum_codex(self):
        """Can get Codex adapter by CLIType enum."""
        adapter = get_adapter(CLIType.CODEX)
        assert isinstance(adapter, CodexAdapter)
        assert adapter.cli_type == CLIType.CODEX

    def test_get_adapter_by_string_claude(self):
        """Can get Claude adapter by string value."""
        adapter = get_adapter("claude")
        assert isinstance(adapter, ClaudeAdapter)

    def test_get_adapter_by_string_gemini(self):
        """Can get Gemini adapter by string value."""
        adapter = get_adapter("gemini")
        assert isinstance(adapter, GeminiAdapter)

    def test_get_adapter_by_string_codex(self):
        """Can get Codex adapter by string value."""
        adapter = get_adapter("codex")
        assert isinstance(adapter, CodexAdapter)

    def test_get_adapter_invalid_string_raises(self):
        """Raises ValueError for invalid string CLI type."""
        with pytest.raises(ValueError, match="Unknown CLI type"):
            get_adapter("invalid")

    def test_get_adapter_invalid_string_empty(self):
        """Raises ValueError for empty string."""
        with pytest.raises(ValueError, match="Unknown CLI type"):
            get_adapter("")

    def test_get_adapter_case_sensitive(self):
        """CLI type strings are case-sensitive."""
        with pytest.raises(ValueError, match="Unknown CLI type"):
            get_adapter("CLAUDE")
        with pytest.raises(ValueError, match="Unknown CLI type"):
            get_adapter("Claude")


class TestAdapterCaching:
    """Tests for adapter singleton caching behavior."""

    def test_adapter_is_cached(self):
        """Same adapter instance is returned for same type."""
        adapter1 = get_adapter(CLIType.CLAUDE)
        adapter2 = get_adapter(CLIType.CLAUDE)
        assert adapter1 is adapter2

    def test_different_types_return_different_adapters(self):
        """Different CLI types return different adapter instances."""
        claude = get_adapter(CLIType.CLAUDE)
        gemini = get_adapter(CLIType.GEMINI)
        codex = get_adapter(CLIType.CODEX)

        assert claude is not gemini
        assert claude is not codex
        assert gemini is not codex

    def test_string_and_enum_return_same_adapter(self):
        """String and enum access returns same cached adapter."""
        adapter_enum = get_adapter(CLIType.CLAUDE)
        adapter_str = get_adapter("claude")
        assert adapter_enum is adapter_str

    def test_clear_cache_forces_new_instance(self):
        """Clearing cache causes new adapter instance to be created."""
        adapter1 = get_adapter(CLIType.CLAUDE)
        clear_adapter_cache()
        adapter2 = get_adapter(CLIType.CLAUDE)

        # Should be different instances (but equivalent)
        assert adapter1 is not adapter2
        assert type(adapter1) is type(adapter2)


class TestThreadSafety:
    """Tests for thread-safe adapter creation."""

    def test_concurrent_get_adapter_same_type(self):
        """Concurrent calls for same type return same adapter instance."""
        results = []
        errors = []
        num_threads = 20

        def get_claude_adapter():
            try:
                adapter = get_adapter(CLIType.CLAUDE)
                results.append(adapter)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=get_claude_adapter) for _ in range(num_threads)]

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Errors occurred: {errors}"
        assert len(results) == num_threads

        # All results should be the same instance
        first_adapter = results[0]
        for adapter in results[1:]:
            assert adapter is first_adapter

    def test_concurrent_get_adapter_different_types(self):
        """Concurrent calls for different types work correctly."""
        results = {CLIType.CLAUDE: [], CLIType.GEMINI: [], CLIType.CODEX: []}
        errors = []

        def get_adapter_for_type(cli_type):
            try:
                adapter = get_adapter(cli_type)
                results[cli_type].append(adapter)
            except Exception as e:
                errors.append(e)

        threads = []
        for _ in range(10):
            for cli_type in CLIType:
                threads.append(threading.Thread(target=get_adapter_for_type, args=(cli_type,)))

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Errors occurred: {errors}"

        # Each type should have consistent results
        for cli_type, adapters in results.items():
            assert len(adapters) == 10
            first = adapters[0]
            for adapter in adapters[1:]:
                assert adapter is first

    def test_concurrent_get_adapter_with_executor(self):
        """ThreadPoolExecutor access returns consistent adapters."""
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(get_adapter, CLIType.CLAUDE) for _ in range(50)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        # All should be same instance
        first = results[0]
        for adapter in results[1:]:
            assert adapter is first

    def test_clear_cache_thread_safety(self):
        """Clearing cache while getting adapters doesn't cause errors."""
        errors = []

        def get_adapters_loop():
            for _ in range(100):
                try:
                    get_adapter(CLIType.CLAUDE)
                    get_adapter(CLIType.GEMINI)
                    get_adapter(CLIType.CODEX)
                except Exception as e:
                    errors.append(e)

        def clear_cache_loop():
            for _ in range(50):
                try:
                    clear_adapter_cache()
                except Exception as e:
                    errors.append(e)

        threads = [
            threading.Thread(target=get_adapters_loop),
            threading.Thread(target=get_adapters_loop),
            threading.Thread(target=clear_cache_loop),
        ]

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Errors occurred: {errors}"


class TestGetDefaultAdapter:
    """Tests for get_default_adapter function."""

    def test_returns_claude_adapter(self):
        """Default adapter is Claude."""
        adapter = get_default_adapter()
        assert isinstance(adapter, ClaudeAdapter)
        assert adapter.cli_type == CLIType.CLAUDE

    def test_returns_cached_adapter(self):
        """Default adapter is cached like other adapters."""
        default = get_default_adapter()
        explicit = get_adapter(CLIType.CLAUDE)
        assert default is explicit


class TestGetAllAdapters:
    """Tests for get_all_adapters function."""

    def test_returns_all_three_adapters(self):
        """Returns exactly three adapters."""
        adapters = get_all_adapters()
        assert len(adapters) == 3

    def test_returns_correct_types(self):
        """Returns one of each CLI type."""
        adapters = get_all_adapters()
        types = {a.cli_type for a in adapters}
        assert types == {CLIType.CLAUDE, CLIType.GEMINI, CLIType.CODEX}

    def test_returns_adapter_instances(self):
        """Returns CLIAdapter instances."""
        adapters = get_all_adapters()
        for adapter in adapters:
            assert isinstance(adapter, CLIAdapter)

    def test_populates_cache(self):
        """Getting all adapters populates the cache."""
        _ = get_all_adapters()

        # Subsequent individual gets should return cached instances
        claude = get_adapter(CLIType.CLAUDE)
        gemini = get_adapter(CLIType.GEMINI)
        codex = get_adapter(CLIType.CODEX)

        # All should be cached instances
        all_adapters = get_all_adapters()
        assert claude in all_adapters
        assert gemini in all_adapters
        assert codex in all_adapters


class TestIsCLIInstalled:
    """Tests for is_cli_installed function."""

    def test_returns_bool(self):
        """Always returns a boolean."""
        result = is_cli_installed(CLIType.CLAUDE)
        assert isinstance(result, bool)

    def test_accepts_enum(self):
        """Accepts CLIType enum."""
        result = is_cli_installed(CLIType.CLAUDE)
        assert isinstance(result, bool)

    def test_accepts_string(self):
        """Accepts string CLI type."""
        result = is_cli_installed("claude")
        assert isinstance(result, bool)

    def test_returns_true_when_command_found(self):
        """Returns True when shutil.which finds the command."""
        with patch("app.cli.registry.shutil.which", return_value="/usr/bin/claude"):
            result = is_cli_installed(CLIType.CLAUDE)
            assert result is True

    def test_returns_false_when_command_not_found(self):
        """Returns False when shutil.which returns None."""
        with patch("app.cli.registry.shutil.which", return_value=None):
            result = is_cli_installed(CLIType.CLAUDE)
            assert result is False

    def test_checks_correct_command_for_each_type(self):
        """Checks the correct command name for each CLI type."""
        with patch("app.cli.registry.shutil.which") as mock_which:
            mock_which.return_value = None

            is_cli_installed(CLIType.CLAUDE)
            mock_which.assert_called_with("claude")

            mock_which.reset_mock()
            is_cli_installed(CLIType.GEMINI)
            mock_which.assert_called_with("gemini")

            mock_which.reset_mock()
            is_cli_installed(CLIType.CODEX)
            mock_which.assert_called_with("codex")


class TestGetInstalledAdapters:
    """Tests for get_installed_adapters function."""

    def test_returns_empty_when_none_installed(self):
        """Returns empty list when no CLIs installed."""
        with patch("app.cli.registry.shutil.which", return_value=None):
            result = get_installed_adapters()
            assert result == []

    def test_returns_all_when_all_installed(self):
        """Returns all adapters when all CLIs installed."""
        with patch("app.cli.registry.shutil.which", return_value="/usr/bin/cmd"):
            result = get_installed_adapters()
            assert len(result) == 3
            types = {a.cli_type for a in result}
            assert types == {CLIType.CLAUDE, CLIType.GEMINI, CLIType.CODEX}

    def test_returns_only_installed(self):
        """Returns only adapters for installed CLIs."""

        def which_side_effect(cmd):
            return "/usr/bin/claude" if cmd == "claude" else None

        with patch("app.cli.registry.shutil.which", side_effect=which_side_effect):
            result = get_installed_adapters()
            assert len(result) == 1
            assert result[0].cli_type == CLIType.CLAUDE

    def test_returns_multiple_installed(self):
        """Returns multiple adapters when multiple CLIs installed."""

        def which_side_effect(cmd):
            if cmd in ("claude", "gemini"):
                return f"/usr/bin/{cmd}"
            return None

        with patch("app.cli.registry.shutil.which", side_effect=which_side_effect):
            result = get_installed_adapters()
            assert len(result) == 2
            types = {a.cli_type for a in result}
            assert types == {CLIType.CLAUDE, CLIType.GEMINI}

    def test_returns_adapter_instances(self):
        """Returns CLIAdapter instances, not just types."""
        with patch("app.cli.registry.shutil.which", return_value="/usr/bin/cmd"):
            result = get_installed_adapters()
            for adapter in result:
                assert isinstance(adapter, CLIAdapter)


class TestGetAdapterByCommand:
    """Tests for get_adapter_by_command function."""

    def test_claude_command(self):
        """Returns Claude adapter for 'claude' command."""
        adapter = get_adapter_by_command("claude")
        assert adapter is not None
        assert isinstance(adapter, ClaudeAdapter)

    def test_gemini_command(self):
        """Returns Gemini adapter for 'gemini' command."""
        adapter = get_adapter_by_command("gemini")
        assert adapter is not None
        assert isinstance(adapter, GeminiAdapter)

    def test_codex_command(self):
        """Returns Codex adapter for 'codex' command."""
        adapter = get_adapter_by_command("codex")
        assert adapter is not None
        assert isinstance(adapter, CodexAdapter)

    def test_unknown_command_returns_none(self):
        """Returns None for unknown command."""
        adapter = get_adapter_by_command("unknown")
        assert adapter is None

    def test_empty_string_returns_none(self):
        """Returns None for empty string."""
        adapter = get_adapter_by_command("")
        assert adapter is None

    def test_case_sensitive(self):
        """Command matching is case-sensitive."""
        assert get_adapter_by_command("Claude") is None
        assert get_adapter_by_command("CLAUDE") is None
        assert get_adapter_by_command("Gemini") is None
        assert get_adapter_by_command("CODEX") is None

    def test_exact_match_required(self):
        """Command matching requires exact match."""
        assert get_adapter_by_command("claude-code") is None
        assert get_adapter_by_command("my-claude") is None
        assert get_adapter_by_command("claude ") is None
        assert get_adapter_by_command(" claude") is None
        assert get_adapter_by_command("gemini-cli") is None


class TestGetCLIInfo:
    """Tests for get_cli_info function."""

    def test_returns_info_for_all_clis(self):
        """Returns info for all three CLIs."""
        info = get_cli_info()
        assert len(info) == 3

    def test_info_structure(self):
        """Each info dict has required keys."""
        info = get_cli_info()
        for cli_info in info:
            assert "type" in cli_info
            assert "name" in cli_info
            assert "command" in cli_info
            assert "installed" in cli_info
            assert "capabilities" in cli_info

    def test_capabilities_structure(self):
        """Capabilities dict has required keys."""
        info = get_cli_info()
        for cli_info in info:
            caps = cli_info["capabilities"]
            assert "headless" in caps
            assert "resume" in caps
            assert "session_id" in caps
            assert "tool_allowlist" in caps
            assert "permission_modes" in caps
            assert "max_turns" in caps

    def test_type_values(self):
        """Type values match CLI type enum values."""
        info = get_cli_info()
        types = {cli["type"] for cli in info}
        assert types == {"claude", "gemini", "codex"}

    def test_installed_is_bool(self):
        """Installed field is always boolean."""
        info = get_cli_info()
        for cli_info in info:
            assert isinstance(cli_info["installed"], bool)

    def test_capabilities_are_bool(self):
        """Capability values are booleans."""
        info = get_cli_info()
        for cli_info in info:
            caps = cli_info["capabilities"]
            for key, value in caps.items():
                assert isinstance(value, bool), f"{key} should be bool, got {type(value)}"


class TestClearAdapterCache:
    """Tests for clear_adapter_cache function."""

    def test_clears_all_adapters(self):
        """Clearing cache removes all adapters."""
        # Populate cache
        _ = get_all_adapters()

        # Clear
        clear_adapter_cache()

        # Getting adapters should create new instances
        adapter1 = get_adapter(CLIType.CLAUDE)
        clear_adapter_cache()
        adapter2 = get_adapter(CLIType.CLAUDE)

        assert adapter1 is not adapter2

    def test_safe_to_call_on_empty_cache(self):
        """Clearing empty cache doesn't raise."""
        # Cache is already empty due to fixture
        clear_adapter_cache()  # Should not raise
        clear_adapter_cache()  # Multiple clears should be fine

    def test_subsequent_gets_work_after_clear(self):
        """Can get adapters normally after clearing cache."""
        get_adapter(CLIType.CLAUDE)
        clear_adapter_cache()

        # Should work fine after clear
        adapter = get_adapter(CLIType.CLAUDE)
        assert isinstance(adapter, ClaudeAdapter)
