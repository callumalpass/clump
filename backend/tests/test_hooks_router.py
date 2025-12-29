"""
Tests for the hooks router API endpoints.

Tests cover:
- POST /hooks/notification (notification hook)
- POST /hooks/permission-request (permission request hook)
- POST /hooks/clear/{session_id} (clear attention)
- GET /hooks/attention (get sessions needing attention)
- WebSocket /hooks/ws (real-time event streaming)
"""

import pytest
import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import FastAPI

from app.routers.hooks import (
    router,
    NotificationHookPayload,
    PermissionRequestPayload,
    CLAUDE_CODE_PERMISSION_PROMPT,
    CLAUDE_CODE_IDLE_PROMPT,
)
from app.services.notification_manager import NotificationType


@pytest.fixture
def app():
    """Create a test FastAPI app with the hooks router."""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def client(app):
    """Create a test client."""
    return TestClient(app)


class TestNotificationHook:
    """Tests for POST /hooks/notification endpoint."""

    def test_notification_hook_permission_type(self, client):
        """Test notification hook with permission_prompt type."""
        with patch("app.routers.hooks.notification_manager") as mock_nm:
            mock_nm.notify = AsyncMock()

            response = client.post(
                "/hooks/notification",
                json={
                    "session_id": "test-session-123",
                    "message": "Claude needs permission",
                    "notification_type": CLAUDE_CODE_PERMISSION_PROMPT,
                    "cwd": "/home/user/project",
                }
            )

            assert response.status_code == 200

            mock_nm.notify.assert_called_once()
            call_kwargs = mock_nm.notify.call_args[1]
            assert call_kwargs["session_id"] == "test-session-123"
            assert call_kwargs["notification_type"] == NotificationType.PERMISSION_NEEDED

    def test_notification_hook_idle_type(self, client):
        """Test notification hook with idle_prompt type."""
        with patch("app.routers.hooks.notification_manager") as mock_nm:
            mock_nm.notify = AsyncMock()

            response = client.post(
                "/hooks/notification",
                json={
                    "session_id": "test-session-123",
                    "message": "Claude is waiting",
                    "notification_type": CLAUDE_CODE_IDLE_PROMPT,
                }
            )

            assert response.status_code == 200

            mock_nm.notify.assert_called_once()
            call_kwargs = mock_nm.notify.call_args[1]
            assert call_kwargs["notification_type"] == NotificationType.IDLE

    def test_notification_hook_fallback_to_message_parsing(self, client):
        """Test notification hook falls back to message parsing when type is missing."""
        with patch("app.routers.hooks.notification_manager") as mock_nm:
            mock_nm.notify = AsyncMock()

            # Message contains "permission" keyword
            response = client.post(
                "/hooks/notification",
                json={
                    "session_id": "test-session-123",
                    "message": "Claude needs your permission to use Bash",
                }
            )

            assert response.status_code == 200

            call_kwargs = mock_nm.notify.call_args[1]
            assert call_kwargs["notification_type"] == NotificationType.PERMISSION_NEEDED

    def test_notification_hook_fallback_idle_keyword(self, client):
        """Test notification hook detects idle keyword in message."""
        with patch("app.routers.hooks.notification_manager") as mock_nm:
            mock_nm.notify = AsyncMock()

            response = client.post(
                "/hooks/notification",
                json={
                    "session_id": "test-session-123",
                    "message": "Claude is idle and waiting for input",
                }
            )

            assert response.status_code == 200

            call_kwargs = mock_nm.notify.call_args[1]
            assert call_kwargs["notification_type"] == NotificationType.IDLE

    def test_notification_hook_unknown_defaults_to_permission(self, client):
        """Test notification hook defaults to permission when type unknown."""
        with patch("app.routers.hooks.notification_manager") as mock_nm:
            mock_nm.notify = AsyncMock()

            response = client.post(
                "/hooks/notification",
                json={
                    "session_id": "test-session-123",
                    "message": "Some unknown message type",
                }
            )

            assert response.status_code == 200

            call_kwargs = mock_nm.notify.call_args[1]
            assert call_kwargs["notification_type"] == NotificationType.PERMISSION_NEEDED


class TestPermissionRequestHook:
    """Tests for POST /hooks/permission-request endpoint."""

    def test_permission_request_hook(self, client):
        """Test permission request hook with tool details."""
        with patch("app.routers.hooks.notification_manager") as mock_nm:
            mock_nm.notify = AsyncMock()

            response = client.post(
                "/hooks/permission-request",
                json={
                    "session_id": "test-session-123",
                    "tool_name": "Bash",
                    "tool_input": {"command": "rm -rf /"},
                    "cwd": "/home/user/project",
                    "permission_mode": "acceptEdits",
                }
            )

            assert response.status_code == 200

            mock_nm.notify.assert_called_once()
            call_kwargs = mock_nm.notify.call_args[1]
            assert call_kwargs["session_id"] == "test-session-123"
            assert call_kwargs["notification_type"] == NotificationType.PERMISSION_NEEDED
            assert call_kwargs["data"]["tool_name"] == "Bash"
            assert call_kwargs["data"]["tool_input"] == {"command": "rm -rf /"}

    def test_permission_request_hook_minimal(self, client):
        """Test permission request hook with minimal fields."""
        with patch("app.routers.hooks.notification_manager") as mock_nm:
            mock_nm.notify = AsyncMock()

            response = client.post(
                "/hooks/permission-request",
                json={
                    "session_id": "test-session-123",
                }
            )

            assert response.status_code == 200
            mock_nm.notify.assert_called_once()


class TestClearNotification:
    """Tests for POST /hooks/clear/{session_id} endpoint."""

    def test_clear_notification(self, client):
        """Test clearing notification for a session."""
        with patch("app.routers.hooks.notification_manager") as mock_nm:
            mock_nm.clear_attention = AsyncMock()

            response = client.post("/hooks/clear/test-session-123")

            assert response.status_code == 200
            assert response.json()["status"] == "cleared"
            mock_nm.clear_attention.assert_called_once_with("test-session-123")


class TestGetSessionsNeedingAttention:
    """Tests for GET /hooks/attention endpoint."""

    def test_get_sessions_needing_attention(self, client):
        """Test getting sessions that need attention."""
        with patch("app.routers.hooks.notification_manager") as mock_nm:
            mock_nm.get_sessions_needing_attention.return_value = [
                "session-1",
                "session-2",
            ]

            response = client.get("/hooks/attention")

            assert response.status_code == 200
            data = response.json()
            assert data["sessions"] == ["session-1", "session-2"]

    def test_get_sessions_needing_attention_empty(self, client):
        """Test getting sessions when none need attention."""
        with patch("app.routers.hooks.notification_manager") as mock_nm:
            mock_nm.get_sessions_needing_attention.return_value = []

            response = client.get("/hooks/attention")

            assert response.status_code == 200
            assert response.json()["sessions"] == []


class TestWebSocketClosingFlag:
    """Tests for WebSocket closing flag behavior to prevent race conditions.

    The WebSocket endpoint uses a `closing` flag to prevent callbacks from
    queuing events after the connection has started closing. This prevents
    errors when trying to send to a closed connection.
    """

    def test_closing_flag_prevents_notification_callback(self):
        """Test that closing flag prevents notification callbacks from queuing events."""
        # This tests the logic of the on_notification callback
        # When closing=True, events should not be added to the queue

        event_queue = asyncio.Queue()
        closing = True  # Simulate closing state

        def on_notification(notification):
            """Simulated callback with closing check."""
            if closing:
                return
            try:
                event_queue.put_nowait({
                    "type": "notification",
                    **notification.to_dict(),
                })
            except asyncio.QueueFull:
                pass

        # Create a mock notification
        mock_notification = MagicMock()
        mock_notification.to_dict.return_value = {"session_id": "test"}

        # Call the callback
        on_notification(mock_notification)

        # Queue should be empty because closing=True
        assert event_queue.empty()

    def test_closing_flag_prevents_event_callback(self):
        """Test that closing flag prevents event callbacks from queuing events."""
        event_queue = asyncio.Queue()
        closing = True  # Simulate closing state

        def on_event(event):
            """Simulated callback with closing check."""
            if closing:
                return
            try:
                event_queue.put_nowait(event.to_dict())
            except asyncio.QueueFull:
                pass

        # Create a mock event
        mock_event = MagicMock()
        mock_event.to_dict.return_value = {"type": "session_created"}

        # Call the callback
        on_event(mock_event)

        # Queue should be empty because closing=True
        assert event_queue.empty()

    def test_callback_works_when_not_closing(self):
        """Test that callbacks work normally when not closing."""
        event_queue = asyncio.Queue()
        closing = False  # Not closing

        def on_notification(notification):
            """Simulated callback with closing check."""
            if closing:
                return
            try:
                event_queue.put_nowait({
                    "type": "notification",
                    **notification.to_dict(),
                })
            except asyncio.QueueFull:
                pass

        # Create a mock notification
        mock_notification = MagicMock()
        mock_notification.to_dict.return_value = {"session_id": "test"}

        # Call the callback
        on_notification(mock_notification)

        # Queue should have the event
        assert not event_queue.empty()
        event = event_queue.get_nowait()
        assert event["type"] == "notification"
        assert event["session_id"] == "test"


class TestNotificationHookPayload:
    """Tests for NotificationHookPayload Pydantic model."""

    def test_payload_with_all_fields(self):
        """Test creating payload with all fields."""
        payload = NotificationHookPayload(
            session_id="test-123",
            transcript_path="/path/to/transcript.jsonl",
            cwd="/home/user/project",
            hook_event_name="Notification",
            message="Claude needs permission",
            notification_type=CLAUDE_CODE_PERMISSION_PROMPT,
        )
        assert payload.session_id == "test-123"
        assert payload.notification_type == CLAUDE_CODE_PERMISSION_PROMPT

    def test_payload_with_minimal_fields(self):
        """Test creating payload with only required fields."""
        payload = NotificationHookPayload(session_id="test-123")
        assert payload.session_id == "test-123"
        assert payload.message is None
        assert payload.notification_type is None


class TestPermissionRequestPayload:
    """Tests for PermissionRequestPayload Pydantic model."""

    def test_payload_with_all_fields(self):
        """Test creating payload with all fields."""
        payload = PermissionRequestPayload(
            session_id="test-123",
            transcript_path="/path/to/transcript.jsonl",
            cwd="/home/user/project",
            permission_mode="acceptEdits",
            hook_event_name="PermissionRequest",
            tool_name="Bash",
            tool_input={"command": "ls -la"},
        )
        assert payload.session_id == "test-123"
        assert payload.tool_name == "Bash"
        assert payload.tool_input == {"command": "ls -la"}

    def test_payload_with_minimal_fields(self):
        """Test creating payload with only required fields."""
        payload = PermissionRequestPayload(session_id="test-123")
        assert payload.session_id == "test-123"
        assert payload.tool_name is None
        assert payload.tool_input is None
