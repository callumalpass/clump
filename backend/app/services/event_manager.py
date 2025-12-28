"""
Event Manager for real-time WebSocket event broadcasting.

Handles broadcasting of session, process, and count events to connected WebSocket clients.
Replaces polling with push-based updates.
"""

import asyncio
import logging

logger = logging.getLogger(__name__)
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Callable, Any


class EventType(str, Enum):
    """Types of events that can be broadcast."""
    # Session events
    SESSION_CREATED = "session_created"
    SESSION_UPDATED = "session_updated"
    SESSION_COMPLETED = "session_completed"
    SESSION_DELETED = "session_deleted"
    # Process events
    PROCESS_STARTED = "process_started"
    PROCESS_ENDED = "process_ended"
    # Count events
    COUNTS_CHANGED = "counts_changed"


@dataclass
class Event:
    """A broadcast event."""
    type: EventType
    data: dict = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "type": self.type.value,
            **self.data,
            "timestamp": self.timestamp.isoformat(),
        }


class EventManager:
    """
    Manages event broadcasting to WebSocket subscribers.

    Simple pub-sub pattern - all subscribers receive all events.
    The frontend filters/handles events as needed.
    """

    def __init__(self):
        self._subscribers: list[Callable[[Event], Any]] = []
        self._lock = asyncio.Lock()
        # Debounce state for counts_changed events
        self._counts_pending = False
        self._counts_task: asyncio.Task | None = None

    async def emit(
        self,
        event_type: EventType,
        data: dict | None = None,
    ) -> None:
        """
        Broadcast an event to all subscribers.
        """
        event = Event(
            type=event_type,
            data=data or {},
        )

        subscriber_count = len(self._subscribers)
        if subscriber_count == 0:
            logger.debug(f"Event {event_type.value} emitted but no subscribers connected")
        else:
            logger.debug(f"Broadcasting {event_type.value} to {subscriber_count} subscriber(s)")

        # Notify all subscribers
        for callback in self._subscribers:
            try:
                result = callback(event)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.error(f"Event callback error: {e}")

    async def emit_counts_changed(self, counts: dict) -> None:
        """
        Emit counts_changed event with debouncing.

        Multiple rapid count changes (e.g., during bulk operations)
        are coalesced into a single event after 100ms.
        """
        async with self._lock:
            self._pending_counts = counts

            if self._counts_task is not None:
                # Cancel existing debounce task
                self._counts_task.cancel()

            # Schedule debounced emit
            self._counts_task = asyncio.create_task(self._debounced_counts_emit())

    async def _debounced_counts_emit(self) -> None:
        """Emit counts after debounce delay."""
        try:
            await asyncio.sleep(0.1)  # 100ms debounce
            async with self._lock:
                counts = getattr(self, '_pending_counts', None)
                if counts is not None:
                    await self.emit(EventType.COUNTS_CHANGED, {"counts": counts})
                    self._pending_counts = None
                    self._counts_task = None
        except asyncio.CancelledError:
            pass

    def subscribe(self, callback: Callable[[Event], Any]) -> None:
        """Subscribe to all events."""
        self._subscribers.append(callback)

    def unsubscribe(self, callback: Callable[[Event], Any]) -> None:
        """Unsubscribe from events."""
        try:
            self._subscribers.remove(callback)
        except ValueError:
            pass


# Global event manager instance
event_manager = EventManager()
