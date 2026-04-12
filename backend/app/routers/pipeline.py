"""PDF-to-Q&A data pipeline router."""

import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_maker, get_db
from app.models.pipeline_job import PipelineJob
from app.models.user import User
from app.schemas.pipeline import PipelineConfig, PipelineJobResponse, PipelineStartResponse
from app.services.auth import get_current_user
from app.services.data_pipeline import DataPipeline

logger = logging.getLogger(__name__)

router = APIRouter()


async def _run_pipeline(pipeline_job_id: int, config: PipelineConfig, user_id: int):
    """Background task that runs the pipeline and updates the job record."""
    async with async_session_maker() as db:
        try:
            # Get the pipeline job record
            result = await db.execute(
                select(PipelineJob).where(PipelineJob.id == pipeline_job_id)
            )
            job = result.scalar_one()

            # Determine API key: user-provided takes priority, then env
            api_key = config.qa_api_key
            if not api_key:
                if config.qa_provider == "anthropic":
                    api_key = settings.anthropic_api_key or ""
                else:
                    api_key = settings.openai_api_key or ""

            if not api_key:
                job.status = "failed"
                job.error_message = (
                    f"{config.qa_provider} API key not configured. "
                    f"Set {'ANTHROPIC_API_KEY' if config.qa_provider == 'anthropic' else 'OPENAI_API_KEY'} in environment."
                )
                await db.commit()
                return

            pipeline = DataPipeline()

            async def on_progress(data: dict):
                """Update pipeline job progress."""
                for key, value in data.items():
                    if hasattr(job, key):
                        setattr(job, key, value)
                await db.commit()

            result_data = await pipeline.process_directory(
                dir_path=config.directory_path,
                dataset_name=config.dataset_name,
                user_id=user_id,
                db=db,
                qa_provider=config.qa_provider,
                qa_api_key=api_key,
                qa_model=config.qa_model,
                num_qa_per_chunk=config.num_qa_per_chunk,
                chunk_size=config.chunk_size,
                chunk_overlap=config.chunk_overlap,
                test_split_ratio=config.test_split_ratio,
                split_seed=config.split_seed,
                description=config.description,
                on_progress=on_progress,
            )

            job.status = "completed"
            job.total_pdfs = result_data["total_pdfs"]
            job.total_chunks = result_data["total_chunks"]
            job.generated_qa_pairs = result_data["total_qa_pairs"]
            job.train_dataset_id = result_data["train_dataset_id"]
            job.test_dataset_id = result_data["test_dataset_id"]
            job.completed_at = datetime.utcnow()
            await db.commit()

            logger.info(f"Pipeline job {pipeline_job_id} completed: {result_data}")

        except Exception as e:
            logger.exception(f"Pipeline job {pipeline_job_id} failed")
            result = await db.execute(
                select(PipelineJob).where(PipelineJob.id == pipeline_job_id)
            )
            job = result.scalar_one_or_none()
            if job:
                job.status = "failed"
                job.error_message = str(e)
                await db.commit()


@router.post(
    "/pipeline/process-directory",
    response_model=PipelineStartResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_pipeline(
    config: PipelineConfig,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Start a PDF-to-Q&A pipeline job.

    Processes PDFs from the specified directory, generates Q&A pairs
    using an AI provider, and creates train/test JSONL datasets.
    Returns immediately; use GET /pipeline/jobs/{id} to poll status.
    """
    # Validate directory exists
    import os

    if not os.path.isdir(config.directory_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Directory not found: {config.directory_path}",
        )

    # Create pipeline job record
    job = PipelineJob(
        name=config.dataset_name,
        directory_path=config.directory_path,
        config=config.model_dump(),
        owner_id=current_user.id,
        status="pending",
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    # Launch pipeline in background
    background_tasks.add_task(_run_pipeline, job.id, config, current_user.id)

    return {
        "pipeline_job_id": job.id,
        "status": "pending",
        "message": "Pipeline started. Poll GET /pipeline/jobs/{id} for progress.",
    }


@router.get("/pipeline/jobs", response_model=list[PipelineJobResponse])
async def list_pipeline_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PipelineJob]:
    """List all pipeline jobs for the current user."""
    result = await db.execute(
        select(PipelineJob)
        .where(PipelineJob.owner_id == current_user.id)
        .order_by(PipelineJob.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/pipeline/jobs/{job_id}", response_model=PipelineJobResponse)
async def get_pipeline_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PipelineJob:
    """Get pipeline job status."""
    result = await db.execute(
        select(PipelineJob).where(
            PipelineJob.id == job_id,
            PipelineJob.owner_id == current_user.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pipeline job not found",
        )
    return job
