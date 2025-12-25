"""Inference server configuration."""

from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Inference server settings."""

    # Server settings
    host: str = "0.0.0.0"
    port: int = 8080
    workers: int = 1

    # Model settings
    model_path: str = ""
    base_model: Optional[str] = None
    adapter_path: Optional[str] = None
    quantization: Optional[str] = None  # "4bit", "8bit", or None

    # Generation defaults
    max_new_tokens: int = 512
    temperature: float = 0.7
    top_p: float = 0.9
    top_k: int = 50
    repetition_penalty: float = 1.1

    # Device settings
    device_map: str = "auto"
    torch_dtype: str = "auto"  # "float16", "bfloat16", "float32", or "auto"

    # Batching
    max_batch_size: int = 8
    max_concurrent_requests: int = 10

    # Control plane integration
    control_plane_url: Optional[str] = None
    api_key: Optional[str] = None
    endpoint_id: Optional[int] = None

    class Config:
        env_prefix = "INFERENCE_"
        env_file = ".env"


settings = Settings()
