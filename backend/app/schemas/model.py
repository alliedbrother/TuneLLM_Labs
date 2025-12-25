"""Trained model schemas."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ModelResponse(BaseModel):
    """Schema for trained model response."""

    id: int
    name: str
    description: Optional[str]
    base_model: str
    method: str
    artifact_path: str
    artifact_size: int
    status: str
    metrics: Optional[dict[str, Any]]
    endpoint_url: Optional[str]
    owner_id: int
    job_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ModelDeploy(BaseModel):
    """Schema for deploying a model."""

    node_id: Optional[int] = None
    port: int = Field(default=8080, ge=1024, le=65535)
    max_batch_size: int = Field(default=8, ge=1)
    max_tokens: int = Field(default=2048, ge=1)
