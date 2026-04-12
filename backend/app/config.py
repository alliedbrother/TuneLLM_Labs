"""Application configuration using Pydantic Settings."""

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    app_name: str = "TuneLLM"
    app_version: str = "0.1.0"
    debug: bool = False
    environment: str = "development"

    # API
    api_prefix: str = "/api/v1"

    # Database
    database_url: str = "postgresql+asyncpg://tunellm:tunellm@localhost:5432/tunellm"

    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Storage
    storage_path: str = "./storage"
    max_upload_size_mb: int = 500

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    # Agent communication
    agent_heartbeat_interval: int = 30
    agent_timeout: int = 120

    # HuggingFace
    hf_token: Optional[str] = None

    # Vast.ai cloud GPU
    vastai_api_key: Optional[str] = None
    vastai_default_disk_gb: int = 50

    # AI providers (for Q&A generation from PDFs)
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None

    # Data pipeline
    allowed_data_paths: str = ""

    @property
    def allowed_data_paths_list(self) -> list[str]:
        """Parse allowed data paths from comma-separated string."""
        if not self.allowed_data_paths:
            return []
        return [p.strip() for p in self.allowed_data_paths.split(",")]

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
