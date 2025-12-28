"""
Notification Manager for Claude Code session events.

Tracks notification state per session and broadcasts events to WebSocket subscribers.
Used primarily to notify when Claude Code needs user attention (permission requests, idle).
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Callable, Any

logger = logging.getLogger(__name__)


class NotificationType(str, Enum):
    """Types of notifications that can be sent."""
    PERMISSION_NEEDED = "permission_needed"
    IDLE = "idle"  # Claude has been waiting for input
    SESSION_COMPLETED = "session_completed"
    SESSION_FAILED = "session_failed"


@dataclass
class Notification:
    """A notification event."""
    session_id: str  # Claude Code session ID
    type: NotificationType
    data: dict = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "session_id": self.session_id,
            "notification_type": self.type.value,
            "data": self.data,
            "timestamp": self.timestamp.isoformat(),
        }


class NotificationManager:
    """
    Manages notification state and broadcasts to subscribers.

    Subscribers are typically WebSocket connections that want to receive
    real-time notification updates for specific sessions.
    """

    def __init__(self):
        # Current notification state per session
        self._state: dict[str, NotificationType | None] = {}
        # Subscribers per session: session_id -> list of async callbacks
        self._subscribers: dict[str, list[Callable[[Notification], Any]]] = {}
        # Global subscribers (receive all notifications)
        self._global_subscribers: list[Callable[[Notification], Any]] = []
        self._lock = asyncio.Lock()

    async def _invoke_callback_safe(
        self,
        callback: Callable[[Notification], Any],
        notification: Notification,
        context: str,
    ) -> None:
        """
        Invoke a callback safely, handling both sync and async callbacks.

        Args:
            callback: The callback function to invoke
            notification: The notification to pass to the callback
            context: Description for logging on failure (e.g., "session abc123")
        """
        try:
            result = callback(notification)
            if asyncio.iscoroutine(result):
                await result
        except Exception:
            logger.exception("Notification callback failed for %s", context)

    async def notify(
        self,
        session_id: str,
        notification_type: NotificationType,
        data: dict | None = None,
    ) -> None:
        """
        Send a notification for a session.

        Avoids sending duplicate notifications of the same type.
        """
        async with self._lock:
            # Skip if already in this state (avoid duplicate notifications)
            if self._state.get(session_id) == notification_type:
                return

            self._state[session_id] = notification_type

        notification = Notification(
            session_id=session_id,
            type=notification_type,
            data=data or {},
        )

        # Notify session-specific subscribers
        subscribers = self._subscribers.get(session_id, [])
        for callback in subscribers:
            await self._invoke_callback_safe(
                callback, notification, f"session {session_id}"
            )

        # Notify global subscribers
        for callback in self._global_subscribers:
            await self._invoke_callback_safe(
                callback, notification, f"global subscriber (session {session_id})"
            )

    async def clear_attention(self, session_id: str) -> None:
        """
        Clear the attention/notification state for a session.

        Called when user focuses the session or interacts with it.
        """
        async with self._lock:
            self._state.pop(session_id, None)

    def get_state(self, session_id: str) -> NotificationType | None:
        """Get the current notification state for a session."""
        return self._state.get(session_id)

    def get_sessions_needing_attention(self) -> list[str]:
        """Get list of session IDs that currently need attention."""
        return [
            session_id
            for session_id, state in self._state.items()
            if state in (NotificationType.PERMISSION_NEEDED, NotificationType.IDLE)
        ]

    def subscribe(
        self,
        session_id: str,
        callback: Callable[[Notification], Any],
    ) -> None:
        """Subscribe to notifications for a specific session."""
        if session_id not in self._subscribers:
            self._subscribers[session_id] = []
        self._subscribers[session_id].append(callback)

    def unsubscribe(
        self,
        session_id: str,
        callback: Callable[[Notification], Any],
    ) -> None:
        """Unsubscribe from notifications for a specific session."""
        if session_id in self._subscribers:
            try:
                self._subscribers[session_id].remove(callback)
            except ValueError:
                pass

    def subscribe_global(self, callback: Callable[[Notification], Any]) -> None:
        """Subscribe to all notifications (for global UI updates)."""
        self._global_subscribers.append(callback)

    def unsubscribe_global(self, callback: Callable[[Notification], Any]) -> None:
        """Unsubscribe from global notifications."""
        try:
            self._global_subscribers.remove(callback)
        except ValueError:
            pass

    def cleanup_session(self, session_id: str) -> None:
        """Clean up all state and subscribers for a session."""
        self._state.pop(session_id, None)
        self._subscribers.pop(session_id, None)


# Global notification manager instance
notification_manager = NotificationManager()
