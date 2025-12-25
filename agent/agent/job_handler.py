"""Job execution handler."""

import asyncio
import logging
from typing import Optional

from agent.api_client import APIClient
from agent.docker_runner import DockerRunner

logger = logging.getLogger(__name__)


class JobHandler:
    """Handles execution of fine-tuning jobs."""

    def __init__(
        self,
        api_client: APIClient,
        docker_runner: DockerRunner,
    ):
        self.api = api_client
        self.docker = docker_runner
        self.current_job: Optional[int] = None

    async def execute_job(self, job: dict) -> bool:
        """Execute a fine-tuning job."""
        job_id = job["id"]
        config = job["config"]

        logger.info(f"Starting job {job_id}: {job['name']}")
        self.current_job = job_id

        try:
            # Update status to running
            await self.api.update_job_status(job_id, "running")
            await self.api.send_job_log(job_id, "INFO", "Job started")

            # Start the training container
            container = self.docker.run_training_job(
                job_id=job_id,
                config=config,
            )

            # Stream logs asynchronously
            log_task = asyncio.create_task(
                self._stream_logs(job_id, container)
            )

            # Wait for completion
            result = await asyncio.to_thread(
                self.docker.wait_for_container, container
            )

            # Cancel log streaming
            log_task.cancel()
            try:
                await log_task
            except asyncio.CancelledError:
                pass

            # Check result
            if result["status_code"] == 0:
                await self.api.update_job_status(job_id, "completed")
                await self.api.send_job_log(job_id, "INFO", "Job completed successfully")
                logger.info(f"Job {job_id} completed successfully")
                return True
            else:
                error_msg = f"Container exited with code {result['status_code']}"
                await self.api.update_job_status(
                    job_id, "failed", error_message=error_msg
                )
                await self.api.send_job_log(job_id, "ERROR", error_msg)
                logger.error(f"Job {job_id} failed: {error_msg}")
                return False

        except Exception as e:
            error_msg = str(e)
            logger.exception(f"Job {job_id} failed with exception")
            await self.api.update_job_status(
                job_id, "failed", error_message=error_msg
            )
            await self.api.send_job_log(job_id, "ERROR", f"Exception: {error_msg}")
            return False
        finally:
            self.current_job = None
            self.docker.cleanup_container(job_id)

    async def _stream_logs(self, job_id: int, container):
        """Stream logs from container to API."""
        try:
            await self.docker.stream_logs(
                container,
                on_log=lambda log: asyncio.create_task(
                    self.api.send_job_log(job_id, "INFO", log)
                ),
            )
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"Error streaming logs for job {job_id}: {e}")

    async def cancel_job(self, job_id: int) -> bool:
        """Cancel a running job."""
        if self.current_job != job_id:
            logger.warning(f"Job {job_id} is not currently running")
            return False

        logger.info(f"Cancelling job {job_id}")
        success = self.docker.stop_container(job_id)

        if success:
            await self.api.update_job_status(job_id, "cancelled")
            await self.api.send_job_log(job_id, "INFO", "Job cancelled by user")

        return success

    def get_current_job(self) -> Optional[int]:
        """Get the currently running job ID."""
        return self.current_job
