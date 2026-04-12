"""Agent configuration."""

from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class AgentSettings(BaseSettings):
    """Agent settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="TUNELLM_AGENT_",
    )

    # Agent identification
    node_name: str = "gpu-node-1"
    api_key: Optional[str] = None

    # Server connection
    server_url: str = "http://localhost:8000"

    # Execution mode: "direct" runs training script locally, "docker" uses containers
    execution_mode: str = "direct"

    # Docker settings (only used if execution_mode="docker")
    docker_socket: str = "unix:///var/run/docker.sock"
    training_image: str = "tunellm-training:latest"
    inference_image: str = "tunellm-inference:latest"

    # Direct execution settings
    training_script: str = "/workspace/tunellm-agent/train_unsloth.py"
    python_executable: str = "python3"

    # Resource limits
    gpu_ids: str = "0"  # Comma-separated GPU IDs
    max_concurrent_jobs: int = 1

    # Heartbeat
    heartbeat_interval: int = 30  # seconds

    # Storage
    data_path: str = "/data"
    model_path: str = "/models"
    log_path: str = "/logs"

    @property
    def gpu_list(self) -> list[int]:
        """Parse GPU IDs from string."""
        return [int(x.strip()) for x in self.gpu_ids.split(",") if x.strip()]


settings = AgentSettings()
