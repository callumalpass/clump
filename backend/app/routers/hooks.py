"""
Webhook endpoints for Claude Code hooks and real-time event streaming.

These endpoints receive notifications from Claude Code's hook system,
allowing the hub to track when Claude needs user attention.

The WebSocket endpoint at /hooks/ws provides unified real-time events:
- Notification events (permission requests, idle)
- Session events (created, updated, completed, deleted)
- Process events (started, ended)
- Count updates (session counts per repo)

Configure Claude Code hooks to POST to these endpoints:
- Notification hook: POST /api/hooks/notification
- PermissionRequest hook: POST /api/hooks/permission-request
"""

import asyncio
import logging
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from app.services.notification_manager import notification_manager, NotificationType, Notification
from app.services.event_manager import event_manager, Event
from app.services.session_manager import process_manager

# Constants for Claude Code's notification_type field values
# These are the values Claude Code sends in its hook payloads
CLAUDE_CODE_PERMISSION_PROMPT = "permission_prompt"
CLAUDE_CODE_IDLE_PROMPT = "idle_prompt"

# Mapping from Claude Code notification types to our internal NotificationType enum
NOTIFICATION_TYPE_MAPPING: dict[str, NotificationType] = {
    CLAUDE_CODE_PERMISSION_PROMPT: NotificationType.PERMISSION_NEEDED,
    CLAUDE_CODE_IDLE_PROMPT: NotificationType.IDLE,
}

# Keywords for fallback message parsing when notification_type is not provided
PERMISSION_KEYWORDS = ("permission",)
IDLE_KEYWORDS = ("waiting", "idle")


router = APIRouter()


class NotificationHookPayload(BaseModel):
    """
    Payload from Claude Code's Notification hook.

    The Notification hook fires when:
    - Claude needs permission to use a tool
    - The prompt input has been idle for 60+ seconds
    """
    session_id: str
    transcript_path: str | None = None
    cwd: str | None = None
    hook_event_name: str = "Notification"
    # The notification message from Claude Code (field name is "message" in actual payload)
    message: str | None = None
    # The notification type from Claude Code: "permission_prompt" or "idle_prompt"
    notification_type: str | None = None


class PermissionRequestPayload(BaseModel):
    """
    Payload from Claude Code's PermissionRequest hook.

    Fires when Claude requests permission to use a tool.
    """
    session_id: str
    transcript_path: str | None = None
    cwd: str | None = None
    permission_mode: str | None = None
    hook_event_name: str = "PermissionRequest"
    tool_name: str | None = None
    tool_input: dict | None = None


class HookResponse(BaseModel):
    """Response to hook calls (empty = don't modify behavior)."""
    pass


@router.post("/hooks/notification", response_model=HookResponse)
async def handle_notification_hook(payload: NotificationHookPayload):
    """
    Handle notifications from Claude Code's Notification hook.

    This fires when Claude Code sends a notification, such as:
    - "Claude needs your permission to use Bash"
    - "Claude is waiting for your input"

    Configure this hook in Claude Code:
    ```json
    {
      "hooks": {
        "Notification": [{
          "hooks": [{
            "type": "command",
            "command": "curl -s -X POST http://localhost:8000/api/hooks/notification -H 'Content-Type: application/json' -d @-"
          }]
        }]
      }
    }
    ```
    """
    # Use Claude Code's notification_type field if available
    notification_type = NOTIFICATION_TYPE_MAPPING.get(payload.notification_type or "")

    if notification_type is None:
        # Fallback: parse the message text for keywords
        message_lower = (payload.message or "").lower()
        if any(kw in message_lower for kw in PERMISSION_KEYWORDS):
            notification_type = NotificationType.PERMISSION_NEEDED
        elif any(kw in message_lower for kw in IDLE_KEYWORDS):
            notification_type = NotificationType.IDLE
        else:
            notification_type = NotificationType.PERMISSION_NEEDED

    await notification_manager.notify(
        session_id=payload.session_id,
        notification_type=notification_type,
        data={
            "message": payload.message,
            "cwd": payload.cwd,
        },
    )

    return HookResponse()


@router.post("/hooks/permission-request", response_model=HookResponse)
async def handle_permission_request_hook(payload: PermissionRequestPayload):
    """
    Handle permission requests from Claude Code's PermissionRequest hook.

    This fires when Claude requests permission to use a tool, providing
    more detailed context than the Notification hook.

    Configure this hook in Claude Code:
    ```json
    {
      "hooks": {
        "PermissionRequest": [{
          "matcher": "*",
          "hooks": [{
            "type": "command",
            "command": "curl -s -X POST http://localhost:8000/api/hooks/permission-request -H 'Content-Type: application/json' -d @-"
          }]
        }]
      }
    }
    ```
    """
    await notification_manager.notify(
        session_id=payload.session_id,
        notification_type=NotificationType.PERMISSION_NEEDED,
        data={
            "tool_name": payload.tool_name,
            "tool_input": payload.tool_input,
            "cwd": payload.cwd,
        },
    )

    return HookResponse()


@router.post("/hooks/clear/{session_id}")
async def clear_notification(session_id: str):
    """
    Clear the notification state for a session.

    Called when user focuses on or interacts with a session,
    indicating they've seen the notification.
    """
    await notification_manager.clear_attention(session_id)
    return {"status": "cleared"}


@router.get("/hooks/attention")
async def get_sessions_needing_attention():
    """
    Get list of sessions that currently need user attention.

    Returns session IDs that have pending permission requests or are idle.
    """
    session_ids = notification_manager.get_sessions_needing_attention()
    return {"sessions": session_ids}


@router.websocket("/hooks/ws")
async def notifications_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time event streaming.

    Clients connect to receive all events as they happen:
    - Notification events (permission requests, idle states)
    - Session events (created, updated, completed, deleted)
    - Process events (started, ended)
    - Count updates (session counts per repo)

    Messages sent to client:
    {
        "type": "notification" | "session_created" | "session_updated" | ...,
        ...event-specific data,
        "timestamp": "..."
    }
    """
    await websocket.accept()

    # Unified queue for all events (notifications + general events)
    event_queue: asyncio.Queue[dict] = asyncio.Queue()

    def on_notification(notification: Notification):
        """Callback when a notification is received."""
        try:
            event_queue.put_nowait({
                "type": "notification",
                **notification.to_dict(),
            })
        except asyncio.QueueFull:
            pass

    def on_event(event: Event):
        """Callback when a general event is received."""
        try:
            event_queue.put_nowait(event.to_dict())
        except asyncio.QueueFull:
            logger.warning(f"Event queue full, dropping {event.type.value} event")

    # Subscribe to both notification and general events
    notification_manager.subscribe_global(on_notification)
    event_manager.subscribe(on_event)

    async def send_events():
        """Task to send events to the client."""
        while True:
            try:
                event = await event_queue.get()
                await websocket.send_json(event)
            except WebSocketDisconnect:
                logger.debug("WebSocket disconnected during send")
                break
            except asyncio.CancelledError:
                # Task cancellation is expected during cleanup
                break
            except Exception:
                logger.exception("Unexpected error sending WebSocket event")
                break

    async def receive_messages():
        """Task to receive messages from client (e.g., clear attention)."""
        while True:
            try:
                message = await websocket.receive_json()

                if message.get("type") == "clear_attention":
                    session_id = message.get("session_id")
                    if session_id:
                        await notification_manager.clear_attention(session_id)

            except WebSocketDisconnect:
                logger.debug("WebSocket disconnected during receive")
                break
            except asyncio.CancelledError:
                # Task cancellation is expected during cleanup
                break
            except Exception:
                logger.exception("Unexpected error receiving WebSocket message")
                break

    try:
        # Send initial state on connect
        attention_sessions = notification_manager.get_sessions_needing_attention()

        # Get current processes
        processes = await process_manager.list_processes()
        process_list = [
            {
                "id": p.id,
                "session_id": p.session_id,
                "working_dir": p.working_dir,
                "created_at": p.created_at.isoformat(),
                "claude_session_id": p.claude_session_id,
            }
            for p in processes
        ]

        await websocket.send_json({
            "type": "initial_state",
            "sessions_needing_attention": attention_sessions,
            "processes": process_list,
        })
    except WebSocketDisconnect:
        notification_manager.unsubscribe_global(on_notification)
        event_manager.unsubscribe(on_event)
        return

    # Run both tasks concurrently
    send_task = asyncio.create_task(send_events())
    receive_task = asyncio.create_task(receive_messages())

    try:
        await asyncio.gather(send_task, receive_task, return_exceptions=True)
    finally:
        notification_manager.unsubscribe_global(on_notification)
        event_manager.unsubscribe(on_event)
        send_task.cancel()
        receive_task.cancel()
