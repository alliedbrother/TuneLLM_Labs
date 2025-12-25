"""Job scheduler service."""

import asyncio
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# In-memory job queue (replace with Redis or similar in production)
job_queue: asyncio.Queue = asyncio.Queue()


async def schedule_job(job_id: int, node_id: int) -> bool:
    """Schedule a job to run on a specific node."""
    logger.info(f"Scheduling job {job_id} on node {node_id}")

    # Add to queue
    await job_queue.put({"job_id": job_id, "node_id": node_id})

    # TODO: Send job to node agent via WebSocket or HTTP
    # For now, just log and return success
    return True


async def cancel_job_on_node(job_id: int, node_host: str, node_port: int) -> bool:
    """Cancel a running job on a node."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"http://{node_host}:{node_port}/jobs/{job_id}/cancel",
            )
            return response.status_code == 200
    except Exception as e:
        logger.error(f"Failed to cancel job {job_id}: {e}")
        return False


async def get_next_job() -> Optional[dict]:
    """Get the next job from the queue."""
    try:
        return job_queue.get_nowait()
    except asyncio.QueueEmpty:
        return None


class JobScheduler:
    """Simple job scheduler that dispatches jobs to available nodes."""

    def __init__(self):
        self.running = False
        self._task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the scheduler background task."""
        if self.running:
            return
        self.running = True
        self._task = asyncio.create_task(self._run())
        logger.info("Job scheduler started")

    async def stop(self):
        """Stop the scheduler."""
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Job scheduler stopped")

    async def _run(self):
        """Main scheduler loop."""
        while self.running:
            try:
                job = await get_next_job()
                if job:
                    await self._dispatch_job(job)
                await asyncio.sleep(1)  # Poll interval
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
                await asyncio.sleep(5)

    async def _dispatch_job(self, job: dict):
        """Dispatch a job to its assigned node."""
        job_id = job["job_id"]
        node_id = job["node_id"]
        logger.info(f"Dispatching job {job_id} to node {node_id}")
        # TODO: Implement actual job dispatch to node agent


# Global scheduler instance
scheduler = JobScheduler()
