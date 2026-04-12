"""Lambda Labs cloud GPU provider service."""

import logging
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

LAMBDA_API_BASE = "https://cloud.lambdalabs.com/api/v1"


class LambdaProvider:
    """Interact with the Lambda Labs API to list and manage GPU instances."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._auth = (self.api_key, "")

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(
                method,
                f"{LAMBDA_API_BASE}{path}",
                auth=self._auth,
                **kwargs,
            )
            resp.raise_for_status()
            return resp.json()

    async def list_instances(self) -> list[dict]:
        """List all running Lambda Labs instances."""
        try:
            data = await self._request("GET", "/instances")
            instances = data.get("data", [])
            return [
                {
                    "id": str(inst.get("id")),
                    "name": inst.get("name", ""),
                    "status": inst.get("status", "unknown"),
                    "gpu_type": inst.get("instance_type", {}).get("name", "Unknown")
                    if isinstance(inst.get("instance_type"), dict)
                    else str(inst.get("instance_type", "Unknown")),
                    "gpu_count": inst.get("instance_type", {}).get("specs", {}).get("gpus", 1)
                    if isinstance(inst.get("instance_type"), dict)
                    else 1,
                    "ip_address": inst.get("ip"),
                    "region": inst.get("region", {}).get("name", "")
                    if isinstance(inst.get("region"), dict)
                    else str(inst.get("region", "")),
                }
                for inst in instances
            ]
        except Exception as e:
            logger.error(f"Failed to list Lambda instances: {e}")
            raise

    async def list_available_types(self) -> list[dict]:
        """List available GPU instance types and their pricing."""
        try:
            data = await self._request("GET", "/instance-types")
            types_data = data.get("data", {})
            result = []
            for type_name, info in types_data.items():
                instance_type = info.get("instance_type", {})
                specs = instance_type.get("specs", {})
                regions = info.get("regions_with_capacity_available", [])
                if regions:
                    result.append({
                        "id": type_name,
                        "gpu_name": instance_type.get("description", type_name),
                        "gpu_count": specs.get("gpus", 1),
                        "gpu_ram_gb": specs.get("memory_gib", 0) / specs.get("gpus", 1)
                        if specs.get("gpus", 0) > 0
                        else 0,
                        "vcpus": specs.get("vcpus", 0),
                        "ram_gb": specs.get("memory_gib", 0),
                        "storage_gb": specs.get("storage_gib", 0),
                        "price_per_hour": instance_type.get(
                            "price_cents_per_hour", 0
                        ) / 100,
                        "regions": [
                            r.get("name", "") if isinstance(r, dict) else str(r)
                            for r in regions
                        ],
                    })
            return sorted(result, key=lambda x: x["price_per_hour"])
        except Exception as e:
            logger.error(f"Failed to list Lambda instance types: {e}")
            raise

    async def destroy_instance(self, instance_id: str) -> bool:
        """Terminate an instance."""
        try:
            await self._request(
                "POST",
                "/instance-operations/terminate",
                json={"instance_ids": [instance_id]},
            )
            return True
        except Exception as e:
            logger.error(f"Failed to destroy Lambda instance {instance_id}: {e}")
            return False
