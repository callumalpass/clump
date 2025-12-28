"""
Tests for the schedules router API endpoints.

Tests cover:
- GET /repos/{repo_id}/schedules (list scheduled jobs)
- POST /repos/{repo_id}/schedules (create scheduled job)
- GET /repos/{repo_id}/schedules/{job_id} (get scheduled job)
- PATCH /repos/{repo_id}/schedules/{job_id} (update scheduled job)
- DELETE /repos/{repo_id}/schedules/{job_id} (delete scheduled job)
- POST /repos/{repo_id}/schedules/{job_id}/run (trigger job)
- POST /repos/{repo_id}/schedules/{job_id}/pause (pause job)
- POST /repos/{repo_id}/schedules/{job_id}/resume (resume job)
- GET /repos/{repo_id}/schedules/{job_id}/runs (list job runs)
- Helper functions: safe_json_loads, safe_json_dumps, job_to_response, run_to_response
"""

import json
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI

from app.routers.schedules import (
    router,
    safe_json_loads,
    safe_json_dumps,
    job_to_response,
    run_to_response,
    ScheduledJobCreate,
    ScheduledJobUpdate,
)
from app.models import ScheduledJob, ScheduledJobRun, ScheduledJobStatus


@pytest.fixture
def app():
    """Create a test FastAPI app with the schedules router."""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def client(app):
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def mock_repo():
    """Create a mock repository dict."""
    return {
        "id": 1,
        "owner": "testowner",
        "name": "testrepo",
        "local_path": "/path/to/repo",
    }


@pytest.fixture
def mock_job():
    """Create a mock ScheduledJob model instance."""
    job = MagicMock(spec=ScheduledJob)
    job.id = 1
    job.repo_id = 1
    job.name = "Test Job"
    job.description = "A test scheduled job"
    job.status = ScheduledJobStatus.ACTIVE.value
    job.cron_expression = "0 9 * * *"
    job.timezone = "UTC"
    job.target_type = "issues"
    job.filter_query = "label:bug"
    job.command_id = "test-command"
    job.custom_prompt = None
    job.max_items = 10
    job.permission_mode = "default"
    job.allowed_tools = '["Read", "Grep"]'
    job.max_turns = 5
    job.model = "claude-3-sonnet"
    job.next_run_at = datetime(2024, 1, 15, 9, 0, 0)
    job.last_run_at = datetime(2024, 1, 14, 9, 0, 0)
    job.last_run_status = "completed"
    job.run_count = 10
    job.created_at = datetime(2024, 1, 1, 0, 0, 0)
    job.updated_at = datetime(2024, 1, 14, 9, 0, 0)
    return job


@pytest.fixture
def mock_job_run():
    """Create a mock ScheduledJobRun model instance."""
    run = MagicMock(spec=ScheduledJobRun)
    run.id = 1
    run.job_id = 1
    run.status = "completed"
    run.started_at = datetime(2024, 1, 14, 9, 0, 0)
    run.completed_at = datetime(2024, 1, 14, 9, 15, 0)
    run.items_found = 5
    run.items_processed = 4
    run.items_skipped = 1
    run.items_failed = 0
    run.error_message = None
    run.session_ids = '["session-1", "session-2"]'
    return run


class TestSafeJsonLoads:
    """Tests for safe_json_loads helper function."""

    def test_parses_valid_json(self):
        """Parses valid JSON string correctly."""
        result = safe_json_loads('["item1", "item2"]')
        assert result == ["item1", "item2"]

    def test_parses_json_object(self):
        """Parses JSON object correctly."""
        result = safe_json_loads('{"key": "value"}')
        assert result == {"key": "value"}

    def test_returns_none_for_none_input(self):
        """Returns None when input is None."""
        result = safe_json_loads(None)
        assert result is None

    def test_returns_none_for_empty_string(self):
        """Returns None when input is empty string."""
        result = safe_json_loads("")
        assert result is None

    def test_returns_none_for_invalid_json(self):
        """Returns None for invalid JSON string."""
        result = safe_json_loads("not valid json {{{")
        assert result is None

    def test_handles_nested_json(self):
        """Handles nested JSON structures."""
        result = safe_json_loads('{"nested": {"key": ["a", "b"]}}')
        assert result == {"nested": {"key": ["a", "b"]}}


class TestSafeJsonDumps:
    """Tests for safe_json_dumps helper function."""

    def test_serializes_list(self):
        """Serializes list to JSON string."""
        result = safe_json_dumps(["item1", "item2"])
        assert result == '["item1", "item2"]'

    def test_serializes_dict(self):
        """Serializes dict to JSON string."""
        result = safe_json_dumps({"key": "value"})
        assert result == '{"key": "value"}'

    def test_returns_none_for_none_input(self):
        """Returns None when input is None."""
        result = safe_json_dumps(None)
        assert result is None

    def test_returns_none_for_empty_list(self):
        """Returns None when input is empty list."""
        result = safe_json_dumps([])
        assert result is None

    def test_returns_none_for_empty_dict(self):
        """Returns None when input is empty dict."""
        result = safe_json_dumps({})
        assert result is None

    def test_handles_nested_structures(self):
        """Handles nested data structures."""
        result = safe_json_dumps({"nested": {"key": ["a", "b"]}})
        assert json.loads(result) == {"nested": {"key": ["a", "b"]}}


class TestJobToResponse:
    """Tests for job_to_response conversion function."""

    def test_converts_basic_job(self, mock_job):
        """Converts a basic job to response correctly."""
        result = job_to_response(mock_job)

        assert result.id == 1
        assert result.name == "Test Job"
        assert result.description == "A test scheduled job"
        assert result.status == ScheduledJobStatus.ACTIVE.value
        assert result.cron_expression == "0 9 * * *"
        assert result.timezone == "UTC"
        assert result.target_type == "issues"
        assert result.filter_query == "label:bug"
        assert result.command_id == "test-command"
        assert result.max_items == 10
        assert result.model == "claude-3-sonnet"
        assert result.run_count == 10

    def test_parses_allowed_tools_json(self, mock_job):
        """Parses allowed_tools JSON correctly."""
        result = job_to_response(mock_job)
        assert result.allowed_tools == ["Read", "Grep"]

    def test_handles_none_allowed_tools(self, mock_job):
        """Handles None allowed_tools."""
        mock_job.allowed_tools = None
        result = job_to_response(mock_job)
        assert result.allowed_tools is None

    def test_formats_next_run_at_with_z_suffix(self, mock_job):
        """Formats next_run_at with Z suffix."""
        result = job_to_response(mock_job)
        assert result.next_run_at.endswith("Z")

    def test_formats_last_run_at_with_z_suffix(self, mock_job):
        """Formats last_run_at with Z suffix."""
        result = job_to_response(mock_job)
        assert result.last_run_at.endswith("Z")

    def test_handles_none_next_run_at(self, mock_job):
        """Handles None next_run_at."""
        mock_job.next_run_at = None
        result = job_to_response(mock_job)
        assert result.next_run_at is None

    def test_handles_none_last_run_at(self, mock_job):
        """Handles None last_run_at."""
        mock_job.last_run_at = None
        result = job_to_response(mock_job)
        assert result.last_run_at is None


class TestRunToResponse:
    """Tests for run_to_response conversion function."""

    def test_converts_basic_run(self, mock_job_run):
        """Converts a basic job run to response correctly."""
        result = run_to_response(mock_job_run)

        assert result.id == 1
        assert result.job_id == 1
        assert result.status == "completed"
        assert result.items_found == 5
        assert result.items_processed == 4
        assert result.items_skipped == 1
        assert result.items_failed == 0
        assert result.error_message is None

    def test_parses_session_ids_json(self, mock_job_run):
        """Parses session_ids JSON correctly."""
        result = run_to_response(mock_job_run)
        assert result.session_ids == ["session-1", "session-2"]

    def test_handles_none_session_ids(self, mock_job_run):
        """Handles None session_ids."""
        mock_job_run.session_ids = None
        result = run_to_response(mock_job_run)
        assert result.session_ids is None

    def test_handles_none_completed_at(self, mock_job_run):
        """Handles None completed_at for running jobs."""
        mock_job_run.completed_at = None
        result = run_to_response(mock_job_run)
        assert result.completed_at is None

    def test_formats_dates_as_isoformat(self, mock_job_run):
        """Formats dates as ISO format strings."""
        result = run_to_response(mock_job_run)
        assert "2024-01-14" in result.started_at
        assert "2024-01-14" in result.completed_at


class TestScheduledJobCreate:
    """Tests for ScheduledJobCreate validation."""

    def test_valid_create_request(self):
        """Creates valid request with all required fields."""
        data = ScheduledJobCreate(
            name="Test Job",
            cron_expression="0 9 * * *",
            timezone="UTC",
            target_type="issues",
            command_id="test-command",
        )
        assert data.name == "Test Job"
        assert data.cron_expression == "0 9 * * *"

    def test_invalid_cron_expression_raises(self):
        """Raises validation error for invalid cron expression."""
        with pytest.raises(ValueError, match="Invalid cron expression"):
            ScheduledJobCreate(
                name="Test",
                cron_expression="not a cron",
                target_type="issues",
                command_id="cmd",
            )

    def test_invalid_timezone_raises(self):
        """Raises validation error for unknown timezone."""
        with pytest.raises(ValueError, match="Unknown timezone"):
            ScheduledJobCreate(
                name="Test",
                cron_expression="0 9 * * *",
                timezone="Invalid/Zone",
                target_type="issues",
                command_id="cmd",
            )

    def test_invalid_target_type_raises(self):
        """Raises validation error for invalid target_type."""
        with pytest.raises(ValueError, match="target_type must be one of"):
            ScheduledJobCreate(
                name="Test",
                cron_expression="0 9 * * *",
                target_type="invalid",
                command_id="cmd",
            )

    def test_valid_target_types(self):
        """Accepts all valid target types."""
        for target in ["issues", "prs", "codebase", "custom"]:
            if target == "custom":
                data = ScheduledJobCreate(
                    name="Test",
                    cron_expression="0 9 * * *",
                    target_type=target,
                    custom_prompt="Test prompt",
                )
            else:
                data = ScheduledJobCreate(
                    name="Test",
                    cron_expression="0 9 * * *",
                    target_type=target,
                    command_id="cmd",
                )
            assert data.target_type == target


class TestScheduledJobUpdate:
    """Tests for ScheduledJobUpdate validation."""

    def test_all_fields_optional(self):
        """All fields are optional in update request."""
        data = ScheduledJobUpdate()
        assert data.name is None
        assert data.cron_expression is None

    def test_partial_update(self):
        """Allows partial update with some fields."""
        data = ScheduledJobUpdate(name="New Name", max_items=20)
        assert data.name == "New Name"
        assert data.max_items == 20
        assert data.cron_expression is None

    def test_validates_cron_when_provided(self):
        """Validates cron expression only when provided."""
        with pytest.raises(ValueError, match="Invalid cron expression"):
            ScheduledJobUpdate(cron_expression="invalid")

    def test_validates_timezone_when_provided(self):
        """Validates timezone only when provided."""
        with pytest.raises(ValueError, match="Unknown timezone"):
            ScheduledJobUpdate(timezone="Invalid/Zone")

    def test_accepts_valid_cron_update(self):
        """Accepts valid cron expression in update."""
        data = ScheduledJobUpdate(cron_expression="0 12 * * *")
        assert data.cron_expression == "0 12 * * *"


class TestListScheduledJobs:
    """Tests for GET /repos/{repo_id}/schedules endpoint."""

    def test_list_jobs_success(self, client, mock_repo, mock_job):
        """Lists jobs successfully for a repository."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [mock_job]
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.get("/repos/1/schedules")

            assert response.status_code == 200
            data = response.json()
            assert len(data) == 1
            assert data[0]["name"] == "Test Job"

    def test_list_jobs_repo_not_found(self, client):
        """Returns 404 when repository not found."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=None):
            response = client.get("/repos/999/schedules")

            assert response.status_code == 404
            assert "not found" in response.json()["detail"].lower()

    def test_list_jobs_empty(self, client, mock_repo):
        """Returns empty list when no jobs exist."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = []
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.get("/repos/1/schedules")

            assert response.status_code == 200
            assert response.json() == []


class TestCreateScheduledJob:
    """Tests for POST /repos/{repo_id}/schedules endpoint."""

    def test_create_job_success(self, client, mock_repo, mock_job):
        """Creates job successfully."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.calculate_next_run", return_value=datetime(2024, 1, 15, 9, 0, 0)), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()
            mock_session.add = MagicMock()
            mock_session.commit = AsyncMock()
            mock_session.refresh = AsyncMock()

            # Mock the refresh to set the job ID
            def set_job_id(job):
                job.id = 1
                job.status = ScheduledJobStatus.ACTIVE.value
                job.run_count = 0
                job.created_at = datetime(2024, 1, 1, 0, 0, 0)
                job.updated_at = datetime(2024, 1, 1, 0, 0, 0)
                job.last_run_at = None
                job.last_run_status = None
            mock_session.refresh.side_effect = set_job_id

            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.post("/repos/1/schedules", json={
                "name": "Test Job",
                "cron_expression": "0 9 * * *",
                "target_type": "issues",
                "command_id": "test-command",
            })

            assert response.status_code == 200
            mock_session.add.assert_called_once()
            mock_session.commit.assert_called_once()

    def test_create_job_repo_not_found(self, client):
        """Returns 404 when repository not found."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=None):
            response = client.post("/repos/999/schedules", json={
                "name": "Test",
                "cron_expression": "0 9 * * *",
                "target_type": "issues",
                "command_id": "cmd",
            })

            assert response.status_code == 404

    def test_create_custom_job_requires_prompt(self, client, mock_repo):
        """Returns 400 when custom job missing custom_prompt."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo):
            response = client.post("/repos/1/schedules", json={
                "name": "Test",
                "cron_expression": "0 9 * * *",
                "target_type": "custom",
            })

            assert response.status_code == 400
            assert "custom_prompt is required" in response.json()["detail"]

    def test_create_non_custom_job_requires_command_id(self, client, mock_repo):
        """Returns 400 when non-custom job missing command_id."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo):
            response = client.post("/repos/1/schedules", json={
                "name": "Test",
                "cron_expression": "0 9 * * *",
                "target_type": "issues",
            })

            assert response.status_code == 400
            assert "command_id is required" in response.json()["detail"]


class TestGetScheduledJob:
    """Tests for GET /repos/{repo_id}/schedules/{job_id} endpoint."""

    def test_get_job_success(self, client, mock_repo, mock_job):
        """Gets job details successfully."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_job
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.get("/repos/1/schedules/1")

            assert response.status_code == 200
            assert response.json()["name"] == "Test Job"

    def test_get_job_not_found(self, client, mock_repo):
        """Returns 404 when job not found."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.get("/repos/1/schedules/999")

            assert response.status_code == 404

    def test_get_job_repo_not_found(self, client):
        """Returns 404 when repository not found."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=None):
            response = client.get("/repos/999/schedules/1")

            assert response.status_code == 404


class TestUpdateScheduledJob:
    """Tests for PATCH /repos/{repo_id}/schedules/{job_id} endpoint."""

    def test_update_job_name(self, client, mock_repo, mock_job):
        """Updates job name successfully."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_job
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_session.commit = AsyncMock()
            mock_session.refresh = AsyncMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.patch("/repos/1/schedules/1", json={
                "name": "Updated Name"
            })

            assert response.status_code == 200
            mock_session.commit.assert_called_once()

    def test_update_job_cron_recalculates_next_run(self, client, mock_repo, mock_job):
        """Recalculates next_run when cron expression is updated."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.calculate_next_run", return_value=datetime(2024, 1, 20, 12, 0, 0)) as mock_calc, \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_job
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_session.commit = AsyncMock()
            mock_session.refresh = AsyncMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.patch("/repos/1/schedules/1", json={
                "cron_expression": "0 12 * * *"
            })

            assert response.status_code == 200
            mock_calc.assert_called_once()

    def test_update_job_not_found(self, client, mock_repo):
        """Returns 404 when job not found."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.patch("/repos/1/schedules/999", json={
                "name": "New Name"
            })

            assert response.status_code == 404


class TestDeleteScheduledJob:
    """Tests for DELETE /repos/{repo_id}/schedules/{job_id} endpoint."""

    def test_delete_job_success(self, client, mock_repo, mock_job):
        """Deletes job successfully."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_job
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_session.delete = AsyncMock()
            mock_session.commit = AsyncMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.delete("/repos/1/schedules/1")

            assert response.status_code == 200
            assert response.json()["status"] == "deleted"
            mock_session.delete.assert_called_once_with(mock_job)

    def test_delete_job_not_found(self, client, mock_repo):
        """Returns 404 when job not found."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.delete("/repos/1/schedules/999")

            assert response.status_code == 404


class TestTriggerJobNow:
    """Tests for POST /repos/{repo_id}/schedules/{job_id}/run endpoint."""

    def test_trigger_job_success(self, client, mock_repo, mock_job_run):
        """Triggers job successfully."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.scheduler") as mock_scheduler:

            mock_scheduler.trigger_job = AsyncMock(return_value=(mock_job_run, None))

            response = client.post("/repos/1/schedules/1/run")

            assert response.status_code == 200
            assert response.json()["status"] == "triggered"
            mock_scheduler.trigger_job.assert_called_once_with(1, 1)

    def test_trigger_job_already_running(self, client, mock_repo):
        """Returns 409 when job is already running."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.scheduler") as mock_scheduler:

            mock_scheduler.trigger_job = AsyncMock(return_value=(None, "already_running"))

            response = client.post("/repos/1/schedules/1/run")

            assert response.status_code == 409
            assert "already running" in response.json()["detail"].lower()

    def test_trigger_job_not_found(self, client, mock_repo):
        """Returns 404 when job not found."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.scheduler") as mock_scheduler:

            mock_scheduler.trigger_job = AsyncMock(return_value=(None, None))

            response = client.post("/repos/1/schedules/999/run")

            assert response.status_code == 404


class TestPauseJob:
    """Tests for POST /repos/{repo_id}/schedules/{job_id}/pause endpoint."""

    def test_pause_job_success(self, client, mock_repo, mock_job):
        """Pauses job successfully."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_job
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_session.commit = AsyncMock()
            mock_session.refresh = AsyncMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.post("/repos/1/schedules/1/pause")

            assert response.status_code == 200
            assert mock_job.status == ScheduledJobStatus.PAUSED.value

    def test_pause_job_not_found(self, client, mock_repo):
        """Returns 404 when job not found."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.post("/repos/1/schedules/999/pause")

            assert response.status_code == 404


class TestResumeJob:
    """Tests for POST /repos/{repo_id}/schedules/{job_id}/resume endpoint."""

    def test_resume_job_success(self, client, mock_repo, mock_job):
        """Resumes job successfully."""
        mock_job.status = ScheduledJobStatus.PAUSED.value

        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.calculate_next_run", return_value=datetime(2024, 1, 15, 9, 0, 0)), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_job
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_session.commit = AsyncMock()
            mock_session.refresh = AsyncMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.post("/repos/1/schedules/1/resume")

            assert response.status_code == 200
            assert mock_job.status == ScheduledJobStatus.ACTIVE.value

    def test_resume_job_not_found(self, client, mock_repo):
        """Returns 404 when job not found."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.post("/repos/1/schedules/999/resume")

            assert response.status_code == 404


class TestListJobRuns:
    """Tests for GET /repos/{repo_id}/schedules/{job_id}/runs endpoint."""

    def test_list_runs_success(self, client, mock_repo, mock_job_run):
        """Lists job runs successfully."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()

            # Mock count query
            mock_count_result = MagicMock()
            mock_count_result.scalar.return_value = 1

            # Mock runs query
            mock_runs_result = MagicMock()
            mock_runs_result.scalars.return_value.all.return_value = [mock_job_run]

            mock_session.execute = AsyncMock(side_effect=[mock_count_result, mock_runs_result])
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.get("/repos/1/schedules/1/runs")

            assert response.status_code == 200
            data = response.json()
            assert data["total"] == 1
            assert len(data["runs"]) == 1
            assert data["runs"][0]["status"] == "completed"

    def test_list_runs_with_pagination(self, client, mock_repo, mock_job_run):
        """Lists job runs with pagination parameters."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()

            mock_count_result = MagicMock()
            mock_count_result.scalar.return_value = 50

            mock_runs_result = MagicMock()
            mock_runs_result.scalars.return_value.all.return_value = [mock_job_run]

            mock_session.execute = AsyncMock(side_effect=[mock_count_result, mock_runs_result])
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.get("/repos/1/schedules/1/runs?limit=10&offset=20")

            assert response.status_code == 200
            data = response.json()
            assert data["total"] == 50

    def test_list_runs_repo_not_found(self, client):
        """Returns 404 when repository not found."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=None):
            response = client.get("/repos/999/schedules/1/runs")

            assert response.status_code == 404

    def test_list_runs_empty(self, client, mock_repo):
        """Returns empty list when no runs exist."""
        with patch("app.routers.schedules.get_repo_by_id", return_value=mock_repo), \
             patch("app.routers.schedules.get_repo_db") as mock_db:

            mock_session = AsyncMock()

            mock_count_result = MagicMock()
            mock_count_result.scalar.return_value = 0

            mock_runs_result = MagicMock()
            mock_runs_result.scalars.return_value.all.return_value = []

            mock_session.execute = AsyncMock(side_effect=[mock_count_result, mock_runs_result])
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=None)

            response = client.get("/repos/1/schedules/1/runs")

            assert response.status_code == 200
            data = response.json()
            assert data["total"] == 0
            assert data["runs"] == []
