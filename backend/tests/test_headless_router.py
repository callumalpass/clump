"""
Tests for the headless router API endpoints.

Tests cover:
- POST /headless/run (run a headless session and return complete result)
- POST /headless/run/stream (run a headless session with streaming)
- GET /headless/running (list running headless sessions)
- DELETE /headless/{session_id} (cancel a running session)
"""

import pytest
import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI

from app.routers.headless import router, HeadlessSessionCreate, HeadlessSessionResponse
from app.services.headless_analyzer import SessionResult, SessionMessage
from app.models import SessionStatus


@pytest.fixture
def app():
    """Create a test FastAPI app with the headless router."""
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
def mock_session_result():
    """Create a mock successful session result."""
    return SessionResult(
        session_id="abc123-def456",
        result="Analysis complete. Found 3 issues.",
        success=True,
        cost_usd=0.05,
        duration_ms=5000,
        turns=3,
        messages=[
            SessionMessage(type="system", subtype="init", content="Starting session"),
            SessionMessage(type="assistant", content="Analyzing..."),
            SessionMessage(
                type="result",
                subtype="success",
                content="Analysis complete. Found 3 issues.",
                session_id="abc123-def456",
                cost_usd=0.05,
                duration_ms=5000,
            ),
        ],
    )


@pytest.fixture
def mock_failed_session_result():
    """Create a mock failed session result."""
    return SessionResult(
        session_id="",
        result="",
        success=False,
        error="Process exited with code 1",
        messages=[
            SessionMessage(type="system", subtype="init", content="Starting session"),
            SessionMessage(type="error", content="Process exited with code 1"),
        ],
    )


class TestRunHeadlessSession:
    """Tests for POST /headless/run endpoint."""

    def test_run_headless_success(self, client, mock_repo, mock_session_result):
        """Test running a headless session successfully."""
        with patch("app.routers.headless.get_repo_or_404", return_value=mock_repo), \
             patch("app.routers.headless.get_repo_db") as mock_db_ctx, \
             patch("app.routers.headless.headless_analyzer") as mock_analyzer:

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

            # Mock analyzer
            mock_analyzer.analyze = AsyncMock(return_value=mock_session_result)

            response = client.post(
                "/headless/run",
                json={
                    "repo_id": 1,
                    "prompt": "Analyze the codebase",
                    "kind": "custom",
                    "title": "Code Analysis",
                }
            )

            assert response.status_code == 200
            data = response.json()
            assert data["session_id"] == 1
            assert data["claude_session_id"] == "abc123-def456"
            assert data["result"] == "Analysis complete. Found 3 issues."
            assert data["success"] is True
            assert data["cost_usd"] == 0.05
            assert data["duration_ms"] == 5000
            assert data["error"] is None

    def test_run_headless_with_all_options(self, client, mock_repo, mock_session_result):
        """Test running a headless session with all optional parameters."""
        with patch("app.routers.headless.get_repo_or_404", return_value=mock_repo), \
             patch("app.routers.headless.get_repo_db") as mock_db_ctx, \
             patch("app.routers.headless.headless_analyzer") as mock_analyzer:

            mock_db = AsyncMock()
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.add = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock(side_effect=lambda s: setattr(s, 'id', 1))

            mock_analyzer.analyze = AsyncMock(return_value=mock_session_result)

            response = client.post(
                "/headless/run",
                json={
                    "repo_id": 1,
                    "prompt": "Analyze the codebase",
                    "kind": "custom",
                    "title": "Code Analysis",
                    "permission_mode": "plan",
                    "allowed_tools": ["Read", "Write"],
                    "disallowed_tools": ["Bash"],
                    "max_turns": 10,
                    "model": "claude-3-opus",
                    "system_prompt": "Be concise",
                    "resume_session": "previous-session-id",
                }
            )

            assert response.status_code == 200

            # Verify analyzer was called with all options
            mock_analyzer.analyze.assert_called_once()
            call_kwargs = mock_analyzer.analyze.call_args[1]
            assert call_kwargs["permission_mode"] == "plan"
            assert call_kwargs["allowed_tools"] == ["Read", "Write"]
            assert call_kwargs["disallowed_tools"] == ["Bash"]
            assert call_kwargs["max_turns"] == 10
            assert call_kwargs["model"] == "claude-3-opus"
            assert call_kwargs["system_prompt"] == "Be concise"
            assert call_kwargs["resume_session"] == "previous-session-id"

    def test_run_headless_session_failed(self, client, mock_repo, mock_failed_session_result):
        """Test running a headless session that fails."""
        with patch("app.routers.headless.get_repo_or_404", return_value=mock_repo), \
             patch("app.routers.headless.get_repo_db") as mock_db_ctx, \
             patch("app.routers.headless.headless_analyzer") as mock_analyzer:

            mock_db = AsyncMock()
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.add = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock(side_effect=lambda s: setattr(s, 'id', 1))

            mock_analyzer.analyze = AsyncMock(return_value=mock_failed_session_result)

            response = client.post(
                "/headless/run",
                json={
                    "repo_id": 1,
                    "prompt": "Analyze the codebase",
                    "title": "Code Analysis",
                }
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is False
            assert data["error"] == "Process exited with code 1"

    def test_run_headless_repo_not_found(self, client):
        """Test running a headless session with non-existent repo."""
        from fastapi import HTTPException

        with patch("app.routers.headless.get_repo_or_404") as mock_get_repo:
            mock_get_repo.side_effect = HTTPException(status_code=404, detail="Repository not found")

            response = client.post(
                "/headless/run",
                json={
                    "repo_id": 999,
                    "prompt": "Analyze the codebase",
                    "title": "Code Analysis",
                }
            )

            assert response.status_code == 404
            assert "Repository not found" in response.json()["detail"]

    def test_run_headless_analyzer_exception(self, client, mock_repo):
        """Test handling exceptions from the analyzer."""
        with patch("app.routers.headless.get_repo_or_404", return_value=mock_repo), \
             patch("app.routers.headless.get_repo_db") as mock_db_ctx, \
             patch("app.routers.headless.headless_analyzer") as mock_analyzer:

            mock_db = AsyncMock()
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.add = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock(side_effect=lambda s: setattr(s, 'id', 1))

            mock_analyzer.analyze = AsyncMock(side_effect=Exception("Claude Code not found"))

            response = client.post(
                "/headless/run",
                json={
                    "repo_id": 1,
                    "prompt": "Analyze the codebase",
                    "title": "Code Analysis",
                }
            )

            assert response.status_code == 500
            assert "Claude Code not found" in response.json()["detail"]

    def test_run_headless_default_values(self, client, mock_repo, mock_session_result):
        """Test that default values are applied correctly."""
        with patch("app.routers.headless.get_repo_or_404", return_value=mock_repo), \
             patch("app.routers.headless.get_repo_db") as mock_db_ctx, \
             patch("app.routers.headless.headless_analyzer") as mock_analyzer:

            mock_db = AsyncMock()
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.add = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock(side_effect=lambda s: setattr(s, 'id', 1))

            mock_analyzer.analyze = AsyncMock(return_value=mock_session_result)

            # Only provide required fields
            response = client.post(
                "/headless/run",
                json={
                    "repo_id": 1,
                    "prompt": "Hello",
                }
            )

            assert response.status_code == 200


class TestRunHeadlessSessionStream:
    """Tests for POST /headless/run/stream endpoint."""

    def test_stream_headless_success(self, client, mock_repo):
        """Test streaming a headless session successfully."""
        async def mock_stream(*args, **kwargs):
            yield SessionMessage(type="system", subtype="init", content="Starting")
            yield SessionMessage(type="assistant", content="Working on it...")
            yield SessionMessage(
                type="result",
                subtype="success",
                content="Done!",
                session_id="abc123",
                cost_usd=0.03,
                duration_ms=2000,
            )

        with patch("app.routers.headless.get_repo_or_404", return_value=mock_repo), \
             patch("app.routers.headless.get_repo_db") as mock_db_ctx, \
             patch("app.routers.headless.headless_analyzer") as mock_analyzer:

            mock_db = AsyncMock()
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.add = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock(side_effect=lambda s: setattr(s, 'id', 1))

            # Mock select query for session update
            mock_result = MagicMock()
            mock_session = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_session
            mock_db.execute = AsyncMock(return_value=mock_result)

            mock_analyzer.analyze_stream = mock_stream

            response = client.post(
                "/headless/run/stream",
                json={
                    "repo_id": 1,
                    "prompt": "Analyze",
                    "title": "Analysis",
                }
            )

            assert response.status_code == 200
            assert response.headers["content-type"] == "application/x-ndjson"

            # Parse streaming response
            lines = response.text.strip().split("\n")
            messages = [json.loads(line) for line in lines if line]

            assert len(messages) == 3
            assert messages[0]["type"] == "system"
            assert messages[1]["type"] == "assistant"
            assert messages[2]["type"] == "result"
            assert messages[2]["subtype"] == "success"
            assert messages[2]["content"] == "Done!"

    def test_stream_headless_with_error(self, client, mock_repo):
        """Test streaming a headless session that encounters an error."""
        async def mock_stream(*args, **kwargs):
            yield SessionMessage(type="system", subtype="init", content="Starting")
            raise Exception("Connection lost")

        with patch("app.routers.headless.get_repo_or_404", return_value=mock_repo), \
             patch("app.routers.headless.get_repo_db") as mock_db_ctx, \
             patch("app.routers.headless.headless_analyzer") as mock_analyzer:

            mock_db = AsyncMock()
            mock_db_ctx.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_db_ctx.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_db.add = MagicMock()
            mock_db.commit = AsyncMock()
            mock_db.refresh = AsyncMock(side_effect=lambda s: setattr(s, 'id', 1))

            # Mock select query for session update
            mock_result = MagicMock()
            mock_session = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_session
            mock_db.execute = AsyncMock(return_value=mock_result)

            mock_analyzer.analyze_stream = mock_stream

            response = client.post(
                "/headless/run/stream",
                json={
                    "repo_id": 1,
                    "prompt": "Analyze",
                    "title": "Analysis",
                }
            )

            assert response.status_code == 200

            # Parse streaming response - should include error message
            lines = response.text.strip().split("\n")
            messages = [json.loads(line) for line in lines if line]

            # Should have init message and error message
            assert len(messages) >= 1
            # Error should be in the stream
            error_msg = next((m for m in messages if m["type"] == "error"), None)
            assert error_msg is not None
            assert "Connection lost" in error_msg["content"]


class TestListRunningHeadlessSessions:
    """Tests for GET /headless/running endpoint."""

    def test_list_running_sessions_empty(self, client):
        """Test listing running sessions when none are running."""
        with patch("app.routers.headless.headless_analyzer") as mock_analyzer:
            mock_analyzer.list_running.return_value = []

            response = client.get("/headless/running")

            assert response.status_code == 200
            assert response.json() == {"running": []}

    def test_list_running_sessions_with_sessions(self, client):
        """Test listing running sessions when some are active."""
        with patch("app.routers.headless.headless_analyzer") as mock_analyzer:
            mock_analyzer.list_running.return_value = ["session-1", "session-2", "session-3"]

            response = client.get("/headless/running")

            assert response.status_code == 200
            data = response.json()
            assert data["running"] == ["session-1", "session-2", "session-3"]
            assert len(data["running"]) == 3


class TestCancelHeadlessSession:
    """Tests for DELETE /headless/{session_id} endpoint."""

    def test_cancel_session_success(self, client):
        """Test cancelling a running session successfully."""
        with patch("app.routers.headless.headless_analyzer") as mock_analyzer:
            mock_analyzer.cancel = AsyncMock(return_value=True)

            response = client.delete("/headless/session-123")

            assert response.status_code == 200
            assert response.json() == {"status": "cancelled"}
            mock_analyzer.cancel.assert_called_once_with("session-123")

    def test_cancel_session_not_found(self, client):
        """Test cancelling a session that doesn't exist."""
        with patch("app.routers.headless.headless_analyzer") as mock_analyzer:
            mock_analyzer.cancel = AsyncMock(return_value=False)

            response = client.delete("/headless/nonexistent-session")

            assert response.status_code == 404
            assert "not found or already completed" in response.json()["detail"]


class TestHeadlessSessionCreate:
    """Tests for the HeadlessSessionCreate model validation."""

    def test_minimal_request(self):
        """Test creating request with minimal fields."""
        request = HeadlessSessionCreate(
            repo_id=1,
            prompt="Hello",
        )
        assert request.repo_id == 1
        assert request.prompt == "Hello"
        assert request.kind == "custom"
        assert request.title == "Headless Session"
        assert request.permission_mode is None
        assert request.allowed_tools is None
        assert request.max_turns is None

    def test_full_request(self):
        """Test creating request with all fields."""
        request = HeadlessSessionCreate(
            repo_id=1,
            prompt="Analyze code",
            kind="issue",
            title="Issue Analysis",
            permission_mode="plan",
            allowed_tools=["Read", "Grep"],
            disallowed_tools=["Bash"],
            max_turns=5,
            model="claude-3-sonnet",
            system_prompt="Be helpful",
            resume_session="prev-session",
        )
        assert request.repo_id == 1
        assert request.prompt == "Analyze code"
        assert request.kind == "issue"
        assert request.title == "Issue Analysis"
        assert request.permission_mode == "plan"
        assert request.allowed_tools == ["Read", "Grep"]
        assert request.disallowed_tools == ["Bash"]
        assert request.max_turns == 5
        assert request.model == "claude-3-sonnet"
        assert request.system_prompt == "Be helpful"
        assert request.resume_session == "prev-session"


class TestHeadlessSessionResponse:
    """Tests for the HeadlessSessionResponse model."""

    def test_success_response(self):
        """Test creating a successful response."""
        response = HeadlessSessionResponse(
            session_id=1,
            claude_session_id="abc123",
            result="All done",
            success=True,
            cost_usd=0.05,
            duration_ms=3000,
        )
        assert response.session_id == 1
        assert response.claude_session_id == "abc123"
        assert response.result == "All done"
        assert response.success is True
        assert response.cost_usd == 0.05
        assert response.duration_ms == 3000
        assert response.error is None

    def test_error_response(self):
        """Test creating an error response."""
        response = HeadlessSessionResponse(
            session_id=1,
            claude_session_id="",
            result="",
            success=False,
            cost_usd=0.0,
            duration_ms=100,
            error="Session timed out",
        )
        assert response.success is False
        assert response.error == "Session timed out"
