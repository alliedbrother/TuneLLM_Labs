"""TuneLLM Backend - Main FastAPI Application."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import close_db, init_db
from app.routers import auth, cloud, datasets, endpoints, hardware, jobs, models, pipeline


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    # Startup
    await init_db()
    yield
    # Shutdown
    await close_db()


def create_application() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Open-source LLM Fine-Tuning Platform",
        docs_url=f"{settings.api_prefix}/docs",
        redoc_url=f"{settings.api_prefix}/redoc",
        openapi_url=f"{settings.api_prefix}/openapi.json",
        lifespan=lifespan,
    )

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(auth.router, prefix=settings.api_prefix, tags=["Authentication"])
    app.include_router(datasets.router, prefix=settings.api_prefix, tags=["Datasets"])
    app.include_router(jobs.router, prefix=settings.api_prefix, tags=["Fine-Tuning Jobs"])
    app.include_router(models.router, prefix=settings.api_prefix, tags=["Models"])
    app.include_router(hardware.router, prefix=settings.api_prefix, tags=["Hardware"])
    app.include_router(endpoints.router, prefix=settings.api_prefix, tags=["Endpoints"])
    app.include_router(cloud.router, prefix=settings.api_prefix, tags=["Cloud GPU"])
    app.include_router(pipeline.router, prefix=settings.api_prefix, tags=["Data Pipeline"])

    return app


app = create_application()


@app.get("/")
async def root() -> dict:
    """Root endpoint."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": f"{settings.api_prefix}/docs",
    }


@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {"status": "healthy"}
