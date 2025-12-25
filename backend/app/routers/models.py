"""Trained models router."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.model import ModelStatus, TrainedModel
from app.models.user import User
from app.schemas.model import ModelDeploy, ModelResponse
from app.services.auth import get_current_user

router = APIRouter()


@router.get("/models", response_model=list[ModelResponse])
async def list_models(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TrainedModel]:
    """List all trained models for the current user."""
    result = await db.execute(
        select(TrainedModel)
        .where(TrainedModel.owner_id == current_user.id)
        .offset(skip)
        .limit(limit)
        .order_by(TrainedModel.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/models/{model_id}", response_model=ModelResponse)
async def get_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TrainedModel:
    """Get a specific model."""
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
    return model


@router.get("/models/{model_id}/download")
async def download_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """Download a trained model."""
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

    # Return model artifact
    return FileResponse(
        path=model.artifact_path,
        filename=f"{model.name}.zip",
        media_type="application/zip",
    )


@router.post("/models/{model_id}/deploy", response_model=ModelResponse)
async def deploy_model(
    model_id: int,
    deploy_config: ModelDeploy,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TrainedModel:
    """Deploy a model for inference."""
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

    if model.status == ModelStatus.DEPLOYED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Model is already deployed",
        )

    # TODO: Actually deploy to node
    model.status = ModelStatus.DEPLOYING.value
    await db.flush()

    # For now, simulate deployment
    model.status = ModelStatus.DEPLOYED.value
    model.endpoint_url = f"http://localhost:{deploy_config.port}"

    await db.flush()
    await db.refresh(model)
    return model


@router.post("/models/{model_id}/undeploy", response_model=ModelResponse)
async def undeploy_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TrainedModel:
    """Undeploy a model."""
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

    # TODO: Actually undeploy from node
    model.status = ModelStatus.READY.value
    model.endpoint_url = None

    await db.flush()
    await db.refresh(model)
    return model


@router.delete("/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a trained model."""
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

    if model.status == ModelStatus.DEPLOYED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete deployed model. Undeploy first.",
        )

    # TODO: Delete artifact files
    await db.delete(model)
