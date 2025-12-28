"""
Webhook endpoints for Claude Code hooks.

These endpoints receive notifications from Claude Code's hook system,
allowing the hub to track when Claude needs user attention.

Configure Claude Code hooks to POST to these endpoints:
- Notification hook: POST /api/hooks/notification
- PermissionRequest hook: POST /api/hooks/permission-request
"""

import asyncio
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from app.services.notification_manager import notification_manager, NotificationType, Notification


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
    if payload.notification_type == "permission_prompt":
        notification_type = NotificationType.PERMISSION_NEEDED
    elif payload.notification_type == "idle_prompt":
        notification_type = NotificationType.IDLE
    else:
        # Fallback: parse the message text
        message_text = payload.message or ""
        if "permission" in message_text.lower():
            notification_type = NotificationType.PERMISSION_NEEDED
        elif "waiting" in message_text.lower() or "idle" in message_text.lower():
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
    WebSocket endpoint for real-time notification updates.

    Clients connect to receive all notification events as they happen.
    This allows the frontend to update session tab styling and browser
    title/favicon in real-time when Claude needs attention.

    Messages sent to client:
    {
        "type": "notification",
        "session_id": "...",
        "notification_type": "permission_needed" | "idle" | ...,
        "data": {...},
        "timestamp": "..."
    }
    """
    await websocket.accept()

    # Queue for notifications to send to this client
    notification_queue: asyncio.Queue[Notification] = asyncio.Queue()

    def on_notification(notification: Notification):
        """Callback when a notification is received."""
        try:
            notification_queue.put_nowait(notification)
        except asyncio.QueueFull:
            pass

    # Subscribe to global notifications
    notification_manager.subscribe_global(on_notification)

    try:
        # Send current attention state on connect
        attention_sessions = notification_manager.get_sessions_needing_attention()
        if attention_sessions:
            await websocket.send_json({
                "type": "initial_state",
                "sessions_needing_attention": attention_sessions,
            })
    except WebSocketDisconnect:
        notification_manager.unsubscribe_global(on_notification)
        return

    async def send_notifications():
        """Task to send notifications to the client."""
        while True:
            try:
                notification = await notification_queue.get()
                await websocket.send_json({
                    "type": "notification",
                    **notification.to_dict(),
                })
            except Exception:
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
                break
            except Exception:
                break

    # Run both tasks concurrently
    send_task = asyncio.create_task(send_notifications())
    receive_task = asyncio.create_task(receive_messages())

    try:
        await asyncio.gather(send_task, receive_task, return_exceptions=True)
    finally:
        notification_manager.unsubscribe_global(on_notification)
        send_task.cancel()
        receive_task.cancel()
