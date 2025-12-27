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

from app.routers.sessions import router, _quick_scan_transcript, _get_pending_sessions
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
        claude_code_version="1.0.0",
        git_branch="main",
    )


class TestListSessions:
    """Tests for GET /sessions endpoint."""

    def test_list_sessions_empty(self, client):
        """Test listing sessions when none exist."""
        with patch("app.routers.sessions.discover_sessions", return_value=[]), \
             patch("app.routers.sessions.process_manager") as mock_pm:
            mock_pm.list_processes = AsyncMock(return_value=[])

            response = client.get("/sessions")

            assert response.status_code == 200
            data = response.json()
            assert data["sessions"] == []
            assert data["total"] == 0

    def test_list_sessions_with_results(self, client, mock_discovered_session):
        """Test listing sessions returns correct data."""
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
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
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
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
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
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
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": "Test Session", "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # Search for existing title
            response = client.get("/sessions?search=Test")
            assert response.status_code == 200
            assert response.json()["total"] == 1

            # Search for non-existent title
            response = client.get("/sessions?search=NotFound")
            assert response.status_code == 200
            assert response.json()["total"] == 0

    def test_list_sessions_pagination(self, client):
        """Test pagination of session list."""
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

        with patch("app.routers.sessions.discover_sessions", return_value=sessions), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions._quick_scan_transcript") as mock_scan:
            mock_pm.list_processes = AsyncMock(return_value=[])
            mock_scan.return_value = {"title": None, "model": None, "start_time": None, "end_time": None, "message_count": 0}

            # Get first page with limit=2
            response = client.get("/sessions?limit=2&offset=0")
            assert response.status_code == 200
            data = response.json()
            assert data["total"] == 5
            assert len(data["sessions"]) == 2

            # Get second page
            response = client.get("/sessions?limit=2&offset=2")
            assert response.status_code == 200
            data = response.json()
            assert data["total"] == 5
            assert len(data["sessions"]) == 2

            # Get last page
            response = client.get("/sessions?limit=2&offset=4")
            assert response.status_code == 200
            data = response.json()
            assert data["total"] == 5
            assert len(data["sessions"]) == 1


class TestGetSession:
    """Tests for GET /sessions/{session_id} endpoint."""

    def test_get_session_success(self, client, mock_discovered_session, mock_parsed_transcript):
        """Test getting a session detail successfully."""
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions.parse_transcript", return_value=mock_parsed_transcript):
            mock_pm.list_processes = AsyncMock(return_value=[])

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
        with patch("app.routers.sessions.discover_sessions", return_value=[]), \
             patch("app.routers.sessions.process_manager") as mock_pm:
            mock_pm.list_processes = AsyncMock(return_value=[])

            response = client.get("/sessions/nonexistent-uuid")

            assert response.status_code == 404
            assert "not found" in response.json()["detail"].lower()

    def test_get_session_active_process(self, client, mock_discovered_session, mock_parsed_transcript):
        """Test getting a session that has an active process."""
        mock_process = MagicMock()
        mock_process.claude_session_id = "test-uuid-1234"

        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions.parse_transcript", return_value=mock_parsed_transcript):
            mock_pm.list_processes = AsyncMock(return_value=[mock_process])

            response = client.get("/sessions/test-uuid-1234")

            assert response.status_code == 200
            assert response.json()["is_active"] is True

    def test_get_session_parse_failure(self, client, mock_discovered_session):
        """Test handling transcript parse failure."""
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.process_manager") as mock_pm, \
             patch("app.routers.sessions.parse_transcript", return_value=None):
            mock_pm.list_processes = AsyncMock(return_value=[])

            response = client.get("/sessions/test-uuid-1234")

            assert response.status_code == 500
            assert "parse" in response.json()["detail"].lower()


class TestUpdateSessionMetadata:
    """Tests for PATCH /sessions/{session_id} endpoint."""

    def test_update_session_title(self, client, mock_discovered_session):
        """Test updating session title."""
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
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
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
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
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
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
        with patch("app.routers.sessions.discover_sessions", return_value=[]):

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

        with patch("app.routers.sessions.discover_sessions", return_value=[session_without_metadata]), \
             patch("app.routers.sessions.save_session_metadata") as mock_save:

            response = client.patch(
                "/sessions/test-uuid-1234",
                json={"title": "New Title"}
            )

            assert response.status_code == 200
            mock_save.assert_called_once()


class TestEntityManagement:
    """Tests for entity link endpoints."""

    def test_add_entity_to_session(self, client, mock_discovered_session):
        """Test adding an entity link to a session."""
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
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
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]):
            # Session already has issue #42
            response = client.post(
                "/sessions/test-uuid-1234/entities",
                json={"kind": "issue", "number": 42}
            )

            assert response.status_code == 400
            assert "already linked" in response.json()["detail"].lower()

    def test_add_entity_session_not_found(self, client):
        """Test adding entity to non-existent session returns 404."""
        with patch("app.routers.sessions.discover_sessions", return_value=[]):

            response = client.post(
                "/sessions/nonexistent-uuid/entities",
                json={"kind": "issue", "number": 1}
            )

            assert response.status_code == 404

    def test_remove_entity_from_session(self, client, mock_discovered_session):
        """Test removing an entity link from a session."""
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.save_session_metadata") as mock_save:

            response = client.delete("/sessions/test-uuid-1234/entities/0")

            assert response.status_code == 200
            assert response.json()["status"] == "deleted"
            mock_save.assert_called_once()

    def test_remove_entity_invalid_index(self, client, mock_discovered_session):
        """Test removing entity with invalid index returns 404."""
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]):

            response = client.delete("/sessions/test-uuid-1234/entities/99")

            assert response.status_code == 404
            assert "not found" in response.json()["detail"].lower()

    def test_remove_entity_negative_index(self, client, mock_discovered_session):
        """Test removing entity with negative index returns 404."""
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]):

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

        with patch("app.routers.sessions.discover_sessions", return_value=[session_without_metadata]):

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


class TestGetPendingSessions:
    """Tests for the _get_pending_sessions helper function."""

    def test_no_pending_sessions(self):
        """Test when there are no pending sessions."""
        # Need to patch where process_manager is imported inside the function
        with patch("app.services.session_manager.process_manager") as mock_pm:
            mock_pm.processes = {}

            result = _get_pending_sessions(
                active_session_ids=set(),
                discovered_session_ids=set(),
            )

            assert result == []

    def test_pending_session_no_jsonl_yet(self):
        """Test a session that's active but has no JSONL file."""
        mock_process = MagicMock()
        mock_process.claude_session_id = "pending-uuid"
        mock_process.working_dir = "/home/user/projects/myapp"
        mock_process.model = "claude-3-opus"
        mock_process.created_at = datetime(2024, 1, 15, 10, 30, 0)

        # Patch at the module level since _get_pending_sessions imports it fresh
        with patch("app.services.session_manager.process_manager") as mock_pm, \
             patch("app.routers.sessions.encode_path", return_value="-home-user-projects-myapp"), \
             patch("app.routers.sessions.get_session_metadata", return_value=None), \
             patch("app.routers.sessions._get_repo_name", return_value="user/myapp"):
            mock_pm.processes = {"proc-1": mock_process}

            result = _get_pending_sessions(
                active_session_ids={"pending-uuid"},
                discovered_session_ids=set(),  # Not yet discovered
            )

            assert len(result) == 1
            assert result[0].session_id == "pending-uuid"
            assert result[0].is_active is True
            assert result[0].title == "Starting..."

    def test_pending_session_already_discovered(self):
        """Test that already discovered sessions are not duplicated."""
        mock_process = MagicMock()
        mock_process.claude_session_id = "existing-uuid"
        mock_process.working_dir = "/home/user/projects/myapp"

        with patch("app.services.session_manager.process_manager") as mock_pm:
            mock_pm.processes = {"proc-1": mock_process}

            result = _get_pending_sessions(
                active_session_ids={"existing-uuid"},
                discovered_session_ids={"existing-uuid"},  # Already discovered
            )

            assert result == []

    def test_pending_session_with_metadata(self):
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

        with patch("app.services.session_manager.process_manager") as mock_pm, \
             patch("app.routers.sessions.encode_path", return_value="-home-user-projects-myapp"), \
             patch("app.routers.sessions.get_session_metadata", return_value=mock_metadata), \
             patch("app.routers.sessions._get_repo_name", return_value="user/myapp"):
            mock_pm.processes = {"proc-1": mock_process}

            result = _get_pending_sessions(
                active_session_ids={"pending-uuid"},
                discovered_session_ids=set(),
            )

            assert len(result) == 1
            assert result[0].title == "Custom Title"
            assert result[0].starred is True
            assert len(result[0].entities) == 1


class TestContinueSession:
    """Tests for POST /sessions/{session_id}/continue endpoint."""

    def test_continue_session_success(self, client, mock_discovered_session):
        """Test continuing a session successfully."""
        mock_process = MagicMock()
        mock_process.id = "new-process-id"
        mock_process.working_dir = "/home/user/projects/myapp"
        mock_process.created_at = datetime(2024, 1, 15, 10, 30, 0)
        mock_process.claude_session_id = "test-uuid-1234"

        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
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
        with patch("app.routers.sessions.discover_sessions", return_value=[]):

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

        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
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
        with patch("app.routers.sessions.discover_sessions", return_value=[mock_discovered_session]), \
             patch("app.routers.sessions.match_encoded_path_to_repo", return_value=None), \
             patch("app.routers.sessions.process_manager") as mock_pm:
            mock_pm.create_process = AsyncMock(side_effect=ValueError("Session already active"))

            response = client.post("/sessions/test-uuid-1234/continue")

            assert response.status_code == 400
            assert "cannot continue" in response.json()["detail"].lower()
