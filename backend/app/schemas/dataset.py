"""Dataset schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DatasetCreate(BaseModel):
    """Schema for creating a dataset."""

    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    format: str = Field(default="jsonl", pattern="^(jsonl|csv|parquet)$")


class DatasetUpdate(BaseModel):
    """Schema for updating a dataset."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None


class DatasetResponse(BaseModel):
    """Schema for dataset response."""

    id: int
    name: str
    description: Optional[str]
    file_path: str
    file_size: int
    format: str
    num_samples: Optional[int]
    parent_dataset_id: Optional[int] = None
    split_type: Optional[str] = None
    owner_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
