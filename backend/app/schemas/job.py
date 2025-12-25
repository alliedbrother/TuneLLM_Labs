"""Fine-tuning job schemas."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class LoRAConfig(BaseModel):
    """LoRA configuration."""

    r: int = Field(default=16, ge=1, le=256)
    alpha: int = Field(default=32, ge=1)
    target_modules: list[str] = Field(default=["q_proj", "v_proj"])
    dropout: float = Field(default=0.05, ge=0.0, le=1.0)


class QLoRAConfig(LoRAConfig):
    """QLoRA configuration."""

    bits: int = Field(default=4, ge=2, le=8)
    double_quant: bool = True
    compute_dtype: str = "bf16"


class TrainingConfig(BaseModel):
    """Training hyperparameters."""

    epochs: int = Field(default=3, ge=1)
    batch_size: int = Field(default=16, ge=1)
    micro_batch_size: int = Field(default=4, ge=1)
    learning_rate: float = Field(default=2e-5, gt=0)
    lr_scheduler: str = "cosine"
    warmup_ratio: float = Field(default=0.03, ge=0, le=1)
    mixed_precision: str = Field(default="bf16", pattern="^(no|fp16|bf16)$")
    gradient_checkpointing: bool = True
    seed: int = 42


class JobConfig(BaseModel):
    """Full fine-tuning job configuration."""

    run_name: str = Field(..., min_length=1, max_length=255)
    base_model: str = Field(..., min_length=1)
    tokenizer: Optional[str] = None
    method: str = Field(default="lora", pattern="^(full|lora|qlora|dpo|ppo)$")

    # Method-specific configs
    lora: Optional[LoRAConfig] = None
    qlora: Optional[QLoRAConfig] = None

    # Training config
    training: TrainingConfig = Field(default_factory=TrainingConfig)

    # Data config
    prompt_template: Optional[str] = None
    eval_steps: int = Field(default=100, ge=1)


class JobCreate(BaseModel):
    """Schema for creating a fine-tuning job."""

    name: str = Field(..., min_length=1, max_length=255)
    dataset_id: int
    node_id: Optional[int] = None
    config: JobConfig


class JobStatusUpdate(BaseModel):
    """Schema for updating job status from agent."""

    status: str
    current_epoch: Optional[int] = None
    current_step: Optional[int] = None
    total_steps: Optional[int] = None
    train_loss: Optional[float] = None
    eval_loss: Optional[float] = None
    error_message: Optional[str] = None


class JobLogResponse(BaseModel):
    """Schema for job log entries."""

    id: int
    level: str
    message: str
    timestamp: datetime

    model_config = {"from_attributes": True}


class JobResponse(BaseModel):
    """Schema for job response."""

    id: int
    name: str
    status: str
    base_model: str
    method: str
    config: dict[str, Any]
    current_epoch: int
    total_epochs: int
    current_step: int
    total_steps: Optional[int]
    train_loss: Optional[float]
    eval_loss: Optional[float]
    error_message: Optional[str]
    owner_id: int
    dataset_id: int
    node_id: Optional[int]
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]

    model_config = {"from_attributes": True}
