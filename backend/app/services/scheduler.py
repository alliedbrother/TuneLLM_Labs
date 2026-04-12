"""Job scheduler service.

The architecture is pull-based: agents poll for pending jobs assigned to their node.
schedule_job() simply ensures the job has node_id set and status='pending' in the DB.
The agent's poll loop will then find the job and execute it.
"""

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import FineTuneJob, JobStatus
from app.models.node import Node, NodeStatus

logger = logging.getLogger(__name__)


async def schedule_job(job_id: int, node_id: int, db: AsyncSession) -> bool:
    """Schedule a job to run on a specific node.

    Sets the job's node_id and status to 'pending' so the agent can pick it up.
    """
    result = await db.execute(select(FineTuneJob).where(FineTuneJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        logger.error(f"Job {job_id} not found for scheduling")
        return False

    job.node_id = node_id
    job.status = JobStatus.PENDING.value

    logger.info(f"Scheduled job {job_id} on node {node_id} (status=pending)")
    return True


async def find_available_node(owner_id: int, db: AsyncSession) -> int | None:
    """Find an available online node for the given user."""
    result = await db.execute(
        select(Node).where(
            (Node.owner_id == owner_id) | (Node.is_shared == True),  # noqa: E712
            Node.status == NodeStatus.ONLINE.value,
        )
    )
    node = result.scalar_one_or_none()
    return node.id if node else None


async def schedule_cloud_teardown(
    node_id: int, delay_seconds: int = 300
) -> None:
    """Schedule auto-teardown of a cloud GPU instance after idle timeout.

    Called after a job completes on a vastai node. Waits for the delay,
    then checks if the node has any pending/running jobs. If idle, destroys it.
    """
    await asyncio.sleep(delay_seconds)

    try:
        from app.database import async_session_maker

        async with async_session_maker() as db:
            result = await db.execute(select(Node).where(Node.id == node_id))
            node = result.scalar_one_or_none()

            if not node or node.provider != "vastai":
                return

            # Check for active jobs
            active = await db.execute(
                select(FineTuneJob).where(
                    FineTuneJob.node_id == node_id,
                    FineTuneJob.status.in_(["pending", "running"]),
                )
            )
            if active.scalar_one_or_none():
                logger.info(f"Node {node_id} has active jobs, skipping teardown")
                return

            # Destroy the cloud instance
            from app.config import settings
            from app.services.vastai_provider import VastAIProvider

            if settings.vastai_api_key and node.provider_instance_id:
                provider = VastAIProvider(settings.vastai_api_key)
                destroyed = await provider.destroy_instance(node.provider_instance_id)
                if destroyed:
                    node.status = NodeStatus.OFFLINE.value
                    await db.commit()
                    logger.info(f"Auto-teardown: destroyed cloud node {node_id}")
    except Exception as e:
        logger.error(f"Auto-teardown failed for node {node_id}: {e}")
