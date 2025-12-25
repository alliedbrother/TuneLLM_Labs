"""Docker container runner for training jobs."""

import asyncio
import logging
from typing import Any, Callable, Optional

import docker
from docker.errors import ContainerError, ImageNotFound
from docker.models.containers import Container

from agent.config import settings

logger = logging.getLogger(__name__)


class DockerRunner:
    """Manages Docker containers for training and inference."""

    def __init__(self):
        self.client = docker.from_env()
        self.running_containers: dict[int, Container] = {}

    def pull_image(self, image: str):
        """Pull a Docker image."""
        logger.info(f"Pulling image: {image}")
        try:
            self.client.images.pull(image)
        except Exception as e:
            logger.error(f"Failed to pull image {image}: {e}")
            raise

    def run_training_job(
        self,
        job_id: int,
        config: dict[str, Any],
        gpu_ids: Optional[list[int]] = None,
        on_log: Optional[Callable[[str], None]] = None,
    ) -> Container:
        """Run a training job in a Docker container."""
        image = settings.training_image
        gpu_ids = gpu_ids or settings.gpu_list

        # Build environment variables
        env = {
            "JOB_ID": str(job_id),
            "JOB_CONFIG": str(config),
            "CUDA_VISIBLE_DEVICES": ",".join(map(str, gpu_ids)),
        }

        # Add HuggingFace token if available
        if config.get("hf_token"):
            env["HF_TOKEN"] = config["hf_token"]

        # Build volume mounts
        volumes = {
            settings.data_path: {"bind": "/data", "mode": "ro"},
            settings.model_path: {"bind": "/models", "mode": "rw"},
            settings.log_path: {"bind": "/logs", "mode": "rw"},
        }

        # GPU configuration
        device_requests = []
        if gpu_ids:
            device_requests = [
                docker.types.DeviceRequest(
                    device_ids=[str(g) for g in gpu_ids],
                    capabilities=[["gpu"]],
                )
            ]

        logger.info(f"Starting training container for job {job_id}")
        logger.debug(f"Image: {image}, GPUs: {gpu_ids}")

        try:
            container = self.client.containers.run(
                image=image,
                command=["python", "train.py", "--config", "/tmp/config.yaml"],
                environment=env,
                volumes=volumes,
                device_requests=device_requests,
                detach=True,
                remove=False,  # Keep for log retrieval
                shm_size="16g",  # Shared memory for PyTorch
                name=f"tunellm-job-{job_id}",
            )
            self.running_containers[job_id] = container
            return container
        except ImageNotFound:
            logger.error(f"Image not found: {image}")
            raise
        except ContainerError as e:
            logger.error(f"Container error: {e}")
            raise

    async def stream_logs(
        self,
        container: Container,
        on_log: Callable[[str], None],
    ):
        """Stream logs from a container."""
        for log in container.logs(stream=True, follow=True):
            line = log.decode("utf-8").strip()
            if line:
                on_log(line)
                await asyncio.sleep(0)  # Yield to event loop

    def wait_for_container(self, container: Container) -> dict:
        """Wait for a container to complete and return result."""
        result = container.wait()
        return {
            "status_code": result["StatusCode"],
            "logs": container.logs().decode("utf-8"),
        }

    def stop_container(self, job_id: int, timeout: int = 30) -> bool:
        """Stop a running container."""
        container = self.running_containers.get(job_id)
        if not container:
            logger.warning(f"No container found for job {job_id}")
            return False

        try:
            container.stop(timeout=timeout)
            container.remove()
            del self.running_containers[job_id]
            return True
        except Exception as e:
            logger.error(f"Failed to stop container for job {job_id}: {e}")
            return False

    def cleanup_container(self, job_id: int):
        """Clean up a completed container."""
        container = self.running_containers.get(job_id)
        if container:
            try:
                container.remove()
            except Exception:
                pass
            del self.running_containers[job_id]

    def get_container_logs(self, job_id: int, tail: int = 100) -> str:
        """Get logs from a container."""
        container = self.running_containers.get(job_id)
        if not container:
            return ""
        return container.logs(tail=tail).decode("utf-8")

    def run_inference_server(
        self,
        model_id: int,
        model_path: str,
        port: int = 8080,
        gpu_ids: Optional[list[int]] = None,
    ) -> Container:
        """Run an inference server container."""
        image = settings.inference_image
        gpu_ids = gpu_ids or settings.gpu_list[:1]  # Use single GPU by default

        env = {
            "MODEL_PATH": model_path,
            "PORT": str(port),
            "CUDA_VISIBLE_DEVICES": ",".join(map(str, gpu_ids)),
        }

        volumes = {
            settings.model_path: {"bind": "/models", "mode": "ro"},
        }

        device_requests = []
        if gpu_ids:
            device_requests = [
                docker.types.DeviceRequest(
                    device_ids=[str(g) for g in gpu_ids],
                    capabilities=[["gpu"]],
                )
            ]

        logger.info(f"Starting inference server for model {model_id} on port {port}")

        container = self.client.containers.run(
            image=image,
            environment=env,
            volumes=volumes,
            device_requests=device_requests,
            ports={f"{port}/tcp": port},
            detach=True,
            remove=False,
            name=f"tunellm-inference-{model_id}",
        )
        return container
