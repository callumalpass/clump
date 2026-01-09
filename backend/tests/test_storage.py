"""Tests for storage module - path encoding, session discovery, and repos registry."""

import json
import logging
import pytest
from concurrent.futures import Future, TimeoutError as FuturesTimeoutError
from pathlib import Path
from datetime import datetime
from unittest.mock import patch, MagicMock
import tempfile
import os

from app.storage import (
    # Path utilities
    encode_path,
    decode_path,
    get_clump_dir,
    get_clump_projects_dir,
    get_claude_projects_dir,
    get_clump_session_dir,
    get_repo_db_path,
    get_gemini_projects_dir,
    get_codex_sessions_dir,
    # Session types and metadata
    RepoInfo,
    EntityLink,
    SessionMetadata,
    DiscoveredSession,
    # Session discovery
    is_subsession,
    discover_sessions,
    discover_gemini_sessions,
    discover_codex_sessions,
    discover_all_sessions,
    _extract_gemini_session_path,
    _scan_gemini_unknown_project_dir,
    get_session_metadata,
    save_session_metadata,
    delete_session_metadata,
    match_encoded_path_to_repo,
    get_repo_path_from_encoded,
    # Repos registry
    get_repos_json_path,
    load_repos,
    save_repos,
    get_next_repo_id,
    add_repo,
    get_repo_by_id,
    get_repo_by_path,
    delete_repo,
    delete_repo_data,
    # Config operations
    get_config_json_path,
    load_config,
    save_config,
    get_config_value,
    set_config_value,
    # Schedule definitions
    ScheduleDefinition,
    get_repo_schedules_dir,
    get_schedule_definition,
    save_schedule_definition,
    delete_schedule_definition,
    list_schedule_definitions,
    generate_schedule_id,
    # Issue metadata
    IssueMetadata,
    get_issue_metadata,
    save_issue_metadata,
    delete_issue_metadata,
    list_issue_metadata,
    # PR metadata
    PRMetadata,
    get_pr_metadata,
    save_pr_metadata,
    delete_pr_metadata,
    list_pr_metadata,
)


class TestPathEncoding:
    """Tests for path encoding/decoding utilities."""

    def test_encode_path_basic(self):
        """Test basic path encoding."""
        assert encode_path("/home/user/projects") == "-home-user-projects"

    def test_encode_path_resolves_symlinks(self, tmp_path):
        """Test that encode_path resolves the path."""
        # Create a directory
        real_dir = tmp_path / "real"
        real_dir.mkdir()

        encoded = encode_path(str(real_dir))
        assert "-" in encoded  # Should contain dashes from encoded slashes

    def test_encode_path_with_dots(self, tmp_path):
        """Test encoding paths with relative components."""
        path = f"{tmp_path}/./subdir/../subdir"
        encoded = encode_path(path)
        # Should resolve the path and encode it
        assert ".." not in encoded
        assert "." not in encoded.split("-")

    def test_decode_path_basic(self):
        """Test basic path decoding."""
        assert decode_path("-home-user-projects") == "/home/user/projects"

    def test_decode_path_without_leading_dash(self):
        """Test decoding path that doesn't start with dash."""
        assert decode_path("home-user-projects") == "home/user/projects"

    def test_encode_decode_roundtrip_without_dashes(self):
        """Test that encode followed by decode gives original path for paths without dashes."""
        original = "/home/user/projects/myapp"
        encoded = encode_path(original)
        decoded = decode_path(encoded)
        # Paths without dashes should roundtrip perfectly
        assert decoded == original

    def test_encode_decode_roundtrip_with_dashes_is_lossy(self):
        """Test that encode/decode is lossy for paths containing dashes.

        This is expected behavior - dashes in the original path become
        indistinguishable from encoded slashes after encoding. The code
        correctly handles this by using encode_path for comparisons rather
        than decode_path.
        """
        original = "/home/user/my-project"
        encoded = encode_path(original)
        decoded = decode_path(encoded)
        # Paths with dashes will NOT roundtrip correctly - dashes become slashes
        # This is expected and documented behavior
        assert decoded != original
        assert decoded == "/home/user/my/project"  # dashes become slashes

    def test_encode_path_with_underscores(self):
        """Test that underscores are replaced with dashes.

        This matches Claude's encoding format where underscores in paths
        are also converted to dashes for consistent directory naming.
        """
        original = "/home/user/my_project"
        encoded = encode_path(original)
        # Underscores should be replaced with dashes
        assert "_" not in encoded
        assert encoded == "-home-user-my-project"

    def test_encode_path_with_multiple_underscores(self):
        """Test encoding paths with multiple underscores."""
        original = "/home/user/my_awesome_project/src_main"
        encoded = encode_path(original)
        assert "_" not in encoded
        assert encoded == "-home-user-my-awesome-project-src-main"

    def test_encode_decode_roundtrip_with_underscores_is_lossy(self):
        """Test that encode/decode is lossy for paths containing underscores.

        This is expected behavior - underscores become indistinguishable
        from slashes after encoding. Similar to the dash behavior.
        """
        original = "/home/user/my_project"
        encoded = encode_path(original)
        decoded = decode_path(encoded)
        # Paths with underscores will NOT roundtrip correctly
        assert decoded != original
        assert decoded == "/home/user/my/project"  # underscores become slashes

    def test_encode_path_with_mixed_special_chars(self):
        """Test encoding paths with both dashes and underscores."""
        original = "/home/user/my-project_v2"
        encoded = encode_path(original)
        # Both dashes and underscores should become dashes
        assert "_" not in encoded
        assert encoded == "-home-user-my-project-v2"

    def test_encode_path_consecutive_underscores(self):
        """Test encoding paths with consecutive underscores."""
        original = "/home/user/my__project"
        encoded = encode_path(original)
        # Consecutive underscores become consecutive dashes
        assert encoded == "-home-user-my--project"

    def test_encode_path_trailing_underscore(self):
        """Test encoding paths with trailing underscore."""
        original = "/home/user/project_"
        encoded = encode_path(original)
        assert encoded == "-home-user-project-"

    def test_encode_path_leading_underscore_in_component(self):
        """Test encoding paths with leading underscore in component."""
        original = "/home/user/_hidden"
        encoded = encode_path(original)
        assert encoded == "-home-user--hidden"


class TestSubsessionDetection:
    """Tests for subsession detection."""

    def test_is_subsession_agent_prefix(self):
        """Test that agent- prefix is detected as subsession."""
        assert is_subsession("agent-a1b2c3d") is True

    def test_is_subsession_regular_uuid(self):
        """Test that regular UUIDs are not subsessions."""
        assert is_subsession("550e8400-e29b-41d4-a716-446655440000") is False

    def test_is_subsession_empty_string(self):
        """Test that empty string is not a subsession."""
        assert is_subsession("") is False


class TestDiscoveredSession:
    """Tests for DiscoveredSession dataclass."""

    def test_repo_path_decodes_encoded_path(self, tmp_path):
        """Test that repo_path property decodes the encoded_path correctly."""
        session = DiscoveredSession(
            session_id="test-session",
            encoded_path="-home-user-myproject",
            transcript_path=tmp_path / "test.jsonl",
            modified_at=datetime.now(),
            file_size=100,
        )

        assert session.repo_path == "/home/user/myproject"

    def test_repo_path_handles_path_without_leading_dash(self, tmp_path):
        """Test repo_path when encoded_path doesn't start with dash."""
        session = DiscoveredSession(
            session_id="test-session",
            encoded_path="relative-path-project",
            transcript_path=tmp_path / "test.jsonl",
            modified_at=datetime.now(),
            file_size=100,
        )

        # Without leading dash, decode_path returns path/with/slashes
        assert session.repo_path == "relative/path/project"

    def test_discovered_session_with_metadata(self, tmp_path):
        """Test DiscoveredSession with attached metadata."""
        metadata = SessionMetadata(
            session_id="test-session",
            title="My Session",
            starred=True,
        )

        session = DiscoveredSession(
            session_id="test-session",
            encoded_path="-home-user-project",
            transcript_path=tmp_path / "test.jsonl",
            modified_at=datetime.now(),
            file_size=1024,
            metadata=metadata,
        )

        assert session.metadata is not None
        assert session.metadata.title == "My Session"
        assert session.metadata.starred is True

    def test_discovered_session_without_metadata(self, tmp_path):
        """Test DiscoveredSession without metadata."""
        session = DiscoveredSession(
            session_id="test-session",
            encoded_path="-home-user-project",
            transcript_path=tmp_path / "test.jsonl",
            modified_at=datetime.now(),
            file_size=512,
        )

        assert session.metadata is None

    def test_discovered_session_file_size(self, tmp_path):
        """Test that file_size is stored correctly."""
        session = DiscoveredSession(
            session_id="test-session",
            encoded_path="-home-user-project",
            transcript_path=tmp_path / "test.jsonl",
            modified_at=datetime.now(),
            file_size=2048,
        )

        assert session.file_size == 2048

    def test_discovered_session_modified_at(self, tmp_path):
        """Test that modified_at timestamp is stored correctly."""
        modified_time = datetime(2024, 6, 15, 12, 30, 0)

        session = DiscoveredSession(
            session_id="test-session",
            encoded_path="-home-user-project",
            transcript_path=tmp_path / "test.jsonl",
            modified_at=modified_time,
            file_size=100,
        )

        assert session.modified_at == modified_time

    def test_discovered_session_equality(self, tmp_path):
        """Test that two DiscoveredSessions with same attributes are equal."""
        modified_time = datetime(2024, 6, 15, 12, 30, 0)
        transcript_path = tmp_path / "test.jsonl"

        session1 = DiscoveredSession(
            session_id="test-session",
            encoded_path="-home-user-project",
            transcript_path=transcript_path,
            modified_at=modified_time,
            file_size=100,
        )

        session2 = DiscoveredSession(
            session_id="test-session",
            encoded_path="-home-user-project",
            transcript_path=transcript_path,
            modified_at=modified_time,
            file_size=100,
        )

        assert session1 == session2

    def test_discovered_session_inequality_session_id(self, tmp_path):
        """Test that sessions with different session_ids are not equal."""
        modified_time = datetime(2024, 6, 15, 12, 30, 0)
        transcript_path = tmp_path / "test.jsonl"

        session1 = DiscoveredSession(
            session_id="session-1",
            encoded_path="-home-user-project",
            transcript_path=transcript_path,
            modified_at=modified_time,
            file_size=100,
        )

        session2 = DiscoveredSession(
            session_id="session-2",
            encoded_path="-home-user-project",
            transcript_path=transcript_path,
            modified_at=modified_time,
            file_size=100,
        )

        assert session1 != session2

    def test_discovered_session_inequality_file_size(self, tmp_path):
        """Test that sessions with different file sizes are not equal."""
        modified_time = datetime(2024, 6, 15, 12, 30, 0)
        transcript_path = tmp_path / "test.jsonl"

        session1 = DiscoveredSession(
            session_id="test-session",
            encoded_path="-home-user-project",
            transcript_path=transcript_path,
            modified_at=modified_time,
            file_size=100,
        )

        session2 = DiscoveredSession(
            session_id="test-session",
            encoded_path="-home-user-project",
            transcript_path=transcript_path,
            modified_at=modified_time,
            file_size=200,
        )

        assert session1 != session2

    def test_discovered_session_with_different_metadata(self, tmp_path):
        """Test that sessions with different metadata are not equal."""
        modified_time = datetime(2024, 6, 15, 12, 30, 0)
        transcript_path = tmp_path / "test.jsonl"

        metadata1 = SessionMetadata(session_id="test-session", title="Title 1")
        metadata2 = SessionMetadata(session_id="test-session", title="Title 2")

        session1 = DiscoveredSession(
            session_id="test-session",
            encoded_path="-home-user-project",
            transcript_path=transcript_path,
            modified_at=modified_time,
            file_size=100,
            metadata=metadata1,
        )

        session2 = DiscoveredSession(
            session_id="test-session",
            encoded_path="-home-user-project",
            transcript_path=transcript_path,
            modified_at=modified_time,
            file_size=100,
            metadata=metadata2,
        )

        assert session1 != session2

    def test_discovered_session_sortable_by_modified_at(self, tmp_path):
        """Test that sessions can be sorted by modified_at."""
        older_time = datetime(2024, 1, 1, 12, 0, 0)
        newer_time = datetime(2024, 6, 15, 12, 0, 0)

        older_session = DiscoveredSession(
            session_id="older-session",
            encoded_path="-home-user-project",
            transcript_path=tmp_path / "older.jsonl",
            modified_at=older_time,
            file_size=100,
        )

        newer_session = DiscoveredSession(
            session_id="newer-session",
            encoded_path="-home-user-project",
            transcript_path=tmp_path / "newer.jsonl",
            modified_at=newer_time,
            file_size=100,
        )

        sessions = [newer_session, older_session]
        sorted_sessions = sorted(sessions, key=lambda s: s.modified_at)

        assert sorted_sessions[0].session_id == "older-session"
        assert sorted_sessions[1].session_id == "newer-session"

    def test_discovered_session_in_list(self, tmp_path):
        """Test that DiscoveredSession works correctly in lists."""
        session = DiscoveredSession(
            session_id="test-session",
            encoded_path="-home-user-project",
            transcript_path=tmp_path / "test.jsonl",
            modified_at=datetime.now(),
            file_size=100,
        )

        sessions = [session]

        assert session in sessions
        assert len(sessions) == 1


class TestSessionMetadata:
    """Tests for SessionMetadata dataclass."""

    def test_to_dict_basic(self):
        """Test converting metadata to dictionary."""
        metadata = SessionMetadata(
            session_id="test-session-123",
            title="Test Session",
            summary="A test summary",
            repo_path="/home/user/repo",
            entities=[EntityLink(kind="issue", number=42)],
            tags=["bug", "enhancement"],
            starred=True,
            created_at="2024-01-15T10:00:00Z",
        )

        result = metadata.to_dict()

        assert result["session_id"] == "test-session-123"
        assert result["title"] == "Test Session"
        assert result["summary"] == "A test summary"
        assert result["repo_path"] == "/home/user/repo"
        assert result["entities"] == [{"kind": "issue", "number": 42}]
        assert result["tags"] == ["bug", "enhancement"]
        assert result["starred"] is True
        assert result["created_at"] == "2024-01-15T10:00:00Z"

    def test_to_dict_with_defaults(self):
        """Test converting metadata with default values."""
        metadata = SessionMetadata(session_id="test-session")
        result = metadata.to_dict()

        assert result["session_id"] == "test-session"
        assert result["title"] is None
        assert result["entities"] == []
        assert result["tags"] == []
        assert result["starred"] is False

    def test_from_dict_basic(self):
        """Test creating metadata from dictionary."""
        data = {
            "session_id": "test-session-123",
            "title": "Test Session",
            "summary": "A test summary",
            "repo_path": "/home/user/repo",
            "entities": [{"kind": "pr", "number": 123}],
            "tags": ["feature"],
            "starred": True,
            "created_at": "2024-01-15T10:00:00Z",
        }

        metadata = SessionMetadata.from_dict(data)

        assert metadata.session_id == "test-session-123"
        assert metadata.title == "Test Session"
        assert len(metadata.entities) == 1
        assert metadata.entities[0].kind == "pr"
        assert metadata.entities[0].number == 123
        assert metadata.starred is True

    def test_from_dict_with_missing_fields(self):
        """Test creating metadata with missing optional fields."""
        data = {"session_id": "test-session"}

        metadata = SessionMetadata.from_dict(data)

        assert metadata.session_id == "test-session"
        assert metadata.title is None
        assert metadata.entities == []
        assert metadata.tags == []
        assert metadata.starred is False

    def test_from_dict_empty_session_id(self):
        """Test creating metadata with empty data."""
        data = {}
        metadata = SessionMetadata.from_dict(data)
        assert metadata.session_id == ""

    def test_to_dict_with_scheduled_job_id(self):
        """Test converting metadata with scheduled_job_id to dictionary."""
        metadata = SessionMetadata(
            session_id="test-session-123",
            title="Scheduled Session",
            scheduled_job_id=42,
        )

        result = metadata.to_dict()

        assert result["scheduled_job_id"] == 42
        assert result["session_id"] == "test-session-123"

    def test_to_dict_scheduled_job_id_default_none(self):
        """Test that scheduled_job_id defaults to None in to_dict."""
        metadata = SessionMetadata(session_id="test-session")
        result = metadata.to_dict()

        assert result["scheduled_job_id"] is None

    def test_from_dict_with_scheduled_job_id(self):
        """Test creating metadata from dictionary with scheduled_job_id."""
        data = {
            "session_id": "scheduled-session-123",
            "title": "Scheduled Analysis",
            "scheduled_job_id": 99,
        }

        metadata = SessionMetadata.from_dict(data)

        assert metadata.session_id == "scheduled-session-123"
        assert metadata.scheduled_job_id == 99

    def test_from_dict_scheduled_job_id_missing(self):
        """Test that missing scheduled_job_id defaults to None."""
        data = {"session_id": "test-session", "title": "Test"}

        metadata = SessionMetadata.from_dict(data)

        assert metadata.scheduled_job_id is None

    def test_scheduled_job_id_roundtrip(self):
        """Test that scheduled_job_id survives to_dict/from_dict roundtrip."""
        original = SessionMetadata(
            session_id="roundtrip-test",
            title="Roundtrip Test",
            scheduled_job_id=123,
        )

        data = original.to_dict()
        restored = SessionMetadata.from_dict(data)

        assert restored.scheduled_job_id == original.scheduled_job_id
        assert restored.scheduled_job_id == 123

    def test_from_dict_skips_malformed_entities_missing_number(self):
        """Test that entities missing 'number' key are skipped."""
        data = {
            "session_id": "test-session",
            "entities": [{"kind": "issue"}],  # Missing 'number'
        }

        metadata = SessionMetadata.from_dict(data)

        assert metadata.entities == []

    def test_from_dict_skips_malformed_entities_missing_kind(self):
        """Test that entities missing 'kind' key are skipped."""
        data = {
            "session_id": "test-session",
            "entities": [{"number": 42}],  # Missing 'kind'
        }

        metadata = SessionMetadata.from_dict(data)

        assert metadata.entities == []

    def test_from_dict_skips_non_dict_entities(self):
        """Test that non-dict entities are skipped."""
        data = {
            "session_id": "test-session",
            "entities": ["invalid", 123, None],
        }

        metadata = SessionMetadata.from_dict(data)

        assert metadata.entities == []

    def test_from_dict_keeps_valid_entities_skips_malformed(self):
        """Test that valid entities are kept while malformed ones are skipped."""
        data = {
            "session_id": "test-session",
            "entities": [
                {"kind": "issue"},  # Missing 'number' - skip
                {"number": 42},  # Missing 'kind' - skip
                {"kind": "pr", "number": 123},  # Valid - keep
                "invalid",  # Not a dict - skip
                {"kind": "issue", "number": 456},  # Valid - keep
            ],
        }

        metadata = SessionMetadata.from_dict(data)

        assert len(metadata.entities) == 2
        assert metadata.entities[0].kind == "pr"
        assert metadata.entities[0].number == 123
        assert metadata.entities[1].kind == "issue"
        assert metadata.entities[1].number == 456


class TestEntityLink:
    """Tests for EntityLink dataclass."""

    def test_entity_link_issue(self):
        """Test creating an issue entity link."""
        link = EntityLink(kind="issue", number=42)
        assert link.kind == "issue"
        assert link.number == 42

    def test_entity_link_pr(self):
        """Test creating a PR entity link."""
        link = EntityLink(kind="pr", number=123)
        assert link.kind == "pr"
        assert link.number == 123

    def test_entity_link_equality(self):
        """Test that two EntityLinks with same values are equal."""
        link1 = EntityLink(kind="issue", number=42)
        link2 = EntityLink(kind="issue", number=42)
        assert link1 == link2

    def test_entity_link_inequality_kind(self):
        """Test that EntityLinks with different kinds are not equal."""
        link1 = EntityLink(kind="issue", number=42)
        link2 = EntityLink(kind="pr", number=42)
        assert link1 != link2

    def test_entity_link_inequality_number(self):
        """Test that EntityLinks with different numbers are not equal."""
        link1 = EntityLink(kind="issue", number=42)
        link2 = EntityLink(kind="issue", number=43)
        assert link1 != link2

    def test_entity_link_zero_number(self):
        """Test EntityLink with number 0."""
        link = EntityLink(kind="issue", number=0)
        assert link.number == 0

    def test_entity_link_large_number(self):
        """Test EntityLink with large issue/PR number."""
        link = EntityLink(kind="pr", number=999999)
        assert link.number == 999999


class TestDirectoryUtilities:
    """Tests for directory utilities with mocked home directory."""

    def test_get_clump_dir_creates_directory(self, tmp_path):
        """Test that get_clump_dir creates the directory."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            clump_dir = get_clump_dir()
            assert clump_dir.exists()
            assert clump_dir == tmp_path / ".clump"

    def test_get_clump_projects_dir_creates_directory(self, tmp_path):
        """Test that get_clump_projects_dir creates the directory."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            projects_dir = get_clump_projects_dir()
            assert projects_dir.exists()
            assert projects_dir == tmp_path / ".clump" / "projects"

    def test_get_claude_projects_dir(self, tmp_path):
        """Test that get_claude_projects_dir returns correct path."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            claude_dir = get_claude_projects_dir()
            assert claude_dir == tmp_path / ".claude" / "projects"

    def test_get_clump_session_dir_creates_directory(self, tmp_path):
        """Test that get_clump_session_dir creates the directory."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            session_dir = get_clump_session_dir("-home-user-project")
            assert session_dir.exists()
            assert session_dir == tmp_path / ".clump" / "projects" / "-home-user-project"

    def test_get_repo_db_path(self, tmp_path):
        """Test getting database path for a repo."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            db_path = get_repo_db_path("/home/user/myproject")
            expected_encoded = encode_path("/home/user/myproject")
            assert db_path.name == "data.db"
            assert expected_encoded in str(db_path)


class TestSessionMetadataIO:
    """Tests for session metadata read/write operations."""

    def test_save_and_get_session_metadata(self, tmp_path):
        """Test saving and retrieving session metadata."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            encoded_path = "-test-project"
            session_id = "test-session-123"

            metadata = SessionMetadata(
                session_id=session_id,
                title="Test Session",
                tags=["tag1", "tag2"],
            )

            # Save metadata
            save_session_metadata(encoded_path, session_id, metadata)

            # Retrieve it
            loaded = get_session_metadata(encoded_path, session_id)

            assert loaded is not None
            assert loaded.session_id == session_id
            assert loaded.title == "Test Session"
            assert loaded.tags == ["tag1", "tag2"]

    def test_get_session_metadata_not_found(self, tmp_path):
        """Test retrieving non-existent metadata returns None."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            result = get_session_metadata("-nonexistent", "no-session")
            assert result is None

    def test_get_session_metadata_invalid_json(self, tmp_path):
        """Test handling of invalid JSON in metadata file."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create directory and invalid JSON file
            session_dir = tmp_path / ".clump" / "projects" / "-test-project"
            session_dir.mkdir(parents=True)

            metadata_file = session_dir / "bad-session.json"
            metadata_file.write_text("not valid json {{{")

            result = get_session_metadata("-test-project", "bad-session")
            assert result is None

    def test_delete_session_metadata_exists(self, tmp_path):
        """Test deleting existing session metadata."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            encoded_path = "-test-project"
            session_id = "test-session"

            # Create metadata first
            metadata = SessionMetadata(session_id=session_id, title="To Delete")
            save_session_metadata(encoded_path, session_id, metadata)

            # Verify it exists
            assert get_session_metadata(encoded_path, session_id) is not None

            # Delete it
            result = delete_session_metadata(encoded_path, session_id)
            assert result is True

            # Verify it's gone
            assert get_session_metadata(encoded_path, session_id) is None

    def test_delete_session_metadata_not_found(self, tmp_path):
        """Test deleting non-existent metadata returns False."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            result = delete_session_metadata("-nonexistent", "no-session")
            assert result is False

    def test_save_and_get_session_metadata_with_scheduled_job_id(self, tmp_path):
        """Test that scheduled_job_id persists correctly through save/load cycle."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            encoded_path = "-scheduled-project"
            session_id = "scheduled-session-456"

            metadata = SessionMetadata(
                session_id=session_id,
                title="Scheduled Job Session",
                scheduled_job_id=77,
                starred=True,
            )

            # Save metadata
            save_session_metadata(encoded_path, session_id, metadata)

            # Retrieve it
            loaded = get_session_metadata(encoded_path, session_id)

            assert loaded is not None
            assert loaded.session_id == session_id
            assert loaded.scheduled_job_id == 77
            assert loaded.title == "Scheduled Job Session"
            assert loaded.starred is True


class TestSessionDiscovery:
    """Tests for session discovery functionality."""

    def test_discover_sessions_no_claude_dir(self, tmp_path):
        """Test discovering sessions when Claude directory doesn't exist."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            sessions = discover_sessions()
            assert sessions == []

    def test_discover_sessions_finds_jsonl_files(self, tmp_path):
        """Test discovering sessions from JSONL files."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create Claude projects directory structure
            claude_dir = tmp_path / ".claude" / "projects" / "-test-project"
            claude_dir.mkdir(parents=True)

            # Create a session file
            session_file = claude_dir / "session-uuid-123.jsonl"
            session_file.write_text('{"type": "message"}\n')

            sessions = discover_sessions()

            assert len(sessions) == 1
            assert sessions[0].session_id == "session-uuid-123"
            assert sessions[0].encoded_path == "-test-project"
            assert sessions[0].transcript_path == session_file

    def test_discover_sessions_filters_by_repo_path(self, tmp_path):
        """Test filtering sessions by repo path."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create two project directories
            project1 = tmp_path / ".claude" / "projects" / "-project1"
            project2 = tmp_path / ".claude" / "projects" / "-project2"
            project1.mkdir(parents=True)
            project2.mkdir(parents=True)

            # Create session files in each
            (project1 / "session1.jsonl").write_text("{}\n")
            (project2 / "session2.jsonl").write_text("{}\n")

            # Filter by one project (need to use actual encoded path)
            with patch("app.storage.encode_path", return_value="-project1"):
                sessions = discover_sessions(repo_path="/project1")

            assert len(sessions) == 1
            assert sessions[0].session_id == "session1"

    def test_discover_sessions_excludes_subsessions_by_default(self, tmp_path):
        """Test that subsessions are excluded by default."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            claude_dir = tmp_path / ".claude" / "projects" / "-test-project"
            claude_dir.mkdir(parents=True)

            # Create regular session and subsession
            (claude_dir / "regular-session.jsonl").write_text("{}\n")
            (claude_dir / "agent-abc123.jsonl").write_text("{}\n")

            sessions = discover_sessions()

            assert len(sessions) == 1
            assert sessions[0].session_id == "regular-session"

    def test_discover_sessions_includes_subsessions_when_requested(self, tmp_path):
        """Test that subsessions are included when requested."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            claude_dir = tmp_path / ".claude" / "projects" / "-test-project"
            claude_dir.mkdir(parents=True)

            # Create regular session and subsession
            (claude_dir / "regular-session.jsonl").write_text("{}\n")
            (claude_dir / "agent-abc123.jsonl").write_text("{}\n")

            sessions = discover_sessions(include_subsessions=True)

            assert len(sessions) == 2
            session_ids = [s.session_id for s in sessions]
            assert "regular-session" in session_ids
            assert "agent-abc123" in session_ids

    def test_discover_sessions_sorted_by_modification_time(self, tmp_path):
        """Test that sessions are sorted by modification time (newest first)."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            claude_dir = tmp_path / ".claude" / "projects" / "-test-project"
            claude_dir.mkdir(parents=True)

            # Create sessions with different modification times
            old_session = claude_dir / "old-session.jsonl"
            old_session.write_text("{}\n")

            new_session = claude_dir / "new-session.jsonl"
            new_session.write_text("{}\n")

            # Make old session actually older
            import time
            old_time = time.time() - 3600  # 1 hour ago
            os.utime(old_session, (old_time, old_time))

            sessions = discover_sessions()

            assert len(sessions) == 2
            assert sessions[0].session_id == "new-session"
            assert sessions[1].session_id == "old-session"

    def test_discover_sessions_loads_metadata(self, tmp_path):
        """Test that metadata is loaded with discovered sessions."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create Claude project directory
            claude_dir = tmp_path / ".claude" / "projects" / "-test-project"
            claude_dir.mkdir(parents=True)
            (claude_dir / "session-123.jsonl").write_text("{}\n")

            # Create clump metadata directory
            clump_dir = tmp_path / ".clump" / "projects" / "-test-project"
            clump_dir.mkdir(parents=True)

            metadata_file = clump_dir / "session-123.json"
            metadata = {
                "session_id": "session-123",
                "title": "My Session",
                "tags": ["important"],
            }
            metadata_file.write_text(json.dumps(metadata))

            sessions = discover_sessions()

            assert len(sessions) == 1
            assert sessions[0].metadata is not None
            assert sessions[0].metadata.title == "My Session"
            assert sessions[0].metadata.tags == ["important"]


class TestDiscoverSessionsErrorHandling:
    """Tests for discover_sessions error handling and logging."""

    def test_timeout_error_is_logged_and_skipped(self, tmp_path, caplog):
        """Test that timeout errors are logged with warning and the directory is skipped."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create Claude projects directory with multiple project dirs (to trigger parallel scanning)
            claude_dir = tmp_path / ".claude" / "projects"
            claude_dir.mkdir(parents=True)
            (claude_dir / "-project1").mkdir()
            (claude_dir / "-project2").mkdir()
            (claude_dir / "-project3").mkdir()

            # Create mock futures - one that times out, others that succeed
            mock_future_timeout = MagicMock(spec=Future)
            mock_future_timeout.result.side_effect = FuturesTimeoutError()

            mock_future_success = MagicMock(spec=Future)
            mock_future_success.result.return_value = []

            # Patch the executor to return our mocked futures
            with patch("app.storage._fs_executor") as mock_executor:
                mock_executor.submit.side_effect = [
                    mock_future_timeout,  # First directory times out
                    mock_future_success,  # Second directory succeeds
                    mock_future_success,  # Third directory succeeds
                ]

                with caplog.at_level(logging.WARNING, logger="app.storage"):
                    sessions = discover_sessions()

            # Should have logged a warning about the timeout
            assert "Timeout scanning project directory" in caplog.text
            assert "30s" in caplog.text

    def test_general_exception_is_logged_and_skipped(self, tmp_path, caplog):
        """Test that general exceptions are logged with exception traceback and skipped."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create Claude projects directory with multiple project dirs
            claude_dir = tmp_path / ".claude" / "projects"
            claude_dir.mkdir(parents=True)
            (claude_dir / "-project1").mkdir()
            (claude_dir / "-project2").mkdir()

            # Create mock futures - one that raises an exception, one that succeeds
            mock_future_error = MagicMock(spec=Future)
            mock_future_error.result.side_effect = PermissionError("Access denied")

            mock_future_success = MagicMock(spec=Future)
            mock_future_success.result.return_value = []

            with patch("app.storage._fs_executor") as mock_executor:
                mock_executor.submit.side_effect = [
                    mock_future_error,  # First directory errors
                    mock_future_success,  # Second directory succeeds
                ]

                with caplog.at_level(logging.ERROR, logger="app.storage"):
                    sessions = discover_sessions()

            # Should have logged an error with exception info
            assert "Error scanning project directory" in caplog.text
            assert "skipping" in caplog.text

    def test_mixed_errors_and_successes(self, tmp_path, caplog):
        """Test that sessions from successful scans are returned despite errors in other dirs."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            claude_dir = tmp_path / ".claude" / "projects"
            claude_dir.mkdir(parents=True)
            project1 = claude_dir / "-project1"
            project2 = claude_dir / "-project2"
            project3 = claude_dir / "-project3"
            project1.mkdir()
            project2.mkdir()
            project3.mkdir()

            # Create a real session file for one project
            (project2 / "test-session.jsonl").write_text('{"type": "message"}\n')

            from app.storage import DiscoveredSession

            # Create mock discovered session
            mock_session = DiscoveredSession(
                session_id="test-session",
                encoded_path="-project2",
                transcript_path=project2 / "test-session.jsonl",
                modified_at=datetime.now(),
                file_size=20,
                cli_type="claude",
            )

            mock_future_timeout = MagicMock(spec=Future)
            mock_future_timeout.result.side_effect = FuturesTimeoutError()

            mock_future_success = MagicMock(spec=Future)
            mock_future_success.result.return_value = [mock_session]

            mock_future_error = MagicMock(spec=Future)
            mock_future_error.result.side_effect = OSError("I/O error")

            with patch("app.storage._fs_executor") as mock_executor:
                mock_executor.submit.side_effect = [
                    mock_future_timeout,  # project1 times out
                    mock_future_success,  # project2 succeeds
                    mock_future_error,  # project3 errors
                ]

                with caplog.at_level(logging.WARNING, logger="app.storage"):
                    sessions = discover_sessions()

            # Should still get the successful session
            assert len(sessions) == 1
            assert sessions[0].session_id == "test-session"

            # Should have logged both the timeout and the error
            assert "Timeout scanning project directory" in caplog.text
            assert "Error scanning project directory" in caplog.text


class TestReposRegistry:
    """Tests for repos registry operations."""

    def test_load_repos_empty(self, tmp_path):
        """Test loading repos when file doesn't exist."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            repos = load_repos()
            assert repos == []

    def test_save_and_load_repos(self, tmp_path):
        """Test saving and loading repos."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            repos: list[RepoInfo] = [
                {"id": 1, "owner": "owner1", "name": "repo1", "local_path": "/path/to/repo1"},
                {"id": 2, "owner": "owner2", "name": "repo2", "local_path": "/path/to/repo2"},
            ]

            save_repos(repos)
            loaded = load_repos()

            assert len(loaded) == 2
            assert loaded[0]["owner"] == "owner1"
            assert loaded[1]["owner"] == "owner2"

    def test_load_repos_invalid_json(self, tmp_path):
        """Test loading repos with invalid JSON returns empty list."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create clump directory and invalid repos file
            clump_dir = tmp_path / ".clump"
            clump_dir.mkdir(parents=True)

            repos_file = clump_dir / "repos.json"
            repos_file.write_text("invalid json")

            repos = load_repos()
            assert repos == []

    def test_get_next_repo_id_empty(self, tmp_path):
        """Test getting next repo ID when no repos exist."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            next_id = get_next_repo_id()
            assert next_id == 1

    def test_get_next_repo_id_with_existing(self, tmp_path):
        """Test getting next repo ID with existing repos."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            repos: list[RepoInfo] = [
                {"id": 1, "owner": "a", "name": "b", "local_path": "/p1"},
                {"id": 5, "owner": "c", "name": "d", "local_path": "/p2"},
            ]
            save_repos(repos)

            next_id = get_next_repo_id()
            assert next_id == 6

    def test_add_repo(self, tmp_path):
        """Test adding a new repo."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            repo = add_repo("myowner", "myrepo", str(tmp_path / "myrepo"))

            assert repo["id"] == 1
            assert repo["owner"] == "myowner"
            assert repo["name"] == "myrepo"

            # Verify it's persisted
            repos = load_repos()
            assert len(repos) == 1
            assert repos[0]["owner"] == "myowner"

    def test_add_repo_duplicate_path_raises(self, tmp_path):
        """Test that adding a repo with duplicate path raises error."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            repo_path = str(tmp_path / "myrepo")
            add_repo("owner1", "repo1", repo_path)

            with pytest.raises(ValueError, match="already exists"):
                add_repo("owner2", "repo2", repo_path)

    def test_get_repo_by_id_found(self, tmp_path):
        """Test getting a repo by ID."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            add_repo("owner", "repo", str(tmp_path / "repo"))

            repo = get_repo_by_id(1)
            assert repo is not None
            assert repo["owner"] == "owner"

    def test_get_repo_by_id_not_found(self, tmp_path):
        """Test getting a repo by non-existent ID."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            repo = get_repo_by_id(999)
            assert repo is None

    def test_get_repo_by_path_found(self, tmp_path):
        """Test getting a repo by path."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            repo_path = str(tmp_path / "myrepo")
            add_repo("owner", "repo", repo_path)

            repo = get_repo_by_path(repo_path)
            assert repo is not None
            assert repo["owner"] == "owner"

    def test_get_repo_by_path_not_found(self, tmp_path):
        """Test getting a repo by non-existent path."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            repo = get_repo_by_path("/nonexistent/path")
            assert repo is None

    def test_delete_repo_found(self, tmp_path):
        """Test deleting an existing repo."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            add_repo("owner", "repo", str(tmp_path / "repo"))

            result = delete_repo(1)
            assert result is True

            repos = load_repos()
            assert len(repos) == 0

    def test_delete_repo_not_found(self, tmp_path):
        """Test deleting a non-existent repo."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            result = delete_repo(999)
            assert result is False

    def test_delete_repo_data(self, tmp_path):
        """Test deleting repo data directory."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            repo_path = "/home/user/myrepo"
            encoded = encode_path(repo_path)

            # Create the data directory
            data_dir = tmp_path / ".clump" / "projects" / encoded
            data_dir.mkdir(parents=True)
            (data_dir / "data.db").write_text("test")

            result = delete_repo_data(repo_path)
            assert result is True
            assert not data_dir.exists()

    def test_delete_repo_data_not_found(self, tmp_path):
        """Test deleting non-existent repo data."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            result = delete_repo_data("/nonexistent/path")
            assert result is False


class TestMatchEncodedPathToRepo:
    """Tests for matching encoded paths to repos."""

    def test_match_encoded_path_found(self, tmp_path):
        """Test matching encoded path to existing repo."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            repo_path = str(tmp_path / "myrepo")
            add_repo("owner", "repo", repo_path)

            encoded = encode_path(repo_path)
            matched = match_encoded_path_to_repo(encoded)

            assert matched is not None
            assert matched["owner"] == "owner"

    def test_match_encoded_path_not_found(self, tmp_path):
        """Test matching non-existent encoded path."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            matched = match_encoded_path_to_repo("-nonexistent-path")
            assert matched is None


class TestConfigOperations:
    """Tests for config operations."""

    def test_load_config_empty(self, tmp_path):
        """Test loading config when file doesn't exist."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            config = load_config()
            assert config == {}

    def test_save_and_load_config(self, tmp_path):
        """Test saving and loading config."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            config = {"key1": "value1", "key2": 42, "nested": {"a": "b"}}
            save_config(config)

            loaded = load_config()
            assert loaded == config

    def test_load_config_invalid_json(self, tmp_path):
        """Test loading config with invalid JSON returns empty dict."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            clump_dir = tmp_path / ".clump"
            clump_dir.mkdir(parents=True)

            config_file = clump_dir / "config.json"
            config_file.write_text("not valid json")

            config = load_config()
            assert config == {}

    def test_get_config_value_exists(self, tmp_path):
        """Test getting an existing config value."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            save_config({"mykey": "myvalue"})

            value = get_config_value("mykey")
            assert value == "myvalue"

    def test_get_config_value_default(self, tmp_path):
        """Test getting a non-existent config value with default."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            value = get_config_value("nonexistent", default="fallback")
            assert value == "fallback"

    def test_set_config_value(self, tmp_path):
        """Test setting a config value."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            set_config_value("newkey", "newvalue")

            value = get_config_value("newkey")
            assert value == "newvalue"

    def test_set_config_value_preserves_existing(self, tmp_path):
        """Test that setting a config value preserves other values."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            save_config({"existing": "value"})
            set_config_value("new", "newvalue")

            config = load_config()
            assert config["existing"] == "value"
            assert config["new"] == "newvalue"


class TestGetPaths:
    """Tests for path getter functions."""

    def test_get_repos_json_path(self, tmp_path):
        """Test getting repos.json path."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            path = get_repos_json_path()
            assert path == tmp_path / ".clump" / "repos.json"

    def test_get_config_json_path(self, tmp_path):
        """Test getting config.json path."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            path = get_config_json_path()
            assert path == tmp_path / ".clump" / "config.json"


class TestGeminiSessionDiscovery:
    """Tests for Gemini session discovery functionality."""

    def test_get_gemini_projects_dir(self, tmp_path):
        """Test getting Gemini projects directory path."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            gemini_dir = get_gemini_projects_dir()
            assert gemini_dir == tmp_path / ".gemini" / "tmp"

    def test_extract_gemini_session_path_with_project_path(self, tmp_path):
        """Test extracting project path from Gemini session file."""
        session_file = tmp_path / "session.json"
        session_data = {
            "projectPath": "/home/user/my-project",
            "messages": []
        }
        session_file.write_text(json.dumps(session_data))

        result = _extract_gemini_session_path(session_file)
        assert result == "/home/user/my-project"

    def test_extract_gemini_session_path_with_cwd(self, tmp_path):
        """Test extracting cwd from Gemini session file when projectPath is missing."""
        session_file = tmp_path / "session.json"
        session_data = {
            "cwd": "/home/user/another-project",
            "messages": []
        }
        session_file.write_text(json.dumps(session_data))

        result = _extract_gemini_session_path(session_file)
        assert result == "/home/user/another-project"

    def test_extract_gemini_session_path_prefers_project_path(self, tmp_path):
        """Test that projectPath is preferred over cwd."""
        session_file = tmp_path / "session.json"
        session_data = {
            "projectPath": "/preferred/path",
            "cwd": "/fallback/path",
            "messages": []
        }
        session_file.write_text(json.dumps(session_data))

        result = _extract_gemini_session_path(session_file)
        assert result == "/preferred/path"

    def test_extract_gemini_session_path_missing_both(self, tmp_path):
        """Test extracting path when neither projectPath nor cwd exists."""
        session_file = tmp_path / "session.json"
        session_data = {"messages": []}
        session_file.write_text(json.dumps(session_data))

        result = _extract_gemini_session_path(session_file)
        assert result is None

    def test_extract_gemini_session_path_invalid_json(self, tmp_path):
        """Test extracting path from invalid JSON file."""
        session_file = tmp_path / "session.json"
        session_file.write_text("not valid json {{{")

        result = _extract_gemini_session_path(session_file)
        assert result is None

    def test_extract_gemini_session_path_file_not_found(self, tmp_path):
        """Test extracting path from non-existent file."""
        session_file = tmp_path / "nonexistent.json"

        result = _extract_gemini_session_path(session_file)
        assert result is None

    def test_discover_gemini_sessions_no_gemini_dir(self, tmp_path):
        """Test discovering sessions when Gemini directory doesn't exist."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            sessions = discover_gemini_sessions()
            assert sessions == []

    def test_discover_gemini_sessions_empty_dir(self, tmp_path):
        """Test discovering sessions from empty Gemini directory."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            gemini_dir = tmp_path / ".gemini" / "tmp"
            gemini_dir.mkdir(parents=True)

            sessions = discover_gemini_sessions()
            assert sessions == []

    def test_scan_gemini_unknown_project_dir_uses_encode_path(self, tmp_path):
        """Test that _scan_gemini_unknown_project_dir uses encode_path correctly.

        This is a regression test for the bug where path encoding was done
        with duplicated and incorrect logic instead of using encode_path().
        """
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create Gemini project structure
            project_hash = "abc123def456"
            project_dir = tmp_path / ".gemini" / "tmp" / project_hash
            chats_dir = project_dir / "chats"
            chats_dir.mkdir(parents=True)

            # Create a session file with projectPath
            session_file = chats_dir / "session-123.json"
            session_data = {
                "projectPath": "/home/user/my_project",  # Note: contains underscore
                "messages": []
            }
            session_file.write_text(json.dumps(session_data))

            # Create clump projects dir
            clump_projects_dir = tmp_path / ".clump" / "projects"
            clump_projects_dir.mkdir(parents=True)

            # Scan the project directory
            sessions = _scan_gemini_unknown_project_dir(
                project_dir, clump_projects_dir, project_hash
            )

            assert len(sessions) == 1
            # The encoded path should match what encode_path() produces
            expected_encoded = encode_path("/home/user/my_project")
            assert sessions[0].encoded_path == expected_encoded
            # Verify it handles underscores correctly (they become dashes)
            assert "-my-project" in sessions[0].encoded_path

    def test_scan_gemini_unknown_project_dir_fallback_to_hash(self, tmp_path):
        """Test fallback to hash when project path cannot be extracted."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create Gemini project structure
            project_hash = "abc123def456789"
            project_dir = tmp_path / ".gemini" / "tmp" / project_hash
            chats_dir = project_dir / "chats"
            chats_dir.mkdir(parents=True)

            # Create a session file WITHOUT projectPath or cwd
            session_file = chats_dir / "session-456.json"
            session_data = {"messages": []}
            session_file.write_text(json.dumps(session_data))

            # Create clump projects dir
            clump_projects_dir = tmp_path / ".clump" / "projects"
            clump_projects_dir.mkdir(parents=True)

            # Scan the project directory
            sessions = _scan_gemini_unknown_project_dir(
                project_dir, clump_projects_dir, project_hash
            )

            assert len(sessions) == 1
            # Should use fallback format with first 12 chars of hash
            assert sessions[0].encoded_path == f"gemini-unknown-{project_hash[:12]}"

    def test_scan_gemini_unknown_project_dir_loads_metadata(self, tmp_path):
        """Test that sidecar metadata is loaded when available."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create Gemini project structure
            project_hash = "abc123"
            project_dir = tmp_path / ".gemini" / "tmp" / project_hash
            chats_dir = project_dir / "chats"
            chats_dir.mkdir(parents=True)

            # Create a session file
            session_file = chats_dir / "session-with-meta.json"
            session_data = {
                "projectPath": "/home/user/project",
                "messages": []
            }
            session_file.write_text(json.dumps(session_data))

            # Create clump projects dir with metadata
            encoded_path = encode_path("/home/user/project")
            clump_session_dir = tmp_path / ".clump" / "projects" / encoded_path
            clump_session_dir.mkdir(parents=True)

            metadata_file = clump_session_dir / "session-with-meta.json"
            metadata = {
                "session_id": "session-with-meta",
                "title": "Test Session",
                "starred": True,
            }
            metadata_file.write_text(json.dumps(metadata))

            clump_projects_dir = tmp_path / ".clump" / "projects"

            # Scan the project directory
            sessions = _scan_gemini_unknown_project_dir(
                project_dir, clump_projects_dir, project_hash
            )

            assert len(sessions) == 1
            assert sessions[0].metadata is not None
            assert sessions[0].metadata.title == "Test Session"
            assert sessions[0].metadata.starred is True

    def test_scan_gemini_unknown_project_dir_no_chats_dir(self, tmp_path):
        """Test handling when chats directory doesn't exist."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create Gemini project structure WITHOUT chats dir
            project_hash = "nochats123"
            project_dir = tmp_path / ".gemini" / "tmp" / project_hash
            project_dir.mkdir(parents=True)

            clump_projects_dir = tmp_path / ".clump" / "projects"
            clump_projects_dir.mkdir(parents=True)

            # Scan the project directory
            sessions = _scan_gemini_unknown_project_dir(
                project_dir, clump_projects_dir, project_hash
            )

            assert sessions == []

    def test_scan_gemini_unknown_project_dir_glob_oserror(self, tmp_path):
        """Test that OSError during glob returns empty list instead of failing.

        This is a regression test for handling permission errors or other OS
        issues when scanning directories.
        """
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create Gemini project structure
            project_hash = "globerror123"
            project_dir = tmp_path / ".gemini" / "tmp" / project_hash
            chats_dir = project_dir / "chats"
            chats_dir.mkdir(parents=True)

            clump_projects_dir = tmp_path / ".clump" / "projects"
            clump_projects_dir.mkdir(parents=True)

            # Mock the glob method to raise OSError
            with patch.object(Path, "glob", side_effect=OSError("Permission denied")):
                sessions = _scan_gemini_unknown_project_dir(
                    project_dir, clump_projects_dir, project_hash
                )

            # Should return empty list instead of raising
            assert sessions == []

    def test_discover_gemini_sessions_with_known_repo(self, tmp_path):
        """Test discovering sessions for a known repo using hash mapping."""
        import hashlib

        with patch("app.storage.Path.home", return_value=tmp_path):
            # Setup known repo
            repo_path = str(tmp_path / "known-repo")
            (tmp_path / "known-repo").mkdir()

            # Save the repo
            add_repo("owner", "known-repo", repo_path)

            # Compute hash the same way Gemini does
            normalized = str(Path(repo_path).resolve())
            project_hash = hashlib.sha256(normalized.encode()).hexdigest()

            # Create Gemini project structure with the computed hash
            project_dir = tmp_path / ".gemini" / "tmp" / project_hash
            chats_dir = project_dir / "chats"
            chats_dir.mkdir(parents=True)

            session_file = chats_dir / "known-session.json"
            session_file.write_text(json.dumps({"messages": []}))

            sessions = discover_gemini_sessions()

            assert len(sessions) == 1
            assert sessions[0].session_id == "known-session"
            # Should use the proper encoded path from the known repo
            expected_encoded = encode_path(repo_path)
            assert sessions[0].encoded_path == expected_encoded

    def test_discover_gemini_sessions_filters_by_repo_path(self, tmp_path):
        """Test filtering Gemini sessions by repo path."""
        import hashlib

        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create two repos
            repo1_path = str(tmp_path / "repo1")
            repo2_path = str(tmp_path / "repo2")
            (tmp_path / "repo1").mkdir()
            (tmp_path / "repo2").mkdir()

            # Create Gemini project structures for both
            for repo_path in [repo1_path, repo2_path]:
                normalized = str(Path(repo_path).resolve())
                project_hash = hashlib.sha256(normalized.encode()).hexdigest()

                project_dir = tmp_path / ".gemini" / "tmp" / project_hash
                chats_dir = project_dir / "chats"
                chats_dir.mkdir(parents=True)

                session_file = chats_dir / f"session-{Path(repo_path).name}.json"
                session_file.write_text(json.dumps({"messages": []}))

            # Filter by repo1
            sessions = discover_gemini_sessions(repo_path=repo1_path)

            assert len(sessions) == 1
            assert sessions[0].session_id == "session-repo1"


class TestCodexSessionDiscovery:
    """Tests for Codex session discovery functionality."""

    def test_get_codex_sessions_dir(self, tmp_path):
        """Test getting Codex sessions directory path."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            codex_dir = get_codex_sessions_dir()
            assert codex_dir == tmp_path / ".codex" / "sessions"

    def test_discover_codex_sessions_no_codex_dir(self, tmp_path):
        """Test discovering sessions when Codex directory doesn't exist."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            sessions = discover_codex_sessions()
            assert sessions == []

    def test_discover_codex_sessions_finds_sessions(self, tmp_path):
        """Test discovering Codex sessions from date-based directory structure."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create Codex directory structure: ~/.codex/sessions/2024/01/15/session.jsonl
            session_dir = tmp_path / ".codex" / "sessions" / "2024" / "01" / "15"
            session_dir.mkdir(parents=True)

            # Create a session file with session_meta entry
            session_file = session_dir / "test-session.jsonl"
            session_meta = {
                "type": "session_meta",
                "payload": {"cwd": "/home/user/my-project"}
            }
            session_file.write_text(json.dumps(session_meta) + "\n")

            sessions = discover_codex_sessions()

            assert len(sessions) == 1
            assert sessions[0].session_id == "test-session"
            assert sessions[0].cli_type == "codex"
            assert sessions[0].encoded_path == encode_path("/home/user/my-project")

    def test_discover_codex_sessions_filters_by_repo_path(self, tmp_path):
        """Test filtering Codex sessions by repo path."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create session for repo1
            session_dir1 = tmp_path / ".codex" / "sessions" / "2024" / "01" / "15"
            session_dir1.mkdir(parents=True)
            session_file1 = session_dir1 / "session1.jsonl"
            session_file1.write_text(json.dumps({
                "type": "session_meta",
                "payload": {"cwd": "/home/user/repo1"}
            }) + "\n")

            # Create session for repo2
            session_dir2 = tmp_path / ".codex" / "sessions" / "2024" / "01" / "16"
            session_dir2.mkdir(parents=True)
            session_file2 = session_dir2 / "session2.jsonl"
            session_file2.write_text(json.dumps({
                "type": "session_meta",
                "payload": {"cwd": "/home/user/repo2"}
            }) + "\n")

            # Filter by repo1 path
            sessions = discover_codex_sessions(repo_path="/home/user/repo1")

            assert len(sessions) == 1
            assert sessions[0].session_id == "session1"

    def test_discover_codex_sessions_skips_sessions_without_cwd(self, tmp_path):
        """Test that sessions without cwd in session_meta are skipped."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            session_dir = tmp_path / ".codex" / "sessions" / "2024" / "01" / "15"
            session_dir.mkdir(parents=True)

            # Create a session file WITHOUT cwd
            session_file = session_dir / "no-cwd-session.jsonl"
            session_file.write_text(json.dumps({
                "type": "session_meta",
                "payload": {}  # No cwd
            }) + "\n")

            sessions = discover_codex_sessions()

            assert sessions == []

    def test_discover_codex_sessions_handles_none_payload(self, tmp_path):
        """Test that sessions with None payload in session_meta are skipped gracefully."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            session_dir = tmp_path / ".codex" / "sessions" / "2024" / "01" / "15"
            session_dir.mkdir(parents=True)

            # Create a session file with payload explicitly set to None
            session_file = session_dir / "none-payload-session.jsonl"
            session_file.write_text(json.dumps({
                "type": "session_meta",
                "payload": None  # Payload is None instead of missing
            }) + "\n")

            sessions = discover_codex_sessions()

            # Should be skipped gracefully without error
            assert sessions == []


class TestDiscoverAllSessions:
    """Tests for discover_all_sessions which combines all CLI sources."""

    def test_discover_all_sessions_combines_cli_sources(self, tmp_path):
        """Test that discover_all_sessions combines sessions from all CLIs."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create Claude session
            claude_dir = tmp_path / ".claude" / "projects" / "-test-project"
            claude_dir.mkdir(parents=True)
            (claude_dir / "claude-session.jsonl").write_text("{}\n")

            # Create Codex session
            codex_dir = tmp_path / ".codex" / "sessions" / "2024" / "01" / "15"
            codex_dir.mkdir(parents=True)
            codex_session = codex_dir / "codex-session.jsonl"
            codex_session.write_text(json.dumps({
                "type": "session_meta",
                "payload": {"cwd": "/test/project"}
            }) + "\n")

            sessions = discover_all_sessions()

            assert len(sessions) == 2
            cli_types = {s.cli_type for s in sessions}
            assert "claude" in cli_types
            assert "codex" in cli_types

    def test_discover_all_sessions_filters_by_cli_type(self, tmp_path):
        """Test filtering by CLI type."""
        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create Claude session
            claude_dir = tmp_path / ".claude" / "projects" / "-test-project"
            claude_dir.mkdir(parents=True)
            (claude_dir / "claude-session.jsonl").write_text("{}\n")

            # Create Codex session
            codex_dir = tmp_path / ".codex" / "sessions" / "2024" / "01" / "15"
            codex_dir.mkdir(parents=True)
            codex_session = codex_dir / "codex-session.jsonl"
            codex_session.write_text(json.dumps({
                "type": "session_meta",
                "payload": {"cwd": "/test/project"}
            }) + "\n")

            # Only get Claude sessions
            sessions = discover_all_sessions(cli_types=["claude"])

            assert len(sessions) == 1
            assert sessions[0].cli_type == "claude"

    def test_discover_all_sessions_sorted_by_modification_time(self, tmp_path):
        """Test that combined sessions are sorted by modification time."""
        import time

        with patch("app.storage.Path.home", return_value=tmp_path):
            # Create older Claude session
            claude_dir = tmp_path / ".claude" / "projects" / "-test-project"
            claude_dir.mkdir(parents=True)
            old_session = claude_dir / "old-session.jsonl"
            old_session.write_text("{}\n")
            old_time = time.time() - 3600
            os.utime(old_session, (old_time, old_time))

            # Create newer Codex session
            codex_dir = tmp_path / ".codex" / "sessions" / "2024" / "01" / "15"
            codex_dir.mkdir(parents=True)
            new_session = codex_dir / "new-session.jsonl"
            new_session.write_text(json.dumps({
                "type": "session_meta",
                "payload": {"cwd": "/test/project"}
            }) + "\n")

            sessions = discover_all_sessions()

            assert len(sessions) == 2
            # Newest first
            assert sessions[0].session_id == "new-session"
            assert sessions[1].session_id == "old-session"


class TestScheduleDefinition:
    """Tests for ScheduleDefinition dataclass."""

    def test_to_dict_basic(self):
        """Test converting schedule to dictionary."""
        schedule = ScheduleDefinition(
            id="my-schedule",
            name="My Schedule",
            description="A test schedule",
            status="active",
            cron_expression="0 9 * * 1",
            timezone="America/New_York",
            target_type="issues",
            filter_query="label:bug",
            max_items=5,
        )

        result = schedule.to_dict()

        assert result["id"] == "my-schedule"
        assert result["name"] == "My Schedule"
        assert result["description"] == "A test schedule"
        assert result["status"] == "active"
        assert result["cron_expression"] == "0 9 * * 1"
        assert result["timezone"] == "America/New_York"
        assert result["target_type"] == "issues"
        assert result["filter_query"] == "label:bug"
        assert result["max_items"] == 5

    def test_to_dict_with_defaults(self):
        """Test converting schedule with default values."""
        schedule = ScheduleDefinition(id="test", name="Test")
        result = schedule.to_dict()

        assert result["id"] == "test"
        assert result["name"] == "Test"
        assert result["description"] is None
        assert result["status"] == "active"
        assert result["cron_expression"] == "0 9 * * *"
        assert result["timezone"] == "UTC"
        assert result["target_type"] == "codebase"
        assert result["filter_query"] is None
        assert result["max_items"] == 10
        assert result["only_new"] is False

    def test_to_dict_with_all_optional_fields(self):
        """Test converting schedule with all optional fields set."""
        schedule = ScheduleDefinition(
            id="full-schedule",
            name="Full Schedule",
            description="Complete test",
            status="paused",
            cron_expression="*/30 * * * *",
            timezone="Europe/London",
            target_type="prs",
            filter_query="state:open",
            command_id="code-review",
            custom_prompt="Review this code carefully",
            max_items=20,
            only_new=True,
            permission_mode="plan",
            allowed_tools=["read", "write", "bash"],
            max_turns=50,
            model="claude-3-opus",
            cli_type="claude",
        )

        result = schedule.to_dict()

        assert result["command_id"] == "code-review"
        assert result["custom_prompt"] == "Review this code carefully"
        assert result["only_new"] is True
        assert result["permission_mode"] == "plan"
        assert result["allowed_tools"] == ["read", "write", "bash"]
        assert result["max_turns"] == 50
        assert result["model"] == "claude-3-opus"
        assert result["cli_type"] == "claude"

    def test_from_dict_basic(self):
        """Test creating schedule from dictionary."""
        data = {
            "id": "test-schedule",
            "name": "Test Schedule",
            "description": "A test",
            "status": "disabled",
            "cron_expression": "0 12 * * *",
            "timezone": "Asia/Tokyo",
            "target_type": "custom",
        }

        schedule = ScheduleDefinition.from_dict(data)

        assert schedule.id == "test-schedule"
        assert schedule.name == "Test Schedule"
        assert schedule.description == "A test"
        assert schedule.status == "disabled"
        assert schedule.cron_expression == "0 12 * * *"
        assert schedule.timezone == "Asia/Tokyo"
        assert schedule.target_type == "custom"

    def test_from_dict_with_defaults(self):
        """Test creating schedule from minimal dictionary."""
        data = {"id": "minimal", "name": "Minimal Schedule"}

        schedule = ScheduleDefinition.from_dict(data)

        assert schedule.id == "minimal"
        assert schedule.name == "Minimal Schedule"
        assert schedule.status == "active"
        assert schedule.cron_expression == "0 9 * * *"
        assert schedule.timezone == "UTC"
        assert schedule.target_type == "codebase"
        assert schedule.max_items == 10
        assert schedule.only_new is False

    def test_from_dict_with_all_fields(self):
        """Test creating schedule from dictionary with all fields."""
        data = {
            "id": "complete",
            "name": "Complete Schedule",
            "description": "Full test",
            "status": "active",
            "cron_expression": "0 0 * * 0",
            "timezone": "UTC",
            "target_type": "issues",
            "filter_query": "priority:high",
            "command_id": "triage",
            "custom_prompt": "Triage this issue",
            "max_items": 15,
            "only_new": True,
            "permission_mode": "default",
            "allowed_tools": ["read"],
            "max_turns": 25,
            "model": "claude-3-sonnet",
            "cli_type": "gemini",
        }

        schedule = ScheduleDefinition.from_dict(data)

        assert schedule.filter_query == "priority:high"
        assert schedule.command_id == "triage"
        assert schedule.custom_prompt == "Triage this issue"
        assert schedule.max_items == 15
        assert schedule.only_new is True
        assert schedule.permission_mode == "default"
        assert schedule.allowed_tools == ["read"]
        assert schedule.max_turns == 25
        assert schedule.model == "claude-3-sonnet"
        assert schedule.cli_type == "gemini"

    def test_roundtrip_to_dict_from_dict(self):
        """Test that to_dict/from_dict roundtrip preserves all data."""
        original = ScheduleDefinition(
            id="roundtrip-test",
            name="Roundtrip Test",
            description="Testing roundtrip",
            status="paused",
            cron_expression="30 8 * * 1-5",
            timezone="America/Chicago",
            target_type="prs",
            filter_query="label:needs-review",
            command_id="review",
            custom_prompt="Custom prompt here",
            max_items=7,
            only_new=True,
            permission_mode="trust",
            allowed_tools=["read", "write"],
            max_turns=100,
            model="custom-model",
            cli_type="codex",
        )

        data = original.to_dict()
        restored = ScheduleDefinition.from_dict(data)

        assert restored.id == original.id
        assert restored.name == original.name
        assert restored.description == original.description
        assert restored.status == original.status
        assert restored.cron_expression == original.cron_expression
        assert restored.timezone == original.timezone
        assert restored.target_type == original.target_type
        assert restored.filter_query == original.filter_query
        assert restored.command_id == original.command_id
        assert restored.custom_prompt == original.custom_prompt
        assert restored.max_items == original.max_items
        assert restored.only_new == original.only_new
        assert restored.permission_mode == original.permission_mode
        assert restored.allowed_tools == original.allowed_tools
        assert restored.max_turns == original.max_turns
        assert restored.model == original.model
        assert restored.cli_type == original.cli_type


class TestGetRepoSchedulesDir:
    """Tests for get_repo_schedules_dir function."""

    def test_creates_schedules_directory(self, tmp_path):
        """Test that schedules directory is created."""
        repo_path = str(tmp_path / "my-repo")
        (tmp_path / "my-repo").mkdir()

        schedules_dir = get_repo_schedules_dir(repo_path)

        assert schedules_dir.exists()
        assert schedules_dir == Path(repo_path) / ".clump" / "schedules"

    def test_returns_existing_directory(self, tmp_path):
        """Test that existing directory is returned without error."""
        repo_path = str(tmp_path / "my-repo")
        (tmp_path / "my-repo" / ".clump" / "schedules").mkdir(parents=True)

        schedules_dir = get_repo_schedules_dir(repo_path)

        assert schedules_dir.exists()
        assert schedules_dir == Path(repo_path) / ".clump" / "schedules"


class TestScheduleDefinitionIO:
    """Tests for schedule definition read/write operations."""

    def test_save_and_get_schedule_definition(self, tmp_path):
        """Test saving and retrieving a schedule definition."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        schedule = ScheduleDefinition(
            id="test-schedule",
            name="Test Schedule",
            description="Testing save/load",
            cron_expression="0 10 * * *",
        )

        save_schedule_definition(repo_path, schedule)
        loaded = get_schedule_definition(repo_path, "test-schedule")

        assert loaded is not None
        assert loaded.id == "test-schedule"
        assert loaded.name == "Test Schedule"
        assert loaded.description == "Testing save/load"
        assert loaded.cron_expression == "0 10 * * *"

    def test_get_schedule_definition_not_found(self, tmp_path):
        """Test getting non-existent schedule returns None."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        result = get_schedule_definition(repo_path, "nonexistent")

        assert result is None

    def test_get_schedule_definition_invalid_json(self, tmp_path):
        """Test handling of invalid JSON in schedule file."""
        repo_path = str(tmp_path / "test-repo")
        schedules_dir = tmp_path / "test-repo" / ".clump" / "schedules"
        schedules_dir.mkdir(parents=True)

        schedule_file = schedules_dir / "bad-schedule.json"
        schedule_file.write_text("not valid json {{{")

        result = get_schedule_definition(repo_path, "bad-schedule")

        assert result is None

    def test_get_schedule_definition_uses_filename_as_id(self, tmp_path):
        """Test that the filename takes precedence over id in JSON."""
        repo_path = str(tmp_path / "test-repo")
        schedules_dir = tmp_path / "test-repo" / ".clump" / "schedules"
        schedules_dir.mkdir(parents=True)

        # Create a file where JSON id doesn't match filename
        schedule_data = {
            "id": "wrong-id",
            "name": "Test",
        }
        schedule_file = schedules_dir / "correct-id.json"
        schedule_file.write_text(json.dumps(schedule_data))

        loaded = get_schedule_definition(repo_path, "correct-id")

        assert loaded is not None
        assert loaded.id == "correct-id"  # Filename wins

    def test_save_schedule_definition_overwrites(self, tmp_path):
        """Test that save overwrites existing schedule."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        original = ScheduleDefinition(
            id="overwrite-test",
            name="Original Name",
            description="Original description",
        )
        save_schedule_definition(repo_path, original)

        updated = ScheduleDefinition(
            id="overwrite-test",
            name="Updated Name",
            description="Updated description",
        )
        save_schedule_definition(repo_path, updated)

        loaded = get_schedule_definition(repo_path, "overwrite-test")

        assert loaded is not None
        assert loaded.name == "Updated Name"
        assert loaded.description == "Updated description"

    def test_save_schedule_definition_create_new(self, tmp_path):
        """Test that create_new=True fails if file exists."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        schedule = ScheduleDefinition(
            id="unique-test",
            name="First Schedule",
        )
        save_schedule_definition(repo_path, schedule, create_new=True)

        # Try to create again with same ID
        duplicate = ScheduleDefinition(
            id="unique-test",
            name="Duplicate Schedule",
        )

        with pytest.raises(FileExistsError):
            save_schedule_definition(repo_path, duplicate, create_new=True)

    def test_delete_schedule_definition_exists(self, tmp_path):
        """Test deleting an existing schedule definition."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        schedule = ScheduleDefinition(id="to-delete", name="Delete Me")
        save_schedule_definition(repo_path, schedule)

        # Verify it exists
        assert get_schedule_definition(repo_path, "to-delete") is not None

        # Delete it
        result = delete_schedule_definition(repo_path, "to-delete")

        assert result is True
        assert get_schedule_definition(repo_path, "to-delete") is None

    def test_delete_schedule_definition_not_found(self, tmp_path):
        """Test deleting non-existent schedule returns False."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        result = delete_schedule_definition(repo_path, "nonexistent")

        assert result is False


class TestListScheduleDefinitions:
    """Tests for list_schedule_definitions function."""

    def test_list_empty_directory(self, tmp_path):
        """Test listing schedules when no schedules exist."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        schedules = list_schedule_definitions(repo_path)

        assert schedules == []

    def test_list_schedules_directory_not_exists(self, tmp_path):
        """Test listing schedules when .clump/schedules doesn't exist."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        # Don't create .clump/schedules
        schedules = list_schedule_definitions(repo_path)

        assert schedules == []

    def test_list_multiple_schedules(self, tmp_path):
        """Test listing multiple schedule definitions."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        schedule1 = ScheduleDefinition(id="alpha", name="Alpha Schedule")
        schedule2 = ScheduleDefinition(id="beta", name="Beta Schedule")
        schedule3 = ScheduleDefinition(id="gamma", name="Gamma Schedule")

        save_schedule_definition(repo_path, schedule1)
        save_schedule_definition(repo_path, schedule2)
        save_schedule_definition(repo_path, schedule3)

        schedules = list_schedule_definitions(repo_path)

        assert len(schedules) == 3
        names = [s.name for s in schedules]
        assert "Alpha Schedule" in names
        assert "Beta Schedule" in names
        assert "Gamma Schedule" in names

    def test_list_schedules_sorted_alphabetically(self, tmp_path):
        """Test that schedules are sorted alphabetically by filename."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        # Create in non-alphabetical order
        schedule_c = ScheduleDefinition(id="charlie", name="Charlie")
        schedule_a = ScheduleDefinition(id="alpha", name="Alpha")
        schedule_b = ScheduleDefinition(id="bravo", name="Bravo")

        save_schedule_definition(repo_path, schedule_c)
        save_schedule_definition(repo_path, schedule_a)
        save_schedule_definition(repo_path, schedule_b)

        schedules = list_schedule_definitions(repo_path)

        assert len(schedules) == 3
        assert schedules[0].id == "alpha"
        assert schedules[1].id == "bravo"
        assert schedules[2].id == "charlie"

    def test_list_schedules_skips_invalid_json(self, tmp_path):
        """Test that invalid JSON files are skipped."""
        repo_path = str(tmp_path / "test-repo")
        schedules_dir = tmp_path / "test-repo" / ".clump" / "schedules"
        schedules_dir.mkdir(parents=True)

        # Create a valid schedule
        valid_schedule = ScheduleDefinition(id="valid", name="Valid Schedule")
        save_schedule_definition(repo_path, valid_schedule)

        # Create an invalid JSON file
        (schedules_dir / "invalid.json").write_text("not json {{{")

        schedules = list_schedule_definitions(repo_path)

        assert len(schedules) == 1
        assert schedules[0].id == "valid"

    def test_list_schedules_skips_missing_required_fields(self, tmp_path):
        """Test that files missing required fields are skipped."""
        repo_path = str(tmp_path / "test-repo")
        schedules_dir = tmp_path / "test-repo" / ".clump" / "schedules"
        schedules_dir.mkdir(parents=True)

        # Create a valid schedule
        valid_schedule = ScheduleDefinition(id="valid", name="Valid")
        save_schedule_definition(repo_path, valid_schedule)

        # Create a file missing required 'name' field
        incomplete = {"description": "No name"}  # Missing id and name
        (schedules_dir / "incomplete.json").write_text(json.dumps(incomplete))

        schedules = list_schedule_definitions(repo_path)

        assert len(schedules) == 1
        assert schedules[0].id == "valid"

    def test_list_schedules_uses_filename_as_id(self, tmp_path):
        """Test that filenames are used as IDs."""
        repo_path = str(tmp_path / "test-repo")
        schedules_dir = tmp_path / "test-repo" / ".clump" / "schedules"
        schedules_dir.mkdir(parents=True)

        # Create a file where JSON id doesn't match filename
        schedule_data = {"id": "wrong-id", "name": "Test Schedule"}
        (schedules_dir / "correct-id.json").write_text(json.dumps(schedule_data))

        schedules = list_schedule_definitions(repo_path)

        assert len(schedules) == 1
        assert schedules[0].id == "correct-id"


class TestGenerateScheduleId:
    """Tests for generate_schedule_id function."""

    def test_basic_slugification(self, tmp_path):
        """Test basic name to slug conversion."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        schedule_id = generate_schedule_id("My Test Schedule", repo_path)

        assert schedule_id == "my-test-schedule"

    def test_handles_special_characters(self, tmp_path):
        """Test that special characters are removed."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        schedule_id = generate_schedule_id("Test!@#$%^&*()Schedule", repo_path)

        assert schedule_id == "testschedule"

    def test_handles_multiple_spaces(self, tmp_path):
        """Test that multiple spaces collapse into single dashes."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        schedule_id = generate_schedule_id("Test    Multiple   Spaces", repo_path)

        # Multiple consecutive dashes should collapse into a single dash
        assert schedule_id == "test-multiple-spaces"

    def test_handles_leading_trailing_dashes(self, tmp_path):
        """Test that leading/trailing dashes are removed."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        schedule_id = generate_schedule_id("---Test---", repo_path)

        assert schedule_id == "test"

    def test_empty_name_uses_default(self, tmp_path):
        """Test that empty name defaults to 'schedule'."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        schedule_id = generate_schedule_id("", repo_path)

        assert schedule_id == "schedule"

    def test_special_chars_only_uses_default(self, tmp_path):
        """Test that name with only special chars defaults to 'schedule'."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        schedule_id = generate_schedule_id("!@#$%^&*()", repo_path)

        assert schedule_id == "schedule"

    def test_ensures_uniqueness(self, tmp_path):
        """Test that generated IDs are unique within repo."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        # Create first schedule with this name
        schedule1 = ScheduleDefinition(
            id=generate_schedule_id("My Schedule", repo_path),
            name="My Schedule"
        )
        save_schedule_definition(repo_path, schedule1)

        # Generate ID for same name should add suffix
        schedule_id2 = generate_schedule_id("My Schedule", repo_path)

        assert schedule_id2 == "my-schedule-1"

    def test_uniqueness_counter_increments(self, tmp_path):
        """Test that uniqueness counter increments correctly."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        # Create schedules with incrementing suffixes
        for i in range(3):
            schedule = ScheduleDefinition(
                id=generate_schedule_id("Test", repo_path),
                name="Test"
            )
            save_schedule_definition(repo_path, schedule)

        # Fourth one should be test-3
        next_id = generate_schedule_id("Test", repo_path)

        assert next_id == "test-3"

    def test_preserves_existing_numbers_in_name(self, tmp_path):
        """Test that numbers in the name are preserved."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        schedule_id = generate_schedule_id("Schedule 2023", repo_path)

        assert schedule_id == "schedule-2023"

    def test_collapses_consecutive_dashes_from_special_chars(self, tmp_path):
        """Test that special chars between words don't create multiple dashes."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        # Special chars surrounded by spaces should collapse to single dash
        schedule_id = generate_schedule_id("Test - Schedule", repo_path)

        assert schedule_id == "test-schedule"

    def test_collapses_many_consecutive_dashes(self, tmp_path):
        """Test that many consecutive dashes collapse to one."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        # Name that would produce many dashes
        schedule_id = generate_schedule_id("A     B", repo_path)

        assert schedule_id == "a-b"

    def test_mixed_special_chars_and_spaces(self, tmp_path):
        """Test combination of special chars and spaces."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        schedule_id = generate_schedule_id("Test!!! @ Schedule", repo_path)

        # Special chars removed, multiple spaces collapse to single dash
        assert schedule_id == "test-schedule"

    def test_dashes_in_middle_of_name_preserved(self, tmp_path):
        """Test that single dashes in the name are preserved."""
        repo_path = str(tmp_path / "test-repo")
        (tmp_path / "test-repo").mkdir()

        schedule_id = generate_schedule_id("test-schedule-name", repo_path)

        assert schedule_id == "test-schedule-name"


class TestGetRepoPathFromEncoded:
    """Tests for get_repo_path_from_encoded function.

    This function correctly retrieves repo paths from encoded paths,
    avoiding the lossy decode_path function which fails for paths
    with underscores or dashes.
    """

    def test_returns_repo_path_for_known_repo(self, tmp_path, monkeypatch):
        """Test that known repos return correct path."""
        # Create a repo with underscores in path
        repo_path = str(tmp_path / "my_project_v2")
        (tmp_path / "my_project_v2").mkdir()

        repos = [{"id": 1, "owner": "test", "name": "repo", "local_path": repo_path}]
        monkeypatch.setattr("app.storage.load_repos", lambda: repos)

        encoded = encode_path(repo_path)
        result = get_repo_path_from_encoded(encoded)

        assert result == repo_path

    def test_returns_repo_path_for_known_repo_with_dashes(self, tmp_path, monkeypatch):
        """Test that repos with dashes in path return correct path."""
        repo_path = str(tmp_path / "my-project-v2")
        (tmp_path / "my-project-v2").mkdir()

        repos = [{"id": 1, "owner": "test", "name": "repo", "local_path": repo_path}]
        monkeypatch.setattr("app.storage.load_repos", lambda: repos)

        encoded = encode_path(repo_path)
        result = get_repo_path_from_encoded(encoded)

        assert result == repo_path

    def test_falls_back_to_decode_path_for_unknown_repo(self, monkeypatch):
        """Test fallback to decode_path for unknown repos."""
        monkeypatch.setattr("app.storage.load_repos", lambda: [])

        # For a path without special chars, decode_path works correctly
        encoded = "-home-user-projects"
        result = get_repo_path_from_encoded(encoded)

        assert result == "/home/user/projects"

    def test_correctly_resolves_path_with_underscores_in_known_repo(self, tmp_path, monkeypatch):
        """Test that paths with underscores are correctly resolved.

        This is the key bug fix - decode_path would incorrectly convert
        underscores (which become dashes when encoded) back to slashes.
        """
        # Original path has underscores
        repo_path = str(tmp_path / "my_awesome_project")
        (tmp_path / "my_awesome_project").mkdir()

        repos = [{"id": 1, "owner": "test", "name": "repo", "local_path": repo_path}]
        monkeypatch.setattr("app.storage.load_repos", lambda: repos)

        encoded = encode_path(repo_path)
        result = get_repo_path_from_encoded(encoded)

        # Should return original path with underscores, not slashes
        assert result == repo_path
        assert "_" in result  # Underscores preserved

    def test_handles_multiple_repos(self, tmp_path, monkeypatch):
        """Test matching when multiple repos are registered."""
        repo1_path = str(tmp_path / "project_one")
        repo2_path = str(tmp_path / "project_two")
        (tmp_path / "project_one").mkdir()
        (tmp_path / "project_two").mkdir()

        repos = [
            {"id": 1, "owner": "test", "name": "one", "local_path": repo1_path},
            {"id": 2, "owner": "test", "name": "two", "local_path": repo2_path},
        ]
        monkeypatch.setattr("app.storage.load_repos", lambda: repos)

        # Should match the correct repo
        result = get_repo_path_from_encoded(encode_path(repo2_path))
        assert result == repo2_path


class TestIssueMetadataWithUnderscorePaths:
    """Tests for issue metadata functions with paths containing underscores.

    These tests verify that the fix for using get_repo_path_from_encoded
    instead of decode_path works correctly.
    """

    @pytest.fixture
    def repo_with_underscores(self, tmp_path, monkeypatch):
        """Create a repo with underscores in the path."""
        repo_path = tmp_path / "my_project_v2"
        repo_path.mkdir()
        (repo_path / ".clump" / "issues").mkdir(parents=True)

        repos = [{"id": 1, "owner": "test", "name": "repo", "local_path": str(repo_path)}]
        monkeypatch.setattr("app.storage.load_repos", lambda: repos)

        return str(repo_path)

    def test_save_and_get_issue_metadata(self, repo_with_underscores, monkeypatch):
        """Test that metadata can be saved and retrieved for repos with underscores."""
        repo_path = repo_with_underscores
        encoded_path = encode_path(repo_path)

        # Patch get_clump_projects_dir to use temp dir
        monkeypatch.setattr("app.storage.get_clump_projects_dir", lambda: Path(repo_path).parent / ".clump_test")

        metadata = IssueMetadata(issue_number=42, priority="high", difficulty="medium")
        save_issue_metadata(encoded_path, 42, metadata)

        # Retrieve it
        result = get_issue_metadata(encoded_path, 42)

        assert result is not None
        assert result.issue_number == 42
        assert result.priority == "high"
        assert result.difficulty == "medium"

    def test_delete_issue_metadata(self, repo_with_underscores, monkeypatch):
        """Test that metadata can be deleted for repos with underscores."""
        repo_path = repo_with_underscores
        encoded_path = encode_path(repo_path)

        monkeypatch.setattr("app.storage.get_clump_projects_dir", lambda: Path(repo_path).parent / ".clump_test")

        metadata = IssueMetadata(issue_number=42, priority="high")
        save_issue_metadata(encoded_path, 42, metadata)

        # Delete it
        deleted = delete_issue_metadata(encoded_path, 42)
        assert deleted is True

        # Verify it's gone
        result = get_issue_metadata(encoded_path, 42)
        assert result is None

    def test_list_issue_metadata(self, repo_with_underscores, monkeypatch):
        """Test listing all issue metadata for repos with underscores."""
        repo_path = repo_with_underscores
        encoded_path = encode_path(repo_path)

        monkeypatch.setattr("app.storage.get_clump_projects_dir", lambda: Path(repo_path).parent / ".clump_test")

        # Save multiple issues
        for i in range(1, 4):
            metadata = IssueMetadata(issue_number=i, priority="medium")
            save_issue_metadata(encoded_path, i, metadata)

        # List them
        result = list_issue_metadata(encoded_path)

        assert len(result) == 3
        issue_numbers = {m.issue_number for m in result}
        assert issue_numbers == {1, 2, 3}


class TestPRMetadataWithUnderscorePaths:
    """Tests for PR metadata functions with paths containing underscores."""

    @pytest.fixture
    def repo_with_underscores(self, tmp_path, monkeypatch):
        """Create a repo with underscores in the path."""
        repo_path = tmp_path / "my_project_v2"
        repo_path.mkdir()
        (repo_path / ".clump" / "prs").mkdir(parents=True)

        repos = [{"id": 1, "owner": "test", "name": "repo", "local_path": str(repo_path)}]
        monkeypatch.setattr("app.storage.load_repos", lambda: repos)

        return str(repo_path)

    def test_save_and_get_pr_metadata(self, repo_with_underscores, monkeypatch):
        """Test that PR metadata can be saved and retrieved for repos with underscores."""
        repo_path = repo_with_underscores
        encoded_path = encode_path(repo_path)

        monkeypatch.setattr("app.storage.get_clump_projects_dir", lambda: Path(repo_path).parent / ".clump_test")

        metadata = PRMetadata(pr_number=42, risk="low")
        save_pr_metadata(encoded_path, 42, metadata)

        result = get_pr_metadata(encoded_path, 42)

        assert result is not None
        assert result.pr_number == 42
        assert result.risk == "low"

    def test_delete_pr_metadata(self, repo_with_underscores, monkeypatch):
        """Test that PR metadata can be deleted for repos with underscores."""
        repo_path = repo_with_underscores
        encoded_path = encode_path(repo_path)

        monkeypatch.setattr("app.storage.get_clump_projects_dir", lambda: Path(repo_path).parent / ".clump_test")

        metadata = PRMetadata(pr_number=42, risk="high")
        save_pr_metadata(encoded_path, 42, metadata)

        deleted = delete_pr_metadata(encoded_path, 42)
        assert deleted is True

        result = get_pr_metadata(encoded_path, 42)
        assert result is None

    def test_list_pr_metadata(self, repo_with_underscores, monkeypatch):
        """Test listing all PR metadata for repos with underscores."""
        repo_path = repo_with_underscores
        encoded_path = encode_path(repo_path)

        monkeypatch.setattr("app.storage.get_clump_projects_dir", lambda: Path(repo_path).parent / ".clump_test")

        for i in range(1, 4):
            metadata = PRMetadata(pr_number=i, risk="medium")
            save_pr_metadata(encoded_path, i, metadata)

        result = list_pr_metadata(encoded_path)

        assert len(result) == 3
        pr_numbers = {m.pr_number for m in result}
        assert pr_numbers == {1, 2, 3}


class TestMetadataFallbackToGlobal:
    """Tests for metadata fallback to global ~/.clump/projects/ location."""

    def test_get_issue_metadata_falls_back_to_global(self, tmp_path, monkeypatch):
        """Test that issue metadata falls back to global location."""
        repo_path = tmp_path / "my_project"
        repo_path.mkdir()
        # Don't create local .clump/issues/

        # Set up global location
        global_clump = tmp_path / ".clump_global"
        encoded_path = encode_path(str(repo_path))
        global_issues = global_clump / encoded_path / "issues"
        global_issues.mkdir(parents=True)

        # Write metadata to global location
        metadata = {"issue_number": 42, "priority": "high"}
        with open(global_issues / "42.json", "w") as f:
            json.dump(metadata, f)

        repos = [{"id": 1, "owner": "test", "name": "repo", "local_path": str(repo_path)}]
        monkeypatch.setattr("app.storage.load_repos", lambda: repos)
        monkeypatch.setattr("app.storage.get_clump_projects_dir", lambda: global_clump)

        result = get_issue_metadata(encoded_path, 42)

        assert result is not None
        assert result.issue_number == 42
        assert result.priority == "high"

    def test_local_metadata_takes_precedence(self, tmp_path, monkeypatch):
        """Test that local metadata overrides global."""
        repo_path = tmp_path / "my_project"
        repo_path.mkdir()
        local_issues = repo_path / ".clump" / "issues"
        local_issues.mkdir(parents=True)

        global_clump = tmp_path / ".clump_global"
        encoded_path = encode_path(str(repo_path))
        global_issues = global_clump / encoded_path / "issues"
        global_issues.mkdir(parents=True)

        # Write different metadata to both locations
        local_meta = {"issue_number": 42, "priority": "critical"}
        global_meta = {"issue_number": 42, "priority": "low"}

        with open(local_issues / "42.json", "w") as f:
            json.dump(local_meta, f)
        with open(global_issues / "42.json", "w") as f:
            json.dump(global_meta, f)

        repos = [{"id": 1, "owner": "test", "name": "repo", "local_path": str(repo_path)}]
        monkeypatch.setattr("app.storage.load_repos", lambda: repos)
        monkeypatch.setattr("app.storage.get_clump_projects_dir", lambda: global_clump)

        result = get_issue_metadata(encoded_path, 42)

        # Should get local value
        assert result.priority == "critical"


class TestIssueMetadataSerialization:
    """Tests for IssueMetadata to_dict() and from_dict() methods."""

    def test_to_dict_includes_all_fields(self):
        """to_dict() returns all fields."""
        metadata = IssueMetadata(
            issue_number=42,
            status="in_progress",
            tags=["backend", "urgent"],
            priority="high",
            difficulty="medium",
            risk="low",
            type="bug",
            affected_areas=["auth", "api"],
            ai_summary="Auth bug in login flow",
            notes="Needs investigation",
            root_cause="Token validation issue",
            suggested_fix="Update token expiry check",
            analyzed_at="2025-01-01T10:00:00Z",
            analyzed_by="claude-sonnet-4",
        )

        result = metadata.to_dict()

        assert result["issue_number"] == 42
        assert result["status"] == "in_progress"
        assert result["tags"] == ["backend", "urgent"]
        assert result["priority"] == "high"
        assert result["difficulty"] == "medium"
        assert result["risk"] == "low"
        assert result["type"] == "bug"
        assert result["affected_areas"] == ["auth", "api"]
        assert result["ai_summary"] == "Auth bug in login flow"
        assert result["notes"] == "Needs investigation"
        assert result["root_cause"] == "Token validation issue"
        assert result["suggested_fix"] == "Update token expiry check"
        assert result["analyzed_at"] == "2025-01-01T10:00:00Z"
        assert result["analyzed_by"] == "claude-sonnet-4"

    def test_to_dict_handles_none_fields(self):
        """to_dict() includes None values for optional fields."""
        metadata = IssueMetadata(issue_number=1)

        result = metadata.to_dict()

        assert result["issue_number"] == 1
        assert result["status"] is None
        assert result["tags"] == []
        assert result["priority"] is None
        assert result["difficulty"] is None
        assert result["risk"] is None
        assert result["type"] is None
        assert result["affected_areas"] == []
        assert result["ai_summary"] is None

    def test_from_dict_parses_all_fields(self):
        """from_dict() correctly parses all fields."""
        data = {
            "issue_number": 42,
            "status": "open",
            "tags": ["frontend"],
            "priority": "critical",
            "difficulty": "hard",
            "risk": "high",
            "type": "feature",
            "affected_areas": ["ui", "ux"],
            "ai_summary": "New feature request",
            "notes": "Important feature",
            "root_cause": None,
            "suggested_fix": "Implement new UI component",
            "analyzed_at": "2025-01-02T12:00:00Z",
            "analyzed_by": "claude-opus-4",
        }

        result = IssueMetadata.from_dict(data)

        assert result.issue_number == 42
        assert result.status == "open"
        assert result.tags == ["frontend"]
        assert result.priority == "critical"
        assert result.difficulty == "hard"
        assert result.risk == "high"
        assert result.type == "feature"
        assert result.affected_areas == ["ui", "ux"]
        assert result.ai_summary == "New feature request"
        assert result.notes == "Important feature"
        assert result.root_cause is None
        assert result.suggested_fix == "Implement new UI component"
        assert result.analyzed_at == "2025-01-02T12:00:00Z"
        assert result.analyzed_by == "claude-opus-4"

    def test_from_dict_handles_missing_fields(self):
        """from_dict() uses defaults for missing fields."""
        data = {"issue_number": 99}

        result = IssueMetadata.from_dict(data)

        assert result.issue_number == 99
        assert result.status is None
        assert result.tags == []
        assert result.priority is None
        assert result.difficulty is None
        assert result.risk is None
        assert result.type is None
        assert result.affected_areas == []
        assert result.ai_summary is None

    def test_from_dict_handles_empty_dict(self):
        """from_dict() handles empty dict with defaults."""
        data = {}

        result = IssueMetadata.from_dict(data)

        assert result.issue_number == 0
        assert result.tags == []
        assert result.affected_areas == []

    def test_round_trip_serialization(self):
        """to_dict() and from_dict() are inverse operations."""
        original = IssueMetadata(
            issue_number=123,
            status="completed",
            tags=["done", "reviewed"],
            priority="medium",
            difficulty="easy",
            risk="low",
            type="refactor",
            affected_areas=["core"],
            ai_summary="Code cleanup",
            notes="Minor refactoring",
            root_cause=None,
            suggested_fix=None,
            analyzed_at="2025-01-03T08:00:00Z",
            analyzed_by="claude-haiku",
        )

        serialized = original.to_dict()
        deserialized = IssueMetadata.from_dict(serialized)

        assert deserialized.issue_number == original.issue_number
        assert deserialized.status == original.status
        assert deserialized.tags == original.tags
        assert deserialized.priority == original.priority
        assert deserialized.difficulty == original.difficulty
        assert deserialized.risk == original.risk
        assert deserialized.type == original.type
        assert deserialized.affected_areas == original.affected_areas
        assert deserialized.ai_summary == original.ai_summary
        assert deserialized.notes == original.notes
        assert deserialized.root_cause == original.root_cause
        assert deserialized.suggested_fix == original.suggested_fix
        assert deserialized.analyzed_at == original.analyzed_at
        assert deserialized.analyzed_by == original.analyzed_by

    def test_from_dict_handles_extra_fields(self):
        """from_dict() ignores extra/unknown fields."""
        data = {
            "issue_number": 1,
            "priority": "high",
            "unknown_field": "should be ignored",
            "another_extra": 42,
        }

        result = IssueMetadata.from_dict(data)

        assert result.issue_number == 1
        assert result.priority == "high"
        # Extra fields are ignored (no exception raised)


class TestPRMetadataSerialization:
    """Tests for PRMetadata to_dict() and from_dict() methods."""

    def test_to_dict_includes_all_fields(self):
        """to_dict() returns all fields."""
        metadata = PRMetadata(
            pr_number=101,
            status="reviewing",
            tags=["needs-review", "priority"],
            risk="medium",
            complexity="moderate",
            review_priority="high",
            security_concerns=["SQL injection risk"],
            test_coverage="partial",
            breaking_changes=True,
            change_type="feature",
            affected_areas=["api", "database"],
            ai_summary="New API endpoint for users",
            review_notes="Check input validation",
            suggested_improvements="Add rate limiting",
            analyzed_at="2025-01-01T10:00:00Z",
            analyzed_by="claude-sonnet-4",
        )

        result = metadata.to_dict()

        assert result["pr_number"] == 101
        assert result["status"] == "reviewing"
        assert result["tags"] == ["needs-review", "priority"]
        assert result["risk"] == "medium"
        assert result["complexity"] == "moderate"
        assert result["review_priority"] == "high"
        assert result["security_concerns"] == ["SQL injection risk"]
        assert result["test_coverage"] == "partial"
        assert result["breaking_changes"] is True
        assert result["change_type"] == "feature"
        assert result["affected_areas"] == ["api", "database"]
        assert result["ai_summary"] == "New API endpoint for users"
        assert result["review_notes"] == "Check input validation"
        assert result["suggested_improvements"] == "Add rate limiting"
        assert result["analyzed_at"] == "2025-01-01T10:00:00Z"
        assert result["analyzed_by"] == "claude-sonnet-4"

    def test_to_dict_handles_none_and_defaults(self):
        """to_dict() includes None values and default values."""
        metadata = PRMetadata(pr_number=1)

        result = metadata.to_dict()

        assert result["pr_number"] == 1
        assert result["status"] is None
        assert result["tags"] == []
        assert result["risk"] is None
        assert result["complexity"] is None
        assert result["review_priority"] is None
        assert result["security_concerns"] == []
        assert result["test_coverage"] is None
        assert result["breaking_changes"] is False
        assert result["change_type"] is None
        assert result["affected_areas"] == []

    def test_from_dict_parses_all_fields(self):
        """from_dict() correctly parses all fields."""
        data = {
            "pr_number": 202,
            "status": "approved",
            "tags": ["lgtm"],
            "risk": "low",
            "complexity": "simple",
            "review_priority": "low",
            "security_concerns": [],
            "test_coverage": "good",
            "breaking_changes": False,
            "change_type": "bugfix",
            "affected_areas": ["core"],
            "ai_summary": "Minor bug fix",
            "review_notes": "LGTM",
            "suggested_improvements": None,
            "analyzed_at": "2025-01-02T12:00:00Z",
            "analyzed_by": "claude-opus-4",
        }

        result = PRMetadata.from_dict(data)

        assert result.pr_number == 202
        assert result.status == "approved"
        assert result.tags == ["lgtm"]
        assert result.risk == "low"
        assert result.complexity == "simple"
        assert result.review_priority == "low"
        assert result.security_concerns == []
        assert result.test_coverage == "good"
        assert result.breaking_changes is False
        assert result.change_type == "bugfix"
        assert result.affected_areas == ["core"]
        assert result.ai_summary == "Minor bug fix"
        assert result.review_notes == "LGTM"
        assert result.suggested_improvements is None
        assert result.analyzed_at == "2025-01-02T12:00:00Z"
        assert result.analyzed_by == "claude-opus-4"

    def test_from_dict_handles_missing_fields(self):
        """from_dict() uses defaults for missing fields."""
        data = {"pr_number": 99}

        result = PRMetadata.from_dict(data)

        assert result.pr_number == 99
        assert result.status is None
        assert result.tags == []
        assert result.risk is None
        assert result.complexity is None
        assert result.review_priority is None
        assert result.security_concerns == []
        assert result.test_coverage is None
        assert result.breaking_changes is False
        assert result.change_type is None
        assert result.affected_areas == []

    def test_from_dict_handles_empty_dict(self):
        """from_dict() handles empty dict with defaults."""
        data = {}

        result = PRMetadata.from_dict(data)

        assert result.pr_number == 0
        assert result.tags == []
        assert result.security_concerns == []
        assert result.affected_areas == []
        assert result.breaking_changes is False

    def test_round_trip_serialization(self):
        """to_dict() and from_dict() are inverse operations."""
        original = PRMetadata(
            pr_number=303,
            status="merged",
            tags=["merged", "deployed"],
            risk="high",
            complexity="complex",
            review_priority="critical",
            security_concerns=["auth bypass", "data leak"],
            test_coverage="good",
            breaking_changes=True,
            change_type="feature",
            affected_areas=["auth", "api", "frontend"],
            ai_summary="Major auth overhaul",
            review_notes="Extensive changes - careful review needed",
            suggested_improvements="Consider splitting into smaller PRs",
            analyzed_at="2025-01-03T08:00:00Z",
            analyzed_by="claude-opus-4",
        )

        serialized = original.to_dict()
        deserialized = PRMetadata.from_dict(serialized)

        assert deserialized.pr_number == original.pr_number
        assert deserialized.status == original.status
        assert deserialized.tags == original.tags
        assert deserialized.risk == original.risk
        assert deserialized.complexity == original.complexity
        assert deserialized.review_priority == original.review_priority
        assert deserialized.security_concerns == original.security_concerns
        assert deserialized.test_coverage == original.test_coverage
        assert deserialized.breaking_changes == original.breaking_changes
        assert deserialized.change_type == original.change_type
        assert deserialized.affected_areas == original.affected_areas
        assert deserialized.ai_summary == original.ai_summary
        assert deserialized.review_notes == original.review_notes
        assert deserialized.suggested_improvements == original.suggested_improvements
        assert deserialized.analyzed_at == original.analyzed_at
        assert deserialized.analyzed_by == original.analyzed_by

    def test_from_dict_handles_extra_fields(self):
        """from_dict() ignores extra/unknown fields."""
        data = {
            "pr_number": 1,
            "risk": "low",
            "unknown_field": "should be ignored",
            "another_extra": {"nested": "data"},
        }

        result = PRMetadata.from_dict(data)

        assert result.pr_number == 1
        assert result.risk == "low"
        # Extra fields are ignored (no exception raised)

    def test_breaking_changes_default_false(self):
        """breaking_changes defaults to False when missing."""
        data = {"pr_number": 1}

        result = PRMetadata.from_dict(data)

        # Should be False by default, not None
        assert result.breaking_changes is False

    def test_breaking_changes_true_from_dict(self):
        """breaking_changes can be set to True via from_dict."""
        data = {"pr_number": 1, "breaking_changes": True}

        result = PRMetadata.from_dict(data)

        assert result.breaking_changes is True


# ==============================================
# Tests for None value handling in from_dict methods
# ==============================================


class TestSessionMetadataNoneHandling:
    """Tests for None value handling in SessionMetadata.from_dict()."""

    def test_handles_none_entities(self):
        """from_dict() handles None entities field (key exists but value is None)."""
        data = {"session_id": "test-123", "entities": None}

        result = SessionMetadata.from_dict(data)

        assert result.entities == []
        assert isinstance(result.entities, list)

    def test_handles_none_tags(self):
        """from_dict() handles None tags field (key exists but value is None)."""
        data = {"session_id": "test-123", "tags": None}

        result = SessionMetadata.from_dict(data)

        assert result.tags == []
        assert isinstance(result.tags, list)

    def test_handles_all_none_list_fields(self):
        """from_dict() handles all list fields being None simultaneously."""
        data = {
            "session_id": "test-123",
            "entities": None,
            "tags": None,
        }

        result = SessionMetadata.from_dict(data)

        assert result.entities == []
        assert result.tags == []

    def test_handles_mixed_none_and_valid_list_fields(self):
        """from_dict() handles mix of None and valid list fields."""
        data = {
            "session_id": "test-123",
            "entities": None,
            "tags": ["tag1", "tag2"],
        }

        result = SessionMetadata.from_dict(data)

        assert result.entities == []
        assert result.tags == ["tag1", "tag2"]


class TestIssueMetadataNoneHandling:
    """Tests for None value handling in IssueMetadata.from_dict()."""

    def test_handles_none_tags(self):
        """from_dict() handles None tags field (key exists but value is None)."""
        data = {"issue_number": 1, "tags": None}

        result = IssueMetadata.from_dict(data)

        assert result.tags == []
        assert isinstance(result.tags, list)

    def test_handles_none_affected_areas(self):
        """from_dict() handles None affected_areas field (key exists but value is None)."""
        data = {"issue_number": 1, "affected_areas": None}

        result = IssueMetadata.from_dict(data)

        assert result.affected_areas == []
        assert isinstance(result.affected_areas, list)

    def test_handles_all_none_list_fields(self):
        """from_dict() handles all list fields being None simultaneously."""
        data = {
            "issue_number": 1,
            "tags": None,
            "affected_areas": None,
        }

        result = IssueMetadata.from_dict(data)

        assert result.tags == []
        assert result.affected_areas == []

    def test_handles_mixed_none_and_valid_list_fields(self):
        """from_dict() handles mix of None and valid list fields."""
        data = {
            "issue_number": 1,
            "tags": None,
            "affected_areas": ["api", "database"],
        }

        result = IssueMetadata.from_dict(data)

        assert result.tags == []
        assert result.affected_areas == ["api", "database"]


class TestPRMetadataNoneHandling:
    """Tests for None value handling in PRMetadata.from_dict()."""

    def test_handles_none_tags(self):
        """from_dict() handles None tags field (key exists but value is None)."""
        data = {"pr_number": 1, "tags": None}

        result = PRMetadata.from_dict(data)

        assert result.tags == []
        assert isinstance(result.tags, list)

    def test_handles_none_security_concerns(self):
        """from_dict() handles None security_concerns field (key exists but value is None)."""
        data = {"pr_number": 1, "security_concerns": None}

        result = PRMetadata.from_dict(data)

        assert result.security_concerns == []
        assert isinstance(result.security_concerns, list)

    def test_handles_none_affected_areas(self):
        """from_dict() handles None affected_areas field (key exists but value is None)."""
        data = {"pr_number": 1, "affected_areas": None}

        result = PRMetadata.from_dict(data)

        assert result.affected_areas == []
        assert isinstance(result.affected_areas, list)

    def test_handles_all_none_list_fields(self):
        """from_dict() handles all list fields being None simultaneously."""
        data = {
            "pr_number": 1,
            "tags": None,
            "security_concerns": None,
            "affected_areas": None,
        }

        result = PRMetadata.from_dict(data)

        assert result.tags == []
        assert result.security_concerns == []
        assert result.affected_areas == []

    def test_handles_mixed_none_and_valid_list_fields(self):
        """from_dict() handles mix of None and valid list fields."""
        data = {
            "pr_number": 1,
            "tags": None,
            "security_concerns": ["SQL injection"],
            "affected_areas": None,
        }

        result = PRMetadata.from_dict(data)

        assert result.tags == []
        assert result.security_concerns == ["SQL injection"]
        assert result.affected_areas == []
