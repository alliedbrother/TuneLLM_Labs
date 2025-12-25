"""Storage service for datasets and model artifacts."""

import os
import shutil
from pathlib import Path
from typing import Optional

import aiofiles

from app.config import settings


class StorageService:
    """Service for managing file storage."""

    def __init__(self, base_path: Optional[str] = None):
        self.base_path = Path(base_path or settings.storage_path)
        self._ensure_directories()

    def _ensure_directories(self):
        """Ensure storage directories exist."""
        (self.base_path / "datasets").mkdir(parents=True, exist_ok=True)
        (self.base_path / "models").mkdir(parents=True, exist_ok=True)
        (self.base_path / "logs").mkdir(parents=True, exist_ok=True)
        (self.base_path / "tmp").mkdir(parents=True, exist_ok=True)

    def get_dataset_path(self, user_id: int, dataset_name: str, format: str) -> Path:
        """Get the path for a dataset file."""
        user_dir = self.base_path / "datasets" / str(user_id)
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir / f"{dataset_name}.{format}"

    def get_model_path(self, user_id: int, model_name: str) -> Path:
        """Get the path for a model artifact directory."""
        user_dir = self.base_path / "models" / str(user_id)
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir / model_name

    def get_log_path(self, job_id: int) -> Path:
        """Get the path for job logs."""
        log_dir = self.base_path / "logs"
        return log_dir / f"job_{job_id}.log"

    async def save_file(self, path: Path, content: bytes) -> int:
        """Save content to a file and return size."""
        async with aiofiles.open(path, "wb") as f:
            await f.write(content)
        return len(content)

    async def read_file(self, path: Path) -> bytes:
        """Read file content."""
        async with aiofiles.open(path, "rb") as f:
            return await f.read()

    async def append_log(self, job_id: int, message: str):
        """Append a log message for a job."""
        log_path = self.get_log_path(job_id)
        async with aiofiles.open(log_path, "a") as f:
            await f.write(f"{message}\n")

    async def read_logs(self, job_id: int, tail: int = 100) -> list[str]:
        """Read the last N log lines for a job."""
        log_path = self.get_log_path(job_id)
        if not log_path.exists():
            return []

        async with aiofiles.open(log_path, "r") as f:
            content = await f.read()
            lines = content.strip().split("\n")
            return lines[-tail:]

    def delete_file(self, path: Path):
        """Delete a file."""
        if path.exists():
            path.unlink()

    def delete_directory(self, path: Path):
        """Delete a directory and its contents."""
        if path.exists():
            shutil.rmtree(path)

    def get_file_size(self, path: Path) -> int:
        """Get the size of a file in bytes."""
        if path.exists():
            return path.stat().st_size
        return 0

    def list_files(self, directory: Path) -> list[str]:
        """List files in a directory."""
        if not directory.exists():
            return []
        return [f.name for f in directory.iterdir() if f.is_file()]


# Global storage instance
storage = StorageService()
