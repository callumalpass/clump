"""Tests for storage module - path encoding, session discovery, and repos registry."""

import json
import pytest
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
