"""Fine-tuning jobs router."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.dataset import Dataset
from app.models.job import FineTuneJob, JobLog, JobStatus
from app.models.node import Node, NodeStatus
from app.models.user import User
from app.schemas.job import JobCreate, JobLogResponse, JobResponse, JobStatusUpdate
from app.services.auth import get_current_user
from app.services.scheduler import schedule_job

router = APIRouter()


@router.post("/finetune-jobs", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    job_data: JobCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FineTuneJob:
    """Create a new fine-tuning job."""
    # Verify dataset exists and belongs to user
    result = await db.execute(
        select(Dataset).where(
            Dataset.id == job_data.dataset_id,
            Dataset.owner_id == current_user.id,
        )
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found",
        )

    # Verify node if specified
    node_id = job_data.node_id
    if node_id:
        result = await db.execute(
            select(Node).where(
                Node.id == node_id,
                (Node.owner_id == current_user.id) | (Node.is_shared == True),  # noqa: E712
            )
        )
        node = result.scalar_one_or_none()
        if not node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Node not found or not accessible",
            )
    else:
        # Find available node
        result = await db.execute(
            select(Node).where(
                (Node.owner_id == current_user.id) | (Node.is_shared == True),  # noqa: E712
                Node.status == NodeStatus.ONLINE.value,
            )
        )
        node = result.scalar_one_or_none()
        if node:
            node_id = node.id

    # Create job
    job = FineTuneJob(
        name=job_data.name,
        base_model=job_data.config.base_model,
        method=job_data.config.method,
        config=job_data.config.model_dump(),
        total_epochs=job_data.config.training.epochs,
        owner_id=current_user.id,
        dataset_id=job_data.dataset_id,
        node_id=node_id,
        status=JobStatus.PENDING.value if node_id else JobStatus.QUEUED.value,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    # Schedule job if node available
    if node_id:
        await schedule_job(job.id, node_id)

    return job


@router.get("/finetune-jobs", response_model=list[JobResponse])
async def list_jobs(
    skip: int = 0,
    limit: int = 100,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FineTuneJob]:
    """List all fine-tuning jobs for the current user."""
    query = select(FineTuneJob).where(FineTuneJob.owner_id == current_user.id)

    if status_filter:
        query = query.where(FineTuneJob.status == status_filter)

    query = query.offset(skip).limit(limit).order_by(FineTuneJob.created_at.desc())
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/finetune-jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FineTuneJob:
    """Get a specific job."""
    result = await db.execute(
        select(FineTuneJob).where(
            FineTuneJob.id == job_id,
            FineTuneJob.owner_id == current_user.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    return job


@router.get("/finetune-jobs/{job_id}/logs", response_model=list[JobLogResponse])
async def get_job_logs(
    job_id: int,
    skip: int = 0,
    limit: int = 1000,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[JobLog]:
    """Get logs for a specific job."""
    # Verify job belongs to user
    result = await db.execute(
        select(FineTuneJob).where(
            FineTuneJob.id == job_id,
            FineTuneJob.owner_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    result = await db.execute(
        select(JobLog)
        .where(JobLog.job_id == job_id)
        .offset(skip)
        .limit(limit)
        .order_by(JobLog.timestamp.asc())
    )
    return list(result.scalars().all())


@router.post("/finetune-jobs/{job_id}/cancel", response_model=JobResponse)
async def cancel_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FineTuneJob:
    """Cancel a running job."""
    result = await db.execute(
        select(FineTuneJob).where(
            FineTuneJob.id == job_id,
            FineTuneJob.owner_id == current_user.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    if job.status not in [JobStatus.PENDING.value, JobStatus.QUEUED.value, JobStatus.RUNNING.value]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel job with status: {job.status}",
        )

    job.status = JobStatus.CANCELLED.value
    job.finished_at = datetime.utcnow()
    await db.flush()
    await db.refresh(job)

    # TODO: Send cancel signal to agent
    return job


@router.put("/finetune-jobs/{job_id}/status", response_model=JobResponse)
async def update_job_status(
    job_id: int,
    status_update: JobStatusUpdate,
    db: AsyncSession = Depends(get_db),
) -> FineTuneJob:
    """Update job status (called by agent)."""
    # TODO: Add agent authentication
    result = await db.execute(select(FineTuneJob).where(FineTuneJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    # Update fields
    job.status = status_update.status
    if status_update.current_epoch is not None:
        job.current_epoch = status_update.current_epoch
    if status_update.current_step is not None:
        job.current_step = status_update.current_step
    if status_update.total_steps is not None:
        job.total_steps = status_update.total_steps
    if status_update.train_loss is not None:
        job.train_loss = status_update.train_loss
    if status_update.eval_loss is not None:
        job.eval_loss = status_update.eval_loss
    if status_update.error_message is not None:
        job.error_message = status_update.error_message

    # Update timestamps
    if status_update.status == JobStatus.RUNNING.value and not job.started_at:
        job.started_at = datetime.utcnow()
    if status_update.status in [JobStatus.COMPLETED.value, JobStatus.FAILED.value]:
        job.finished_at = datetime.utcnow()

    await db.flush()
    await db.refresh(job)
    return job


@router.post("/finetune-jobs/{job_id}/logs")
async def add_job_log(
    job_id: int,
    level: str,
    message: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Add a log entry for a job (called by agent)."""
    # TODO: Add agent authentication
    result = await db.execute(select(FineTuneJob).where(FineTuneJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    log = JobLog(job_id=job_id, level=level, message=message)
    db.add(log)
    await db.flush()
    return {"status": "ok"}
