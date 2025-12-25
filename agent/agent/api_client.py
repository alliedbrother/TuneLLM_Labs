"""API client for communicating with the control plane."""

import logging
from typing import Any, Optional

import httpx

from agent.config import settings

logger = logging.getLogger(__name__)


class APIClient:
    """HTTP client for control plane communication."""

    def __init__(
        self,
        server_url: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        self.server_url = (server_url or settings.server_url).rstrip("/")
        self.api_key = api_key or settings.api_key
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.disconnect()

    async def connect(self):
        """Initialize the HTTP client."""
        self._client = httpx.AsyncClient(
            base_url=self.server_url,
            headers={"X-API-Key": self.api_key} if self.api_key else {},
            timeout=30.0,
        )

    async def disconnect(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        """Get the HTTP client."""
        if not self._client:
            raise RuntimeError("Client not connected. Call connect() first.")
        return self._client

    async def register_node(self, node_name: str) -> dict:
        """Register this node with the control plane."""
        response = await self.client.post(
            "/api/v1/hardware/register",
            json={"name": node_name},
        )
        response.raise_for_status()
        return response.json()

    async def send_heartbeat(self, node_id: int, stats: dict) -> dict:
        """Send heartbeat with system stats."""
        response = await self.client.post(
            f"/api/v1/hardware/{node_id}/heartbeat",
            json=stats,
        )
        response.raise_for_status()
        return response.json()

    async def get_pending_jobs(self, node_id: int) -> list[dict]:
        """Get jobs assigned to this node."""
        response = await self.client.get(
            "/api/v1/finetune-jobs",
            params={"node_id": node_id, "status": "pending"},
        )
        response.raise_for_status()
        return response.json()

    async def update_job_status(
        self,
        job_id: int,
        status: str,
        **kwargs: Any,
    ) -> dict:
        """Update job status."""
        data = {"status": status, **kwargs}
        response = await self.client.put(
            f"/api/v1/finetune-jobs/{job_id}/status",
            json=data,
        )
        response.raise_for_status()
        return response.json()

    async def send_job_log(
        self,
        job_id: int,
        level: str,
        message: str,
    ):
        """Send a log message for a job."""
        await self.client.post(
            f"/api/v1/finetune-jobs/{job_id}/logs",
            params={"level": level, "message": message},
        )

    async def get_dataset(self, dataset_id: int) -> dict:
        """Get dataset metadata."""
        response = await self.client.get(f"/api/v1/datasets/{dataset_id}")
        response.raise_for_status()
        return response.json()

    async def download_dataset(self, dataset_id: int, path: str) -> str:
        """Download a dataset file."""
        response = await self.client.get(
            f"/api/v1/datasets/{dataset_id}/download",
        )
        response.raise_for_status()

        with open(path, "wb") as f:
            f.write(response.content)

        return path
