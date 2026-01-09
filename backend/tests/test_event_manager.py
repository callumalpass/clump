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
        # The enum value can be accessed directly or via .value
        assert EventType.SESSION_CREATED.value == "session_created"


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
        await manager.subscribe(callback)

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
        await manager.subscribe(callback)

        await manager.emit(EventType.PROCESS_STARTED)

        callback.assert_called_once()

    @pytest.mark.asyncio
    async def test_emit_calls_multiple_subscribers(self):
        """emit() calls all registered subscribers."""
        manager = EventManager()
        callback1 = MagicMock()
        callback2 = AsyncMock()
        callback3 = MagicMock()
        await manager.subscribe(callback1)
        await manager.subscribe(callback2)
        await manager.subscribe(callback3)

        await manager.emit(EventType.SESSION_UPDATED)

        callback1.assert_called_once()
        callback2.assert_called_once()
        callback3.assert_called_once()

    @pytest.mark.asyncio
    async def test_emit_without_data(self):
        """emit() works without data parameter."""
        manager = EventManager()
        callback = MagicMock()
        await manager.subscribe(callback)

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
        await manager.subscribe(callback_error)
        await manager.subscribe(callback_ok)

        # Should not raise, and should continue to other callbacks
        await manager.emit(EventType.SESSION_CREATED)

        callback_error.assert_called_once()
        callback_ok.assert_called_once()


class TestEventManagerSubscribe:
    """Tests for EventManager.subscribe() method."""

    @pytest.mark.asyncio
    async def test_subscribe_adds_callback(self):
        """subscribe() adds callback to subscribers list."""
        manager = EventManager()
        callback = MagicMock()

        await manager.subscribe(callback)

        assert callback in manager._subscribers
        assert len(manager._subscribers) == 1

    @pytest.mark.asyncio
    async def test_subscribe_multiple_callbacks(self):
        """subscribe() can add multiple callbacks."""
        manager = EventManager()
        callback1 = MagicMock()
        callback2 = MagicMock()

        await manager.subscribe(callback1)
        await manager.subscribe(callback2)

        assert len(manager._subscribers) == 2
        assert callback1 in manager._subscribers
        assert callback2 in manager._subscribers

    @pytest.mark.asyncio
    async def test_subscribe_same_callback_twice(self):
        """subscribe() allows adding the same callback twice."""
        manager = EventManager()
        callback = MagicMock()

        await manager.subscribe(callback)
        await manager.subscribe(callback)

        # Both are added (no deduplication)
        assert len(manager._subscribers) == 2


class TestEventManagerUnsubscribe:
    """Tests for EventManager.unsubscribe() method."""

    @pytest.mark.asyncio
    async def test_unsubscribe_removes_callback(self):
        """unsubscribe() removes callback from subscribers list."""
        manager = EventManager()
        callback = MagicMock()
        await manager.subscribe(callback)

        await manager.unsubscribe(callback)

        assert callback not in manager._subscribers
        assert len(manager._subscribers) == 0

    @pytest.mark.asyncio
    async def test_unsubscribe_nonexistent_callback(self):
        """unsubscribe() handles nonexistent callback gracefully."""
        manager = EventManager()
        callback = MagicMock()

        # Should not raise
        await manager.unsubscribe(callback)

    @pytest.mark.asyncio
    async def test_unsubscribe_removes_only_first_occurrence(self):
        """unsubscribe() removes only first occurrence if duplicated."""
        manager = EventManager()
        callback = MagicMock()
        await manager.subscribe(callback)
        await manager.subscribe(callback)

        await manager.unsubscribe(callback)

        # Only one should be removed
        assert len(manager._subscribers) == 1

    @pytest.mark.asyncio
    async def test_unsubscribed_callback_not_called(self):
        """Unsubscribed callback is not called on emit."""
        manager = EventManager()
        callback = MagicMock()
        await manager.subscribe(callback)
        await manager.unsubscribe(callback)

        await manager.emit(EventType.SESSION_CREATED)

        callback.assert_not_called()


class TestEventManagerEmitCountsChanged:
    """Tests for EventManager.emit_counts_changed() debouncing."""

    @pytest.mark.asyncio
    async def test_emit_counts_changed_debounces(self):
        """emit_counts_changed() debounces multiple rapid calls."""
        manager = EventManager()
        callback = AsyncMock()
        await manager.subscribe(callback)

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
        await manager.subscribe(callback)

        await manager.emit_counts_changed({"repo1": {"total": 5}})
        await asyncio.sleep(0.15)

        assert manager._pending_counts is None
        assert manager._counts_task is None

    @pytest.mark.asyncio
    async def test_emit_counts_changed_cancels_previous_task(self):
        """emit_counts_changed() cancels previous debounce task."""
        manager = EventManager()
        callback = AsyncMock()
        await manager.subscribe(callback)

        await manager.emit_counts_changed({"repo1": {"total": 1}})
        first_task = manager._counts_task

        await manager.emit_counts_changed({"repo1": {"total": 2}})
        second_task = manager._counts_task

        # First task should be in cancelling state (cancel was requested)
        # Note: cancelled() only returns True after the task fully processes CancelledError
        assert first_task.cancelling() > 0 or first_task.cancelled()
        assert second_task is not first_task

    @pytest.mark.asyncio
    async def test_emit_counts_changed_emits_correct_event_type(self):
        """emit_counts_changed() emits COUNTS_CHANGED event type."""
        manager = EventManager()
        callback = AsyncMock()
        await manager.subscribe(callback)

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

        await manager.subscribe(callback)

        await manager.emit(EventType.SESSION_CREATED, {"id": "1"})
        await manager.emit(EventType.SESSION_UPDATED, {"id": "1"})

        await manager.unsubscribe(callback)

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

        await manager.subscribe(callback)

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

        await manager.subscribe(callback)

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

        await manager.subscribe(sync_callback)
        await manager.subscribe(async_callback)

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

        await manager.subscribe(slow_callback)

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


class TestEventManagerThreadSafety:
    """Tests for thread-safety of EventManager."""

    @pytest.mark.asyncio
    async def test_concurrent_subscribe_and_emit(self):
        """Subscribe and emit can run concurrently without race conditions."""
        manager = EventManager()
        received_events = []
        lock = asyncio.Lock()

        async def callback(event):
            async with lock:
                received_events.append(event)

        # Subscribe first callback
        await manager.subscribe(callback)

        # Create tasks that subscribe new callbacks and emit events concurrently
        async def subscribe_task():
            for _ in range(10):
                await manager.subscribe(MagicMock())
                await asyncio.sleep(0)

        async def emit_task():
            for i in range(10):
                await manager.emit(EventType.SESSION_CREATED, {"id": str(i)})
                await asyncio.sleep(0)

        # Run concurrently - should not raise any exceptions
        await asyncio.gather(
            subscribe_task(),
            emit_task(),
        )

        # Verify events were received
        assert len(received_events) >= 1

    @pytest.mark.asyncio
    async def test_concurrent_unsubscribe_and_emit(self):
        """Unsubscribe and emit can run concurrently without race conditions."""
        manager = EventManager()
        received_events = []
        lock = asyncio.Lock()
        callbacks = []

        async def callback(event):
            async with lock:
                received_events.append(event)

        # Add multiple callbacks
        for _ in range(10):
            cb = MagicMock()
            callbacks.append(cb)
            await manager.subscribe(cb)

        # Add main callback
        await manager.subscribe(callback)

        # Create tasks that unsubscribe callbacks and emit events concurrently
        async def unsubscribe_task():
            for cb in callbacks:
                await manager.unsubscribe(cb)
                await asyncio.sleep(0)

        async def emit_task():
            for i in range(10):
                await manager.emit(EventType.SESSION_CREATED, {"id": str(i)})
                await asyncio.sleep(0)

        # Run concurrently - should not raise any exceptions
        await asyncio.gather(
            unsubscribe_task(),
            emit_task(),
        )

        # Verify our main callback still received events
        assert len(received_events) >= 1

    @pytest.mark.asyncio
    async def test_emit_uses_snapshot(self):
        """emit() uses a snapshot of subscribers, so unsubscribe during emit doesn't affect current emit."""
        manager = EventManager()
        call_order = []

        async def callback1(event):
            call_order.append("callback1_start")
            # Unsubscribe callback2 during emit - should not affect this emit
            await manager.unsubscribe(callback2)
            call_order.append("callback1_end")

        def callback2(event):
            call_order.append("callback2")

        await manager.subscribe(callback1)
        await manager.subscribe(callback2)

        await manager.emit(EventType.SESSION_CREATED)

        # Both callbacks should have been called because emit uses a snapshot
        assert "callback1_start" in call_order
        assert "callback1_end" in call_order
        assert "callback2" in call_order


class TestEventManagerDebounceEdgeCases:
    """Tests for edge cases in debounced counts emission."""

    @pytest.mark.asyncio
    async def test_cancelled_task_propagates_error(self):
        """Cancelled debounce task properly re-raises CancelledError.

        This ensures proper task cancellation semantics - suppressing CancelledError
        can lead to subtle bugs where tasks appear to complete successfully but
        actually didn't do their work.
        """
        manager = EventManager()

        await manager.emit_counts_changed({"repo1": {"total": 1}})
        task = manager._counts_task
        assert task is not None

        # Cancel the task
        task.cancel()

        # The task should raise CancelledError when awaited
        with pytest.raises(asyncio.CancelledError):
            await task

    @pytest.mark.asyncio
    async def test_rapid_successive_emissions(self):
        """Rapid successive emissions only result in one final emit."""
        manager = EventManager()
        callback = AsyncMock()
        await manager.subscribe(callback)

        # Emit 10 times rapidly
        for i in range(10):
            await manager.emit_counts_changed({"repo1": {"total": i}})

        # Wait for debounce
        await asyncio.sleep(0.15)

        # Should only be called once with the last value
        assert callback.call_count == 1
        event = callback.call_args[0][0]
        assert event.data["counts"]["repo1"]["total"] == 9

    @pytest.mark.asyncio
    async def test_pending_counts_preserved_after_cancellation(self):
        """Pending counts are preserved when a task is cancelled.

        When a task is cancelled by emit_counts_changed, the new task
        should still have access to the (updated) pending counts.
        """
        manager = EventManager()
        callback = AsyncMock()
        await manager.subscribe(callback)

        # First emission
        await manager.emit_counts_changed({"repo1": {"total": 1}})

        # Second emission (cancels first task)
        await manager.emit_counts_changed({"repo1": {"total": 2}})

        # Pending counts should be the newer value
        assert manager._pending_counts == {"repo1": {"total": 2}}

        # Wait for final emit
        await asyncio.sleep(0.15)

        # Should emit the latest value
        event = callback.call_args[0][0]
        assert event.data["counts"]["repo1"]["total"] == 2

    @pytest.mark.asyncio
    async def test_no_emit_after_cancelled_without_replacement(self):
        """A cancelled task without replacement does not emit.

        If a debounce task is cancelled externally (not via emit_counts_changed),
        it should not emit anything. This tests the explicit cancellation path.
        """
        manager = EventManager()
        callback = AsyncMock()
        await manager.subscribe(callback)

        await manager.emit_counts_changed({"repo1": {"total": 1}})
        task = manager._counts_task

        # Cancel the task directly (not via emit_counts_changed)
        task.cancel()

        # Wait for the cancellation to complete
        try:
            await task
        except asyncio.CancelledError:
            pass

        # Wait longer than debounce period
        await asyncio.sleep(0.15)

        # No emit should have occurred
        callback.assert_not_called()

    @pytest.mark.asyncio
    async def test_task_reference_replaced_before_cancellation(self):
        """New task reference is set before old task is cancelled.

        This ensures there's no race condition where _counts_task could be None
        between cancellation and new task creation.
        """
        manager = EventManager()

        await manager.emit_counts_changed({"repo1": {"total": 1}})
        old_task = manager._counts_task

        await manager.emit_counts_changed({"repo1": {"total": 2}})
        new_task = manager._counts_task

        # New task should be different from old
        assert new_task is not old_task
        assert new_task is not None

        # Old task should be cancelled or cancelling
        assert old_task.cancelling() > 0 or old_task.cancelled() or old_task.done()

    @pytest.mark.asyncio
    async def test_concurrent_emit_counts_changed(self):
        """Concurrent emit_counts_changed calls are handled safely."""
        manager = EventManager()
        callback = AsyncMock()
        await manager.subscribe(callback)

        # Launch many concurrent emissions
        async def emit_count(i):
            await manager.emit_counts_changed({"repo1": {"total": i}})

        await asyncio.gather(*[emit_count(i) for i in range(20)])

        # Wait for debounce
        await asyncio.sleep(0.15)

        # Should have emitted exactly once (debounced)
        assert callback.call_count == 1

    @pytest.mark.asyncio
    async def test_emit_after_long_gap(self):
        """Emissions separated by more than debounce delay emit separately."""
        manager = EventManager()
        callback = AsyncMock()
        await manager.subscribe(callback)

        # First emission
        await manager.emit_counts_changed({"repo1": {"total": 1}})
        await asyncio.sleep(0.15)  # Wait for debounce

        # Second emission after gap
        await manager.emit_counts_changed({"repo1": {"total": 2}})
        await asyncio.sleep(0.15)  # Wait for debounce

        # Should have emitted twice
        assert callback.call_count == 2

    @pytest.mark.asyncio
    async def test_state_cleared_after_successful_emit(self):
        """_pending_counts and _counts_task are cleared after successful emit."""
        manager = EventManager()
        callback = AsyncMock()
        await manager.subscribe(callback)

        await manager.emit_counts_changed({"repo1": {"total": 1}})
        await asyncio.sleep(0.15)

        assert manager._pending_counts is None
        assert manager._counts_task is None

    @pytest.mark.asyncio
    async def test_empty_counts_dict(self):
        """Empty counts dict is handled correctly."""
        manager = EventManager()
        callback = AsyncMock()
        await manager.subscribe(callback)

        await manager.emit_counts_changed({})
        await asyncio.sleep(0.15)

        callback.assert_called_once()
        event = callback.call_args[0][0]
        assert event.data["counts"] == {}

    @pytest.mark.asyncio
    async def test_none_values_in_counts(self):
        """Counts dict with None values is handled correctly."""
        manager = EventManager()
        callback = AsyncMock()
        await manager.subscribe(callback)

        await manager.emit_counts_changed({"repo1": None, "repo2": {"total": 5}})
        await asyncio.sleep(0.15)

        event = callback.call_args[0][0]
        assert event.data["counts"]["repo1"] is None
        assert event.data["counts"]["repo2"]["total"] == 5


class TestEventManagerAsyncCallbackErrors:
    """Tests for error handling in async callbacks."""

    @pytest.mark.asyncio
    async def test_async_callback_exception_does_not_stop_others(self):
        """Exception in async callback doesn't prevent other callbacks from running."""
        manager = EventManager()
        results = []

        async def failing_callback(event):
            raise ValueError("Async callback failed")

        async def successful_callback(event):
            results.append("success")

        await manager.subscribe(failing_callback)
        await manager.subscribe(successful_callback)

        # Should not raise
        await manager.emit(EventType.SESSION_CREATED)

        # Successful callback should still run
        assert "success" in results

    @pytest.mark.asyncio
    async def test_callback_returning_coroutine_is_awaited(self):
        """Callback that returns a coroutine has it awaited."""
        manager = EventManager()
        results = []

        async def coro_callback(event):
            await asyncio.sleep(0.01)
            results.append("awaited")

        await manager.subscribe(coro_callback)
        await manager.emit(EventType.SESSION_CREATED)

        # Should have awaited the coroutine
        assert "awaited" in results


class TestEventManagerGlobalInstance:
    """Tests for the global event_manager instance."""

    def test_global_instance_exists(self):
        """Global event_manager instance exists and is an EventManager."""
        from app.services.event_manager import event_manager

        assert event_manager is not None
        assert isinstance(event_manager, EventManager)

    def test_global_instance_initialized(self):
        """Global event_manager is properly initialized."""
        from app.services.event_manager import event_manager

        assert hasattr(event_manager, '_subscribers')
        assert hasattr(event_manager, '_lock')
        assert hasattr(event_manager, '_pending_counts')
        assert hasattr(event_manager, '_counts_task')
