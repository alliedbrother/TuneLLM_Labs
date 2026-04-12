"""Pipeline schemas for PDF-to-Q&A processing."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class PipelineConfig(BaseModel):
    """Configuration for the PDF-to-Q&A pipeline."""

    directory_path: str = Field(..., min_length=1)
    dataset_name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None

    # PDF processing
    chunk_size: int = Field(default=1500, ge=200, le=10000)
    chunk_overlap: int = Field(default=200, ge=0, le=2000)

    # Q&A generation
    qa_provider: str = Field(default="anthropic", pattern="^(anthropic|openai)$")
    qa_api_key: Optional[str] = None  # User-provided API key (takes priority over env)
    qa_model: Optional[str] = None
    num_qa_per_chunk: int = Field(default=3, ge=1, le=10)

    # Train/test split
    test_split_ratio: float = Field(default=0.2, ge=0.05, le=0.5)
    split_seed: int = 42


class PipelineJobResponse(BaseModel):
    """Response for a pipeline job."""

    id: int
    name: str
    status: str
    directory_path: str
    total_pdfs: int
    processed_pdfs: int
    total_chunks: int
    generated_qa_pairs: int
    train_dataset_id: Optional[int]
    test_dataset_id: Optional[int]
    error_message: Optional[str]
    owner_id: int
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class PipelineStartResponse(BaseModel):
    """Response after starting a pipeline."""

    pipeline_job_id: int
    status: str
    message: str
