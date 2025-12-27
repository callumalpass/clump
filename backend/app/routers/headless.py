"""
Headless analysis routes using Claude Code's -p (non-interactive) mode.

Provides structured JSON output and streaming for programmatic analysis.
"""

import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import json

from app.database import get_db
from app.models import Repo, Analysis, AnalysisStatus
from app.services.headless_analyzer import headless_analyzer, AnalysisMessage

router = APIRouter()


class HeadlessAnalysisCreate(BaseModel):
    """Request to create a headless analysis."""

    repo_id: int
    prompt: str
    analysis_type: str = "custom"
    entity_id: str | None = None
    title: str = "Headless Analysis"

    # Claude Code configuration
    permission_mode: str | None = None
    allowed_tools: list[str] | None = None
    disallowed_tools: list[str] | None = None
    max_turns: int | None = None
    model: str | None = None
    system_prompt: str | None = None

    # Session management
    resume_session: str | None = None


class HeadlessAnalysisResponse(BaseModel):
    """Response from a completed headless analysis."""

    analysis_id: int
    session_id: str
    result: str
    success: bool
    cost_usd: float
    duration_ms: int
    error: str | None = None


@router.post("/headless/analyze", response_model=HeadlessAnalysisResponse)
async def run_headless_analysis(
    data: HeadlessAnalysisCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Run a headless Claude Code analysis and return the complete result.

    This is a blocking endpoint that waits for the analysis to complete.
    For streaming results, use POST /headless/analyze/stream instead.
    """
    # Get repo
    result = await db.execute(select(Repo).where(Repo.id == data.repo_id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Create analysis record
    analysis = Analysis(
        repo_id=repo.id,
        type=data.analysis_type,
        entity_id=data.entity_id,
        title=data.title,
        prompt=data.prompt,
        status=AnalysisStatus.RUNNING.value,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    try:
        # Run headless analysis
        result = await headless_analyzer.analyze(
            prompt=data.prompt,
            working_dir=repo.local_path,
            allowed_tools=data.allowed_tools,
            disallowed_tools=data.disallowed_tools,
            permission_mode=data.permission_mode,
            max_turns=data.max_turns,
            model=data.model,
            system_prompt=data.system_prompt,
            resume_session=data.resume_session,
        )

        # Update analysis record
        analysis.status = (
            AnalysisStatus.COMPLETED.value if result.success else AnalysisStatus.FAILED.value
        )
        analysis.transcript = result.result
        analysis.session_id = result.session_id
        await db.commit()

        return HeadlessAnalysisResponse(
            analysis_id=analysis.id,
            session_id=result.session_id,
            result=result.result,
            success=result.success,
            cost_usd=result.cost_usd,
            duration_ms=result.duration_ms,
            error=result.error,
        )

    except Exception as e:
        analysis.status = AnalysisStatus.FAILED.value
        await db.commit()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/headless/analyze/stream")
async def run_headless_analysis_stream(
    data: HeadlessAnalysisCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Run a headless Claude Code analysis with streaming results.

    Returns a stream of newline-delimited JSON messages as the analysis progresses.
    Each message is an AnalysisMessage with type, content, and metadata.
    """
    # Get repo
    result = await db.execute(select(Repo).where(Repo.id == data.repo_id))
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Create analysis record
    analysis = Analysis(
        repo_id=repo.id,
        type=data.analysis_type,
        entity_id=data.entity_id,
        title=data.title,
        prompt=data.prompt,
        status=AnalysisStatus.RUNNING.value,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    async def generate():
        """Generate streaming response."""
        full_result = ""
        session_id = ""
        success = False

        try:
            async for msg in headless_analyzer.analyze_stream(
                prompt=data.prompt,
                working_dir=repo.local_path,
                allowed_tools=data.allowed_tools,
                disallowed_tools=data.disallowed_tools,
                permission_mode=data.permission_mode,
                max_turns=data.max_turns,
                model=data.model,
                system_prompt=data.system_prompt,
                resume_session=data.resume_session,
            ):
                # Track session ID and result
                if msg.session_id:
                    session_id = msg.session_id
                if msg.type == "result" and msg.subtype == "success":
                    full_result = msg.content or ""
                    success = True

                # Yield message as JSON
                yield json.dumps({
                    "type": msg.type,
                    "subtype": msg.subtype,
                    "content": msg.content,
                    "session_id": msg.session_id,
                    "cost_usd": msg.cost_usd,
                    "duration_ms": msg.duration_ms,
                }) + "\n"

            # Update analysis record
            async with db.begin():
                analysis.status = (
                    AnalysisStatus.COMPLETED.value if success else AnalysisStatus.FAILED.value
                )
                analysis.transcript = full_result
                analysis.session_id = session_id

        except Exception as e:
            yield json.dumps({
                "type": "error",
                "content": str(e),
            }) + "\n"

            async with db.begin():
                analysis.status = AnalysisStatus.FAILED.value

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/headless/running")
async def list_running_analyses():
    """List currently running headless analyses."""
    return {"running": headless_analyzer.list_running()}


@router.delete("/headless/{analysis_id}")
async def cancel_headless_analysis(analysis_id: str):
    """Cancel a running headless analysis."""
    cancelled = await headless_analyzer.cancel(analysis_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Analysis not found or already completed")
    return {"status": "cancelled"}
