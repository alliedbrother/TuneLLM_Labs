"""Hardware node schemas."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class NodeCreate(BaseModel):
    """Schema for registering a new node."""

    name: str = Field(..., min_length=1, max_length=255)
    host: Optional[str] = None
    port: Optional[int] = Field(None, ge=1, le=65535)
    is_shared: bool = False


class NodeUpdate(BaseModel):
    """Schema for updating a node."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    is_shared: Optional[bool] = None


class NodeHeartbeat(BaseModel):
    """Schema for node heartbeat updates."""

    gpu_count: int = Field(default=1, ge=0)
    gpu_type: Optional[str] = None
    gpu_memory_gb: Optional[float] = Field(None, ge=0)
    cpu_count: Optional[int] = Field(None, ge=1)
    ram_gb: Optional[float] = Field(None, ge=0)
    disk_gb: Optional[float] = Field(None, ge=0)
    gpu_utilization: Optional[float] = Field(None, ge=0, le=100)
    memory_utilization: Optional[float] = Field(None, ge=0, le=100)
    extra_data: Optional[dict[str, Any]] = None


class NodeResponse(BaseModel):
    """Schema for node response."""

    id: int
    name: str
    status: str
    gpu_count: int
    gpu_type: Optional[str]
    gpu_memory_gb: Optional[float]
    cpu_count: Optional[int]
    ram_gb: Optional[float]
    disk_gb: Optional[float]
    host: Optional[str]
    port: Optional[int]
    gpu_utilization: Optional[float]
    memory_utilization: Optional[float]
    provider: str = "local"
    provider_instance_id: Optional[str] = None
    hourly_cost: Optional[float] = None
    owner_id: int
    is_shared: bool
    created_at: datetime
    last_heartbeat: Optional[datetime]

    model_config = {"from_attributes": True}


class NodeRegistrationResponse(BaseModel):
    """Schema for node registration response."""

    node_id: int
    api_key: str
    message: str = "Node registered successfully"


class CloudGpuOffer(BaseModel):
    """Schema for a Vast.ai GPU offer."""

    id: int
    gpu_name: str
    num_gpus: int
    gpu_ram_gb: float
    cpu_cores: float
    ram_gb: float
    disk_gb: float
    dph_total: float  # dollars per hour
    reliability: float
    inet_down: float
    inet_up: float
    cuda_max_good: Optional[float] = None
    machine_id: int
    verified: bool = False


class CloudProvisionRequest(BaseModel):
    """Schema for provisioning a cloud GPU instance."""

    offer_id: int
    name: str = Field(..., min_length=1, max_length=255)
    disk_gb: int = Field(default=50, ge=10, le=1000)
    docker_image: str = "pytorch/pytorch:2.1.0-cuda12.1-cudnn8-devel"


class CloudProvisionResponse(BaseModel):
    """Response after provisioning a cloud instance."""

    node_id: int
    provider_instance_id: str
    status: str
    message: str
