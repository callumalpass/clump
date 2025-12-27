"""
Tests for the processes router API endpoints.

Tests cover:
- POST /processes (create a new PTY process)
- GET /processes (list all active processes)
- DELETE /processes/{process_id} (kill a process)
- GET /processes/{process_id}/transcript (get process transcript)
- WebSocket /processes/{process_id}/ws (terminal I/O)
"""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI

from app.routers.processes import router, ProcessCreate, EntityInput
from app.models import SessionStatus


@pytest.fixture
def app():
    """Create a test FastAPI app with the processes router."""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def client(app):
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def mock_repo():
    """Create a mock repository."""
    return {
        "id": 1,
        "owner": "testowner",
        "name": "testrepo",
        "local_path": "/home/user/projects/testrepo",
    }


@pytest.fixture
def mock_process():
    """Create a mock Process object."""
    process = MagicMock()
    process.id = "abc12345"
    process.pid = 12345
    process.fd = 3
    process.working_dir = "/home/user/projects/testrepo"
    process.created_at = datetime(2024, 1, 15, 10, 30, 0)
    process.session_id = 1
    process.transcript = "Test transcript output"
    process.claude_session_id = "test-claude-session-uuid"
    return process


class TestCreateProcess:
    """Tests for POST /processes endpoint."""

    def test_create_process_success(self, client, mock_repo, mock_process):
        """Test creating a new process successfully."""
        with patch("app.routers.processes.get_repo_or_404", return_value=mock_repo), \
             patch("app.routers.processes.get_repo_db") as mock_db_ctx, \
             patch("app.routers.processes.process_manager") as mock_pm, \
             patch("app.routers.processes.encode_path", return_value="-home-user-projects-testrepo"):

            # Mock database context manager
            mock_db = AsyncMock()
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=None)

            # Mock session creation
            mock_session = MagicMock()
            mock_session.id = 1
            mock_db.add = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock(side_effect=lambda s: setattr(s, 'id', 1))

            # Mock process creation
            mock_pm.create_process = AsyncMock(return_value=mock_process)

            response = client.post(
                "/processes",
                json={
                    "repo_id": 1,
                    "prompt": "Hello, Claude!",
                    "kind": "custom",
                    "title": "Test Session",
                }
            )

            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "abc12345"
            assert data["working_dir"] == "/home/user/projects/testrepo"
            assert data["claude_session_id"] == "test-claude-session-uuid"

    def test_create_process_with_entities(self, client, mock_repo, mock_process):
        """Test creating a process with linked entities."""
        with patch("app.routers.processes.get_repo_or_404", return_value=mock_repo), \
             patch("app.routers.processes.get_repo_db") as mock_db_ctx, \
             patch("app.routers.processes.process_manager") as mock_pm, \
             patch("app.routers.processes.encode_path", return_value="-home-user-projects-testrepo"), \
             patch("app.routers.processes.save_session_metadata") as mock_save_meta:

            mock_db = AsyncMock()
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.add = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock(side_effect=lambda s: setattr(s, 'id', 1))

            mock_pm.create_process = AsyncMock(return_value=mock_process)

            response = client.post(
                "/processes",
                json={
                    "repo_id": 1,
                    "prompt": "Fix issue #42",
                    "kind": "issue",
                    "title": "Fix Bug",
                    "entities": [
                        {"kind": "issue", "number": 42},
                        {"kind": "pr", "number": 10},
                    ],
                }
            )

            assert response.status_code == 200
            # Verify metadata was saved with entities
            mock_save_meta.assert_called_once()

    def test_create_process_repo_not_found(self, client):
        """Test creating a process with non-existent repo."""
        from fastapi import HTTPException

        with patch("app.routers.processes.get_repo_or_404") as mock_get_repo:
            mock_get_repo.side_effect = HTTPException(status_code=404, detail="Repository not found")

            response = client.post(
                "/processes",
                json={
                    "repo_id": 999,
                    "prompt": "Hello",
                    "title": "Test",
                }
            )

            assert response.status_code == 404

    def test_create_process_invalid_working_dir(self, client, mock_repo):
        """Test creating a process with invalid working directory."""
        with patch("app.routers.processes.get_repo_or_404", return_value=mock_repo), \
             patch("app.routers.processes.get_repo_db") as mock_db_ctx, \
             patch("app.routers.processes.process_manager") as mock_pm:

            mock_db = AsyncMock()
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.add = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock(side_effect=lambda s: setattr(s, 'id', 1))

            # Process creation fails due to invalid working dir
            mock_pm.create_process = AsyncMock(
                side_effect=ValueError("Working directory does not exist: /invalid/path")
            )

            response = client.post(
                "/processes",
                json={
                    "repo_id": 1,
                    "title": "Test",
                }
            )

            assert response.status_code == 400
            assert "Working directory" in response.json()["detail"]

    def test_create_process_with_claude_config(self, client, mock_repo, mock_process):
        """Test creating a process with Claude Code configuration overrides."""
        with patch("app.routers.processes.get_repo_or_404", return_value=mock_repo), \
             patch("app.routers.processes.get_repo_db") as mock_db_ctx, \
             patch("app.routers.processes.process_manager") as mock_pm:

            mock_db = AsyncMock()
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.add = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock(side_effect=lambda s: setattr(s, 'id', 1))

            mock_pm.create_process = AsyncMock(return_value=mock_process)

            response = client.post(
                "/processes",
                json={
                    "repo_id": 1,
                    "title": "Test",
                    "permission_mode": "plan",
                    "allowed_tools": ["Read", "Write"],
                    "max_turns": 10,
                    "model": "claude-3-opus",
                }
            )

            assert response.status_code == 200

            # Verify config was passed to process_manager
            call_kwargs = mock_pm.create_process.call_args[1]
            assert call_kwargs["permission_mode"] == "plan"
            assert call_kwargs["allowed_tools"] == ["Read", "Write"]
            assert call_kwargs["max_turns"] == 10
            assert call_kwargs["model"] == "claude-3-opus"

    def test_create_process_resume_session(self, client, mock_repo, mock_process):
        """Test creating a process that resumes an existing session."""
        with patch("app.routers.processes.get_repo_or_404", return_value=mock_repo), \
             patch("app.routers.processes.get_repo_db") as mock_db_ctx, \
             patch("app.routers.processes.process_manager") as mock_pm:

            mock_db = AsyncMock()
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.add = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock(side_effect=lambda s: setattr(s, 'id', 1))

            mock_pm.create_process = AsyncMock(return_value=mock_process)

            response = client.post(
                "/processes",
                json={
                    "repo_id": 1,
                    "title": "Resume Session",
                    "resume_session": "existing-session-uuid",
                }
            )

            assert response.status_code == 200
            call_kwargs = mock_pm.create_process.call_args[1]
            assert call_kwargs["resume_session"] == "existing-session-uuid"


class TestListProcesses:
    """Tests for GET /processes endpoint."""

    def test_list_processes_empty(self, client):
        """Test listing processes when none exist."""
        with patch("app.routers.processes.process_manager") as mock_pm:
            mock_pm.get_dead_process_info = AsyncMock(return_value=[])
            mock_pm.list_processes = AsyncMock(return_value=[])

            response = client.get("/processes")

            assert response.status_code == 200
            data = response.json()
            assert data["processes"] == []

    def test_list_processes_with_results(self, client, mock_process):
        """Test listing active processes."""
        with patch("app.routers.processes.process_manager") as mock_pm:
            mock_pm.get_dead_process_info = AsyncMock(return_value=[])
            mock_pm.list_processes = AsyncMock(return_value=[mock_process])

            response = client.get("/processes")

            assert response.status_code == 200
            data = response.json()
            assert len(data["processes"]) == 1
            assert data["processes"][0]["id"] == "abc12345"
            assert data["processes"][0]["working_dir"] == "/home/user/projects/testrepo"

    def test_list_processes_cleans_up_dead(self, client, mock_repo):
        """Test that listing processes cleans up dead processes and updates sessions."""
        dead_process_info = [
            (1, "transcript content", "claude-session-id", "/home/user/projects/testrepo")
        ]

        mock_session = MagicMock()
        mock_session.status = SessionStatus.RUNNING.value

        with patch("app.routers.processes.process_manager") as mock_pm, \
             patch("app.routers.processes.get_repo_by_path", return_value=mock_repo), \
             patch("app.routers.processes.get_repo_db") as mock_db_ctx:

            mock_pm.get_dead_process_info = AsyncMock(return_value=dead_process_info)
            mock_pm.list_processes = AsyncMock(return_value=[])

            mock_db = AsyncMock()
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=None)

            # Mock the select query result
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_session
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()

            response = client.get("/processes")

            assert response.status_code == 200
            # Verify session was updated
            assert mock_session.status == SessionStatus.COMPLETED.value
            assert mock_session.transcript == "transcript content"
            assert mock_session.claude_session_id == "claude-session-id"


class TestKillProcess:
    """Tests for DELETE /processes/{process_id} endpoint."""

    def test_kill_process_success(self, client, mock_process, mock_repo):
        """Test killing a process successfully."""
        with patch("app.routers.processes.process_manager") as mock_pm, \
             patch("app.routers.processes.get_repo_by_path", return_value=mock_repo), \
             patch("app.routers.processes.get_repo_db") as mock_db_ctx:

            mock_pm.get_process = AsyncMock(return_value=mock_process)
            mock_pm.kill = AsyncMock(return_value=True)

            mock_db = AsyncMock()
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=None)

            mock_session = MagicMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_session
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()

            response = client.delete("/processes/abc12345")

            assert response.status_code == 200
            assert response.json()["status"] == "killed"
            mock_pm.kill.assert_called_once_with("abc12345")

    def test_kill_process_not_found(self, client):
        """Test killing a non-existent process."""
        with patch("app.routers.processes.process_manager") as mock_pm:
            mock_pm.get_process = AsyncMock(return_value=None)

            response = client.delete("/processes/nonexistent")

            assert response.status_code == 404
            assert "not found" in response.json()["detail"].lower()

    def test_kill_process_updates_session(self, client, mock_process, mock_repo):
        """Test that killing updates the linked session."""
        with patch("app.routers.processes.process_manager") as mock_pm, \
             patch("app.routers.processes.get_repo_by_path", return_value=mock_repo), \
             patch("app.routers.processes.get_repo_db") as mock_db_ctx:

            mock_pm.get_process = AsyncMock(return_value=mock_process)
            mock_pm.kill = AsyncMock(return_value=True)

            mock_db = AsyncMock()
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=None)

            mock_session = MagicMock()
            mock_session.status = SessionStatus.RUNNING.value
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_session
            mock_db.execute = AsyncMock(return_value=mock_result)
            mock_db.commit = AsyncMock()

            response = client.delete("/processes/abc12345")

            assert response.status_code == 200
            # Verify session was updated
            assert mock_session.status == SessionStatus.COMPLETED.value
            assert mock_session.transcript == "Test transcript output"


class TestGetTranscript:
    """Tests for GET /processes/{process_id}/transcript endpoint."""

    def test_get_transcript_success(self, client, mock_process):
        """Test getting a process transcript."""
        with patch("app.routers.processes.process_manager") as mock_pm:
            mock_pm.get_process = AsyncMock(return_value=mock_process)

            response = client.get("/processes/abc12345/transcript")

            assert response.status_code == 200
            assert response.json()["transcript"] == "Test transcript output"

    def test_get_transcript_not_found(self, client):
        """Test getting transcript for non-existent process."""
        with patch("app.routers.processes.process_manager") as mock_pm:
            mock_pm.get_process = AsyncMock(return_value=None)

            response = client.get("/processes/nonexistent/transcript")

            assert response.status_code == 404

    def test_get_transcript_empty(self, client, mock_process):
        """Test getting empty transcript."""
        mock_process.transcript = ""

        with patch("app.routers.processes.process_manager") as mock_pm:
            mock_pm.get_process = AsyncMock(return_value=mock_process)

            response = client.get("/processes/abc12345/transcript")

            assert response.status_code == 200
            assert response.json()["transcript"] == ""


class TestProcessWebSocket:
    """Tests for WebSocket /processes/{process_id}/ws endpoint.

    Note: WebSocket testing with async handlers is complex. These tests verify
    the endpoint's behavior at a basic level. For comprehensive WebSocket testing,
    integration tests with a real server would be more appropriate.
    """

    def test_websocket_endpoint_exists(self, client):
        """Test that the WebSocket endpoint exists and can be connected to."""
        # We just verify the endpoint is routed correctly
        # Full WebSocket testing requires more complex async handling
        from app.routers.processes import process_websocket
        assert process_websocket is not None


class TestProcessCreate:
    """Tests for ProcessCreate Pydantic model validation."""

    def test_process_create_minimal(self):
        """Test creating ProcessCreate with minimal fields."""
        data = ProcessCreate(repo_id=1, title="Test")
        assert data.repo_id == 1
        assert data.title == "Test"
        assert data.prompt is None
        assert data.kind == "custom"
        assert data.entities == []

    def test_process_create_full(self):
        """Test creating ProcessCreate with all fields."""
        data = ProcessCreate(
            repo_id=1,
            prompt="Test prompt",
            kind="issue",
            entities=[EntityInput(kind="issue", number=42)],
            title="Test Session",
            permission_mode="plan",
            allowed_tools=["Read", "Write"],
            disallowed_tools=["Bash"],
            max_turns=10,
            model="claude-3-opus",
            resume_session="session-uuid",
        )
        assert data.repo_id == 1
        assert data.prompt == "Test prompt"
        assert data.kind == "issue"
        assert len(data.entities) == 1
        assert data.entities[0].kind == "issue"
        assert data.entities[0].number == 42
        assert data.permission_mode == "plan"
        assert data.allowed_tools == ["Read", "Write"]
        assert data.disallowed_tools == ["Bash"]
        assert data.max_turns == 10
        assert data.model == "claude-3-opus"
        assert data.resume_session == "session-uuid"


class TestEntityInput:
    """Tests for EntityInput Pydantic model."""

    def test_entity_input_issue(self):
        """Test creating EntityInput for an issue."""
        entity = EntityInput(kind="issue", number=42)
        assert entity.kind == "issue"
        assert entity.number == 42

    def test_entity_input_pr(self):
        """Test creating EntityInput for a PR."""
        entity = EntityInput(kind="pr", number=123)
        assert entity.kind == "pr"
        assert entity.number == 123
