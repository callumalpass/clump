"""
Tests for the NotificationManager service.

Tests cover:
- NotificationType enum and Notification dataclass
- NotificationManager state management
- Subscriber and global subscriber functionality
- Race condition handling (callback invocation with snapshotted lists)
- Async callback handling
"""

import pytest
import asyncio
from datetime import datetime, timezone
from unittest.mock import MagicMock, AsyncMock

from app.services.notification_manager import (
    NotificationType,
    Notification,
    NotificationManager,
)


class TestNotificationType:
    """Tests for NotificationType enum."""

    def test_notification_types_are_strings(self):
        """NotificationType values are string-compatible."""
        assert NotificationType.PERMISSION_NEEDED == "permission_needed"
        assert NotificationType.IDLE == "idle"
        assert NotificationType.SESSION_COMPLETED == "session_completed"
        assert NotificationType.SESSION_FAILED == "session_failed"

    def test_notification_type_value_access(self):
        """NotificationType.value returns the string value."""
        assert NotificationType.PERMISSION_NEEDED.value == "permission_needed"
        assert NotificationType.IDLE.value == "idle"


class TestNotification:
    """Tests for Notification dataclass."""

    def test_creates_notification_with_required_fields(self):
        """Creates notification with required fields."""
        notification = Notification(
            session_id="test-session",
            type=NotificationType.PERMISSION_NEEDED,
        )
        assert notification.session_id == "test-session"
        assert notification.type == NotificationType.PERMISSION_NEEDED
        assert notification.data == {}
        assert isinstance(notification.timestamp, datetime)

    def test_creates_notification_with_data(self):
        """Creates notification with custom data."""
        notification = Notification(
            session_id="test-session",
            type=NotificationType.IDLE,
            data={"idle_seconds": 30},
        )
        assert notification.data == {"idle_seconds": 30}

    def test_to_dict_serialization(self):
        """to_dict returns JSON-serializable dictionary."""
        notification = Notification(
            session_id="test-session",
            type=NotificationType.SESSION_COMPLETED,
            data={"result": "success"},
        )
        result = notification.to_dict()

        assert result["session_id"] == "test-session"
        assert result["notification_type"] == "session_completed"
        assert result["data"] == {"result": "success"}
        assert "timestamp" in result
        # Timestamp should be ISO format string
        assert isinstance(result["timestamp"], str)

    def test_timestamp_is_utc(self):
        """Notification timestamp is in UTC."""
        notification = Notification(
            session_id="test-session",
            type=NotificationType.IDLE,
        )
        assert notification.timestamp.tzinfo == timezone.utc


class TestNotificationManagerStateManagement:
    """Tests for NotificationManager state management."""

    @pytest.fixture
    def manager(self):
        """Create a fresh NotificationManager instance."""
        return NotificationManager()

    def test_initial_state_is_empty(self, manager):
        """Manager starts with no state."""
        assert manager.get_state("any-session") is None

    @pytest.mark.asyncio
    async def test_notify_sets_state(self, manager):
        """notify() sets the state for a session."""
        await manager.notify("session-1", NotificationType.PERMISSION_NEEDED)
        assert manager.get_state("session-1") == NotificationType.PERMISSION_NEEDED

    @pytest.mark.asyncio
    async def test_notify_skips_duplicate_state(self, manager):
        """notify() skips duplicate notifications of the same type."""
        callback = MagicMock()
        manager.subscribe("session-1", callback)

        await manager.notify("session-1", NotificationType.IDLE)
        await manager.notify("session-1", NotificationType.IDLE)  # Duplicate

        # Callback should only be called once
        assert callback.call_count == 1

    @pytest.mark.asyncio
    async def test_notify_allows_different_types(self, manager):
        """notify() allows changing notification type."""
        callback = MagicMock()
        manager.subscribe("session-1", callback)

        await manager.notify("session-1", NotificationType.IDLE)
        await manager.notify("session-1", NotificationType.PERMISSION_NEEDED)

        assert callback.call_count == 2
        assert manager.get_state("session-1") == NotificationType.PERMISSION_NEEDED

    @pytest.mark.asyncio
    async def test_clear_attention_removes_state(self, manager):
        """clear_attention() removes state for a session."""
        await manager.notify("session-1", NotificationType.PERMISSION_NEEDED)
        await manager.clear_attention("session-1")
        assert manager.get_state("session-1") is None

    @pytest.mark.asyncio
    async def test_clear_attention_allows_renotification(self, manager):
        """After clear_attention(), the same notification type can be sent again."""
        callback = MagicMock()
        manager.subscribe("session-1", callback)

        await manager.notify("session-1", NotificationType.IDLE)
        await manager.clear_attention("session-1")
        await manager.notify("session-1", NotificationType.IDLE)

        assert callback.call_count == 2

    def test_get_sessions_needing_attention(self, manager):
        """get_sessions_needing_attention() returns correct sessions."""
        # Set up state directly for testing
        manager._state["session-1"] = NotificationType.PERMISSION_NEEDED
        manager._state["session-2"] = NotificationType.IDLE
        manager._state["session-3"] = NotificationType.SESSION_COMPLETED

        result = manager.get_sessions_needing_attention()

        assert "session-1" in result
        assert "session-2" in result
        assert "session-3" not in result  # SESSION_COMPLETED doesn't need attention

    def test_get_sessions_needing_attention_empty(self, manager):
        """get_sessions_needing_attention() returns empty list when no sessions need attention."""
        result = manager.get_sessions_needing_attention()
        assert result == []


class TestNotificationManagerSubscribers:
    """Tests for NotificationManager subscriber functionality."""

    @pytest.fixture
    def manager(self):
        """Create a fresh NotificationManager instance."""
        return NotificationManager()

    @pytest.mark.asyncio
    async def test_subscribe_receives_notifications(self, manager):
        """Subscribed callback receives notifications."""
        callback = MagicMock()
        manager.subscribe("session-1", callback)

        await manager.notify("session-1", NotificationType.PERMISSION_NEEDED)

        callback.assert_called_once()
        notification = callback.call_args[0][0]
        assert notification.session_id == "session-1"
        assert notification.type == NotificationType.PERMISSION_NEEDED

    @pytest.mark.asyncio
    async def test_subscribe_only_receives_for_session(self, manager):
        """Subscriber only receives notifications for subscribed session."""
        callback = MagicMock()
        manager.subscribe("session-1", callback)

        await manager.notify("session-2", NotificationType.PERMISSION_NEEDED)

        callback.assert_not_called()

    @pytest.mark.asyncio
    async def test_multiple_subscribers_same_session(self, manager):
        """Multiple subscribers for same session all receive notifications."""
        callback1 = MagicMock()
        callback2 = MagicMock()
        manager.subscribe("session-1", callback1)
        manager.subscribe("session-1", callback2)

        await manager.notify("session-1", NotificationType.IDLE)

        callback1.assert_called_once()
        callback2.assert_called_once()

    @pytest.mark.asyncio
    async def test_unsubscribe_stops_notifications(self, manager):
        """Unsubscribed callback no longer receives notifications."""
        callback = MagicMock()
        manager.subscribe("session-1", callback)
        manager.unsubscribe("session-1", callback)

        await manager.notify("session-1", NotificationType.PERMISSION_NEEDED)

        callback.assert_not_called()

    @pytest.mark.asyncio
    async def test_unsubscribe_nonexistent_callback(self, manager):
        """Unsubscribing non-existent callback doesn't raise."""
        callback = MagicMock()
        # Should not raise
        manager.unsubscribe("session-1", callback)

    @pytest.mark.asyncio
    async def test_unsubscribe_from_nonexistent_session(self, manager):
        """Unsubscribing from non-existent session doesn't raise."""
        callback = MagicMock()
        # Should not raise
        manager.unsubscribe("nonexistent", callback)


class TestNotificationManagerGlobalSubscribers:
    """Tests for NotificationManager global subscriber functionality."""

    @pytest.fixture
    def manager(self):
        """Create a fresh NotificationManager instance."""
        return NotificationManager()

    @pytest.mark.asyncio
    async def test_global_subscriber_receives_all_notifications(self, manager):
        """Global subscriber receives notifications for all sessions."""
        callback = MagicMock()
        manager.subscribe_global(callback)

        await manager.notify("session-1", NotificationType.IDLE)
        await manager.notify("session-2", NotificationType.PERMISSION_NEEDED)

        assert callback.call_count == 2

    @pytest.mark.asyncio
    async def test_global_and_session_subscriber_both_receive(self, manager):
        """Both session and global subscribers receive notifications."""
        session_callback = MagicMock()
        global_callback = MagicMock()
        manager.subscribe("session-1", session_callback)
        manager.subscribe_global(global_callback)

        await manager.notify("session-1", NotificationType.IDLE)

        session_callback.assert_called_once()
        global_callback.assert_called_once()

    @pytest.mark.asyncio
    async def test_unsubscribe_global_stops_notifications(self, manager):
        """Unsubscribed global callback no longer receives notifications."""
        callback = MagicMock()
        manager.subscribe_global(callback)
        manager.unsubscribe_global(callback)

        await manager.notify("session-1", NotificationType.PERMISSION_NEEDED)

        callback.assert_not_called()

    @pytest.mark.asyncio
    async def test_unsubscribe_global_nonexistent(self, manager):
        """Unsubscribing non-existent global callback doesn't raise."""
        callback = MagicMock()
        # Should not raise
        manager.unsubscribe_global(callback)


class TestNotificationManagerAsyncCallbacks:
    """Tests for NotificationManager async callback handling."""

    @pytest.fixture
    def manager(self):
        """Create a fresh NotificationManager instance."""
        return NotificationManager()

    @pytest.mark.asyncio
    async def test_async_callback_is_awaited(self, manager):
        """Async callbacks are properly awaited."""
        called = []

        async def async_callback(notification):
            await asyncio.sleep(0.01)
            called.append(notification)

        manager.subscribe("session-1", async_callback)
        await manager.notify("session-1", NotificationType.IDLE)

        assert len(called) == 1
        assert called[0].session_id == "session-1"

    @pytest.mark.asyncio
    async def test_sync_callback_works(self, manager):
        """Sync callbacks work correctly."""
        called = []

        def sync_callback(notification):
            called.append(notification)

        manager.subscribe("session-1", sync_callback)
        await manager.notify("session-1", NotificationType.IDLE)

        assert len(called) == 1

    @pytest.mark.asyncio
    async def test_callback_exception_is_logged_not_raised(self, manager):
        """Exceptions in callbacks are logged but don't stop other callbacks."""
        called = []

        def failing_callback(notification):
            raise ValueError("Test error")

        def success_callback(notification):
            called.append(notification)

        manager.subscribe("session-1", failing_callback)
        manager.subscribe("session-1", success_callback)

        # Should not raise
        await manager.notify("session-1", NotificationType.IDLE)

        # Success callback should still be called
        assert len(called) == 1

    @pytest.mark.asyncio
    async def test_async_callback_exception_is_handled(self, manager):
        """Exceptions in async callbacks are logged but don't stop other callbacks."""
        called = []

        async def failing_callback(notification):
            raise ValueError("Async test error")

        def success_callback(notification):
            called.append(notification)

        manager.subscribe("session-1", failing_callback)
        manager.subscribe("session-1", success_callback)

        # Should not raise
        await manager.notify("session-1", NotificationType.IDLE)

        # Success callback should still be called
        assert len(called) == 1


class TestNotificationManagerCleanup:
    """Tests for NotificationManager cleanup functionality."""

    @pytest.fixture
    def manager(self):
        """Create a fresh NotificationManager instance."""
        return NotificationManager()

    @pytest.mark.asyncio
    async def test_cleanup_session_removes_state(self, manager):
        """cleanup_session() removes session state."""
        await manager.notify("session-1", NotificationType.IDLE)
        manager.cleanup_session("session-1")

        assert manager.get_state("session-1") is None

    def test_cleanup_session_removes_subscribers(self, manager):
        """cleanup_session() removes session subscribers."""
        callback = MagicMock()
        manager.subscribe("session-1", callback)
        manager.cleanup_session("session-1")

        assert "session-1" not in manager._subscribers

    def test_cleanup_nonexistent_session(self, manager):
        """cleanup_session() for non-existent session doesn't raise."""
        # Should not raise
        manager.cleanup_session("nonexistent")


class TestNotificationManagerConcurrency:
    """Tests for NotificationManager race condition handling."""

    @pytest.fixture
    def manager(self):
        """Create a fresh NotificationManager instance."""
        return NotificationManager()

    @pytest.mark.asyncio
    async def test_concurrent_notifications_different_sessions(self, manager):
        """Concurrent notifications to different sessions work correctly."""
        callbacks = {
            "session-1": MagicMock(),
            "session-2": MagicMock(),
        }
        manager.subscribe("session-1", callbacks["session-1"])
        manager.subscribe("session-2", callbacks["session-2"])

        await asyncio.gather(
            manager.notify("session-1", NotificationType.IDLE),
            manager.notify("session-2", NotificationType.PERMISSION_NEEDED),
        )

        callbacks["session-1"].assert_called_once()
        callbacks["session-2"].assert_called_once()

    @pytest.mark.asyncio
    async def test_subscriber_list_snapshot_during_notify(self, manager):
        """
        Verify that subscribers are snapshotted during notify().

        This tests the race condition fix: if a callback modifies the subscriber
        list (e.g., by unsubscribing), it shouldn't affect the current notify() call.
        """
        called = []

        def callback1(notification):
            called.append("callback1")
            # Try to unsubscribe callback2 during notification
            manager.unsubscribe("session-1", callback2)

        def callback2(notification):
            called.append("callback2")

        manager.subscribe("session-1", callback1)
        manager.subscribe("session-1", callback2)

        await manager.notify("session-1", NotificationType.IDLE)

        # Both callbacks should have been called because we snapshot the list
        assert "callback1" in called
        assert "callback2" in called

    @pytest.mark.asyncio
    async def test_global_subscriber_list_snapshot_during_notify(self, manager):
        """
        Verify that global subscribers are snapshotted during notify().
        """
        called = []

        def callback1(notification):
            called.append("callback1")
            # Try to unsubscribe callback2 during notification
            manager.unsubscribe_global(callback2)

        def callback2(notification):
            called.append("callback2")

        manager.subscribe_global(callback1)
        manager.subscribe_global(callback2)

        await manager.notify("session-1", NotificationType.IDLE)

        # Both callbacks should have been called because we snapshot the list
        assert "callback1" in called
        assert "callback2" in called

    @pytest.mark.asyncio
    async def test_add_subscriber_during_notify(self, manager):
        """
        Verify that adding a subscriber during notify() doesn't affect current notification.
        """
        called = []
        late_callback = MagicMock()

        def callback1(notification):
            called.append("callback1")
            # Try to add a new subscriber during notification
            manager.subscribe("session-1", late_callback)

        manager.subscribe("session-1", callback1)

        await manager.notify("session-1", NotificationType.IDLE)

        # Original callback was called
        assert "callback1" in called
        # Late callback was NOT called for this notification (snapshot taken before)
        late_callback.assert_not_called()

        # But late callback should be called for the next notification
        await manager.notify("session-1", NotificationType.PERMISSION_NEEDED)
        late_callback.assert_called_once()


class TestNotificationManagerNotificationData:
    """Tests for NotificationManager notification data handling."""

    @pytest.fixture
    def manager(self):
        """Create a fresh NotificationManager instance."""
        return NotificationManager()

    @pytest.mark.asyncio
    async def test_notify_passes_data_to_notification(self, manager):
        """notify() passes data to the notification object."""
        callback = MagicMock()
        manager.subscribe("session-1", callback)

        await manager.notify(
            "session-1",
            NotificationType.IDLE,
            data={"idle_time": 30, "message": "waiting for input"},
        )

        notification = callback.call_args[0][0]
        assert notification.data["idle_time"] == 30
        assert notification.data["message"] == "waiting for input"

    @pytest.mark.asyncio
    async def test_notify_with_none_data(self, manager):
        """notify() with None data results in empty dict."""
        callback = MagicMock()
        manager.subscribe("session-1", callback)

        await manager.notify("session-1", NotificationType.IDLE, data=None)

        notification = callback.call_args[0][0]
        assert notification.data == {}
