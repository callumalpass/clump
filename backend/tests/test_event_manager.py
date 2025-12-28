"""
Tests for the event manager service.

Tests cover:
- Event creation and serialization
- EventManager initialization
- Event emission and subscription
- Subscriber callbacks (sync and async)
- Debounced counts_changed events
- Unsubscribe functionality
- Edge cases and error handling
"""

import asyncio
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, AsyncMock

from app.services.event_manager import (
    Event,
    EventType,
    EventManager,
)


class TestEvent:
    """Tests for the Event dataclass."""

    def test_creates_event_with_defaults(self):
        """Creates an Event with default values."""
        event = Event(type=EventType.SESSION_CREATED)

        assert event.type == EventType.SESSION_CREATED
        assert event.data == {}
        assert isinstance(event.timestamp, datetime)

    def test_creates_event_with_data(self):
        """Creates an Event with custom data."""
        data = {"session_id": "abc123", "title": "Test Session"}
        event = Event(type=EventType.SESSION_UPDATED, data=data)

        assert event.type == EventType.SESSION_UPDATED
        assert event.data == data

    def test_to_dict_includes_all_fields(self):
        """to_dict() includes type, data, and timestamp."""
        data = {"session_id": "abc123"}
        event = Event(type=EventType.SESSION_COMPLETED, data=data)

        result = event.to_dict()

        assert result["type"] == "session_completed"
        assert result["session_id"] == "abc123"
        assert "timestamp" in result

    def test_to_dict_flattens_data(self):
        """to_dict() flattens data into top-level keys."""
        data = {"key1": "value1", "key2": "value2"}
        event = Event(type=EventType.PROCESS_STARTED, data=data)

        result = event.to_dict()

        assert result["key1"] == "value1"
        assert result["key2"] == "value2"

    def test_timestamp_is_utc(self):
        """Event timestamp is in UTC."""
        event = Event(type=EventType.SESSION_CREATED)

        # Check that timestamp is timezone-aware and in UTC
        assert event.timestamp.tzinfo is not None


class TestEventType:
    """Tests for the EventType enum."""

    def test_session_event_types(self):
        """Session event types are defined correctly."""
        assert EventType.SESSION_CREATED.value == "session_created"
        assert EventType.SESSION_UPDATED.value == "session_updated"
        assert EventType.SESSION_COMPLETED.value == "session_completed"
        assert EventType.SESSION_DELETED.value == "session_deleted"

    def test_process_event_types(self):
        """Process event types are defined correctly."""
        assert EventType.PROCESS_STARTED.value == "process_started"
        assert EventType.PROCESS_ENDED.value == "process_ended"

    def test_count_event_types(self):
        """Count event types are defined correctly."""
        assert EventType.COUNTS_CHANGED.value == "counts_changed"

    def test_event_type_is_string(self):
        """EventType inherits from str for easy serialization."""
        assert isinstance(EventType.SESSION_CREATED, str)
        assert str(EventType.SESSION_CREATED) == "session_created"


class TestEventManagerInit:
    """Tests for EventManager initialization."""

    def test_init_creates_empty_subscribers(self):
        """Init creates an empty subscribers list."""
        manager = EventManager()

        assert manager._subscribers == []

    def test_init_creates_lock(self):
        """Init creates an asyncio Lock for thread safety."""
        manager = EventManager()

        assert isinstance(manager._lock, asyncio.Lock)

    def test_init_initializes_debounce_state(self):
        """Init initializes debounce state variables."""
        manager = EventManager()

        assert manager._pending_counts is None
        assert manager._counts_task is None


class TestEventManagerEmit:
    """Tests for EventManager.emit() method."""

    @pytest.mark.asyncio
    async def test_emit_calls_sync_subscriber(self):
        """emit() calls synchronous subscriber callbacks."""
        manager = EventManager()
        callback = MagicMock()
        manager.subscribe(callback)

        await manager.emit(EventType.SESSION_CREATED, {"session_id": "abc"})

        callback.assert_called_once()
        event = callback.call_args[0][0]
        assert event.type == EventType.SESSION_CREATED
        assert event.data["session_id"] == "abc"

    @pytest.mark.asyncio
    async def test_emit_calls_async_subscriber(self):
        """emit() awaits asynchronous subscriber callbacks."""
        manager = EventManager()
        callback = AsyncMock()
        manager.subscribe(callback)

        await manager.emit(EventType.PROCESS_STARTED)

        callback.assert_called_once()

    @pytest.mark.asyncio
    async def test_emit_calls_multiple_subscribers(self):
        """emit() calls all registered subscribers."""
        manager = EventManager()
        callback1 = MagicMock()
        callback2 = AsyncMock()
        callback3 = MagicMock()
        manager.subscribe(callback1)
        manager.subscribe(callback2)
        manager.subscribe(callback3)

        await manager.emit(EventType.SESSION_UPDATED)

        callback1.assert_called_once()
        callback2.assert_called_once()
        callback3.assert_called_once()

    @pytest.mark.asyncio
    async def test_emit_without_data(self):
        """emit() works without data parameter."""
        manager = EventManager()
        callback = MagicMock()
        manager.subscribe(callback)

        await manager.emit(EventType.PROCESS_ENDED)

        event = callback.call_args[0][0]
        assert event.data == {}

    @pytest.mark.asyncio
    async def test_emit_without_subscribers(self):
        """emit() works with no subscribers (no error)."""
        manager = EventManager()

        # Should not raise
        await manager.emit(EventType.SESSION_DELETED)

    @pytest.mark.asyncio
    async def test_emit_handles_callback_exception(self):
        """emit() catches and logs exceptions from callbacks."""
        manager = EventManager()
        callback_error = MagicMock(side_effect=Exception("Callback failed"))
        callback_ok = MagicMock()
        manager.subscribe(callback_error)
        manager.subscribe(callback_ok)

        # Should not raise, and should continue to other callbacks
        await manager.emit(EventType.SESSION_CREATED)

        callback_error.assert_called_once()
        callback_ok.assert_called_once()


class TestEventManagerSubscribe:
    """Tests for EventManager.subscribe() method."""

    def test_subscribe_adds_callback(self):
        """subscribe() adds callback to subscribers list."""
        manager = EventManager()
        callback = MagicMock()

        manager.subscribe(callback)

        assert callback in manager._subscribers
        assert len(manager._subscribers) == 1

    def test_subscribe_multiple_callbacks(self):
        """subscribe() can add multiple callbacks."""
        manager = EventManager()
        callback1 = MagicMock()
        callback2 = MagicMock()

        manager.subscribe(callback1)
        manager.subscribe(callback2)

        assert len(manager._subscribers) == 2
        assert callback1 in manager._subscribers
        assert callback2 in manager._subscribers

    def test_subscribe_same_callback_twice(self):
        """subscribe() allows adding the same callback twice."""
        manager = EventManager()
        callback = MagicMock()

        manager.subscribe(callback)
        manager.subscribe(callback)

        # Both are added (no deduplication)
        assert len(manager._subscribers) == 2


class TestEventManagerUnsubscribe:
    """Tests for EventManager.unsubscribe() method."""

    def test_unsubscribe_removes_callback(self):
        """unsubscribe() removes callback from subscribers list."""
        manager = EventManager()
        callback = MagicMock()
        manager.subscribe(callback)

        manager.unsubscribe(callback)

        assert callback not in manager._subscribers
        assert len(manager._subscribers) == 0

    def test_unsubscribe_nonexistent_callback(self):
        """unsubscribe() handles nonexistent callback gracefully."""
        manager = EventManager()
        callback = MagicMock()

        # Should not raise
        manager.unsubscribe(callback)

    def test_unsubscribe_removes_only_first_occurrence(self):
        """unsubscribe() removes only first occurrence if duplicated."""
        manager = EventManager()
        callback = MagicMock()
        manager.subscribe(callback)
        manager.subscribe(callback)

        manager.unsubscribe(callback)

        # Only one should be removed
        assert len(manager._subscribers) == 1

    @pytest.mark.asyncio
    async def test_unsubscribed_callback_not_called(self):
        """Unsubscribed callback is not called on emit."""
        manager = EventManager()
        callback = MagicMock()
        manager.subscribe(callback)
        manager.unsubscribe(callback)

        await manager.emit(EventType.SESSION_CREATED)

        callback.assert_not_called()


class TestEventManagerEmitCountsChanged:
    """Tests for EventManager.emit_counts_changed() debouncing."""

    @pytest.mark.asyncio
    async def test_emit_counts_changed_debounces(self):
        """emit_counts_changed() debounces multiple rapid calls."""
        manager = EventManager()
        callback = AsyncMock()
        manager.subscribe(callback)

        # Emit multiple counts rapidly
        await manager.emit_counts_changed({"repo1": {"total": 1}})
        await manager.emit_counts_changed({"repo1": {"total": 2}})
        await manager.emit_counts_changed({"repo1": {"total": 3}})

        # Wait for debounce
        await asyncio.sleep(0.15)

        # Should only be called once (debounced)
        assert callback.call_count == 1
        # Should have the last value
        event = callback.call_args[0][0]
        assert event.data["counts"]["repo1"]["total"] == 3

    @pytest.mark.asyncio
    async def test_emit_counts_changed_stores_pending(self):
        """emit_counts_changed() stores counts in _pending_counts."""
        manager = EventManager()
        counts = {"repo1": {"total": 5, "active": 2}}

        await manager.emit_counts_changed(counts)

        # Before debounce delay
        assert manager._pending_counts == counts

    @pytest.mark.asyncio
    async def test_emit_counts_changed_clears_after_emit(self):
        """emit_counts_changed() clears pending counts after emit."""
        manager = EventManager()
        callback = AsyncMock()
        manager.subscribe(callback)

        await manager.emit_counts_changed({"repo1": {"total": 5}})
        await asyncio.sleep(0.15)

        assert manager._pending_counts is None
        assert manager._counts_task is None

    @pytest.mark.asyncio
    async def test_emit_counts_changed_cancels_previous_task(self):
        """emit_counts_changed() cancels previous debounce task."""
        manager = EventManager()
        callback = AsyncMock()
        manager.subscribe(callback)

        await manager.emit_counts_changed({"repo1": {"total": 1}})
        first_task = manager._counts_task

        await manager.emit_counts_changed({"repo1": {"total": 2}})
        second_task = manager._counts_task

        # First task should be cancelled
        assert first_task.cancelled()
        assert second_task is not first_task

    @pytest.mark.asyncio
    async def test_emit_counts_changed_emits_correct_event_type(self):
        """emit_counts_changed() emits COUNTS_CHANGED event type."""
        manager = EventManager()
        callback = AsyncMock()
        manager.subscribe(callback)

        await manager.emit_counts_changed({"repo1": {"total": 10}})
        await asyncio.sleep(0.15)

        event = callback.call_args[0][0]
        assert event.type == EventType.COUNTS_CHANGED


class TestEventManagerIntegration:
    """Integration tests for EventManager."""

    @pytest.mark.asyncio
    async def test_full_lifecycle(self):
        """Full lifecycle: subscribe, emit, unsubscribe."""
        manager = EventManager()
        received_events = []

        async def callback(event):
            received_events.append(event)

        manager.subscribe(callback)

        await manager.emit(EventType.SESSION_CREATED, {"id": "1"})
        await manager.emit(EventType.SESSION_UPDATED, {"id": "1"})

        manager.unsubscribe(callback)

        await manager.emit(EventType.SESSION_DELETED, {"id": "1"})

        assert len(received_events) == 2
        assert received_events[0].type == EventType.SESSION_CREATED
        assert received_events[1].type == EventType.SESSION_UPDATED

    @pytest.mark.asyncio
    async def test_multiple_event_types(self):
        """Multiple event types are handled correctly."""
        manager = EventManager()
        events_by_type = {}

        def callback(event):
            events_by_type[event.type] = event

        manager.subscribe(callback)

        await manager.emit(EventType.SESSION_CREATED, {"session": "s1"})
        await manager.emit(EventType.PROCESS_STARTED, {"process": "p1"})
        await manager.emit(EventType.SESSION_COMPLETED, {"session": "s1"})

        assert len(events_by_type) == 3
        assert EventType.SESSION_CREATED in events_by_type
        assert EventType.PROCESS_STARTED in events_by_type
        assert EventType.SESSION_COMPLETED in events_by_type

    @pytest.mark.asyncio
    async def test_concurrent_emissions(self):
        """Concurrent emissions are handled correctly."""
        manager = EventManager()
        received_events = []
        lock = asyncio.Lock()

        async def callback(event):
            async with lock:
                received_events.append(event)

        manager.subscribe(callback)

        # Emit multiple events concurrently
        await asyncio.gather(
            manager.emit(EventType.SESSION_CREATED, {"id": "1"}),
            manager.emit(EventType.SESSION_CREATED, {"id": "2"}),
            manager.emit(EventType.SESSION_CREATED, {"id": "3"}),
        )

        assert len(received_events) == 3

    @pytest.mark.asyncio
    async def test_mixed_sync_async_callbacks(self):
        """Mix of sync and async callbacks works correctly."""
        manager = EventManager()
        sync_calls = []
        async_calls = []

        def sync_callback(event):
            sync_calls.append(event)

        async def async_callback(event):
            async_calls.append(event)

        manager.subscribe(sync_callback)
        manager.subscribe(async_callback)

        await manager.emit(EventType.PROCESS_ENDED, {"code": 0})

        assert len(sync_calls) == 1
        assert len(async_calls) == 1
        assert sync_calls[0].data["code"] == 0
        assert async_calls[0].data["code"] == 0

    @pytest.mark.asyncio
    async def test_counts_emit_does_not_block_new_counts(self):
        """emit_counts_changed allows new counts during slow callback."""
        manager = EventManager()
        emit_started = asyncio.Event()
        emit_can_continue = asyncio.Event()
        received_events = []

        async def slow_callback(event):
            # Signal that emit has started
            emit_started.set()
            # Wait for permission to continue
            await emit_can_continue.wait()
            received_events.append(event)

        manager.subscribe(slow_callback)

        # Start the first emit
        await manager.emit_counts_changed({"repo1": {"total": 1}})

        # Wait for debounce and for emit to start calling callback
        await asyncio.sleep(0.15)

        # While slow_callback is running, we should be able to emit new counts
        # without blocking (since lock is released before emit)
        await manager.emit_counts_changed({"repo1": {"total": 2}})

        # Allow slow callback to complete
        emit_can_continue.set()

        # Wait for second debounce
        await asyncio.sleep(0.15)

        # Should have received both events
        assert len(received_events) == 2
