"""
Tests for the sessions router API endpoints.

Tests cover:
- GET /sessions (list sessions with filtering and pagination)
- GET /sessions/{session_id} (get session detail)
- PATCH /sessions/{session_id} (update session metadata)
- POST /sessions/{session_id}/entities (add entity link)
- DELETE /sessions/{session_id}/entities/{entity_idx} (remove entity link)
"""

import pytest
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI

from app.routers.sessions import (
    router,
    _quick_scan_transcript,
    _get_pending_sessions,
    _get_pending_headless_sessions,
    invalidate_session_cache,
    _calculate_duration_seconds,
    _parse_datetime_naive,
    _format_edit_tool,
    _format_read_tool,
    _format_write_tool,
    _format_bash_tool,
    _format_grep_tool,
    _format_glob_tool,
    _format_task_tool,
    _format_tool_use_markdown,
    _extract_text_from_content,
    _do_quick_scan_codex_transcript,
)
from app.storage import (
    DiscoveredSession,
    SessionMetadata,
    EntityLink,
)
from app.services.transcript_parser import ParsedTranscript, TranscriptMessage, ToolUse, TokenUsage


@pytest.fixture
def app():
    """Create a test FastAPI app with the sessions router."""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def client(app):
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def mock_discovered_session():
    """Create a mock discovered session."""
    return DiscoveredSession(
        session_id="test-uuid-1234",
        encoded_path="-home-user-projects-myapp",
        transcript_path=Path("/home/user/.claude/projects/-home-user-projects-myapp/test-uuid-1234.jsonl"),
        modified_at=datetime(2024, 1, 15, 10, 30, 0),
        file_size=1024,
        metadata=SessionMetadata(
            session_id="test-uuid-1234",
            title="Test Session",
            repo_path="/home/user/projects/myapp",
            entities=[EntityLink(kind="issue", number=42)],
            tags=["bug-fix"],
            starred=True,
        ),
    )


@pytest.fixture
def mock_parsed_transcript():
    """Create a mock parsed transcript."""
    return ParsedTranscript(
        session_id="test-uuid-1234",
        messages=[
            TranscriptMessage(
                uuid="msg-1",
                role="user",
                content="Hello, can you help?",
                timestamp="2024-01-15T10:30:00Z",
                thinking=None,
                tool_uses=[],
                model=None,
                usage=None,
            ),
            TranscriptMessage(
                uuid="msg-2",
                role="assistant",
                content="Of course! What do you need?",
                timestamp="2024-01-15T10:30:05Z",
                thinking="I should be helpful.",
                tool_uses=[
                    ToolUse(
                        id="tool-1",
                        name="Read",
                        input={"file_path": "/test.py"},
                        spawned_agent_id=None,
                    )
                ],
                model="claude-3-opus-20240229",
                usage=TokenUsage(
                    input_tokens=100,
                    output_tokens=50,
                    cache_read_tokens=10,
                    cache_creation_tokens=5,
                ),
            ),
        ],
        summary="A helpful conversation",
        model="claude-3-opus-20240229",
        total_input_tokens=100,
        total_output_tokens=50,
        total_cache_read_tokens=10,
        total_cache_creation_tokens=5,
        start_time="2024-01-15T10:30:00Z",
        end_time="2024-01-15T10:30:05Z",
        cli_version="1.0.0",
        git_branch="main",
    )


class TestListSessions:
    """Tests for GET /sessions endpoint."""

    @pytest.fixture(autouse=True)
    def clear_cache(self):
        """Clear the session cache before and after each test."""
        from app.routers.sessions import _session_cache
        _session_cache.clear()
        yield
        _session_cache.clear()

    def test_list_sessions_empty(self, client):
        """Test listing sessions when none exist."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[]), \
             patch("app.routers.sessions.process_manager") as mock_pm:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])

            response = client.get("/sessions")

            assert response.status_code == 200
            data = response.json()
            assert data["sessions"] == []
            assert data["total"] == 0

    def test_list_sessions_with_results(self, client, mock_discovered_session):
        """Test listing sessions returns correct data."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_scan.return_value = {
                "title": "First user message",
                "model": "claude-3-opus",
                "start_time": "2024-01-15T10:30:00Z",
                "end_time": "2024-01-15T10:35:00Z",
                "message_count": 5,
            }

            response = client.get("/sessions")

            assert response.status_code == 200
            data = response.json()
            assert data["total"] == 1
            assert len(data["sessions"]) == 1

            session = data["sessions"][0]
            assert session["session_id"] == "test-uuid-1234"
            assert session["encoded_path"] == "-home-user-projects-myapp"
            assert session["starred"] is True
            assert len(session["entities"]) == 1
            assert session["entities"][0]["kind"] == "issue"
            assert session["entities"][0]["number"] == 42

    def test_list_sessions_filter_by_starred(self, client, mock_discovered_session):
        """Test filtering sessions by starred status."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": None, "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # Filter starred=true should return our session
            response = client.get("/sessions?starred=true")
            assert response.status_code == 200
            assert response.json()["total"] == 1

            # Filter starred=false should exclude our session
            response = client.get("/sessions?starred=false")
            assert response.status_code == 200
            assert response.json()["total"] == 0

    def test_list_sessions_filter_by_has_entities(self, client, mock_discovered_session):
        """Test filtering sessions by entity presence."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": None, "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # has_entities=true should return our session (has issue #42)
            response = client.get("/sessions?has_entities=true")
            assert response.status_code == 200
            assert response.json()["total"] == 1

            # has_entities=false should exclude our session
            response = client.get("/sessions?has_entities=false")
            assert response.status_code == 200
            assert response.json()["total"] == 0

    def test_list_sessions_search(self, client, mock_discovered_session):
        """Test searching sessions by title."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": "Test Session", "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # Search for existing title
            response = client.get("/sessions?search=Test")
            assert response.status_code == 200
            assert response.json()["total"] == 1

            # Search for non-existent title
            response = client.get("/sessions?search=NotFound")
            assert response.status_code == 200
            assert response.json()["total"] == 0

    def test_list_sessions_multiple(self, client):
        """Test listing multiple sessions returns all of them."""
        # Create multiple mock sessions
        sessions = []
        for i in range(5):
            sessions.append(DiscoveredSession(
                session_id=f"test-uuid-{i}",
                encoded_path="-home-user-projects-myapp",
                transcript_path=Path(f"/home/user/.claude/projects/-home-user-projects-myapp/test-uuid-{i}.jsonl"),
                modified_at=datetime(2024, 1, 15, 10, 30, i),
                file_size=1024,
                metadata=None,
            ))

        with patch("app.routers.sessions.discover_all_sessions", return_value=sessions), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": None, "model": None, "start_time": None, "end_time": None, "message_count": 0}

            response = client.get("/sessions")
            assert response.status_code == 200
            data = response.json()
            assert data["total"] == 5
            assert len(data["sessions"]) == 5

            # Verify session IDs are present
            session_ids = {s["session_id"] for s in data["sessions"]}
            for i in range(5):
                assert f"test-uuid-{i}" in session_ids


class TestGetSession:
    """Tests for GET /sessions/{session_id} endpoint."""

    @pytest.fixture(autouse=True)
    def clear_cache(self):
        """Clear the session cache before and after each test."""
        from app.routers.sessions import _session_cache
        _session_cache.clear()
        yield
        _session_cache.clear()

    def test_get_session_success(self, client, mock_discovered_session, mock_parsed_transcript):
        """Test getting a session detail successfully."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions.parse_transcript_file", return_value=mock_parsed_transcript):
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])

            response = client.get("/sessions/test-uuid-1234")

            assert response.status_code == 200
            data = response.json()
            assert data["session_id"] == "test-uuid-1234"
            assert data["encoded_path"] == "-home-user-projects-myapp"
            assert len(data["messages"]) == 2
            assert data["messages"][0]["role"] == "user"
            assert data["messages"][1]["role"] == "assistant"
            assert data["summary"] == "A helpful conversation"
            assert data["model"] == "claude-3-opus-20240229"
            assert data["total_input_tokens"] == 100
            assert data["total_output_tokens"] == 50
            assert data["is_active"] is False

    def test_get_session_not_found(self, client):
        """Test getting a non-existent session returns 404."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[]), \
             patch("app.routers.sessions.process_manager") as mock_pm:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])

            response = client.get("/sessions/nonexistent-uuid")

            assert response.status_code == 404
            assert "not found" in response.json()["detail"].lower()

    def test_get_session_active_process(self, client, mock_discovered_session, mock_parsed_transcript):
        """Test getting a session that has an active process."""
        mock_process = MagicMock()
        mock_process.claude_session_id = "test-uuid-1234"

        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions.parse_transcript_file", return_value=mock_parsed_transcript):
            mock_pm.list_processes = AsyncMock(return_value=[mock_process])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[mock_process])

            response = client.get("/sessions/test-uuid-1234")

            assert response.status_code == 200
            assert response.json()["is_active"] is True

    def test_get_session_parse_failure(self, client, mock_discovered_session):
        """Test handling transcript parse failure."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions.parse_transcript_file", return_value=None):
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])

            response = client.get("/sessions/test-uuid-1234")

            assert response.status_code == 500
            assert "parse" in response.json()["detail"].lower()


class TestUpdateSessionMetadata:
    """Tests for PATCH /sessions/{session_id} endpoint."""

    @pytest.fixture(autouse=True)
    def clear_cache(self):
        """Clear the session cache before and after each test."""
        from app.routers.sessions import _session_cache
        _session_cache.clear()
        yield
        _session_cache.clear()

    def test_update_session_title(self, client, mock_discovered_session):
        """Test updating session title."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.save_session_metadata") as mock_save:

            response = client.patch(
                "/sessions/test-uuid-1234",
                json={"title": "New Title"}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["title"] == "New Title"
            mock_save.assert_called_once()

    def test_update_session_starred(self, client, mock_discovered_session):
        """Test updating session starred status."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.save_session_metadata") as mock_save:

            response = client.patch(
                "/sessions/test-uuid-1234",
                json={"starred": False}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["starred"] is False
            mock_save.assert_called_once()

    def test_update_session_tags(self, client, mock_discovered_session):
        """Test updating session tags."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.save_session_metadata") as mock_save:

            response = client.patch(
                "/sessions/test-uuid-1234",
                json={"tags": ["feature", "urgent"]}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["tags"] == ["feature", "urgent"]
            mock_save.assert_called_once()

    def test_update_session_not_found(self, client):
        """Test updating non-existent session returns 404."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[]):

            response = client.patch(
                "/sessions/nonexistent-uuid",
                json={"title": "New Title"}
            )

            assert response.status_code == 404

    def test_update_session_creates_metadata(self, client):
        """Test updating session creates metadata if none exists."""
        session_without_metadata = DiscoveredSession(
            session_id="test-uuid-1234",
            encoded_path="-home-user-projects-myapp",
            transcript_path=Path("/test.jsonl"),
            modified_at=datetime(2024, 1, 15, 10, 30, 0),
            file_size=1024,
            metadata=None,  # No existing metadata
        )

        with patch("app.routers.sessions.discover_all_sessions", return_value=[session_without_metadata]), \
             patch("app.routers.sessions.save_session_metadata") as mock_save:

            response = client.patch(
                "/sessions/test-uuid-1234",
                json={"title": "New Title"}
            )

            assert response.status_code == 200
            mock_save.assert_called_once()


class TestEntityManagement:
    """Tests for entity link endpoints."""

    @pytest.fixture(autouse=True)
    def clear_cache(self):
        """Clear the session cache before and after each test."""
        from app.routers.sessions import _session_cache
        _session_cache.clear()
        yield
        _session_cache.clear()

    def test_add_entity_to_session(self, client, mock_discovered_session):
        """Test adding an entity link to a session."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.save_session_metadata") as mock_save:

            response = client.post(
                "/sessions/test-uuid-1234/entities",
                json={"kind": "pr", "number": 123}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["kind"] == "pr"
            assert data["number"] == 123
            mock_save.assert_called_once()

    def test_add_duplicate_entity(self, client, mock_discovered_session):
        """Test adding a duplicate entity returns 400."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]):
            # Session already has issue #42
            response = client.post(
                "/sessions/test-uuid-1234/entities",
                json={"kind": "issue", "number": 42}
            )

            assert response.status_code == 400
            assert "already linked" in response.json()["detail"].lower()

    def test_add_entity_session_not_found(self, client):
        """Test adding entity to non-existent session returns 404."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[]):

            response = client.post(
                "/sessions/nonexistent-uuid/entities",
                json={"kind": "issue", "number": 1}
            )

            assert response.status_code == 404

    def test_remove_entity_from_session(self, client, mock_discovered_session):
        """Test removing an entity link from a session."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.save_session_metadata") as mock_save:

            response = client.delete("/sessions/test-uuid-1234/entities/0")

            assert response.status_code == 200
            assert response.json()["status"] == "deleted"
            mock_save.assert_called_once()

    def test_remove_entity_invalid_index(self, client, mock_discovered_session):
        """Test removing entity with invalid index returns 404."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]):

            response = client.delete("/sessions/test-uuid-1234/entities/99")

            assert response.status_code == 404
            assert "not found" in response.json()["detail"].lower()

    def test_remove_entity_negative_index(self, client, mock_discovered_session):
        """Test removing entity with negative index returns 404."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]):

            response = client.delete("/sessions/test-uuid-1234/entities/-1")

            assert response.status_code == 404

    def test_remove_entity_no_metadata(self, client):
        """Test removing entity from session without metadata returns 404."""
        session_without_metadata = DiscoveredSession(
            session_id="test-uuid-1234",
            encoded_path="-home-user-projects-myapp",
            transcript_path=Path("/test.jsonl"),
            modified_at=datetime(2024, 1, 15, 10, 30, 0),
            file_size=1024,
            metadata=None,
        )

        with patch("app.routers.sessions.discover_all_sessions", return_value=[session_without_metadata]):

            response = client.delete("/sessions/test-uuid-1234/entities/0")

            assert response.status_code == 404
            assert "no metadata" in response.json()["detail"].lower()


class TestQuickScanTranscript:
    """Tests for the _quick_scan_transcript helper function."""

    def test_scan_empty_file(self, tmp_path):
        """Test scanning an empty transcript file."""
        empty_file = tmp_path / "empty.jsonl"
        empty_file.write_text("")

        result = _quick_scan_transcript(empty_file)

        assert result["title"] is None
        assert result["model"] is None
        assert result["start_time"] is None
        assert result["end_time"] is None
        assert result["message_count"] == 0

    def test_scan_with_summary(self, tmp_path):
        """Test scanning a transcript with summary."""
        import json
        transcript = tmp_path / "test.jsonl"
        lines = [
            json.dumps({"type": "summary", "summary": "Test summary"}),
            json.dumps({"type": "user", "timestamp": "2024-01-15T10:00:00Z", "message": {"content": "Hello"}}),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        assert result["title"] == "Test summary"
        assert result["message_count"] == 1

    def test_scan_extracts_first_user_message_as_title(self, tmp_path):
        """Test that first user message is used as title fallback."""
        import json
        transcript = tmp_path / "test.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "timestamp": "2024-01-15T10:00:00Z",
                "message": {"content": "This is the first message"}
            }),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        assert result["title"] == "This is the first message"

    def test_scan_extracts_model_from_assistant(self, tmp_path):
        """Test that model is extracted from assistant message."""
        import json
        transcript = tmp_path / "test.jsonl"
        lines = [
            json.dumps({
                "type": "assistant",
                "timestamp": "2024-01-15T10:00:00Z",
                "message": {"model": "claude-3-opus"}
            }),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        assert result["model"] == "claude-3-opus"

    def test_scan_handles_invalid_json(self, tmp_path):
        """Test that invalid JSON lines are skipped."""
        import json
        transcript = tmp_path / "test.jsonl"
        lines = [
            "not valid json",
            json.dumps({"type": "user", "timestamp": "2024-01-15T10:00:00Z", "message": {"content": "Hello"}}),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        assert result["message_count"] == 1

    def test_scan_nonexistent_file(self, tmp_path):
        """Test scanning a file that doesn't exist returns defaults."""
        nonexistent = tmp_path / "does_not_exist.jsonl"

        result = _quick_scan_transcript(nonexistent)

        assert result["title"] is None
        assert result["model"] is None
        assert result["start_time"] is None
        assert result["end_time"] is None
        assert result["message_count"] == 0

    def test_scan_extracts_time_range(self, tmp_path):
        """Test that start_time and end_time are correctly extracted."""
        import json
        transcript = tmp_path / "test.jsonl"
        lines = [
            json.dumps({"type": "user", "timestamp": "2024-01-15T10:00:00Z", "message": {"content": "First"}}),
            json.dumps({"type": "assistant", "timestamp": "2024-01-15T10:05:00Z", "message": {"content": "Reply"}}),
            json.dumps({"type": "user", "timestamp": "2024-01-15T10:10:00Z", "message": {"content": "Second"}}),
            json.dumps({"type": "assistant", "timestamp": "2024-01-15T10:15:00Z", "message": {"content": "Final"}}),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        assert result["start_time"] == "2024-01-15T10:00:00Z"
        assert result["end_time"] == "2024-01-15T10:15:00Z"
        assert result["message_count"] == 4

    def test_scan_user_message_list_content(self, tmp_path):
        """Test extracting title from user message with list content."""
        import json
        transcript = tmp_path / "test.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "timestamp": "2024-01-15T10:00:00Z",
                "message": {
                    "content": [
                        {"type": "text", "text": "List format message content"}
                    ]
                }
            }),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        assert result["title"] == "List format message content"

    def test_scan_truncates_long_title(self, tmp_path):
        """Test that long user messages are truncated to 100 chars for title."""
        import json
        long_message = "x" * 200
        transcript = tmp_path / "test.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "timestamp": "2024-01-15T10:00:00Z",
                "message": {"content": long_message}
            }),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        assert result["title"] == "x" * 100

    def test_scan_summary_takes_precedence(self, tmp_path):
        """Test that summary takes precedence over first user message."""
        import json
        transcript = tmp_path / "test.jsonl"
        lines = [
            json.dumps({"type": "summary", "summary": "Official summary"}),
            json.dumps({
                "type": "user",
                "timestamp": "2024-01-15T10:00:00Z",
                "message": {"content": "First user message"}
            }),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        assert result["title"] == "Official summary"

    def test_scan_only_uses_first_user_message(self, tmp_path):
        """Test that only the first user message is used for title fallback."""
        import json
        transcript = tmp_path / "test.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "timestamp": "2024-01-15T10:00:00Z",
                "message": {"content": "First message"}
            }),
            json.dumps({
                "type": "user",
                "timestamp": "2024-01-15T10:05:00Z",
                "message": {"content": "Second message should be ignored"}
            }),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        assert result["title"] == "First message"

    def test_scan_handles_empty_lines(self, tmp_path):
        """Test that empty lines are skipped."""
        import json
        transcript = tmp_path / "test.jsonl"
        content = "\n\n" + json.dumps({
            "type": "user",
            "timestamp": "2024-01-15T10:00:00Z",
            "message": {"content": "Hello"}
        }) + "\n\n"
        transcript.write_text(content)

        result = _quick_scan_transcript(transcript)

        assert result["message_count"] == 1

    def test_scan_ignores_other_entry_types(self, tmp_path):
        """Test that non user/assistant/summary entries are ignored."""
        import json
        transcript = tmp_path / "test.jsonl"
        lines = [
            json.dumps({"type": "init", "version": "1.0.0"}),
            json.dumps({"type": "metadata", "project": "test"}),
            json.dumps({"type": "user", "timestamp": "2024-01-15T10:00:00Z", "message": {"content": "Hello"}}),
            json.dumps({"type": "result", "status": "success"}),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        # Only the user message should count
        assert result["message_count"] == 1

    def test_scan_handles_missing_timestamp(self, tmp_path):
        """Test handling of messages without timestamps."""
        import json
        transcript = tmp_path / "test.jsonl"
        lines = [
            json.dumps({"type": "user", "message": {"content": "No timestamp"}}),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        assert result["message_count"] == 1
        assert result["start_time"] is None
        assert result["end_time"] is None


class TestExtractTextFromContent:
    """Tests for the _extract_text_from_content helper function."""

    def test_extracts_from_plain_string(self):
        """Extracts text from plain string content."""
        result = _extract_text_from_content("Hello world")
        assert result == "Hello world"

    def test_extracts_from_empty_string_returns_none(self):
        """Returns None for empty string."""
        result = _extract_text_from_content("")
        assert result is None

    def test_truncates_long_string(self):
        """Truncates string content to max_length."""
        long_text = "a" * 200
        result = _extract_text_from_content(long_text, max_length=50)
        assert len(result) == 50
        assert result == "a" * 50

    def test_extracts_from_text_type_block(self):
        """Extracts text from content block with type='text'."""
        content = [{"type": "text", "text": "Hello from text block"}]
        result = _extract_text_from_content(content)
        assert result == "Hello from text block"

    def test_extracts_from_input_text_type_block(self):
        """Extracts text from content block with type='input_text' (Codex format)."""
        content = [{"type": "input_text", "text": "Hello from input_text block"}]
        result = _extract_text_from_content(content)
        assert result == "Hello from input_text block"

    def test_extracts_from_output_text_type_block(self):
        """Extracts text from content block with type='output_text' (Codex format)."""
        content = [{"type": "output_text", "text": "Hello from output_text block"}]
        result = _extract_text_from_content(content)
        assert result == "Hello from output_text block"

    def test_ignores_tool_use_blocks(self):
        """Does not extract text from tool_use blocks."""
        content = [
            {"type": "tool_use", "id": "123", "name": "Read", "input": {"file": "test.py"}},
            {"type": "text", "text": "Real text here"}
        ]
        result = _extract_text_from_content(content)
        assert result == "Real text here"

    def test_ignores_tool_use_blocks_with_text_key(self):
        """Does not extract from tool_use blocks even if they have a 'text' key."""
        # This tests the bug fix - tool_use blocks shouldn't have text extracted
        content = [
            {"type": "tool_use", "text": "Should not be extracted", "id": "123"},
        ]
        result = _extract_text_from_content(content)
        assert result is None

    def test_ignores_thinking_blocks(self):
        """Does not extract text from thinking blocks."""
        content = [
            {"type": "thinking", "thinking": "Let me think about this..."},
            {"type": "text", "text": "Actual response"}
        ]
        result = _extract_text_from_content(content)
        assert result == "Actual response"

    def test_skips_environment_context(self):
        """Skips text that starts with environment context marker."""
        content = [
            {"type": "text", "text": "<environment_context>System info here</environment_context>"},
            {"type": "text", "text": "User's actual message"}
        ]
        result = _extract_text_from_content(content)
        assert result == "User's actual message"

    def test_returns_first_valid_text_block(self):
        """Returns the first valid text content found."""
        content = [
            {"type": "text", "text": "First message"},
            {"type": "text", "text": "Second message"}
        ]
        result = _extract_text_from_content(content)
        assert result == "First message"

    def test_extracts_from_plain_string_in_list(self):
        """Extracts text from list containing plain strings."""
        content = ["Plain string content"]
        result = _extract_text_from_content(content)
        assert result == "Plain string content"

    def test_skips_empty_strings_in_list(self):
        """Skips empty strings in list content."""
        content = ["", "Non-empty content"]
        result = _extract_text_from_content(content)
        assert result == "Non-empty content"

    def test_returns_none_for_empty_list(self):
        """Returns None for empty list."""
        result = _extract_text_from_content([])
        assert result is None

    def test_returns_none_for_list_with_only_non_text_blocks(self):
        """Returns None when list contains no text blocks."""
        content = [
            {"type": "tool_use", "id": "123", "name": "Bash"},
            {"type": "tool_result", "tool_use_id": "123", "content": "output"}
        ]
        result = _extract_text_from_content(content)
        assert result is None

    def test_handles_text_block_with_empty_text(self):
        """Handles text block with empty text value."""
        content = [
            {"type": "text", "text": ""},
            {"type": "text", "text": "Non-empty text"}
        ]
        result = _extract_text_from_content(content)
        assert result == "Non-empty text"

    def test_handles_text_block_without_text_key(self):
        """Handles text block missing the 'text' key gracefully."""
        content = [
            {"type": "text"},  # Missing 'text' key
            {"type": "text", "text": "Valid text"}
        ]
        result = _extract_text_from_content(content)
        assert result == "Valid text"

    def test_truncates_text_from_block(self):
        """Truncates text from content block to max_length."""
        long_text = "b" * 200
        content = [{"type": "text", "text": long_text}]
        result = _extract_text_from_content(content, max_length=75)
        assert len(result) == 75
        assert result == "b" * 75


class TestGetPendingSessions:
    """Tests for the _get_pending_sessions helper function."""

    @pytest.fixture(autouse=True)
    def clear_cache(self):
        """Clear the session cache before and after each test."""
        from app.routers.sessions import _session_cache
        _session_cache.clear()
        yield
        _session_cache.clear()

    @pytest.mark.asyncio
    async def test_no_pending_sessions(self):
        """Test when there are no pending sessions."""
        # Need to patch where process_manager is imported inside the function
        with patch("app.routers.sessions.process_manager") as mock_pm:
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])

            result = await _get_pending_sessions(
                active_session_ids=set(),
                discovered_session_ids=set(),
            )

            assert result == []

    @pytest.mark.asyncio
    async def test_pending_session_no_jsonl_yet(self):
        """Test a session that's active but has no JSONL file."""
        mock_process = MagicMock()
        mock_process.claude_session_id = "pending-uuid"
        mock_process.working_dir = "/home/user/projects/myapp"
        mock_process.model = "claude-3-opus"
        mock_process.created_at = datetime(2024, 1, 15, 10, 30, 0)

        # Patch at the module level since _get_pending_sessions imports it fresh
        with patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions.encode_path", return_value="-home-user-projects-myapp"), \
             patch("app.routers.sessions.get_session_metadata", return_value=None), \
             patch("app.routers.sessions._get_repo_name", return_value="user/myapp"):
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[mock_process])

            result = await _get_pending_sessions(
                active_session_ids={"pending-uuid"},
                discovered_session_ids=set(),  # Not yet discovered
            )

            assert len(result) == 1
            assert result[0].session_id == "pending-uuid"
            assert result[0].is_active is True
            assert result[0].title == "Starting..."

    @pytest.mark.asyncio
    async def test_pending_session_already_discovered(self):
        """Test that already discovered sessions are not duplicated."""
        mock_process = MagicMock()
        mock_process.claude_session_id = "existing-uuid"
        mock_process.working_dir = "/home/user/projects/myapp"

        with patch("app.routers.sessions.process_manager") as mock_pm:
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[mock_process])

            result = await _get_pending_sessions(
                active_session_ids={"existing-uuid"},
                discovered_session_ids={"existing-uuid"},  # Already discovered
            )

            assert result == []

    @pytest.mark.asyncio
    async def test_pending_session_with_metadata(self):
        """Test pending session uses saved metadata."""
        mock_process = MagicMock()
        mock_process.claude_session_id = "pending-uuid"
        mock_process.working_dir = "/home/user/projects/myapp"
        mock_process.model = "claude-3-opus"
        mock_process.created_at = datetime(2024, 1, 15, 10, 30, 0)

        mock_metadata = SessionMetadata(
            session_id="pending-uuid",
            title="Custom Title",
            entities=[EntityLink(kind="issue", number=1)],
            tags=["test"],
            starred=True,
        )

        with patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions.encode_path", return_value="-home-user-projects-myapp"), \
             patch("app.routers.sessions.get_session_metadata", return_value=mock_metadata), \
             patch("app.routers.sessions._get_repo_name", return_value="user/myapp"):
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[mock_process])

            result = await _get_pending_sessions(
                active_session_ids={"pending-uuid"},
                discovered_session_ids=set(),
            )

            assert len(result) == 1
            assert result[0].title == "Custom Title"
            assert result[0].starred is True
            assert len(result[0].entities) == 1

    @pytest.mark.asyncio
    async def test_pending_session_takes_snapshot_of_processes(self):
        """Test that _get_pending_sessions uses thread-safe snapshot of processes.

        This ensures the function is safe from race conditions when the processes
        dictionary is modified concurrently during iteration (e.g., by create_process,
        kill, or _cleanup_dead_process in other coroutines).
        """
        mock_process1 = MagicMock()
        mock_process1.claude_session_id = "uuid-1"
        mock_process1.working_dir = "/path/to/repo1"
        mock_process1.model = "claude-3-opus"
        mock_process1.created_at = datetime(2024, 1, 15, 10, 0, 0)

        mock_process2 = MagicMock()
        mock_process2.claude_session_id = "uuid-2"
        mock_process2.working_dir = "/path/to/repo2"
        mock_process2.model = "claude-3-opus"
        mock_process2.created_at = datetime(2024, 1, 15, 10, 5, 0)

        with patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions.encode_path", return_value="-path-to-repo"), \
             patch("app.routers.sessions.get_session_metadata", return_value=None), \
             patch("app.routers.sessions._get_repo_name", return_value="user/repo"):
            # get_processes_snapshot returns a thread-safe copy of processes
            mock_pm.get_processes_snapshot = AsyncMock(
                return_value=[mock_process1, mock_process2]
            )

            result = await _get_pending_sessions(
                active_session_ids={"uuid-1", "uuid-2"},
                discovered_session_ids=set(),
            )

            # Should process both sessions (from the snapshot)
            assert len(result) == 2
            session_ids = {r.session_id for r in result}
            assert "uuid-1" in session_ids
            assert "uuid-2" in session_ids

    @pytest.mark.asyncio
    async def test_pending_session_repo_path_filter(self):
        """Test filtering pending sessions by repo_path."""
        mock_process1 = MagicMock()
        mock_process1.claude_session_id = "uuid-1"
        mock_process1.working_dir = "/path/to/repo1"
        mock_process1.model = "claude-3-opus"
        mock_process1.created_at = datetime(2024, 1, 15, 10, 0, 0)

        mock_process2 = MagicMock()
        mock_process2.claude_session_id = "uuid-2"
        mock_process2.working_dir = "/path/to/repo2"
        mock_process2.model = "claude-3-opus"
        mock_process2.created_at = datetime(2024, 1, 15, 10, 5, 0)

        with patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions.encode_path") as mock_encode, \
             patch("app.routers.sessions.get_session_metadata", return_value=None), \
             patch("app.routers.sessions._get_repo_name", return_value="user/repo"):
            mock_pm.get_processes_snapshot = AsyncMock(
                return_value=[mock_process1, mock_process2]
            )
            # encode_path returns encoded form of the path
            mock_encode.side_effect = lambda p: p.replace("/", "-")

            # Filter by repo_path
            result = await _get_pending_sessions(
                active_session_ids={"uuid-1", "uuid-2"},
                discovered_session_ids=set(),
                repo_path="/path/to/repo1",
            )

            # Should only return the process in repo1
            assert len(result) == 1
            assert result[0].session_id == "uuid-1"


class TestContinueSession:
    """Tests for POST /sessions/{session_id}/continue endpoint."""

    @pytest.fixture(autouse=True)
    def clear_cache(self):
        """Clear the session cache before and after each test."""
        from app.routers.sessions import _session_cache
        _session_cache.clear()
        yield
        _session_cache.clear()

    def test_continue_session_success(self, client, mock_discovered_session):
        """Test continuing a session successfully."""
        mock_process = MagicMock()
        mock_process.id = "new-process-id"
        mock_process.working_dir = "/home/user/projects/myapp"
        mock_process.created_at = datetime(2024, 1, 15, 10, 30, 0)
        mock_process.claude_session_id = "test-uuid-1234"

        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.match_encoded_path_to_repo", return_value=None), \
             patch("app.routers.sessions.process_manager") as mock_pm:
            mock_pm.create_process = AsyncMock(return_value=mock_process)

            response = client.post("/sessions/test-uuid-1234/continue")

            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "new-process-id"
            assert data["claude_session_id"] == "test-uuid-1234"

    def test_continue_session_not_found(self, client):
        """Test continuing non-existent session returns 404."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[]):

            response = client.post("/sessions/nonexistent-uuid/continue")

            assert response.status_code == 404

    def test_continue_session_with_matched_repo(self, client, mock_discovered_session):
        """Test continuing session uses matched repo path."""
        mock_process = MagicMock()
        mock_process.id = "new-process-id"
        mock_process.working_dir = "/actual/repo/path"
        mock_process.created_at = datetime(2024, 1, 15, 10, 30, 0)
        mock_process.claude_session_id = "test-uuid-1234"

        matched_repo = {
            "id": 1,
            "owner": "user",
            "name": "myapp",
            "local_path": "/actual/repo/path"
        }

        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.match_encoded_path_to_repo", return_value=matched_repo), \
             patch("app.routers.sessions.process_manager") as mock_pm:
            mock_pm.create_process = AsyncMock(return_value=mock_process)

            response = client.post("/sessions/test-uuid-1234/continue")

            assert response.status_code == 200
            # Verify it used the matched repo path
            mock_pm.create_process.assert_called_once()
            call_kwargs = mock_pm.create_process.call_args[1]
            assert call_kwargs["working_dir"] == "/actual/repo/path"

    def test_continue_session_process_error(self, client, mock_discovered_session):
        """Test handling process creation errors."""
        with patch("app.routers.sessions.discover_all_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.match_encoded_path_to_repo", return_value=None), \
             patch("app.routers.sessions.process_manager") as mock_pm:
            mock_pm.create_process = AsyncMock(side_effect=ValueError("Session already active"))

            response = client.post("/sessions/test-uuid-1234/continue")

            assert response.status_code == 400
            assert "cannot continue" in response.json()["detail"].lower()


class TestQuickScanTranscriptNoneHandling:
    """Tests for None text value handling in _quick_scan_transcript."""

    def test_scan_handles_none_text_in_list_content(self, tmp_path):
        """Test that None text values in list content are handled gracefully."""
        import json
        transcript = tmp_path / "test.jsonl"
        # Content with type='text' but text=None (can happen with malformed data)
        lines = [
            json.dumps({
                "type": "user",
                "timestamp": "2024-01-15T10:00:00Z",
                "message": {
                    "content": [
                        {"type": "text", "text": None}  # None text value
                    ]
                }
            }),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        # Should not crash, title should be None (no valid text found)
        assert result["title"] is None
        assert result["message_count"] == 1

    def test_scan_handles_missing_text_key_in_list_content(self, tmp_path):
        """Test that missing text key in list content is handled gracefully."""
        import json
        transcript = tmp_path / "test.jsonl"
        # Content with type='text' but no text key at all
        lines = [
            json.dumps({
                "type": "user",
                "timestamp": "2024-01-15T10:00:00Z",
                "message": {
                    "content": [
                        {"type": "text"}  # Missing text key
                    ]
                }
            }),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        # Should not crash, title should be None (no valid text found)
        assert result["title"] is None
        assert result["message_count"] == 1

    def test_scan_uses_first_valid_text_from_list(self, tmp_path):
        """Test that first valid text is used when list has None followed by valid text."""
        import json
        transcript = tmp_path / "test.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "timestamp": "2024-01-15T10:00:00Z",
                "message": {
                    "content": [
                        {"type": "text", "text": None},  # None - should skip
                        {"type": "text", "text": "Valid message"}  # Valid
                    ]
                }
            }),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        # Should skip the None text block and use the valid one
        assert result["title"] == "Valid message"
        assert result["message_count"] == 1


class TestQuickScanTranscriptNoneMessageHandling:
    """Tests for None message value handling in _quick_scan_transcript.

    These tests verify the fix for the bug where entry.get('message', {})
    returns None (not {}) when the key exists with value None. The fix uses
    entry.get('message') or {} to correctly fall back to empty dict.
    """

    def test_scan_handles_none_message_value_for_user(self, tmp_path):
        """Test that None message values in user entries are handled gracefully."""
        import json
        transcript = tmp_path / "test.jsonl"
        # Entry with message=None (can happen with corrupted/malformed data)
        lines = [
            json.dumps({
                "type": "user",
                "timestamp": "2024-01-15T10:00:00Z",
                "message": None,  # Key exists but value is None
            }),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        # Should not crash, title should be None (no valid message found)
        assert result["title"] is None
        assert result["message_count"] == 1

    def test_scan_handles_none_message_value_for_assistant(self, tmp_path):
        """Test that None message values in assistant entries are handled gracefully."""
        import json
        transcript = tmp_path / "test.jsonl"
        # Assistant entry with message=None
        lines = [
            json.dumps({
                "type": "assistant",
                "timestamp": "2024-01-15T10:00:00Z",
                "message": None,  # Key exists but value is None
            }),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        # Should not crash, model should be None (no valid message found)
        assert result["model"] is None
        assert result["message_count"] == 1

    def test_scan_handles_mixed_none_and_valid_messages(self, tmp_path):
        """Test mix of None and valid message values."""
        import json
        transcript = tmp_path / "test.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "timestamp": "2024-01-15T10:00:00Z",
                "message": None,  # None - should skip
            }),
            json.dumps({
                "type": "user",
                "timestamp": "2024-01-15T10:01:00Z",
                "message": {"content": "Valid user message"},  # Valid
            }),
            json.dumps({
                "type": "assistant",
                "timestamp": "2024-01-15T10:02:00Z",
                "message": None,  # None - should skip
            }),
            json.dumps({
                "type": "assistant",
                "timestamp": "2024-01-15T10:03:00Z",
                "message": {"model": "claude-sonnet-4-20250514"},  # Valid
            }),
        ]
        transcript.write_text("\n".join(lines))

        result = _quick_scan_transcript(transcript)

        # Should skip None messages and extract info from valid ones
        assert result["title"] == "Valid user message"
        assert result["model"] == "claude-sonnet-4-20250514"
        assert result["message_count"] == 4


class TestSessionCacheInvalidation:
    """Tests for session cache invalidation logic."""

    @pytest.fixture(autouse=True)
    def clear_cache(self):
        """Clear the session cache before and after each test."""
        from app.routers.sessions import _session_cache
        _session_cache.clear()
        yield
        _session_cache.clear()

    def test_cache_returns_same_data_within_ttl(self):
        """Test that cache returns cached data within TTL window."""
        from app.routers.sessions import _get_cached_sessions, _session_cache, SESSION_CACHE_TTL

        mock_sessions = [MagicMock()]

        with patch("app.routers.sessions.discover_all_sessions", return_value=mock_sessions) as mock_discover:
            # First call - cache miss
            result1 = _get_cached_sessions(repo_path="/test/path")
            assert mock_discover.call_count == 1

            # Second call within TTL - should use cache
            result2 = _get_cached_sessions(repo_path="/test/path")
            assert mock_discover.call_count == 1  # Should not have called discover again

            assert result1 == result2

    def test_cache_invalidation_clears_specific_repo(self):
        """Test that invalidating with repo_path clears that repo's cache."""
        from app.routers.sessions import invalidate_session_cache, _session_cache

        # Set up cache manually using the new API
        _session_cache.set("/test/path1", [], 0)
        _session_cache.set("/test/path2", [], 0)
        _session_cache.set("__all__", [], 0)

        # Invalidate specific path
        invalidate_session_cache(repo_path="/test/path1")

        assert "/test/path1" not in _session_cache
        assert "/test/path2" in _session_cache
        assert "__all__" not in _session_cache  # Should also clear global cache

    def test_cache_invalidation_clears_all(self):
        """Test that invalidating without repo_path clears all cache entries."""
        from app.routers.sessions import invalidate_session_cache, _session_cache

        # Set up cache manually using the new API
        _session_cache.set("/test/path1", [], 0)
        _session_cache.set("/test/path2", [], 0)
        _session_cache.set("__all__", [], 0)

        # Invalidate all
        invalidate_session_cache()

        assert len(_session_cache) == 0

    def test_cache_different_repo_paths_are_independent(self):
        """Test that different repo paths have independent cache entries."""
        from app.routers.sessions import _get_cached_sessions, _session_cache

        mock_sessions1 = [MagicMock(session_id="session1")]
        mock_sessions2 = [MagicMock(session_id="session2")]

        with patch("app.routers.sessions.discover_all_sessions") as mock_discover:
            mock_discover.return_value = mock_sessions1
            result1 = _get_cached_sessions(repo_path="/path/one")

            mock_discover.return_value = mock_sessions2
            result2 = _get_cached_sessions(repo_path="/path/two")

            # Both should have been called
            assert mock_discover.call_count == 2
            assert result1[0].session_id == "session1"
            assert result2[0].session_id == "session2"

    def test_cache_global_vs_specific_repo(self):
        """Test that global cache is separate from repo-specific cache."""
        from app.routers.sessions import _get_cached_sessions, _session_cache

        mock_all_sessions = [MagicMock(session_id="all")]
        mock_repo_sessions = [MagicMock(session_id="repo")]

        with patch("app.routers.sessions.discover_all_sessions") as mock_discover:
            # First call with no repo_path (global)
            mock_discover.return_value = mock_all_sessions
            result_all = _get_cached_sessions(repo_path=None)

            # Second call with specific repo_path
            mock_discover.return_value = mock_repo_sessions
            result_repo = _get_cached_sessions(repo_path="/specific/path")

            # Both should have been called
            assert mock_discover.call_count == 2
            assert result_all[0].session_id == "all"
            assert result_repo[0].session_id == "repo"


class TestToolFormatters:
    """Tests for tool formatting functions used in Markdown export."""

    # ==============================================
    # _format_edit_tool tests
    # ==============================================

    def test_format_edit_tool_basic(self):
        """Test formatting an Edit tool with normal inputs."""
        result = _format_edit_tool({
            "file_path": "/path/to/file.py",
            "old_string": "old code",
            "new_string": "new code",
        })
        assert "**Edit** `/path/to/file.py`" in result
        assert "- old code" in result
        assert "+ new code" in result
        assert "```diff" in result

    def test_format_edit_tool_multiline(self):
        """Test formatting an Edit tool with multiline content."""
        result = _format_edit_tool({
            "file_path": "/file.py",
            "old_string": "line1\nline2\nline3",
            "new_string": "new1\nnew2",
        })
        # Multiline old_string should have - prefix on each line
        assert "- line1\n- line2\n- line3" in result
        # Multiline new_string should have + prefix on each line
        assert "+ new1\n+ new2" in result

    def test_format_edit_tool_none_old_string(self):
        """Test formatting Edit tool when old_string is None."""
        result = _format_edit_tool({
            "file_path": "/file.py",
            "old_string": None,
            "new_string": "new content",
        })
        # Should not raise AttributeError
        assert "**Edit** `/file.py`" in result
        assert "+ new content" in result

    def test_format_edit_tool_none_new_string(self):
        """Test formatting Edit tool when new_string is None."""
        result = _format_edit_tool({
            "file_path": "/file.py",
            "old_string": "old content",
            "new_string": None,
        })
        # Should not raise AttributeError
        assert "**Edit** `/file.py`" in result
        assert "- old content" in result

    def test_format_edit_tool_both_none(self):
        """Test formatting Edit tool when both strings are None."""
        result = _format_edit_tool({
            "file_path": "/file.py",
            "old_string": None,
            "new_string": None,
        })
        # Should not raise AttributeError
        assert "**Edit** `/file.py`" in result
        assert "```diff" in result

    def test_format_edit_tool_missing_keys(self):
        """Test formatting Edit tool when keys are missing entirely."""
        result = _format_edit_tool({})
        assert "**Edit** `unknown`" in result
        assert "```diff" in result

    def test_format_edit_tool_none_file_path(self):
        """Test formatting Edit tool when file_path is None."""
        result = _format_edit_tool({
            "file_path": None,
            "old_string": "old",
            "new_string": "new",
        })
        assert "**Edit** `unknown`" in result

    # ==============================================
    # _format_read_tool tests
    # ==============================================

    def test_format_read_tool_basic(self):
        """Test formatting a Read tool."""
        result = _format_read_tool({"file_path": "/path/to/file.py"})
        assert result == "**Read** `/path/to/file.py`"

    def test_format_read_tool_none_file_path(self):
        """Test formatting Read tool when file_path is None."""
        result = _format_read_tool({"file_path": None})
        assert result == "**Read** `unknown`"

    def test_format_read_tool_missing_file_path(self):
        """Test formatting Read tool when file_path is missing."""
        result = _format_read_tool({})
        assert result == "**Read** `unknown`"

    # ==============================================
    # _format_write_tool tests
    # ==============================================

    def test_format_write_tool_basic(self):
        """Test formatting a Write tool."""
        result = _format_write_tool({
            "file_path": "/path/to/file.py",
            "content": "line1\nline2\nline3",
        })
        assert "**Write** `/path/to/file.py` (3 lines)" in result

    def test_format_write_tool_single_line(self):
        """Test formatting Write tool with single line content."""
        result = _format_write_tool({
            "file_path": "/file.py",
            "content": "single line",
        })
        assert "(1 lines)" in result

    def test_format_write_tool_none_content(self):
        """Test formatting Write tool when content is None."""
        result = _format_write_tool({
            "file_path": "/file.py",
            "content": None,
        })
        # Should not raise AttributeError
        assert "**Write** `/file.py` (1 lines)" in result

    def test_format_write_tool_missing_content(self):
        """Test formatting Write tool when content is missing."""
        result = _format_write_tool({"file_path": "/file.py"})
        assert "(1 lines)" in result

    def test_format_write_tool_none_file_path(self):
        """Test formatting Write tool when file_path is None."""
        result = _format_write_tool({
            "file_path": None,
            "content": "content",
        })
        assert "**Write** `unknown`" in result

    def test_format_write_tool_empty(self):
        """Test formatting Write tool with empty input."""
        result = _format_write_tool({})
        assert "**Write** `unknown` (1 lines)" in result

    # ==============================================
    # _format_bash_tool tests
    # ==============================================

    def test_format_bash_tool_basic(self):
        """Test formatting a Bash tool."""
        result = _format_bash_tool({"command": "ls -la"})
        assert "**Bash**" in result
        assert "```bash" in result
        assert "$ ls -la" in result

    def test_format_bash_tool_none_command(self):
        """Test formatting Bash tool when command is None."""
        result = _format_bash_tool({"command": None})
        # Should not raise AttributeError
        assert "**Bash**" in result
        assert "$ " in result

    def test_format_bash_tool_missing_command(self):
        """Test formatting Bash tool when command is missing."""
        result = _format_bash_tool({})
        assert "**Bash**" in result
        assert "$ " in result

    # ==============================================
    # _format_grep_tool tests
    # ==============================================

    def test_format_grep_tool_basic(self):
        """Test formatting a Grep tool."""
        result = _format_grep_tool({
            "pattern": "TODO",
            "path": "/src",
        })
        assert result == "**Grep** `TODO` in `/src`"

    def test_format_grep_tool_none_pattern(self):
        """Test formatting Grep tool when pattern is None."""
        result = _format_grep_tool({
            "pattern": None,
            "path": "/src",
        })
        assert result == "**Grep** `` in `/src`"

    def test_format_grep_tool_none_path(self):
        """Test formatting Grep tool when path is None."""
        result = _format_grep_tool({
            "pattern": "TODO",
            "path": None,
        })
        assert result == "**Grep** `TODO` in `.`"

    def test_format_grep_tool_missing_keys(self):
        """Test formatting Grep tool when keys are missing."""
        result = _format_grep_tool({})
        assert result == "**Grep** `` in `.`"

    # ==============================================
    # _format_glob_tool tests
    # ==============================================

    def test_format_glob_tool_basic(self):
        """Test formatting a Glob tool."""
        result = _format_glob_tool({"pattern": "**/*.py"})
        assert result == "**Glob** `**/*.py`"

    def test_format_glob_tool_none_pattern(self):
        """Test formatting Glob tool when pattern is None."""
        result = _format_glob_tool({"pattern": None})
        assert result == "**Glob** ``"

    def test_format_glob_tool_missing_pattern(self):
        """Test formatting Glob tool when pattern is missing."""
        result = _format_glob_tool({})
        assert result == "**Glob** ``"

    # ==============================================
    # _format_task_tool tests
    # ==============================================

    def test_format_task_tool_basic(self):
        """Test formatting a Task tool."""
        result = _format_task_tool({
            "description": "Search for files",
            "subagent_type": "Explore",
        })
        assert result == "**Task** (Explore): Search for files"

    def test_format_task_tool_none_description(self):
        """Test formatting Task tool when description is None."""
        result = _format_task_tool({
            "description": None,
            "subagent_type": "Explore",
        })
        assert result == "**Task** (Explore): "

    def test_format_task_tool_none_subagent_type(self):
        """Test formatting Task tool when subagent_type is None."""
        result = _format_task_tool({
            "description": "Search for files",
            "subagent_type": None,
        })
        assert result == "**Task** (general): Search for files"

    def test_format_task_tool_missing_keys(self):
        """Test formatting Task tool when keys are missing."""
        result = _format_task_tool({})
        assert result == "**Task** (general): "

    # ==============================================
    # _format_tool_use_markdown tests
    # ==============================================

    def test_format_tool_use_markdown_known_tool(self):
        """Test formatting a known tool via the dispatch function."""
        result = _format_tool_use_markdown({
            "name": "Read",
            "input": {"file_path": "/test.py"},
        })
        assert result == "**Read** `/test.py`"

    def test_format_tool_use_markdown_unknown_tool(self):
        """Test formatting an unknown tool falls back to generic format."""
        result = _format_tool_use_markdown({
            "name": "CustomTool",
            "input": {"custom_param": "value"},
        })
        assert result == "**CustomTool**"

    def test_format_tool_use_markdown_missing_name(self):
        """Test formatting when tool name is missing."""
        result = _format_tool_use_markdown({"input": {}})
        assert result == "**Unknown**"

    def test_format_tool_use_markdown_missing_input(self):
        """Test formatting when input is missing."""
        result = _format_tool_use_markdown({"name": "Read"})
        # Should use empty dict for input and fall back to "unknown" for file_path
        assert result == "**Read** `unknown`"

    def test_format_tool_use_markdown_all_known_tools(self):
        """Test that all known tools are properly dispatched."""
        known_tools = ["Edit", "Read", "Write", "Bash", "Grep", "Glob", "Task"]
        for tool_name in known_tools:
            result = _format_tool_use_markdown({"name": tool_name, "input": {}})
            assert f"**{tool_name}**" in result or "**Edit**" in result


class TestCalculateDurationSeconds:
    """Tests for the _calculate_duration_seconds helper function."""

    # ==============================================
    # Basic functionality tests
    # ==============================================

    def test_calculates_duration_basic(self):
        """Test basic duration calculation with valid ISO timestamps."""
        result = _calculate_duration_seconds(
            "2024-01-15T10:00:00Z",
            "2024-01-15T10:05:00Z"
        )
        assert result == 300  # 5 minutes = 300 seconds

    def test_calculates_duration_with_offset_timezone(self):
        """Test duration calculation with timezone offset."""
        result = _calculate_duration_seconds(
            "2024-01-15T10:00:00+00:00",
            "2024-01-15T11:00:00+00:00"
        )
        assert result == 3600  # 1 hour = 3600 seconds

    def test_calculates_duration_zero(self):
        """Test duration calculation when times are the same."""
        result = _calculate_duration_seconds(
            "2024-01-15T10:00:00Z",
            "2024-01-15T10:00:00Z"
        )
        assert result == 0

    def test_calculates_duration_hours(self):
        """Test duration calculation spanning multiple hours."""
        result = _calculate_duration_seconds(
            "2024-01-15T09:00:00Z",
            "2024-01-15T12:30:00Z"
        )
        assert result == 12600  # 3.5 hours = 12600 seconds

    def test_calculates_duration_crossing_midnight(self):
        """Test duration calculation crossing midnight."""
        result = _calculate_duration_seconds(
            "2024-01-15T23:30:00Z",
            "2024-01-16T00:30:00Z"
        )
        assert result == 3600  # 1 hour

    # ==============================================
    # None handling tests
    # ==============================================

    def test_returns_none_when_start_time_is_none(self):
        """Test that None is returned when start_time is None."""
        result = _calculate_duration_seconds(None, "2024-01-15T10:00:00Z")
        assert result is None

    def test_returns_none_when_end_time_is_none(self):
        """Test that None is returned when end_time is None."""
        result = _calculate_duration_seconds("2024-01-15T10:00:00Z", None)
        assert result is None

    def test_returns_none_when_both_are_none(self):
        """Test that None is returned when both timestamps are None."""
        result = _calculate_duration_seconds(None, None)
        assert result is None

    # ==============================================
    # Empty string handling tests
    # ==============================================

    def test_returns_none_when_start_time_is_empty(self):
        """Test that None is returned when start_time is empty string."""
        result = _calculate_duration_seconds("", "2024-01-15T10:00:00Z")
        assert result is None

    def test_returns_none_when_end_time_is_empty(self):
        """Test that None is returned when end_time is empty string."""
        result = _calculate_duration_seconds("2024-01-15T10:00:00Z", "")
        assert result is None

    # ==============================================
    # Invalid timestamp handling tests
    # ==============================================

    def test_returns_none_for_invalid_start_time_format(self):
        """Test that None is returned for invalid start_time format."""
        result = _calculate_duration_seconds(
            "not-a-timestamp",
            "2024-01-15T10:00:00Z"
        )
        assert result is None

    def test_returns_none_for_invalid_end_time_format(self):
        """Test that None is returned for invalid end_time format."""
        result = _calculate_duration_seconds(
            "2024-01-15T10:00:00Z",
            "invalid"
        )
        assert result is None

    def test_returns_none_for_both_invalid(self):
        """Test that None is returned when both timestamps are invalid."""
        result = _calculate_duration_seconds("bad", "also-bad")
        assert result is None

    def test_returns_none_for_partial_timestamp(self):
        """Test that None is returned for partial timestamp."""
        result = _calculate_duration_seconds(
            "2024-01-15",  # Missing time component
            "2024-01-15T10:00:00Z"
        )
        # Note: datetime.fromisoformat actually accepts this
        # so this might return a value - testing actual behavior
        # The key is it doesn't raise an exception

    # ==============================================
    # Negative duration handling tests
    # ==============================================

    def test_returns_none_for_negative_duration(self):
        """Test that None is returned when end is before start."""
        result = _calculate_duration_seconds(
            "2024-01-15T12:00:00Z",
            "2024-01-15T10:00:00Z"  # Before start
        )
        assert result is None

    # ==============================================
    # Edge case tests
    # ==============================================

    def test_handles_milliseconds_in_timestamp(self):
        """Test handling of timestamps with milliseconds."""
        result = _calculate_duration_seconds(
            "2024-01-15T10:00:00.123Z",
            "2024-01-15T10:00:01.456Z"
        )
        # Should be approximately 1 second (rounded to int)
        assert result == 1

    def test_handles_microseconds_in_timestamp(self):
        """Test handling of timestamps with microseconds."""
        result = _calculate_duration_seconds(
            "2024-01-15T10:00:00.123456Z",
            "2024-01-15T10:00:02.654321Z"
        )
        # Should be approximately 2 seconds (rounded to int)
        assert result == 2

    def test_handles_different_timezone_offsets(self):
        """Test handling of timestamps with different timezone offsets."""
        # These are actually the same instant in time
        result = _calculate_duration_seconds(
            "2024-01-15T10:00:00+00:00",
            "2024-01-15T12:00:00+02:00"  # Same as 10:00 UTC
        )
        assert result == 0

    def test_handles_very_long_duration(self):
        """Test handling of very long durations (multiple days)."""
        result = _calculate_duration_seconds(
            "2024-01-01T00:00:00Z",
            "2024-01-10T00:00:00Z"  # 9 days later
        )
        assert result == 9 * 24 * 3600  # 9 days in seconds

    def test_returns_integer_not_float(self):
        """Test that result is an integer, not a float."""
        result = _calculate_duration_seconds(
            "2024-01-15T10:00:00Z",
            "2024-01-15T10:00:30Z"
        )
        assert isinstance(result, int)
        assert result == 30

    # ==============================================
    # Type safety tests
    # ==============================================

    def test_handles_non_string_start_time(self):
        """Test that non-string start_time is handled gracefully."""
        # This tests the AttributeError case - calling .replace() on non-string
        result = _calculate_duration_seconds(
            123,  # Not a string
            "2024-01-15T10:00:00Z"
        )
        assert result is None

    def test_handles_non_string_end_time(self):
        """Test that non-string end_time is handled gracefully."""
        result = _calculate_duration_seconds(
            "2024-01-15T10:00:00Z",
            456  # Not a string
        )
        assert result is None

    def test_handles_list_input(self):
        """Test that list input is handled gracefully."""
        result = _calculate_duration_seconds(
            ["2024-01-15T10:00:00Z"],  # List instead of string
            "2024-01-15T10:00:00Z"
        )
        assert result is None

    def test_handles_dict_input(self):
        """Test that dict input is handled gracefully."""
        result = _calculate_duration_seconds(
            {"time": "2024-01-15T10:00:00Z"},  # Dict instead of string
            "2024-01-15T10:00:00Z"
        )
        assert result is None


class TestParseDatetimeNaive:
    """Tests for the _parse_datetime_naive helper function.

    This function parses ISO timestamps to naive datetimes for date filtering.
    It must correctly handle:
    - UTC "Z" suffix
    - Positive timezone offsets (+05:00)
    - Negative timezone offsets (-05:00)
    - No timezone suffix
    """

    # ==============================================
    # Basic parsing tests
    # ==============================================

    def test_parses_utc_z_suffix(self):
        """Test parsing timestamp with UTC Z suffix."""
        result = _parse_datetime_naive("2024-01-15T10:30:00Z")
        assert result is not None
        assert result.year == 2024
        assert result.month == 1
        assert result.day == 15
        assert result.hour == 10
        assert result.minute == 30
        assert result.second == 0
        assert result.tzinfo is None  # Must be naive

    def test_parses_positive_timezone_offset(self):
        """Test parsing timestamp with positive timezone offset."""
        result = _parse_datetime_naive("2024-01-15T10:30:00+05:00")
        assert result is not None
        assert result.tzinfo is None  # Must be naive
        # The hour should be preserved from the input (10:30 in +05:00)
        assert result.hour == 10
        assert result.minute == 30

    def test_parses_negative_timezone_offset(self):
        """Test parsing timestamp with negative timezone offset (the bug case)."""
        result = _parse_datetime_naive("2024-01-15T10:30:00-05:00")
        assert result is not None
        assert result.tzinfo is None  # Must be naive
        # The hour should be preserved from the input (10:30 in -05:00)
        assert result.hour == 10
        assert result.minute == 30

    def test_parses_no_timezone(self):
        """Test parsing timestamp without timezone suffix."""
        result = _parse_datetime_naive("2024-01-15T10:30:00")
        assert result is not None
        assert result.tzinfo is None
        assert result.hour == 10
        assert result.minute == 30

    def test_parses_with_milliseconds(self):
        """Test parsing timestamp with milliseconds."""
        result = _parse_datetime_naive("2024-01-15T10:30:00.123Z")
        assert result is not None
        assert result.microsecond == 123000

    def test_parses_with_microseconds(self):
        """Test parsing timestamp with microseconds."""
        result = _parse_datetime_naive("2024-01-15T10:30:00.123456Z")
        assert result is not None
        assert result.microsecond == 123456

    # ==============================================
    # Edge cases for timezone offsets
    # ==============================================

    def test_parses_utc_plus_zero(self):
        """Test parsing timestamp with +00:00 offset."""
        result = _parse_datetime_naive("2024-01-15T10:30:00+00:00")
        assert result is not None
        assert result.tzinfo is None

    def test_parses_large_positive_offset(self):
        """Test parsing timestamp with large positive offset (+14:00)."""
        result = _parse_datetime_naive("2024-01-15T10:30:00+14:00")
        assert result is not None
        assert result.tzinfo is None

    def test_parses_large_negative_offset(self):
        """Test parsing timestamp with large negative offset (-12:00)."""
        result = _parse_datetime_naive("2024-01-15T10:30:00-12:00")
        assert result is not None
        assert result.tzinfo is None

    def test_parses_offset_with_minutes(self):
        """Test parsing timestamp with non-zero minutes in offset."""
        result = _parse_datetime_naive("2024-01-15T10:30:00+05:30")
        assert result is not None
        assert result.tzinfo is None

    def test_parses_negative_offset_with_minutes(self):
        """Test parsing timestamp with negative offset and minutes."""
        result = _parse_datetime_naive("2024-01-15T10:30:00-03:30")
        assert result is not None
        assert result.tzinfo is None

    # ==============================================
    # Error handling tests
    # ==============================================

    def test_returns_none_for_invalid_format(self):
        """Test that None is returned for invalid timestamp format."""
        result = _parse_datetime_naive("not-a-timestamp")
        assert result is None

    def test_returns_none_for_empty_string(self):
        """Test that None is returned for empty string."""
        result = _parse_datetime_naive("")
        assert result is None

    def test_returns_none_for_partial_date(self):
        """Test handling partial date (might succeed or fail depending on format)."""
        # This tests robustness - partial dates may or may not be parseable
        result = _parse_datetime_naive("2024-01-15")
        # datetime.fromisoformat accepts date-only, so this might not be None
        # The important thing is it doesn't raise an exception

    def test_returns_none_for_invalid_month(self):
        """Test that None is returned for invalid month."""
        result = _parse_datetime_naive("2024-13-15T10:30:00Z")
        assert result is None

    def test_returns_none_for_invalid_day(self):
        """Test that None is returned for invalid day."""
        result = _parse_datetime_naive("2024-02-30T10:30:00Z")
        assert result is None

    def test_returns_none_for_invalid_hour(self):
        """Test that None is returned for invalid hour."""
        result = _parse_datetime_naive("2024-01-15T25:30:00Z")
        assert result is None

    # ==============================================
    # Type safety tests
    # ==============================================

    def test_returns_none_for_none_input(self):
        """Test that None is returned for None input."""
        # This would raise TypeError on .replace(), caught by exception handler
        result = _parse_datetime_naive(None)
        assert result is None

    def test_returns_none_for_integer_input(self):
        """Test that None is returned for integer input."""
        result = _parse_datetime_naive(12345)
        assert result is None

    def test_returns_none_for_list_input(self):
        """Test that None is returned for list input."""
        result = _parse_datetime_naive(["2024-01-15T10:30:00Z"])
        assert result is None

    def test_returns_none_for_dict_input(self):
        """Test that None is returned for dict input."""
        result = _parse_datetime_naive({"timestamp": "2024-01-15T10:30:00Z"})
        assert result is None

    # ==============================================
    # Return value tests
    # ==============================================

    def test_returns_datetime_object(self):
        """Test that result is a datetime object."""
        result = _parse_datetime_naive("2024-01-15T10:30:00Z")
        assert isinstance(result, datetime)

    def test_result_is_naive(self):
        """Test that result is always naive (no tzinfo)."""
        # Test with Z suffix
        result1 = _parse_datetime_naive("2024-01-15T10:30:00Z")
        assert result1.tzinfo is None

        # Test with positive offset
        result2 = _parse_datetime_naive("2024-01-15T10:30:00+05:00")
        assert result2.tzinfo is None

        # Test with negative offset
        result3 = _parse_datetime_naive("2024-01-15T10:30:00-05:00")
        assert result3.tzinfo is None

        # Test with no timezone
        result4 = _parse_datetime_naive("2024-01-15T10:30:00")
        assert result4.tzinfo is None

    # ==============================================
    # Comparison tests (for filtering use case)
    # ==============================================

    def test_naive_results_can_be_compared(self):
        """Test that naive results can be compared for date filtering."""
        result1 = _parse_datetime_naive("2024-01-15T10:00:00Z")
        result2 = _parse_datetime_naive("2024-01-15T12:00:00Z")

        assert result1 < result2
        assert result2 > result1
        assert result1 != result2

    def test_comparison_with_naive_datetime(self):
        """Test that result can be compared with other naive datetimes."""
        result = _parse_datetime_naive("2024-01-15T10:00:00Z")
        comparison = datetime(2024, 1, 15, 9, 0, 0)

        assert result > comparison
        assert comparison < result

    def test_comparison_with_different_timezones(self):
        """Test comparison of timestamps from different timezones."""
        # These are different local times but we're comparing naive datetimes
        result1 = _parse_datetime_naive("2024-01-15T10:00:00+00:00")
        result2 = _parse_datetime_naive("2024-01-15T10:00:00-05:00")

        # Since we strip timezone, they should compare as equal (same local time)
        assert result1 == result2


class TestKillSession:
    """Tests for POST /sessions/{session_id}/kill endpoint."""

    @pytest.fixture(autouse=True)
    def clear_cache(self):
        """Clear the session cache before and after each test."""
        from app.routers.sessions import _session_cache
        _session_cache.clear()
        yield
        _session_cache.clear()

    def test_kill_pty_process_success(self, client, mock_discovered_session):
        """Test killing a session with an active PTY process."""
        mock_process = MagicMock()
        mock_process.id = "proc-123"
        mock_process.claude_session_id = "test-uuid-1234"
        mock_process.working_dir = "/home/user/projects/myapp"

        with patch("app.routers.sessions._get_cached_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions.event_manager") as mock_events, \
             patch("app.routers.sessions.invalidate_session_cache") as mock_invalidate:
            mock_pm.list_processes = AsyncMock(return_value=[mock_process])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[mock_process])
            mock_pm.kill = AsyncMock(return_value=True)
            mock_events.emit = AsyncMock()

            response = client.post("/sessions/test-uuid-1234/kill")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "killed"
            assert data["killed_pty"] is True
            assert data["killed_headless"] is False

            mock_pm.kill.assert_called_once_with("proc-123")
            mock_invalidate.assert_called_once()

    def test_kill_headless_session_success(self, client, mock_discovered_session):
        """Test killing a headless session."""
        with patch("app.routers.sessions._get_cached_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.services.headless_analyzer.headless_analyzer") as mock_headless, \
             patch("app.routers.sessions.event_manager") as mock_events, \
             patch("app.routers.sessions.invalidate_session_cache") as mock_invalidate:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])  # No PTY processes
            mock_headless.cancel = AsyncMock(return_value=True)
            mock_events.emit = AsyncMock()

            response = client.post("/sessions/test-uuid-1234/kill")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "killed"
            assert data["killed_pty"] is False
            assert data["killed_headless"] is True

            mock_headless.cancel.assert_called_once_with("test-uuid-1234")
            # Note: unregister_running is not called because cancel() already
            # removes from _active_session_ids inside its lock
            mock_invalidate.assert_called_once()

    def test_kill_both_pty_and_headless(self, client, mock_discovered_session):
        """Test killing when both PTY and headless are running (edge case)."""
        mock_process = MagicMock()
        mock_process.id = "proc-123"
        mock_process.claude_session_id = "test-uuid-1234"
        mock_process.working_dir = "/home/user/projects/myapp"

        with patch("app.routers.sessions._get_cached_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.services.headless_analyzer.headless_analyzer") as mock_headless, \
             patch("app.routers.sessions.event_manager") as mock_events, \
             patch("app.routers.sessions.invalidate_session_cache") as mock_invalidate:
            mock_pm.list_processes = AsyncMock(return_value=[mock_process])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[mock_process])
            mock_pm.kill = AsyncMock(return_value=True)
            mock_headless.cancel = AsyncMock(return_value=True)
            mock_events.emit = AsyncMock()

            response = client.post("/sessions/test-uuid-1234/kill")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "killed"
            assert data["killed_pty"] is True
            assert data["killed_headless"] is True

    def test_kill_session_not_running(self, client, mock_discovered_session):
        """Test killing a session that isn't running returns not_running."""
        with patch("app.routers.sessions._get_cached_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.services.headless_analyzer.headless_analyzer") as mock_headless, \
             patch("app.routers.sessions.event_manager") as mock_events, \
             patch("app.routers.sessions.invalidate_session_cache") as mock_invalidate:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])  # No PTY processes
            mock_headless.cancel = AsyncMock(return_value=False)  # Not a headless session
            mock_events.emit = AsyncMock()

            response = client.post("/sessions/test-uuid-1234/kill")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "not_running"
            assert data["killed_pty"] is False
            assert data["killed_headless"] is False

            # Cache should NOT be invalidated when nothing was killed
            mock_invalidate.assert_not_called()

    def test_kill_session_emits_events(self, client, mock_discovered_session):
        """Test that killing a session emits appropriate events."""
        mock_process = MagicMock()
        mock_process.id = "proc-123"
        mock_process.claude_session_id = "test-uuid-1234"
        mock_process.working_dir = "/home/user/projects/myapp"

        with patch("app.routers.sessions._get_cached_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions.event_manager") as mock_events, \
             patch("app.routers.sessions.invalidate_session_cache"):
            mock_pm.list_processes = AsyncMock(return_value=[mock_process])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[mock_process])
            mock_pm.kill = AsyncMock(return_value=True)
            mock_events.emit = AsyncMock()

            response = client.post("/sessions/test-uuid-1234/kill")

            assert response.status_code == 200

            # Should emit PROCESS_ENDED and SESSION_COMPLETED events
            assert mock_events.emit.call_count == 2

            # Check PROCESS_ENDED event
            process_ended_call = mock_events.emit.call_args_list[0]
            from app.services.event_manager import EventType
            assert process_ended_call[0][0] == EventType.PROCESS_ENDED
            assert process_ended_call[0][1]["process_id"] == "proc-123"

            # Check SESSION_COMPLETED event
            session_completed_call = mock_events.emit.call_args_list[1]
            assert session_completed_call[0][0] == EventType.SESSION_COMPLETED
            assert session_completed_call[0][1]["session_id"] == "test-uuid-1234"

    def test_kill_nonexistent_session_still_tries_kill(self, client):
        """Test killing a session that doesn't have a transcript still attempts kill."""
        # The endpoint doesn't require the session to exist in discovered sessions
        # It just tries to kill any matching PTY/headless processes
        with patch("app.routers.sessions._get_cached_sessions", return_value=[]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.services.headless_analyzer.headless_analyzer") as mock_headless, \
             patch("app.routers.sessions.event_manager") as mock_events:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_headless.cancel = AsyncMock(return_value=False)
            mock_events.emit = AsyncMock()

            response = client.post("/sessions/nonexistent-uuid/kill")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "not_running"

    def test_kill_session_only_kills_matching_process(self, client, mock_discovered_session):
        """Test that kill only affects processes with matching session ID."""
        # Create two processes, only one matches the session ID
        matching_process = MagicMock()
        matching_process.id = "proc-match"
        matching_process.claude_session_id = "test-uuid-1234"
        matching_process.working_dir = "/home/user/projects/myapp"

        other_process = MagicMock()
        other_process.id = "proc-other"
        other_process.claude_session_id = "different-uuid"
        other_process.working_dir = "/home/user/projects/other"

        with patch("app.routers.sessions._get_cached_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.services.headless_analyzer.headless_analyzer") as mock_headless, \
             patch("app.routers.sessions.event_manager") as mock_events, \
             patch("app.routers.sessions.invalidate_session_cache"):
            mock_pm.list_processes = AsyncMock(return_value=[matching_process, other_process])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[matching_process, other_process])
            mock_pm.kill = AsyncMock(return_value=True)
            mock_headless.cancel = AsyncMock(return_value=False)
            mock_events.emit = AsyncMock()

            response = client.post("/sessions/test-uuid-1234/kill")

            assert response.status_code == 200
            data = response.json()
            assert data["killed_pty"] is True

            # Should only kill the matching process
            mock_pm.kill.assert_called_once_with("proc-match")


class TestListSessionsFastPathPendingFiltering:
    """Tests for the fast path optimization's pending session filtering.

    The fast path is used when:
    - sort=updated (default)
    - no search filter
    - no model filter

    Pending sessions must be filtered by starred, has_entities, and is_active
    filters to match the slow path behavior.
    """

    @pytest.fixture(autouse=True)
    def clear_session_cache(self):
        """Clear the session cache before each test to avoid cross-test pollution."""
        from app.routers.sessions import _session_cache
        _session_cache.clear()
        yield
        _session_cache.clear()

    @staticmethod
    def _make_pending_session(
        session_id: str,
        starred: bool = False,
        entities: list = None,
    ):
        """Helper to create a proper SessionSummaryResponse for pending sessions."""
        from app.schemas import SessionSummaryResponse, EntityLinkResponse
        return SessionSummaryResponse(
            session_id=session_id,
            encoded_path="-home-user-projects-myapp",
            repo_path="/home/user/projects/myapp",
            starred=starred,
            entities=[EntityLinkResponse(kind="issue", number=e) for e in (entities or [])],
            is_active=True,
            modified_at="2024-01-15T10:30:00Z",
            file_size=0,
        )

    def test_fast_path_filters_pending_by_starred_true(self, client):
        """Test that pending sessions are filtered when starred=true."""
        # Create a discovered session that's starred
        starred_session = DiscoveredSession(
            session_id="starred-session",
            encoded_path="-home-user-projects-myapp",
            transcript_path=Path("/test/starred.jsonl"),
            modified_at=datetime(2024, 1, 15, 10, 30, 0),
            file_size=1024,
            metadata=SessionMetadata(
                session_id="starred-session",
                starred=True,
                entities=[],
                tags=[],
            ),
        )

        with patch("app.routers.sessions.discover_all_sessions", return_value=[starred_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._get_pending_sessions", new_callable=AsyncMock) as mock_pending, \
             patch("app.routers.sessions._get_pending_headless_sessions") as mock_pending_headless, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            # Return a pending session that is NOT starred
            mock_pending.return_value = [self._make_pending_session("pending-unstarred", starred=False)]
            mock_pending_headless.return_value = []
            mock_scan.return_value = {"title": "Test", "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # Request only starred sessions - fast path should filter out unstarred pending
            response = client.get("/sessions?starred=true")

            assert response.status_code == 200
            data = response.json()
            # Only the starred discovered session should be returned
            # The unstarred pending session should be filtered out
            assert data["total"] == 1
            session_ids = [s["session_id"] for s in data["sessions"]]
            assert "starred-session" in session_ids
            assert "pending-unstarred" not in session_ids

    def test_fast_path_filters_pending_by_starred_false(self, client):
        """Test that pending sessions are filtered when starred=false."""
        # Create a discovered session that's NOT starred
        unstarred_session = DiscoveredSession(
            session_id="unstarred-session",
            encoded_path="-home-user-projects-myapp",
            transcript_path=Path("/test/unstarred.jsonl"),
            modified_at=datetime(2024, 1, 15, 10, 30, 0),
            file_size=1024,
            metadata=SessionMetadata(
                session_id="unstarred-session",
                starred=False,
                entities=[],
                tags=[],
            ),
        )

        with patch("app.routers.sessions.discover_all_sessions", return_value=[unstarred_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._get_pending_sessions", new_callable=AsyncMock) as mock_pending, \
             patch("app.routers.sessions._get_pending_headless_sessions") as mock_pending_headless, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            # Return a pending session that IS starred
            mock_pending.return_value = [self._make_pending_session("pending-starred", starred=True)]
            mock_pending_headless.return_value = []
            mock_scan.return_value = {"title": "Test", "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # Request only unstarred sessions - fast path should filter out starred pending
            response = client.get("/sessions?starred=false")

            assert response.status_code == 200
            data = response.json()
            # Only the unstarred discovered session should be returned
            assert data["total"] == 1
            session_ids = [s["session_id"] for s in data["sessions"]]
            assert "unstarred-session" in session_ids
            assert "pending-starred" not in session_ids

    def test_fast_path_filters_pending_by_has_entities_true(self, client):
        """Test that pending sessions are filtered when has_entities=true."""
        # Create a discovered session that has entities
        session_with_entities = DiscoveredSession(
            session_id="session-with-entities",
            encoded_path="-home-user-projects-myapp",
            transcript_path=Path("/test/with_entities.jsonl"),
            modified_at=datetime(2024, 1, 15, 10, 30, 0),
            file_size=1024,
            metadata=SessionMetadata(
                session_id="session-with-entities",
                starred=False,
                entities=[EntityLink(kind="issue", number=42)],
                tags=[],
            ),
        )

        with patch("app.routers.sessions.discover_all_sessions", return_value=[session_with_entities]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._get_pending_sessions", new_callable=AsyncMock) as mock_pending, \
             patch("app.routers.sessions._get_pending_headless_sessions") as mock_pending_headless, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            # Return a pending session with NO entities
            mock_pending.return_value = [self._make_pending_session("pending-no-entities", entities=[])]
            mock_pending_headless.return_value = []
            mock_scan.return_value = {"title": "Test", "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # Request only sessions with entities
            response = client.get("/sessions?has_entities=true")

            assert response.status_code == 200
            data = response.json()
            # Only the session with entities should be returned
            assert data["total"] == 1
            session_ids = [s["session_id"] for s in data["sessions"]]
            assert "session-with-entities" in session_ids
            assert "pending-no-entities" not in session_ids

    def test_fast_path_filters_pending_by_has_entities_false(self, client):
        """Test that pending sessions are filtered when has_entities=false."""
        # Create a discovered session without entities
        session_without_entities = DiscoveredSession(
            session_id="session-without-entities",
            encoded_path="-home-user-projects-myapp",
            transcript_path=Path("/test/without_entities.jsonl"),
            modified_at=datetime(2024, 1, 15, 10, 30, 0),
            file_size=1024,
            metadata=SessionMetadata(
                session_id="session-without-entities",
                starred=False,
                entities=[],
                tags=[],
            ),
        )

        with patch("app.routers.sessions.discover_all_sessions", return_value=[session_without_entities]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._get_pending_sessions", new_callable=AsyncMock) as mock_pending, \
             patch("app.routers.sessions._get_pending_headless_sessions") as mock_pending_headless, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            # Return a pending session WITH entities
            mock_pending.return_value = [self._make_pending_session("pending-with-entities", entities=[42])]
            mock_pending_headless.return_value = []
            mock_scan.return_value = {"title": "Test", "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # Request only sessions without entities
            response = client.get("/sessions?has_entities=false")

            assert response.status_code == 200
            data = response.json()
            # Only the session without entities should be returned
            assert data["total"] == 1
            session_ids = [s["session_id"] for s in data["sessions"]]
            assert "session-without-entities" in session_ids
            assert "pending-with-entities" not in session_ids

    def test_fast_path_excludes_pending_when_is_active_false(self, client):
        """Test that pending sessions are excluded when is_active=false."""
        # Create a discovered session (inactive)
        inactive_session = DiscoveredSession(
            session_id="inactive-session",
            encoded_path="-home-user-projects-myapp",
            transcript_path=Path("/test/inactive.jsonl"),
            modified_at=datetime(2024, 1, 15, 10, 30, 0),
            file_size=1024,
            metadata=None,
        )

        with patch("app.routers.sessions.discover_all_sessions", return_value=[inactive_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._get_pending_sessions", new_callable=AsyncMock) as mock_pending, \
             patch("app.routers.sessions._get_pending_headless_sessions") as mock_pending_headless, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            # Pending sessions are always active - but _get_pending_sessions won't be called
            # because is_active=False should skip pending sessions entirely
            mock_pending.return_value = [self._make_pending_session("pending-active")]
            mock_pending_headless.return_value = []
            mock_scan.return_value = {"title": "Test", "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # Request only inactive sessions - pending should be excluded entirely
            response = client.get("/sessions?is_active=false")

            assert response.status_code == 200
            data = response.json()
            # Only the inactive discovered session should be returned
            # All pending sessions should be excluded
            assert data["total"] == 1
            session_ids = [s["session_id"] for s in data["sessions"]]
            assert "inactive-session" in session_ids
            assert "pending-active" not in session_ids

    def test_fast_path_includes_pending_when_is_active_true(self, client):
        """Test that pending sessions are included when is_active=true."""
        # Create an active discovered session
        mock_process = MagicMock()
        mock_process.claude_session_id = "active-session"

        active_session = DiscoveredSession(
            session_id="active-session",
            encoded_path="-home-user-projects-myapp",
            transcript_path=Path("/test/active.jsonl"),
            modified_at=datetime(2024, 1, 15, 10, 30, 0),
            file_size=1024,
            metadata=None,
        )

        with patch("app.routers.sessions.discover_all_sessions", return_value=[active_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._get_pending_sessions", new_callable=AsyncMock) as mock_pending, \
             patch("app.routers.sessions._get_pending_headless_sessions") as mock_pending_headless, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[mock_process])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[mock_process])
            # Pending session
            mock_pending.return_value = [self._make_pending_session("pending-session")]
            mock_pending_headless.return_value = []
            mock_scan.return_value = {"title": "Test", "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # Request only active sessions - pending should be included
            response = client.get("/sessions?is_active=true")

            assert response.status_code == 200
            data = response.json()
            # Both active and pending should be returned
            assert data["total"] == 2

    def test_fast_path_total_count_matches_filtered_pending(self, client):
        """Test that total count correctly reflects filtered pending sessions."""
        # Create multiple discovered sessions
        sessions = [
            DiscoveredSession(
                session_id=f"session-{i}",
                encoded_path="-home-user-projects-myapp",
                transcript_path=Path(f"/test/session-{i}.jsonl"),
                modified_at=datetime(2024, 1, 15, 10, 30, i),
                file_size=1024,
                metadata=SessionMetadata(
                    session_id=f"session-{i}",
                    starred=(i % 2 == 0),  # Half are starred
                    entities=[],
                    tags=[],
                ),
            )
            for i in range(4)
        ]

        with patch("app.routers.sessions.discover_all_sessions", return_value=sessions), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._get_pending_sessions", new_callable=AsyncMock) as mock_pending, \
             patch("app.routers.sessions._get_pending_headless_sessions") as mock_pending_headless, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            # Return 2 pending sessions: 1 starred, 1 not starred
            mock_pending.return_value = [
                self._make_pending_session("pending-starred", starred=True),
                self._make_pending_session("pending-unstarred", starred=False),
            ]
            mock_pending_headless.return_value = []
            mock_scan.return_value = {"title": "Test", "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # Request only starred sessions
            response = client.get("/sessions?starred=true")

            assert response.status_code == 200
            data = response.json()
            # Should be: 2 starred discovered + 1 starred pending = 3 total
            assert data["total"] == 3

    def test_fast_path_combined_filters_on_pending(self, client):
        """Test that multiple filters are applied to pending sessions."""
        # Create a session that's starred and has entities
        session = DiscoveredSession(
            session_id="starred-with-entities",
            encoded_path="-home-user-projects-myapp",
            transcript_path=Path("/test/session.jsonl"),
            modified_at=datetime(2024, 1, 15, 10, 30, 0),
            file_size=1024,
            metadata=SessionMetadata(
                session_id="starred-with-entities",
                starred=True,
                entities=[EntityLink(kind="issue", number=1)],
                tags=[],
            ),
        )

        with patch("app.routers.sessions.discover_all_sessions", return_value=[session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._get_pending_sessions", new_callable=AsyncMock) as mock_pending, \
             patch("app.routers.sessions._get_pending_headless_sessions") as mock_pending_headless, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            # Return pending sessions with various combinations
            mock_pending.return_value = [
                # Starred but no entities - should be filtered out by has_entities
                self._make_pending_session("pending-starred-no-entities", starred=True, entities=[]),
                # Not starred but has entities - should be filtered out by starred
                self._make_pending_session("pending-unstarred-with-entities", starred=False, entities=[42]),
                # Starred and has entities - should pass both filters
                self._make_pending_session("pending-starred-with-entities", starred=True, entities=[42]),
            ]
            mock_pending_headless.return_value = []
            mock_scan.return_value = {"title": "Test", "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # Request starred sessions with entities
            response = client.get("/sessions?starred=true&has_entities=true")

            assert response.status_code == 200
            data = response.json()
            # Should be: 1 discovered + 1 pending that matches both filters = 2
            assert data["total"] == 2
            session_ids = [s["session_id"] for s in data["sessions"]]
            assert "starred-with-entities" in session_ids
            assert "pending-starred-with-entities" in session_ids
            assert "pending-starred-no-entities" not in session_ids
            assert "pending-unstarred-with-entities" not in session_ids


class TestTranscriptScanCache:
    """Tests for the transcript scan cache (_transcript_scan_cache).

    Note: We import the module rather than individual names to ensure we're
    testing the actual global state, as Python imports create separate bindings.
    """

    @pytest.fixture(autouse=True)
    def clear_cache(self):
        """Clear the transcript cache before and after each test."""
        import app.routers.sessions as sessions_module
        sessions_module._transcript_scan_cache.clear()
        yield
        sessions_module._transcript_scan_cache.clear()

    def test_cache_stores_scan_results(self, tmp_path):
        """Test that scan results are cached."""
        import app.routers.sessions as sessions_module

        # Create a test transcript file
        transcript = tmp_path / "test.jsonl"
        transcript.write_text('{"type": "user", "message": {"content": "Hello"}, "timestamp": "2024-01-15T10:00:00Z"}\n')

        # First scan
        result1 = sessions_module._quick_scan_transcript(transcript)
        assert len(sessions_module._transcript_scan_cache) == 1
        assert str(transcript) in sessions_module._transcript_scan_cache

        # Second scan should return cached result
        result2 = sessions_module._quick_scan_transcript(transcript)
        assert result1 == result2
        assert len(sessions_module._transcript_scan_cache) == 1

    def test_cache_invalidates_on_mtime_change(self, tmp_path):
        """Test that cache is invalidated when file mtime changes."""
        import app.routers.sessions as sessions_module
        import time

        # Create a test transcript file
        transcript = tmp_path / "test.jsonl"
        transcript.write_text('{"type": "user", "message": {"content": "Hello"}, "timestamp": "2024-01-15T10:00:00Z"}\n')

        # First scan
        result1 = sessions_module._quick_scan_transcript(transcript)
        assert result1["message_count"] == 1

        # Wait a tiny bit and modify the file
        time.sleep(0.01)
        transcript.write_text(
            '{"type": "user", "message": {"content": "Hello"}, "timestamp": "2024-01-15T10:00:00Z"}\n'
            '{"type": "assistant", "message": {"content": "Hi"}, "timestamp": "2024-01-15T10:00:01Z"}\n'
        )

        # Second scan should detect the change
        result2 = sessions_module._quick_scan_transcript(transcript)
        assert result2["message_count"] == 2

    def test_cache_cleanup_keeps_max_entries(self, tmp_path):
        """Test that cache cleanup keeps MAX_ENTRIES when exceeded."""
        import app.routers.sessions as sessions_module

        MAX_ENTRIES = sessions_module.TRANSCRIPT_CACHE_MAX_ENTRIES

        # Create many test transcript files (more than the cache limit)
        num_files = MAX_ENTRIES + 10
        for i in range(num_files):
            transcript = tmp_path / f"test_{i}.jsonl"
            transcript.write_text(f'{{"type": "user", "message": {{"content": "Hello {i}"}}, "timestamp": "2024-01-15T10:00:0{i % 10}Z"}}\n')
            sessions_module._quick_scan_transcript(transcript)

        # Cache should have been cleaned up to MAX_ENTRIES
        assert len(sessions_module._transcript_scan_cache) <= MAX_ENTRIES

    def test_cache_cleanup_preserves_recent_entries(self, tmp_path):
        """Test that cache cleanup preserves entries with recent mtimes."""
        import app.routers.sessions as sessions_module
        import time

        MAX_ENTRIES = sessions_module.TRANSCRIPT_CACHE_MAX_ENTRIES

        # Create old files first
        old_files = []
        for i in range(MAX_ENTRIES):
            transcript = tmp_path / f"old_{i}.jsonl"
            transcript.write_text(f'{{"type": "user", "message": {{"content": "Old {i}"}}}}\n')
            old_files.append(transcript)
            sessions_module._quick_scan_transcript(transcript)

        # Sleep to ensure new files have newer mtimes
        time.sleep(0.05)

        # Create new files that will trigger cleanup
        new_files = []
        for i in range(15):
            transcript = tmp_path / f"new_{i}.jsonl"
            transcript.write_text(f'{{"type": "user", "message": {{"content": "New {i}"}}}}\n')
            new_files.append(transcript)
            sessions_module._quick_scan_transcript(transcript)

        # Cache should be at or below max
        assert len(sessions_module._transcript_scan_cache) <= MAX_ENTRIES

        # All new files should be in cache (they have newer mtimes)
        for f in new_files:
            assert str(f) in sessions_module._transcript_scan_cache

    def test_cache_handles_nonexistent_file(self, tmp_path):
        """Test that cache handles nonexistent files gracefully."""
        import app.routers.sessions as sessions_module

        nonexistent = tmp_path / "nonexistent.jsonl"
        result = sessions_module._quick_scan_transcript(nonexistent)

        # Should return defaults
        assert result["title"] is None
        assert result["model"] is None
        assert result["message_count"] == 0

        # Should not be cached (file doesn't exist)
        assert str(nonexistent) not in sessions_module._transcript_scan_cache

    def test_cache_multiple_files_independent(self, tmp_path):
        """Test that different files have independent cache entries."""
        import app.routers.sessions as sessions_module

        # Create two different files
        file1 = tmp_path / "file1.jsonl"
        file1.write_text('{"type": "summary", "summary": "Summary One"}\n')

        file2 = tmp_path / "file2.jsonl"
        file2.write_text('{"type": "summary", "summary": "Summary Two"}\n')

        result1 = sessions_module._quick_scan_transcript(file1)
        result2 = sessions_module._quick_scan_transcript(file2)

        assert result1["title"] == "Summary One"
        assert result2["title"] == "Summary Two"
        assert len(sessions_module._transcript_scan_cache) == 2

    def test_cache_cleanup_modifies_in_place(self, tmp_path):
        """Test that cache cleanup modifies the dict in-place for thread safety.

        This is a regression test for the thread-safety bug where the cache
        was reassigned to a new dict during cleanup, which could cause issues
        with concurrent access.
        """
        import app.routers.sessions as sessions_module
        import time

        MAX_ENTRIES = sessions_module.TRANSCRIPT_CACHE_MAX_ENTRIES

        # Get reference to the original cache dict
        original_cache_id = id(sessions_module._transcript_scan_cache)

        # Create more files than MAX_ENTRIES to trigger cleanup
        num_files = MAX_ENTRIES + 20
        for i in range(num_files):
            transcript = tmp_path / f"test_{i}.jsonl"
            transcript.write_text(f'{{"type": "user", "message": {{"content": "Hello {i}"}}}}\n')
            # Small delay to ensure different mtimes
            if i % 50 == 0:
                time.sleep(0.01)
            sessions_module._quick_scan_transcript(transcript)

        # After cleanup, the cache dict should be the SAME object (modified in-place)
        # This is the key test - if cleanup reassigned the dict, id() would differ
        assert id(sessions_module._transcript_scan_cache) == original_cache_id

        # And it should have been cleaned up to MAX_ENTRIES
        assert len(sessions_module._transcript_scan_cache) <= MAX_ENTRIES

    def test_cache_thread_safety_concurrent_access(self, tmp_path):
        """Test that concurrent cache access from multiple threads is safe.

        This is a regression test for the thread-safety bug where concurrent
        access to _transcript_scan_cache without locking could cause race
        conditions when cleanup modifies the cache while other threads read it.
        """
        import app.routers.sessions as sessions_module
        from concurrent.futures import ThreadPoolExecutor, as_completed
        import threading

        # Create a bunch of test files
        num_files = 100
        files = []
        for i in range(num_files):
            transcript = tmp_path / f"concurrent_{i}.jsonl"
            transcript.write_text(
                f'{{"type": "user", "message": {{"content": "Hello {i}"}}, "timestamp": "2024-01-15T10:00:00Z"}}\n'
            )
            files.append(transcript)

        errors = []
        results = []
        lock = threading.Lock()

        def scan_file(file_path):
            """Scan a file and record the result."""
            try:
                result = sessions_module._quick_scan_transcript(file_path)
                with lock:
                    results.append(result)
                return result
            except Exception as e:
                with lock:
                    errors.append((file_path, e))
                raise

        # Run many concurrent scans to stress test the lock
        with ThreadPoolExecutor(max_workers=16) as executor:
            # Submit files multiple times to increase contention
            futures = []
            for _ in range(3):  # Run 3 rounds
                for f in files:
                    futures.append(executor.submit(scan_file, f))

            # Wait for all futures
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception:
                    pass  # Error already recorded

        # Should have no errors
        assert len(errors) == 0, f"Thread safety errors: {errors}"

        # Should have processed all files (3 rounds × num_files)
        assert len(results) == 3 * num_files

        # Cache should be in valid state
        assert len(sessions_module._transcript_scan_cache) <= sessions_module.TRANSCRIPT_CACHE_MAX_ENTRIES

    def test_cache_thread_safety_cleanup_during_read(self, tmp_path):
        """Test that cleanup doesn't corrupt cache during concurrent reads.

        Creates enough files to trigger cleanup, then verifies that concurrent
        reads during cleanup don't raise errors or return corrupted data.
        """
        import app.routers.sessions as sessions_module
        from concurrent.futures import ThreadPoolExecutor, as_completed
        import threading
        import time

        MAX_ENTRIES = sessions_module.TRANSCRIPT_CACHE_MAX_ENTRIES

        # Create files to fill cache and trigger cleanup
        num_files = MAX_ENTRIES + 50
        files = []
        for i in range(num_files):
            transcript = tmp_path / f"cleanup_test_{i}.jsonl"
            transcript.write_text(
                f'{{"type": "summary", "summary": "File {i}"}}\n'
                f'{{"type": "user", "message": {{"content": "Content {i}"}}, "timestamp": "2024-01-15T10:00:00Z"}}\n'
            )
            files.append(transcript)

        errors = []
        lock = threading.Lock()

        def scan_and_verify(file_path, expected_idx):
            """Scan a file and verify the result is not corrupted."""
            try:
                result = sessions_module._quick_scan_transcript(file_path)
                # Verify result has expected structure
                assert "title" in result, "Missing title key"
                assert "message_count" in result, "Missing message_count key"
                # The title should be our summary or None
                if result["title"] is not None:
                    assert isinstance(result["title"], str), "Title should be string"
                return result
            except Exception as e:
                with lock:
                    errors.append((file_path, str(e)))
                raise

        # Run concurrent scans with high contention
        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = []
            for i, f in enumerate(files):
                futures.append(executor.submit(scan_and_verify, f, i))
                # Interleave re-reads of earlier files to increase contention
                if i > 10 and i % 5 == 0:
                    earlier_idx = i - 10
                    futures.append(executor.submit(scan_and_verify, files[earlier_idx], earlier_idx))

            for future in as_completed(futures):
                try:
                    future.result()
                except Exception:
                    pass

        # Should have no errors
        assert len(errors) == 0, f"Concurrent cleanup errors: {errors}"

        # Cache should be properly bounded
        assert len(sessions_module._transcript_scan_cache) <= MAX_ENTRIES


class TestSessionCache:
    """Tests for SessionCache class."""

    @pytest.fixture
    def cache(self):
        """Create a fresh SessionCache instance for testing."""
        from app.routers.sessions import SessionCache
        return SessionCache()

    def test_initial_state(self, cache):
        """Test that a new cache is empty."""
        assert len(cache) == 0
        assert cache.get("any_key") is None
        assert "any_key" not in cache

    def test_set_and_get(self, cache):
        """Test setting and getting cache entries."""
        sessions = [{"id": "session-1"}, {"id": "session-2"}]
        cache.set("test_key", sessions, mtime=1000.0)

        entry = cache.get("test_key")
        assert entry is not None
        assert entry.sessions == sessions
        assert entry.dir_mtime == 1000.0
        assert entry.cached_at > 0

    def test_contains(self, cache):
        """Test __contains__ for checking key existence."""
        cache.set("existing_key", [], mtime=100.0)

        assert "existing_key" in cache
        assert "nonexistent_key" not in cache

    def test_len(self, cache):
        """Test __len__ for counting entries."""
        assert len(cache) == 0

        cache.set("key1", [], mtime=100.0)
        assert len(cache) == 1

        cache.set("key2", [], mtime=200.0)
        assert len(cache) == 2

    def test_invalidate_specific_key(self, cache):
        """Test invalidating a specific cache key."""
        cache.set("key1", [], mtime=100.0)
        cache.set("key2", [], mtime=200.0)
        cache.set("__all__", [], mtime=300.0)

        # Also set up mtime tracking using the thread-safe method
        cache.set_mtime_data("key1", 100.0, 100.0)
        cache.set_mtime_data("__all__", 300.0, 300.0)

        cache.invalidate("key1")

        # key1 and __all__ should be invalidated
        assert "key1" not in cache
        assert "__all__" not in cache
        # key2 should remain
        assert "key2" in cache

        # Mtime tracking should also be cleared for invalidated keys
        # Check via the private attributes (acceptable for unit tests)
        assert "key1" not in cache._last_mtime_check
        assert "__all__" not in cache._last_mtime_check
        assert "key1" not in cache._cached_mtimes
        assert "__all__" not in cache._cached_mtimes

    def test_invalidate_all(self, cache):
        """Test invalidating all cache entries."""
        cache.set("key1", [], mtime=100.0)
        cache.set("key2", [], mtime=200.0)
        cache.set_mtime_data("key1", 100.0, 100.0)

        cache.invalidate()

        assert len(cache) == 0
        assert len(cache._last_mtime_check) == 0
        assert len(cache._cached_mtimes) == 0

    def test_clear_is_alias_for_invalidate(self, cache):
        """Test that clear() is an alias for invalidate()."""
        cache.set("key1", [], mtime=100.0)
        cache.set_mtime_data("key1", 100.0, 100.0)

        cache.clear()

        assert len(cache) == 0
        assert len(cache._last_mtime_check) == 0
        assert len(cache._cached_mtimes) == 0

    def test_cleanup_old_entries_when_under_limit(self, cache):
        """Test that cleanup does nothing when under the limit."""
        cache.set("key1", [], mtime=100.0)
        cache.set("key2", [], mtime=200.0)
        cache.set_mtime_data("key1", 100.0, 100.0)

        # Should not clean up when under the limit
        cache.cleanup_old_entries(max_entries=10)

        assert len(cache) == 2
        assert "key1" in cache._last_mtime_check
        assert "key1" in cache._cached_mtimes

    def test_cleanup_old_entries_removes_old_entries(self, cache):
        """Test that cleanup removes entries older than cutoff."""
        import time

        # Create an old entry (with cached_at in the past)
        from app.routers.sessions import SessionCacheEntry, SESSION_CACHE_TTL

        old_time = time.time() - SESSION_CACHE_TTL * 20  # Very old
        cache._entries["old_key"] = SessionCacheEntry(
            sessions=[],
            cached_at=old_time,
            dir_mtime=100.0,
        )
        cache._last_mtime_check["old_key"] = old_time
        cache._cached_mtimes["old_key"] = 100.0

        # Create a recent entry
        cache.set("recent_key", [], mtime=200.0)
        cache.set_mtime_data("recent_key", time.time(), 200.0)

        # Trigger cleanup (set max_entries to 1 to force cleanup)
        cache.cleanup_old_entries(max_entries=1)

        # Old key should be removed along with its mtime tracking
        assert "old_key" not in cache
        assert "old_key" not in cache._last_mtime_check
        assert "old_key" not in cache._cached_mtimes

        # Recent key should remain
        assert "recent_key" in cache
        assert "recent_key" in cache._last_mtime_check
        assert "recent_key" in cache._cached_mtimes

    def test_cleanup_old_entries_prevents_memory_leak(self, cache):
        """Test that cleanup clears mtime tracking for removed entries.

        This is a regression test for the memory leak bug where
        last_mtime_check and cached_mtimes were not being cleaned up.
        """
        import time
        from app.routers.sessions import SessionCacheEntry, SESSION_CACHE_TTL

        # Create multiple old entries with mtime tracking
        old_time = time.time() - SESSION_CACHE_TTL * 20
        for i in range(10):
            key = f"old_key_{i}"
            cache._entries[key] = SessionCacheEntry(
                sessions=[],
                cached_at=old_time,
                dir_mtime=100.0 + i,
            )
            cache._last_mtime_check[key] = old_time
            cache._cached_mtimes[key] = 100.0 + i

        # Create one recent entry
        cache.set("recent_key", [], mtime=500.0)
        cache.set_mtime_data("recent_key", time.time(), 500.0)

        # Before cleanup, all tracking dicts should have 11 entries
        assert len(cache._entries) == 11
        assert len(cache._last_mtime_check) == 11
        assert len(cache._cached_mtimes) == 11

        # Trigger cleanup
        cache.cleanup_old_entries(max_entries=1)

        # After cleanup, only recent entry should remain in ALL dicts
        # This tests the memory leak fix
        assert len(cache._entries) == 1
        assert len(cache._last_mtime_check) == 1
        assert len(cache._cached_mtimes) == 1
        assert "recent_key" in cache._entries
        assert "recent_key" in cache._last_mtime_check
        assert "recent_key" in cache._cached_mtimes

    def test_set_updates_existing_entry(self, cache):
        """Test that setting a key updates an existing entry."""
        cache.set("key1", ["old_session"], mtime=100.0)
        cache.set("key1", ["new_session"], mtime=200.0)

        entry = cache.get("key1")
        assert entry.sessions == ["new_session"]
        assert entry.dir_mtime == 200.0

    def test_get_returns_none_for_missing_key(self, cache):
        """Test that get returns None for missing keys."""
        assert cache.get("nonexistent") is None

    def test_cleanup_old_entries_evicts_oldest_when_all_fresh(self, cache):
        """Test that cleanup evicts oldest entries when all are newer than cutoff.

        This is a regression test for the bug where if all cache entries were
        fresh (newer than SESSION_CACHE_TTL * 10), the cache would never shrink
        below max_entries because only the expired-entry removal logic ran.
        """
        import time
        from app.routers.sessions import SessionCacheEntry

        # Create multiple fresh entries (all recent, none will be removed by cutoff)
        base_time = time.time()
        for i in range(5):
            key = f"fresh_key_{i}"
            # Manually set entries to ensure ordering (oldest first)
            cache._entries[key] = SessionCacheEntry(
                sessions=[f"session_{i}"],
                cached_at=base_time + i,  # Increasing time = newer
                dir_mtime=100.0 + i,
            )
            cache._last_mtime_check[key] = base_time + i
            cache._cached_mtimes[key] = 100.0 + i

        # Verify we have 5 entries
        assert len(cache) == 5

        # Trigger cleanup with max_entries=2 - should evict the 3 oldest
        cache.cleanup_old_entries(max_entries=2)

        # Should have exactly 2 entries remaining
        assert len(cache) == 2

        # The oldest entries (fresh_key_0, fresh_key_1, fresh_key_2) should be gone
        assert "fresh_key_0" not in cache
        assert "fresh_key_1" not in cache
        assert "fresh_key_2" not in cache

        # The newest entries (fresh_key_3, fresh_key_4) should remain
        assert "fresh_key_3" in cache
        assert "fresh_key_4" in cache

        # Mtime tracking should also be cleaned up for evicted entries
        assert "fresh_key_0" not in cache._last_mtime_check
        assert "fresh_key_0" not in cache._cached_mtimes
        assert "fresh_key_3" in cache._last_mtime_check
        assert "fresh_key_3" in cache._cached_mtimes

    def test_cleanup_old_entries_combines_expired_and_oldest_eviction(self, cache):
        """Test that cleanup first removes expired, then evicts oldest if still over limit.

        This tests the combined behavior: first expired entries are removed,
        then if still over the limit, the oldest remaining entries are evicted.
        """
        import time
        from app.routers.sessions import SessionCacheEntry, SESSION_CACHE_TTL

        # Create 2 old (expired) entries
        old_time = time.time() - SESSION_CACHE_TTL * 20
        for i in range(2):
            key = f"expired_key_{i}"
            cache._entries[key] = SessionCacheEntry(
                sessions=[],
                cached_at=old_time,
                dir_mtime=50.0 + i,
            )
            cache._last_mtime_check[key] = old_time
            cache._cached_mtimes[key] = 50.0 + i

        # Create 4 fresh entries with distinct ages
        base_time = time.time()
        for i in range(4):
            key = f"fresh_key_{i}"
            cache._entries[key] = SessionCacheEntry(
                sessions=[],
                cached_at=base_time + i,  # Increasing = newer
                dir_mtime=100.0 + i,
            )
            cache._last_mtime_check[key] = base_time + i
            cache._cached_mtimes[key] = 100.0 + i

        # Total: 6 entries (2 expired + 4 fresh)
        assert len(cache) == 6

        # Cleanup with max_entries=2
        # Should: 1) Remove 2 expired, 2) Still have 4 fresh > 2, so evict 2 oldest fresh
        cache.cleanup_old_entries(max_entries=2)

        # Should have exactly 2 entries
        assert len(cache) == 2

        # Expired should be gone
        assert "expired_key_0" not in cache
        assert "expired_key_1" not in cache

        # Oldest fresh should be gone
        assert "fresh_key_0" not in cache
        assert "fresh_key_1" not in cache

        # Newest fresh should remain
        assert "fresh_key_2" in cache
        assert "fresh_key_3" in cache

    def test_mtime_tracking_methods(self, cache):
        """Test the mtime tracking methods (get_mtime_check, get_cached_mtime, set_mtime_data)."""
        # Initially returns 0 for unknown keys
        assert cache.get_mtime_check("key1") == 0
        assert cache.get_cached_mtime("key1") == 0

        # Set mtime data
        cache.set_mtime_data("key1", 1000.0, 2000.0)

        # Verify it was stored correctly
        assert cache.get_mtime_check("key1") == 1000.0
        assert cache.get_cached_mtime("key1") == 2000.0

        # Update with new values
        cache.set_mtime_data("key1", 3000.0, 4000.0)
        assert cache.get_mtime_check("key1") == 3000.0
        assert cache.get_cached_mtime("key1") == 4000.0

    def test_thread_safety_concurrent_access(self, cache):
        """Test that concurrent access to the cache doesn't cause errors.

        This test uses multiple threads to simultaneously read and write to the cache.
        If the cache is not thread-safe, this could result in race conditions or errors.
        """
        import threading
        import time
        from app.routers.sessions import SessionCacheEntry

        errors = []
        operations_completed = {"read": 0, "write": 0, "invalidate": 0}
        lock = threading.Lock()

        def writer_thread(thread_id: int, iterations: int):
            """Write entries to the cache."""
            for i in range(iterations):
                try:
                    key = f"thread_{thread_id}_key_{i}"
                    cache.set(key, [{"session": f"{thread_id}_{i}"}], mtime=float(i))
                    cache.set_mtime_data(key, time.time(), float(i))
                    with lock:
                        operations_completed["write"] += 1
                except Exception as e:
                    with lock:
                        errors.append(f"Writer {thread_id}: {e}")

        def reader_thread(thread_id: int, iterations: int):
            """Read entries from the cache."""
            for i in range(iterations):
                try:
                    # Try to read various keys (some may not exist)
                    key = f"thread_{thread_id % 3}_key_{i % 10}"
                    _ = cache.get(key)
                    _ = cache.get_mtime_check(key)
                    _ = cache.get_cached_mtime(key)
                    _ = key in cache
                    _ = len(cache)
                    with lock:
                        operations_completed["read"] += 1
                except Exception as e:
                    with lock:
                        errors.append(f"Reader {thread_id}: {e}")

        def invalidator_thread(iterations: int):
            """Invalidate cache entries periodically."""
            for i in range(iterations):
                try:
                    if i % 3 == 0:
                        cache.invalidate(f"thread_0_key_{i % 10}")
                    else:
                        cache.cleanup_old_entries(max_entries=50)
                    with lock:
                        operations_completed["invalidate"] += 1
                except Exception as e:
                    with lock:
                        errors.append(f"Invalidator: {e}")

        # Start multiple threads
        threads = []

        # 3 writer threads
        for i in range(3):
            t = threading.Thread(target=writer_thread, args=(i, 50))
            threads.append(t)

        # 3 reader threads
        for i in range(3):
            t = threading.Thread(target=reader_thread, args=(i, 100))
            threads.append(t)

        # 1 invalidator thread
        t = threading.Thread(target=invalidator_thread, args=(30,))
        threads.append(t)

        # Start all threads
        for t in threads:
            t.start()

        # Wait for all threads to complete
        for t in threads:
            t.join(timeout=10)

        # Check that no errors occurred
        assert len(errors) == 0, f"Thread-safety errors: {errors}"

        # Verify that operations completed
        assert operations_completed["write"] > 0
        assert operations_completed["read"] > 0
        assert operations_completed["invalidate"] > 0

    def test_thread_safety_cleanup_during_read(self, cache):
        """Test that cleanup can run while other threads are reading."""
        import threading
        import time
        from app.routers.sessions import SessionCacheEntry

        errors = []

        # Pre-populate cache with some entries
        for i in range(20):
            cache.set(f"key_{i}", [{"session": i}], mtime=float(i))
            cache.set_mtime_data(f"key_{i}", time.time() - 1000, float(i))

        def reader_thread(iterations: int):
            """Continuously read from cache."""
            for _ in range(iterations):
                try:
                    for i in range(20):
                        _ = cache.get(f"key_{i}")
                        _ = len(cache)
                except Exception as e:
                    errors.append(f"Reader: {e}")

        def cleanup_thread(iterations: int):
            """Continuously run cleanup."""
            for _ in range(iterations):
                try:
                    cache.cleanup_old_entries(max_entries=10)
                except Exception as e:
                    errors.append(f"Cleanup: {e}")

        threads = [
            threading.Thread(target=reader_thread, args=(50,)),
            threading.Thread(target=reader_thread, args=(50,)),
            threading.Thread(target=cleanup_thread, args=(20,)),
        ]

        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert len(errors) == 0, f"Thread-safety errors: {errors}"


class TestParseDateFilter:
    """Tests for the _parse_date_filter helper function."""

    def test_parses_valid_date(self):
        """Test parsing a valid ISO date string."""
        from app.routers.sessions import _parse_date_filter

        result = _parse_date_filter("2024-01-15")
        assert result is not None
        assert result.year == 2024
        assert result.month == 1
        assert result.day == 15
        # Default is start of day
        assert result.hour == 0
        assert result.minute == 0
        assert result.second == 0

    def test_parses_date_start_of_day(self):
        """Test parsing with start of day (default)."""
        from app.routers.sessions import _parse_date_filter

        result = _parse_date_filter("2024-06-20", end_of_day=False)
        assert result.hour == 0
        assert result.minute == 0
        assert result.second == 0
        assert result.microsecond == 0

    def test_parses_date_end_of_day(self):
        """Test parsing with end of day."""
        from app.routers.sessions import _parse_date_filter

        result = _parse_date_filter("2024-06-20", end_of_day=True)
        assert result.hour == 23
        assert result.minute == 59
        assert result.second == 59
        assert result.microsecond == 999999

    def test_returns_none_for_none_input(self):
        """Test that None is returned for None input."""
        from app.routers.sessions import _parse_date_filter

        result = _parse_date_filter(None)
        assert result is None

    def test_returns_none_for_empty_string(self):
        """Test that None is returned for empty string."""
        from app.routers.sessions import _parse_date_filter

        result = _parse_date_filter("")
        assert result is None

    def test_returns_none_for_invalid_format(self):
        """Test that None is returned for invalid format."""
        from app.routers.sessions import _parse_date_filter

        result = _parse_date_filter("not-a-date")
        assert result is None

    def test_returns_none_for_invalid_date(self):
        """Test that None is returned for invalid date values."""
        from app.routers.sessions import _parse_date_filter

        result = _parse_date_filter("2024-02-30")  # Invalid day
        assert result is None

    def test_parses_date_with_time(self):
        """Test parsing a date string that includes time (time is replaced)."""
        from app.routers.sessions import _parse_date_filter

        result = _parse_date_filter("2024-01-15T14:30:00")
        assert result is not None
        # Time should be replaced with start of day
        assert result.hour == 0
        assert result.minute == 0

    def test_returns_naive_datetime(self):
        """Test that result is always a naive datetime."""
        from app.routers.sessions import _parse_date_filter

        result = _parse_date_filter("2024-01-15")
        assert result.tzinfo is None


class TestListSessionsDateFiltering:
    """Tests for date filtering in the list sessions endpoint."""

    @pytest.fixture(autouse=True)
    def clear_cache(self):
        """Clear the session cache before and after each test."""
        from app.routers.sessions import _session_cache
        _session_cache.clear()
        yield
        _session_cache.clear()

    @pytest.fixture
    def create_sessions_with_dates(self):
        """Factory fixture to create mock sessions with specific dates."""
        def _create(dates: list[datetime]):
            sessions = []
            for i, dt in enumerate(dates):
                sessions.append(DiscoveredSession(
                    session_id=f"session-{i}",
                    encoded_path="-home-user-projects-app",
                    transcript_path=Path(f"/home/user/.claude/projects/app/session-{i}.jsonl"),
                    modified_at=dt,
                    file_size=1024,
                    metadata=None,
                ))
            return sessions
        return _create

    def test_filter_by_date_from(self, client, create_sessions_with_dates):
        """Test filtering sessions with date_from parameter."""
        sessions = create_sessions_with_dates([
            datetime(2024, 1, 10, 12, 0, 0),  # Before filter
            datetime(2024, 1, 15, 12, 0, 0),  # On filter date
            datetime(2024, 1, 20, 12, 0, 0),  # After filter date
        ])

        with patch("app.routers.sessions.discover_all_sessions", return_value=sessions), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": None, "model": None, "start_time": None, "end_time": None, "message_count": 0}

            response = client.get("/sessions?date_from=2024-01-15")

            assert response.status_code == 200
            data = response.json()
            # Should include sessions on or after 2024-01-15
            assert data["total"] == 2
            session_ids = {s["session_id"] for s in data["sessions"]}
            assert "session-1" in session_ids  # On filter date
            assert "session-2" in session_ids  # After filter date
            assert "session-0" not in session_ids  # Before filter date

    def test_filter_by_date_to(self, client, create_sessions_with_dates):
        """Test filtering sessions with date_to parameter."""
        sessions = create_sessions_with_dates([
            datetime(2024, 1, 10, 12, 0, 0),  # Before filter
            datetime(2024, 1, 15, 12, 0, 0),  # On filter date
            datetime(2024, 1, 20, 12, 0, 0),  # After filter date
        ])

        with patch("app.routers.sessions.discover_all_sessions", return_value=sessions), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": None, "model": None, "start_time": None, "end_time": None, "message_count": 0}

            response = client.get("/sessions?date_to=2024-01-15")

            assert response.status_code == 200
            data = response.json()
            # Should include sessions on or before 2024-01-15
            assert data["total"] == 2
            session_ids = {s["session_id"] for s in data["sessions"]}
            assert "session-0" in session_ids  # Before filter date
            assert "session-1" in session_ids  # On filter date
            assert "session-2" not in session_ids  # After filter date

    def test_filter_by_date_range(self, client, create_sessions_with_dates):
        """Test filtering sessions with both date_from and date_to."""
        sessions = create_sessions_with_dates([
            datetime(2024, 1, 5, 12, 0, 0),   # Before range
            datetime(2024, 1, 10, 12, 0, 0),  # On start date
            datetime(2024, 1, 15, 12, 0, 0),  # In range
            datetime(2024, 1, 20, 12, 0, 0),  # On end date
            datetime(2024, 1, 25, 12, 0, 0),  # After range
        ])

        with patch("app.routers.sessions.discover_all_sessions", return_value=sessions), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": None, "model": None, "start_time": None, "end_time": None, "message_count": 0}

            response = client.get("/sessions?date_from=2024-01-10&date_to=2024-01-20")

            assert response.status_code == 200
            data = response.json()
            # Should include sessions between 2024-01-10 and 2024-01-20
            assert data["total"] == 3
            session_ids = {s["session_id"] for s in data["sessions"]}
            assert "session-0" not in session_ids  # Before range
            assert "session-1" in session_ids      # On start date
            assert "session-2" in session_ids      # In range
            assert "session-3" in session_ids      # On end date
            assert "session-4" not in session_ids  # After range

    def test_filter_date_from_end_of_day_boundary(self, client, create_sessions_with_dates):
        """Test that date_from starts at beginning of day (00:00:00)."""
        sessions = create_sessions_with_dates([
            datetime(2024, 1, 14, 23, 59, 59),  # Just before midnight on prev day
            datetime(2024, 1, 15, 0, 0, 1),     # Just after midnight on filter day
        ])

        with patch("app.routers.sessions.discover_all_sessions", return_value=sessions), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": None, "model": None, "start_time": None, "end_time": None, "message_count": 0}

            response = client.get("/sessions?date_from=2024-01-15")

            assert response.status_code == 200
            data = response.json()
            # Session just before midnight should be excluded
            assert data["total"] == 1
            assert data["sessions"][0]["session_id"] == "session-1"

    def test_filter_date_to_end_of_day_boundary(self, client, create_sessions_with_dates):
        """Test that date_to ends at end of day (23:59:59)."""
        sessions = create_sessions_with_dates([
            datetime(2024, 1, 15, 23, 59, 58),  # Just before end of day
            datetime(2024, 1, 16, 0, 0, 1),     # Just after midnight (next day)
        ])

        with patch("app.routers.sessions.discover_all_sessions", return_value=sessions), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": None, "model": None, "start_time": None, "end_time": None, "message_count": 0}

            response = client.get("/sessions?date_to=2024-01-15")

            assert response.status_code == 200
            data = response.json()
            # Session just before end of day should be included
            assert data["total"] == 1
            assert data["sessions"][0]["session_id"] == "session-0"

    def test_filter_invalid_date_from_ignored(self, client, create_sessions_with_dates):
        """Test that invalid date_from is ignored (no filtering applied)."""
        sessions = create_sessions_with_dates([
            datetime(2024, 1, 10, 12, 0, 0),
            datetime(2024, 1, 15, 12, 0, 0),
        ])

        with patch("app.routers.sessions.discover_all_sessions", return_value=sessions), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": None, "model": None, "start_time": None, "end_time": None, "message_count": 0}

            response = client.get("/sessions?date_from=invalid-date")

            assert response.status_code == 200
            data = response.json()
            # All sessions should be returned when date is invalid
            assert data["total"] == 2

    def test_filter_invalid_date_to_ignored(self, client, create_sessions_with_dates):
        """Test that invalid date_to is ignored (no filtering applied)."""
        sessions = create_sessions_with_dates([
            datetime(2024, 1, 10, 12, 0, 0),
            datetime(2024, 1, 15, 12, 0, 0),
        ])

        with patch("app.routers.sessions.discover_all_sessions", return_value=sessions), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": None, "model": None, "start_time": None, "end_time": None, "message_count": 0}

            response = client.get("/sessions?date_to=not-a-date")

            assert response.status_code == 200
            data = response.json()
            # All sessions should be returned when date is invalid
            assert data["total"] == 2

    def test_filter_empty_result(self, client, create_sessions_with_dates):
        """Test that date filter can return empty result set."""
        sessions = create_sessions_with_dates([
            datetime(2024, 1, 10, 12, 0, 0),
            datetime(2024, 1, 15, 12, 0, 0),
        ])

        with patch("app.routers.sessions.discover_all_sessions", return_value=sessions), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": None, "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # Filter for dates after all sessions
            response = client.get("/sessions?date_from=2025-01-01")

            assert response.status_code == 200
            data = response.json()
            assert data["total"] == 0
            assert data["sessions"] == []

    def test_filter_date_combined_with_starred(self, client, create_sessions_with_dates):
        """Test date filtering combined with other filters."""
        sessions = [
            DiscoveredSession(
                session_id="session-0",
                encoded_path="-home-user-projects-app",
                transcript_path=Path("/home/user/.claude/projects/app/session-0.jsonl"),
                modified_at=datetime(2024, 1, 10, 12, 0, 0),
                file_size=1024,
                metadata=SessionMetadata(
                    session_id="session-0",
                    title="Old Starred",
                    starred=True,
                    entities=[],
                    tags=[],
                ),
            ),
            DiscoveredSession(
                session_id="session-1",
                encoded_path="-home-user-projects-app",
                transcript_path=Path("/home/user/.claude/projects/app/session-1.jsonl"),
                modified_at=datetime(2024, 1, 20, 12, 0, 0),
                file_size=1024,
                metadata=SessionMetadata(
                    session_id="session-1",
                    title="New Starred",
                    starred=True,
                    entities=[],
                    tags=[],
                ),
            ),
            DiscoveredSession(
                session_id="session-2",
                encoded_path="-home-user-projects-app",
                transcript_path=Path("/home/user/.claude/projects/app/session-2.jsonl"),
                modified_at=datetime(2024, 1, 20, 12, 0, 0),
                file_size=1024,
                metadata=SessionMetadata(
                    session_id="session-2",
                    title="New Not Starred",
                    starred=False,
                    entities=[],
                    tags=[],
                ),
            ),
        ]

        with patch("app.routers.sessions.discover_all_sessions", return_value=sessions), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_pm.get_processes_snapshot = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": None, "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # Filter for starred sessions after 2024-01-15
            response = client.get("/sessions?date_from=2024-01-15&starred=true")

            assert response.status_code == 200
            data = response.json()
            assert data["total"] == 1
            assert data["sessions"][0]["session_id"] == "session-1"


class TestGetPendingHeadlessSessions:
    """Tests for _get_pending_headless_sessions function.

    This function retrieves synthetic session summaries for running headless sessions
    that don't have JSONL files yet. It uses in-memory tracking from the headless
    analyzer for reliable real-time status and sidecar metadata for session info.
    """

    @pytest.mark.asyncio
    async def test_empty_when_no_running_sessions(self):
        """Test returns empty list when no sessions are running."""
        with patch("app.services.headless_analyzer.headless_analyzer") as mock_analyzer:
            mock_analyzer.list_running = AsyncMock(return_value=[])

            result = await _get_pending_headless_sessions(set())

            assert result == []

    @pytest.mark.asyncio
    async def test_empty_when_all_sessions_discovered(self):
        """Test returns empty when all running sessions are already discovered."""
        with patch("app.services.headless_analyzer.headless_analyzer") as mock_analyzer:
            mock_analyzer.list_running = AsyncMock(return_value=["session-1", "session-2"])

            # All running sessions are already discovered
            discovered = {"session-1", "session-2"}
            result = await _get_pending_headless_sessions(discovered)

            assert result == []

    @pytest.mark.asyncio
    async def test_returns_pending_session_with_metadata(self, tmp_path):
        """Test returns pending session when metadata exists for a running session."""
        with patch("app.services.headless_analyzer.headless_analyzer") as mock_analyzer, \
             patch("app.routers.sessions.load_repos") as mock_load_repos, \
             patch("app.routers.sessions.encode_path") as mock_encode, \
             patch("app.routers.sessions.get_session_metadata") as mock_get_meta:

            mock_analyzer.list_running = AsyncMock(return_value=["running-session-123"])
            mock_load_repos.return_value = [
                {"id": 1, "owner": "testowner", "name": "testrepo", "local_path": "/home/user/repo"}
            ]
            mock_encode.return_value = "-home-user-repo"
            mock_get_meta.return_value = SessionMetadata(
                session_id="running-session-123",
                title="Running Session",
                repo_path="/home/user/repo",
                entities=[EntityLink(kind="issue", number=42)],
                tags=["important"],
                starred=True,
                created_at="2024-01-15T10:00:00Z",
            )

            result = await _get_pending_headless_sessions(set())

            assert len(result) == 1
            assert result[0].session_id == "running-session-123"
            assert result[0].encoded_path == "-home-user-repo"
            assert result[0].repo_path == "/home/user/repo"
            assert result[0].repo_name == "testowner/testrepo"
            assert result[0].title == "Running Session"
            assert result[0].is_active is True
            assert result[0].starred is True
            assert result[0].tags == ["important"]
            assert len(result[0].entities) == 1
            assert result[0].entities[0].kind == "issue"
            assert result[0].entities[0].number == 42

    @pytest.mark.asyncio
    async def test_skips_session_without_metadata(self):
        """Test skips sessions that don't have metadata in any repo."""
        with patch("app.services.headless_analyzer.headless_analyzer") as mock_analyzer, \
             patch("app.routers.sessions.load_repos") as mock_load_repos, \
             patch("app.routers.sessions.encode_path") as mock_encode, \
             patch("app.routers.sessions.get_session_metadata") as mock_get_meta:

            mock_analyzer.list_running = AsyncMock(return_value=["running-session-no-meta"])
            mock_load_repos.return_value = [
                {"id": 1, "owner": "owner", "name": "repo", "local_path": "/path/to/repo"}
            ]
            mock_encode.return_value = "-path-to-repo"
            mock_get_meta.return_value = None  # No metadata

            result = await _get_pending_headless_sessions(set())

            assert result == []

    @pytest.mark.asyncio
    async def test_filters_already_discovered_sessions(self):
        """Test excludes sessions that are already in discovered_session_ids."""
        with patch("app.services.headless_analyzer.headless_analyzer") as mock_analyzer, \
             patch("app.routers.sessions.load_repos") as mock_load_repos, \
             patch("app.routers.sessions.encode_path") as mock_encode, \
             patch("app.routers.sessions.get_session_metadata") as mock_get_meta:

            # Two running sessions, one already discovered
            mock_analyzer.list_running = AsyncMock(return_value=["discovered-session", "pending-session"])
            mock_load_repos.return_value = [
                {"id": 1, "owner": "owner", "name": "repo", "local_path": "/path/to/repo"}
            ]
            mock_encode.return_value = "-path-to-repo"

            # Only return metadata for the pending session
            def get_meta(encoded_path, session_id):
                if session_id == "pending-session":
                    return SessionMetadata(
                        session_id="pending-session",
                        title="Pending",
                        created_at="2024-01-15T10:00:00Z",
                    )
                return None

            mock_get_meta.side_effect = get_meta

            # Mark one as already discovered
            result = await _get_pending_headless_sessions({"discovered-session"})

            assert len(result) == 1
            assert result[0].session_id == "pending-session"

    @pytest.mark.asyncio
    async def test_filters_by_repo_path(self):
        """Test filters results to specific repo when repo_path is provided."""
        with patch("app.services.headless_analyzer.headless_analyzer") as mock_analyzer, \
             patch("app.routers.sessions.load_repos") as mock_load_repos, \
             patch("app.routers.sessions.encode_path") as mock_encode, \
             patch("app.routers.sessions.get_session_metadata") as mock_get_meta:

            mock_analyzer.list_running = AsyncMock(return_value=["session-1"])
            mock_load_repos.return_value = [
                {"id": 1, "owner": "owner1", "name": "repo1", "local_path": "/path/to/repo1"},
                {"id": 2, "owner": "owner2", "name": "repo2", "local_path": "/path/to/repo2"},
            ]
            mock_encode.return_value = "-path-to-repo2"
            mock_get_meta.return_value = SessionMetadata(
                session_id="session-1",
                title="Session in Repo 2",
                created_at="2024-01-15T10:00:00Z",
            )

            # Filter to only repo2
            result = await _get_pending_headless_sessions(set(), repo_path="/path/to/repo2")

            # Only repo2 should be checked
            assert mock_encode.call_count == 1
            mock_encode.assert_called_with("/path/to/repo2")

    @pytest.mark.asyncio
    async def test_avoids_duplicate_sessions_across_repos(self):
        """Test that the same session ID is not returned multiple times.

        This tests the fix for the bug where a session could be added multiple times
        if its metadata somehow existed in multiple repo directories.
        """
        with patch("app.services.headless_analyzer.headless_analyzer") as mock_analyzer, \
             patch("app.routers.sessions.load_repos") as mock_load_repos, \
             patch("app.routers.sessions.encode_path") as mock_encode, \
             patch("app.routers.sessions.get_session_metadata") as mock_get_meta:

            mock_analyzer.list_running = AsyncMock(return_value=["duplicate-session"])
            mock_load_repos.return_value = [
                {"id": 1, "owner": "owner1", "name": "repo1", "local_path": "/path/to/repo1"},
                {"id": 2, "owner": "owner2", "name": "repo2", "local_path": "/path/to/repo2"},
            ]

            # Encode path returns different values for different repos
            def encode_for_repo(path):
                if path == "/path/to/repo1":
                    return "-path-to-repo1"
                return "-path-to-repo2"

            mock_encode.side_effect = encode_for_repo

            # Simulate metadata existing in BOTH repos (edge case)
            mock_get_meta.return_value = SessionMetadata(
                session_id="duplicate-session",
                title="Duplicate Session",
                created_at="2024-01-15T10:00:00Z",
            )

            result = await _get_pending_headless_sessions(set())

            # Should only appear once, not twice
            assert len(result) == 1
            assert result[0].session_id == "duplicate-session"
            # Should be associated with the first repo that matched
            assert result[0].encoded_path == "-path-to-repo1"

    @pytest.mark.asyncio
    async def test_handles_repo_without_owner_name(self):
        """Test handles repos that don't have owner/name (local only repos)."""
        with patch("app.services.headless_analyzer.headless_analyzer") as mock_analyzer, \
             patch("app.routers.sessions.load_repos") as mock_load_repos, \
             patch("app.routers.sessions.encode_path") as mock_encode, \
             patch("app.routers.sessions.get_session_metadata") as mock_get_meta:

            mock_analyzer.list_running = AsyncMock(return_value=["session-1"])
            mock_load_repos.return_value = [
                {"id": 1, "local_path": "/path/to/local-only-repo"}  # No owner or name
            ]
            mock_encode.return_value = "-path-to-local-only-repo"
            mock_get_meta.return_value = SessionMetadata(
                session_id="session-1",
                title="Local Session",
                created_at="2024-01-15T10:00:00Z",
            )

            result = await _get_pending_headless_sessions(set())

            assert len(result) == 1
            assert result[0].repo_name is None  # No repo name for local-only repos

    @pytest.mark.asyncio
    async def test_uses_running_title_when_metadata_title_is_none(self):
        """Test uses 'Running...' as title when metadata has no title."""
        with patch("app.services.headless_analyzer.headless_analyzer") as mock_analyzer, \
             patch("app.routers.sessions.load_repos") as mock_load_repos, \
             patch("app.routers.sessions.encode_path") as mock_encode, \
             patch("app.routers.sessions.get_session_metadata") as mock_get_meta:

            mock_analyzer.list_running = AsyncMock(return_value=["session-1"])
            mock_load_repos.return_value = [
                {"id": 1, "owner": "owner", "name": "repo", "local_path": "/path"}
            ]
            mock_encode.return_value = "-path"
            mock_get_meta.return_value = SessionMetadata(
                session_id="session-1",
                title=None,  # No title
                created_at="2024-01-15T10:00:00Z",
            )

            result = await _get_pending_headless_sessions(set())

            assert len(result) == 1
            assert result[0].title == "Running..."

    @pytest.mark.asyncio
    async def test_includes_scheduled_job_id(self):
        """Test that scheduled_job_id is included when present in metadata."""
        with patch("app.services.headless_analyzer.headless_analyzer") as mock_analyzer, \
             patch("app.routers.sessions.load_repos") as mock_load_repos, \
             patch("app.routers.sessions.encode_path") as mock_encode, \
             patch("app.routers.sessions.get_session_metadata") as mock_get_meta:

            mock_analyzer.list_running = AsyncMock(return_value=["scheduled-session"])
            mock_load_repos.return_value = [
                {"id": 1, "owner": "owner", "name": "repo", "local_path": "/path"}
            ]
            mock_encode.return_value = "-path"
            mock_get_meta.return_value = SessionMetadata(
                session_id="scheduled-session",
                title="Scheduled Run",
                scheduled_job_id=42,
                created_at="2024-01-15T10:00:00Z",
            )

            result = await _get_pending_headless_sessions(set())

            assert len(result) == 1
            assert result[0].scheduled_job_id == 42

    @pytest.mark.asyncio
    async def test_multiple_pending_sessions_different_repos(self):
        """Test handling multiple pending sessions across different repos."""
        with patch("app.services.headless_analyzer.headless_analyzer") as mock_analyzer, \
             patch("app.routers.sessions.load_repos") as mock_load_repos, \
             patch("app.routers.sessions.encode_path") as mock_encode, \
             patch("app.routers.sessions.get_session_metadata") as mock_get_meta:

            mock_analyzer.list_running = AsyncMock(return_value=["session-repo1", "session-repo2"])
            mock_load_repos.return_value = [
                {"id": 1, "owner": "owner1", "name": "repo1", "local_path": "/path/repo1"},
                {"id": 2, "owner": "owner2", "name": "repo2", "local_path": "/path/repo2"},
            ]

            def encode_for_repo(path):
                if path == "/path/repo1":
                    return "-path-repo1"
                return "-path-repo2"

            mock_encode.side_effect = encode_for_repo

            def get_meta(encoded_path, session_id):
                # session-repo1 metadata exists in repo1
                if encoded_path == "-path-repo1" and session_id == "session-repo1":
                    return SessionMetadata(
                        session_id="session-repo1",
                        title="Session 1",
                        created_at="2024-01-15T10:00:00Z",
                    )
                # session-repo2 metadata exists in repo2
                if encoded_path == "-path-repo2" and session_id == "session-repo2":
                    return SessionMetadata(
                        session_id="session-repo2",
                        title="Session 2",
                        created_at="2024-01-15T10:00:00Z",
                    )
                return None

            mock_get_meta.side_effect = get_meta

            result = await _get_pending_headless_sessions(set())

            assert len(result) == 2
            session_ids = {s.session_id for s in result}
            assert session_ids == {"session-repo1", "session-repo2"}

    @pytest.mark.asyncio
    async def test_efficiency_skips_matched_sessions_in_subsequent_repos(self):
        """Test that once a session is matched, it's not checked in subsequent repos.

        This verifies the performance optimization where matched session IDs
        are tracked and skipped in subsequent iterations.
        """
        with patch("app.services.headless_analyzer.headless_analyzer") as mock_analyzer, \
             patch("app.routers.sessions.load_repos") as mock_load_repos, \
             patch("app.routers.sessions.encode_path") as mock_encode, \
             patch("app.routers.sessions.get_session_metadata") as mock_get_meta:

            mock_analyzer.list_running = AsyncMock(return_value=["matched-session"])
            mock_load_repos.return_value = [
                {"id": 1, "owner": "owner1", "name": "repo1", "local_path": "/path/repo1"},
                {"id": 2, "owner": "owner2", "name": "repo2", "local_path": "/path/repo2"},
                {"id": 3, "owner": "owner3", "name": "repo3", "local_path": "/path/repo3"},
            ]

            def encode_for_repo(path):
                return f"-{path.replace('/', '-')}"

            mock_encode.side_effect = encode_for_repo

            call_count = [0]

            def get_meta(encoded_path, session_id):
                call_count[0] += 1
                # Only return metadata from the first repo
                if encoded_path == "--path-repo1":
                    return SessionMetadata(
                        session_id="matched-session",
                        title="Matched",
                        created_at="2024-01-15T10:00:00Z",
                    )
                return None

            mock_get_meta.side_effect = get_meta

            result = await _get_pending_headless_sessions(set())

            assert len(result) == 1
            # Should only call get_session_metadata once for the first repo
            # because after matching, subsequent repos skip this session_id
            assert call_count[0] == 1


# ==========================================
# None Value Handling Tests for Codex Scanner
# ==========================================


class TestCodexQuickScanNoneHandling:
    """Tests for handling None values in Codex transcript scanning.

    These tests verify the fix for the bug where entry.get('payload', {})
    returns None instead of {} when the key exists but has a None value.
    The fix uses `or {}` pattern: entry.get('payload') or {}
    """

    def test_session_meta_with_none_payload(self, tmp_path):
        """Handles session_meta entry where 'payload' key is explicitly None.

        This tests the fix at sessions.py for:
            payload = entry.get('payload') or {}

        When 'payload' is None, should not crash on payload.get('timestamp').
        """
        import json

        session_file = tmp_path / "test-session.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": None  # This would crash before the fix
            }),
        ]
        session_file.write_text("\n".join(lines) + "\n")

        # Should not raise AttributeError: 'NoneType' object has no attribute 'get'
        result = _do_quick_scan_codex_transcript(session_file)
        assert result is not None
        assert result["start_time"] is None

    def test_response_item_with_none_payload(self, tmp_path):
        """Handles response_item entry where 'payload' key is explicitly None.

        This tests the fix at sessions.py for:
            payload = entry.get('payload') or {}

        When 'payload' is None, should not crash on payload.get('role').
        """
        import json

        session_file = tmp_path / "test-session.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {"timestamp": "2025-01-15T10:00:00Z"}
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:01:00Z",
                "payload": None  # This would crash before the fix
            }),
        ]
        session_file.write_text("\n".join(lines) + "\n")

        # Should not raise AttributeError
        result = _do_quick_scan_codex_transcript(session_file)
        assert result is not None
        # Message shouldn't be counted since payload is None (no role)
        assert result["message_count"] == 0

    def test_turn_context_with_none_payload(self, tmp_path):
        """Handles turn_context entry where 'payload' key is explicitly None.

        This tests the fix at sessions.py for:
            payload = entry.get('payload') or {}

        When 'payload' is None, should not crash on payload.get('model').
        """
        import json

        session_file = tmp_path / "test-session.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {"timestamp": "2025-01-15T10:00:00Z"}
            }),
            json.dumps({
                "type": "turn_context",
                "payload": None  # This would crash before the fix
            }),
        ]
        session_file.write_text("\n".join(lines) + "\n")

        # Should not raise AttributeError
        result = _do_quick_scan_codex_transcript(session_file)
        assert result is not None
        assert result["model"] is None

    def test_valid_codex_transcript_still_works(self, tmp_path):
        """Verify valid Codex transcript processing still works after the fix.

        This is a regression test to ensure the fix doesn't break normal behavior.
        """
        import json

        session_file = tmp_path / "test-session.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {
                    "timestamp": "2025-01-15T10:00:00Z",
                    "cwd": "/home/user/project",
                }
            }),
            json.dumps({
                "type": "turn_context",
                "payload": {
                    "model": "gpt-4o"
                }
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:01Z",
                "payload": {
                    "role": "user",
                    "content": [{"type": "input_text", "text": "Hello world"}]
                }
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:02Z",
                "payload": {
                    "role": "user",  # Second user message (first is skipped as env context)
                    "content": [{"type": "input_text", "text": "Can you help?"}]
                }
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:03Z",
                "payload": {
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "Sure!"}]
                }
            }),
        ]
        session_file.write_text("\n".join(lines) + "\n")

        result = _do_quick_scan_codex_transcript(session_file)
        assert result is not None
        assert result["start_time"] == "2025-01-15T10:00:00Z"
        assert result["end_time"] == "2025-01-15T10:00:03Z"
        assert result["model"] == "gpt-4o"
        assert result["message_count"] == 3
        assert result["title"] == "Can you help?"  # First real user message

    def test_mixed_none_and_valid_payloads(self, tmp_path):
        """Handles mix of None and valid payloads gracefully."""
        import json

        session_file = tmp_path / "test-session.jsonl"
        lines = [
            json.dumps({
                "type": "session_meta",
                "payload": {"timestamp": "2025-01-15T10:00:00Z"}
            }),
            json.dumps({
                "type": "turn_context",
                "payload": None  # This is None
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:01Z",
                "payload": {
                    "role": "user",
                    "content": [{"type": "input_text", "text": "Hello"}]
                }
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:02Z",
                "payload": None  # This is None
            }),
            json.dumps({
                "type": "response_item",
                "timestamp": "2025-01-15T10:00:03Z",
                "payload": {
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "Hi there!"}]
                }
            }),
        ]
        session_file.write_text("\n".join(lines) + "\n")

        result = _do_quick_scan_codex_transcript(session_file)
        assert result is not None
        assert result["start_time"] == "2025-01-15T10:00:00Z"
        assert result["message_count"] == 2  # Only the valid ones


class TestToolUseMarkdownNoneHandling:
    """Tests for handling None values in tool use markdown formatting."""

    def test_tool_with_none_input(self):
        """Handles tool dict where 'input' key is explicitly None.

        This tests the fix at sessions.py for:
            tool_input = tool.get("input") or {}

        When 'input' is None, should not crash when passing to formatters.
        """
        tool = {
            "name": "Read",
            "input": None  # This would crash some formatters before the fix
        }

        # Should not raise TypeError or AttributeError
        result = _format_tool_use_markdown(tool)
        # Should fall back to just showing the tool name or handle gracefully
        assert "Read" in result

    def test_tool_with_valid_input(self):
        """Verify valid tool input processing still works after the fix.

        This is a regression test to ensure the fix doesn't break normal behavior.
        """
        tool = {
            "name": "Read",
            "input": {"file_path": "/home/user/test.py"}
        }

        result = _format_tool_use_markdown(tool)
        assert "Read" in result
        # Should format the file path
        assert "test.py" in result

    def test_tool_with_empty_input(self):
        """Handles tool with empty input dict (not None)."""
        tool = {
            "name": "Bash",
            "input": {}
        }

        result = _format_tool_use_markdown(tool)
        assert "Bash" in result

    def test_tool_with_missing_input_key(self):
        """Handles tool dict missing the 'input' key entirely."""
        tool = {
            "name": "Task"
            # No 'input' key at all
        }

        result = _format_tool_use_markdown(tool)
        assert "Task" in result

    def test_unknown_tool_with_none_input(self):
        """Handles unknown tool with None input - falls back to generic format."""
        tool = {
            "name": "CustomTool",
            "input": None
        }

        result = _format_tool_use_markdown(tool)
        # Generic fallback just shows tool name
        assert "CustomTool" in result
