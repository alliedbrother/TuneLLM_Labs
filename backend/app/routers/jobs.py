"""Fine-tuning jobs router."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.dataset import Dataset
from app.models.job import FineTuneJob, JobLog, JobNodeAssignment, JobStatus
from app.models.model import TrainedModel
from app.models.node import Node, NodeStatus
from app.models.user import User
from app.routers.hardware import get_node_by_api_key
from app.schemas.job import JobCreate, JobLogResponse, JobResponse, JobStatusUpdate
from app.services.auth import get_current_user
from app.services.scheduler import schedule_cloud_teardown, schedule_job

router = APIRouter()


@router.post("/finetune-jobs", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    job_data: JobCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FineTuneJob:
    """Create a new fine-tuning job. Supports single-node or multi-node distributed training."""
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

    # Resolve node list: multi-node takes priority, then single node, then auto-find
    selected_node_ids: list[int] = []

    if job_data.node_ids and len(job_data.node_ids) > 0:
        # Multi-node distributed training
        for nid in job_data.node_ids:
            result = await db.execute(
                select(Node).where(
                    Node.id == nid,
                    (Node.owner_id == current_user.id) | (Node.is_shared == True),  # noqa: E712
                )
            )
            node = result.scalar_one_or_none()
            if not node:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Node {nid} not found or not accessible",
                )
            selected_node_ids.append(nid)
    elif job_data.node_id:
        # Single node
        result = await db.execute(
            select(Node).where(
                Node.id == job_data.node_id,
                (Node.owner_id == current_user.id) | (Node.is_shared == True),  # noqa: E712
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Node not found or not accessible",
            )
        selected_node_ids = [job_data.node_id]
    else:
        # Auto-find available node
        result = await db.execute(
            select(Node).where(
                (Node.owner_id == current_user.id) | (Node.is_shared == True),  # noqa: E712
                Node.status == NodeStatus.ONLINE.value,
            )
        )
        node = result.scalar_one_or_none()
        if node:
            selected_node_ids = [node.id]

    # Determine primary (master) node
    primary_node_id = selected_node_ids[0] if selected_node_ids else None
    is_distributed = len(selected_node_ids) > 1

    # Build distributed config
    distributed_config = None
    if is_distributed:
        strategy = "deepspeed_zero3"
        if job_data.distributed:
            strategy = job_data.distributed.strategy
            if strategy == "auto":
                strategy = "deepspeed_zero3"  # best default for multi-node

        distributed_config = {
            "strategy": strategy,
            "world_size": len(selected_node_ids),
            "master_node_id": primary_node_id,
            "node_ids": selected_node_ids,
        }

    # Create job
    job = FineTuneJob(
        name=job_data.name,
        base_model=job_data.config.base_model,
        method=job_data.config.method,
        config=job_data.config.model_dump(),
        total_epochs=job_data.config.training.epochs,
        owner_id=current_user.id,
        dataset_id=job_data.dataset_id,
        node_id=primary_node_id,
        distributed_config=distributed_config,
        status=JobStatus.PENDING.value if primary_node_id else JobStatus.QUEUED.value,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    # Create node assignments for distributed training
    if selected_node_ids:
        for rank, nid in enumerate(selected_node_ids):
            assignment = JobNodeAssignment(
                job_id=job.id,
                node_id=nid,
                rank=rank,
                is_master=(rank == 0),
                status="pending",
            )
            db.add(assignment)

    # Schedule job on primary node
    if primary_node_id:
        await schedule_job(job.id, primary_node_id, db)

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


@router.get("/finetune-jobs/pending/{node_id}", response_model=list[JobResponse])
async def get_pending_jobs_for_node(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    agent_node: Node = Depends(get_node_by_api_key),
) -> list[FineTuneJob]:
    """Get pending jobs assigned to a node — includes distributed worker assignments."""
    if agent_node.id != node_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key does not match node_id",
        )
    # Primary node jobs
    result = await db.execute(
        select(FineTuneJob)
        .where(
            FineTuneJob.node_id == node_id,
            FineTuneJob.status == JobStatus.PENDING.value,
        )
        .order_by(FineTuneJob.created_at.asc())
    )
    jobs = list(result.scalars().all())

    # Also check for distributed worker assignments
    result = await db.execute(
        select(JobNodeAssignment).where(
            JobNodeAssignment.node_id == node_id,
            JobNodeAssignment.status == "pending",
            JobNodeAssignment.is_master == False,  # noqa: E712
        )
    )
    worker_assignments = result.scalars().all()
    for assignment in worker_assignments:
        result = await db.execute(
            select(FineTuneJob).where(FineTuneJob.id == assignment.job_id)
        )
        job = result.scalar_one_or_none()
        if job and job.id not in [j.id for j in jobs]:
            jobs.append(job)

    return jobs


@router.get("/finetune-jobs/distributed/{job_id}/{node_id}")
async def get_distributed_config(
    job_id: int,
    node_id: int,
    db: AsyncSession = Depends(get_db),
    agent_node: Node = Depends(get_node_by_api_key),
) -> dict:
    """Get the distributed training config for a specific node in a job.

    Returns the node's rank, master address, world size, and other NCCL params
    so the agent can launch the training container with the right flags.
    """
    if agent_node.id != node_id:
        raise HTTPException(status_code=403, detail="API key mismatch")

    result = await db.execute(
        select(JobNodeAssignment).where(
            JobNodeAssignment.job_id == job_id,
            JobNodeAssignment.node_id == node_id,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Node not assigned to this job")

    # Get all assignments to find the master node's address
    result = await db.execute(
        select(JobNodeAssignment).where(JobNodeAssignment.job_id == job_id)
    )
    all_assignments = list(result.scalars().all())

    # Find master node's SSH/NCCL host
    master_host = "localhost"
    for a in all_assignments:
        if a.is_master:
            if a.nccl_host:
                master_host = a.nccl_host
            else:
                # Look up the node's host from the Node table
                result = await db.execute(select(Node).where(Node.id == a.node_id))
                master_node = result.scalar_one_or_none()
                if master_node and master_node.host:
                    master_host = master_node.host
                elif master_node and master_node.ssh_host:
                    master_host = master_node.ssh_host
            break

    # Get job's distributed config
    result = await db.execute(select(FineTuneJob).where(FineTuneJob.id == job_id))
    job = result.scalar_one_or_none()
    dist_config = job.distributed_config or {} if job else {}

    return {
        "job_id": job_id,
        "node_id": node_id,
        "rank": assignment.rank,
        "is_master": assignment.is_master,
        "world_size": len(all_assignments),
        "master_addr": master_host,
        "master_port": assignment.nccl_port,
        "strategy": dist_config.get("strategy", "deepspeed_zero3"),
        "gpu_ids": assignment.gpu_ids or "0",
        "all_nodes": [
            {"node_id": a.node_id, "rank": a.rank, "is_master": a.is_master}
            for a in sorted(all_assignments, key=lambda x: x.rank)
        ],
    }


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
    agent_node: Node = Depends(get_node_by_api_key),
) -> FineTuneJob:
    """Update job status (called by agent)."""
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
    if status_update.baseline_metrics is not None:
        job.baseline_metrics = status_update.baseline_metrics
    if status_update.final_metrics is not None:
        job.final_metrics = status_update.final_metrics
    if status_update.phase is not None:
        job.phase = status_update.phase
    if status_update.loss_history is not None:
        # Append to existing history
        existing = job.loss_history or []
        existing.extend(status_update.loss_history)
        job.loss_history = existing

    # Update timestamps
    if status_update.status == JobStatus.RUNNING.value and not job.started_at:
        job.started_at = datetime.utcnow()
    if status_update.status in [JobStatus.COMPLETED.value, JobStatus.FAILED.value]:
        job.finished_at = datetime.utcnow()

        # Schedule auto-teardown for cloud instances (5 min idle timeout)
        if job.node_id and agent_node.provider == "vastai":
            import asyncio
            asyncio.create_task(schedule_cloud_teardown(job.node_id, delay_seconds=300))

    await db.flush()
    await db.refresh(job)
    return job


@router.post("/finetune-jobs/{job_id}/logs")
async def add_job_log(
    job_id: int,
    level: str,
    message: str,
    db: AsyncSession = Depends(get_db),
    agent_node: Node = Depends(get_node_by_api_key),
) -> dict:
    """Add a log entry for a job (called by agent)."""
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


@router.post("/finetune-jobs/{job_id}/complete")
async def complete_job(
    job_id: int,
    artifact_path: str = "",
    db: AsyncSession = Depends(get_db),
    agent_node: Node = Depends(get_node_by_api_key),
) -> dict:
    """Mark a job as completed and create a TrainedModel record (called by agent)."""
    result = await db.execute(select(FineTuneJob).where(FineTuneJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    # Create TrainedModel record
    run_name = job.config.get("run_name", job.name)
    model = TrainedModel(
        name=f"{run_name}-model",
        description=f"Fine-tuned from {job.base_model} using {job.method}",
        base_model=job.base_model,
        method=job.method,
        artifact_path=artifact_path or f"/models/{run_name}/final",
        artifact_size=0,
        status="ready",
        metrics=job.final_metrics,
        owner_id=job.owner_id,
        job_id=job.id,
    )
    db.add(model)
    await db.flush()
    await db.refresh(model)

    return {"model_id": model.id, "status": "ready"}


@router.post("/finetune-jobs/{job_id}/upload-model")
async def upload_model_artifact(
    job_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    agent_node: Node = Depends(get_node_by_api_key),
) -> dict:
    """Upload model adapter files (called by agent after training)."""
    import aiofiles

    result = await db.execute(select(FineTuneJob).where(FineTuneJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Save the uploaded zip
    from app.config import settings
    model_dir = os.path.join(settings.storage_path, "models", str(job.owner_id))
    os.makedirs(model_dir, exist_ok=True)
    file_path = os.path.join(model_dir, f"job_{job_id}_adapter.zip")

    async with aiofiles.open(file_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            await f.write(chunk)

    # Update the TrainedModel record if it exists
    result = await db.execute(
        select(TrainedModel).where(TrainedModel.job_id == job_id)
    )
    model = result.scalar_one_or_none()
    if model:
        model.artifact_path = file_path
        model.artifact_size = os.path.getsize(file_path)

    return {"status": "uploaded", "path": file_path, "size": os.path.getsize(file_path)}


@router.get("/finetune-jobs/{job_id}/download-model")
async def download_model_artifact(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download the fine-tuned model adapter for a completed job."""
    from fastapi.responses import FileResponse

    result = await db.execute(
        select(FineTuneJob).where(
            FineTuneJob.id == job_id,
            FineTuneJob.owner_id == current_user.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Find the model artifact
    result = await db.execute(
        select(TrainedModel).where(TrainedModel.job_id == job_id)
    )
    model = result.scalar_one_or_none()

    if model and model.artifact_path and os.path.exists(model.artifact_path):
        return FileResponse(
            model.artifact_path,
            filename=f"{job.name}-adapter.zip",
            media_type="application/zip",
        )

    raise HTTPException(
        status_code=404,
        detail="Model artifact not available. The model files are stored on the GPU instance.",
    )
