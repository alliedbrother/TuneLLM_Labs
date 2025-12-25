"""Model inference endpoints router."""

from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.model import ModelStatus, TrainedModel
from app.models.user import User
from app.services.auth import get_current_user

router = APIRouter()


class GenerateRequest(BaseModel):
    """Request schema for text generation."""

    prompt: str
    max_new_tokens: int = Field(default=256, ge=1, le=4096)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    top_k: int = Field(default=50, ge=1)
    repetition_penalty: float = Field(default=1.1, ge=1.0, le=2.0)
    do_sample: bool = True
    stream: bool = False


class GenerateResponse(BaseModel):
    """Response schema for text generation."""

    generated_text: str
    model_id: int
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None


@router.post("/endpoints/{model_id}/generate", response_model=GenerateResponse)
async def generate(
    model_id: int,
    request: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GenerateResponse:
    """Generate text using a deployed model."""
    # Get model
    result = await db.execute(
        select(TrainedModel).where(
            TrainedModel.id == model_id,
            TrainedModel.owner_id == current_user.id,
        )
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found",
        )

    if model.status != ModelStatus.DEPLOYED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Model is not deployed",
        )

    if not model.endpoint_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Model endpoint URL not configured",
        )

    # Forward request to inference server
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{model.endpoint_url}/generate",
                json={
                    "prompt": request.prompt,
                    "max_new_tokens": request.max_new_tokens,
                    "temperature": request.temperature,
                    "top_p": request.top_p,
                    "top_k": request.top_k,
                    "repetition_penalty": request.repetition_penalty,
                    "do_sample": request.do_sample,
                },
            )
            response.raise_for_status()
            data = response.json()

            return GenerateResponse(
                generated_text=data.get("generated_text", ""),
                model_id=model_id,
                prompt_tokens=data.get("prompt_tokens"),
                completion_tokens=data.get("completion_tokens"),
            )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Inference server is not reachable",
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Inference server error: {e.response.text}",
        )


@router.post("/endpoints/{model_id}/generate/stream")
async def generate_stream(
    model_id: int,
    request: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Generate text with streaming using a deployed model."""
    # Get model
    result = await db.execute(
        select(TrainedModel).where(
            TrainedModel.id == model_id,
            TrainedModel.owner_id == current_user.id,
        )
    )
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found",
        )

    if model.status != ModelStatus.DEPLOYED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Model is not deployed",
        )

    if not model.endpoint_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Model endpoint URL not configured",
        )

    async def stream_response():
        """Stream response from inference server."""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{model.endpoint_url}/generate/stream",
                    json={
                        "prompt": request.prompt,
                        "max_new_tokens": request.max_new_tokens,
                        "temperature": request.temperature,
                        "top_p": request.top_p,
                        "top_k": request.top_k,
                        "repetition_penalty": request.repetition_penalty,
                        "do_sample": request.do_sample,
                    },
                ) as response:
                    async for chunk in response.aiter_text():
                        yield chunk
        except Exception as e:
            yield f"Error: {str(e)}"

    return StreamingResponse(
        stream_response(),
        media_type="text/event-stream",
    )
