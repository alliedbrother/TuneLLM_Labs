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
    metadata: Optional[dict[str, Any]] = None


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
