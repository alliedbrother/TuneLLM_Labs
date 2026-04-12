"""Job execution handler — supports both Docker and direct execution modes."""

import asyncio
import json
import logging
import os
import time
from typing import Optional

from agent.api_client import APIClient
from agent.config import settings

logger = logging.getLogger(__name__)


class JobHandler:
    """Handles execution of fine-tuning jobs."""

    def __init__(self, api_client: APIClient, runner):
        """Initialize with API client and a runner (DockerRunner or DirectRunner)."""
        self.api = api_client
        self.runner = runner
        self.current_job: Optional[int] = None

        # Batch log/progress state
        self._pending_logs: list[tuple[str, str]] = []  # (level, message)
        self._last_progress: Optional[dict] = None
        self._loss_history_buffer: list[dict] = []  # Buffered loss entries
        self._last_flush_time: float = 0

    async def _download_dataset(self, job: dict) -> str:
        """Download the dataset from the backend and return the local path."""
        dataset_id = job.get("dataset_id")
        if not dataset_id:
            raise ValueError("Job has no dataset_id")

        dataset_dir = os.path.join(settings.data_path, "datasets")
        os.makedirs(dataset_dir, exist_ok=True)

        dataset_meta = await self.api.get_dataset(dataset_id)
        file_name = f"dataset_{dataset_id}.{dataset_meta.get('format', 'jsonl')}"
        local_path = os.path.join(dataset_dir, file_name)

        if not os.path.exists(local_path):
            logger.info(f"Downloading dataset {dataset_id} to {local_path}")
            await self.api.download_dataset(dataset_id, local_path)
        else:
            logger.info(f"Dataset {dataset_id} already cached at {local_path}")

        return local_path

    async def _flush_logs_and_progress(self, job_id: int, force: bool = False):
        """Send batched logs and progress update to backend."""
        now = time.time()
        if not force and (now - self._last_flush_time) < 3:
            return  # Flush at most every 3 seconds

        # Send pending logs (batch as one message)
        if self._pending_logs:
            combined = "\n".join(f"[{level}] {msg}" for level, msg in self._pending_logs[-20:])
            try:
                await self.api.send_job_log(job_id, "INFO", combined)
            except Exception as e:
                logger.warning(f"Failed to send logs: {e}")
            self._pending_logs.clear()

        # Send progress update with loss history
        if self._last_progress:
            try:
                kwargs = {
                    "current_step": self._last_progress.get("step"),
                    "total_steps": self._last_progress.get("total_steps"),
                    "current_epoch": int(self._last_progress.get("epoch", 0)),
                    "train_loss": self._last_progress.get("loss"),
                    "eval_loss": self._last_progress.get("eval_loss"),
                }
                if self._loss_history_buffer:
                    kwargs["loss_history"] = self._loss_history_buffer
                    self._loss_history_buffer = []
                await self.api.update_job_status(job_id, "running", **kwargs)
            except Exception as e:
                logger.warning(f"Failed to send progress: {e}")

        self._last_flush_time = now

    async def _handle_log_line(self, job_id: int, line: str):
        """Parse a single output line from the training process."""
        # Parse phase markers
        if line.startswith("__PHASE__:"):
            phase = line.split("__PHASE__:", 1)[1].strip()
            try:
                await self.api.update_job_status(job_id, "running", phase=phase)
                logger.info(f"Job {job_id}: phase → {phase}")
            except Exception as e:
                logger.warning(f"Failed to update phase: {e}")
            return

        # Parse structured progress markers
        if line.startswith("__PROGRESS__:"):
            try:
                self._last_progress = json.loads(line.split("__PROGRESS__:", 1)[1])
                step = self._last_progress.get("step", "?")
                total = self._last_progress.get("total_steps", "?")
                loss = self._last_progress.get("loss", "?")
                logger.info(f"Job {job_id}: step {step}/{total}, loss={loss}")
                # Buffer for loss chart
                self._loss_history_buffer.append({
                    "step": self._last_progress.get("step"),
                    "loss": self._last_progress.get("loss"),
                    "lr": self._last_progress.get("learning_rate"),
                    "epoch": self._last_progress.get("epoch"),
                })
            except json.JSONDecodeError:
                pass
            await self._flush_logs_and_progress(job_id)
            return

        if line.startswith("__BASELINE_METRICS__:"):
            try:
                metrics = json.loads(line.split("__BASELINE_METRICS__:", 1)[1])
                await self.api.update_job_status(
                    job_id, "running", phase="training", baseline_metrics=metrics
                )
                logger.info(f"Job {job_id}: baseline metrics: {metrics}")
            except Exception as e:
                logger.warning(f"Failed to parse baseline metrics: {e}")
            return

        if line.startswith("__FINAL_METRICS__:"):
            try:
                metrics = json.loads(line.split("__FINAL_METRICS__:", 1)[1])
                await self.api.update_job_status(
                    job_id, "running", phase="final_eval", final_metrics=metrics
                )
                logger.info(f"Job {job_id}: final metrics: {metrics}")
            except Exception as e:
                logger.warning(f"Failed to parse final metrics: {e}")
            return

        if line.startswith("__TRAINING_COMPLETE__:"):
            logger.info(f"Job {job_id}: training complete marker received")
            return

        # Regular log line — buffer it
        self._pending_logs.append(("INFO", line))

        # Flush periodically
        if len(self._pending_logs) >= 10:
            await self._flush_logs_and_progress(job_id)

    async def execute_job(self, job: dict) -> bool:
        """Execute a fine-tuning job."""
        job_id = job["id"]
        config = dict(job["config"])  # Copy so we can modify

        logger.info(f"Starting job {job_id}: {job['name']}")
        self.current_job = job_id
        self._pending_logs = []
        self._last_progress = None
        self._last_flush_time = time.time()

        try:
            # Update status to running
            await self.api.update_job_status(job_id, "running", phase="starting")
            await self.api.send_job_log(job_id, "INFO", "Job started — downloading dataset...")

            # Download dataset
            try:
                dataset_path = await self._download_dataset(job)
                if "dataset" not in config:
                    config["dataset"] = {}
                config["dataset"]["source"] = dataset_path
                # Use same dataset for eval if evaluation is enabled
                if config.get("evaluate_before") or config.get("evaluate_after"):
                    config["test_dataset"] = dataset_path
                await self.api.send_job_log(job_id, "INFO", f"Dataset ready: {dataset_path}")
            except Exception as e:
                await self.api.update_job_status(job_id, "failed", error_message=f"Dataset download failed: {e}")
                return False

            # Set output directory
            config["output_dir"] = os.path.join(settings.model_path, config.get("run_name", f"job-{job_id}"))

            # Update phase
            if config.get("evaluate_before"):
                await self.api.update_job_status(job_id, "running", phase="baseline_eval")
                await self.api.send_job_log(job_id, "INFO", "Running baseline evaluation...")
            else:
                await self.api.update_job_status(job_id, "running", phase="training")

            # Run training
            await self.api.send_job_log(job_id, "INFO", f"Launching training: {config.get('base_model')} with {config.get('method', 'lora')}")

            result = await self.runner.run_training_job(
                job_id=job_id,
                config=config,
                on_log=lambda line: self._handle_log_line(job_id, line),
            )

            # Flush remaining logs
            await self._flush_logs_and_progress(job_id, force=True)

            # Check result
            if result["status_code"] == 0:
                # Parse any remaining metrics from logs
                logs_text = result.get("logs", "")
                baseline = self._parse_metrics(logs_text, "__BASELINE_METRICS__:")
                final = self._parse_metrics(logs_text, "__FINAL_METRICS__:")

                update_kwargs = {"phase": "completed"}
                if baseline:
                    update_kwargs["baseline_metrics"] = baseline
                if final:
                    update_kwargs["final_metrics"] = final

                await self.api.update_job_status(job_id, "completed", **update_kwargs)
                await self.api.send_job_log(job_id, "INFO", "Job completed successfully!")

                # Auto-create TrainedModel record + upload adapter
                try:
                    output_dir = config.get("output_dir", "")
                    artifact_path = os.path.join(output_dir, "final") if output_dir else ""

                    # Create model record first
                    model_result = await self.api.complete_job(job_id, artifact_path)
                    model_id = model_result.get('model_id')
                    logger.info(f"Job {job_id}: created model #{model_id}")
                    await self.api.send_job_log(job_id, "INFO", f"Model created: #{model_id}")

                    # Zip and upload the adapter files to backend
                    if artifact_path and os.path.isdir(artifact_path):
                        await self.api.send_job_log(job_id, "INFO", "Uploading model adapter to server...")
                        import shutil
                        zip_path = f"/tmp/tunellm_model_{job_id}"
                        shutil.make_archive(zip_path, "zip", artifact_path)
                        zip_file = f"{zip_path}.zip"
                        upload_result = await self.api.upload_model(job_id, zip_file)
                        logger.info(f"Job {job_id}: model uploaded ({upload_result.get('size', 0)} bytes)")
                        await self.api.send_job_log(job_id, "INFO", f"Model uploaded ({upload_result.get('size', 0)} bytes)")
                        # Cleanup zip
                        try:
                            os.unlink(zip_file)
                        except OSError:
                            pass
                    else:
                        logger.warning(f"Job {job_id}: adapter path not found: {artifact_path}")

                except Exception as e:
                    logger.warning(f"Failed to create/upload model: {e}")
                    await self.api.send_job_log(job_id, "WARNING", f"Model upload failed: {str(e)[:100]}")

                logger.info(f"Job {job_id} completed successfully")
                return True
            else:
                error_msg = f"Training process exited with code {result['status_code']}"
                # Try to find the actual error from the last few lines
                log_lines = result.get("logs", "").strip().split("\n")
                error_lines = [l for l in log_lines[-10:] if "error" in l.lower() or "exception" in l.lower()]
                if error_lines:
                    error_msg += f": {error_lines[-1][:200]}"

                await self.api.update_job_status(job_id, "failed", error_message=error_msg)
                await self.api.send_job_log(job_id, "ERROR", error_msg)
                logger.error(f"Job {job_id} failed: {error_msg}")
                return False

        except Exception as e:
            error_msg = str(e)
            logger.exception(f"Job {job_id} failed with exception")
            try:
                await self.api.update_job_status(job_id, "failed", error_message=error_msg)
                await self.api.send_job_log(job_id, "ERROR", f"Exception: {error_msg}")
            except Exception:
                pass
            return False
        finally:
            self.current_job = None

    def _parse_metrics(self, logs: str, marker: str) -> Optional[dict]:
        """Parse metrics JSON from logs using a marker prefix."""
        for line in logs.split("\n"):
            if marker in line:
                json_str = line.split(marker, 1)[1].strip()
                try:
                    return json.loads(json_str)
                except json.JSONDecodeError:
                    pass
        return None

    async def cancel_job(self, job_id: int) -> bool:
        """Cancel a running job."""
        if self.current_job != job_id:
            return False
        logger.info(f"Cancelling job {job_id}")
        success = await self.runner.stop_job(job_id)
        if success:
            await self.api.update_job_status(job_id, "cancelled")
            await self.api.send_job_log(job_id, "INFO", "Job cancelled by user")
        return success

    def get_current_job(self) -> Optional[int]:
        """Get the currently running job ID."""
        return self.current_job
