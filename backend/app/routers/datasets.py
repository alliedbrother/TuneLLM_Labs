"""Dataset management router."""

import os
from typing import Optional

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.dataset import Dataset
from app.models.user import User
from app.schemas.dataset import DatasetResponse, DatasetUpdate
from app.services.auth import get_current_user

router = APIRouter()


@router.post("/datasets", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def create_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: Optional[str] = Form(None),
    format: str = Form("jsonl"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dataset:
    """Upload a new dataset."""
    # Validate format
    if format not in ["jsonl", "csv", "parquet"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid format. Must be jsonl, csv, or parquet",
        )

    # Create storage directory
    user_dir = os.path.join(settings.storage_path, "datasets", str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)

    # Save file
    file_path = os.path.join(user_dir, f"{name}.{format}")
    file_size = 0

    async with aiofiles.open(file_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):  # 1MB chunks
            await f.write(chunk)
            file_size += len(chunk)

    # Count samples (basic implementation)
    num_samples = None
    if format == "jsonl":
        async with aiofiles.open(file_path, "r") as f:
            content = await f.read()
            num_samples = len(content.strip().split("\n"))

    # Create dataset record
    dataset = Dataset(
        name=name,
        description=description,
        file_path=file_path,
        file_size=file_size,
        format=format,
        num_samples=num_samples,
        owner_id=current_user.id,
    )
    db.add(dataset)
    await db.flush()
    await db.refresh(dataset)
    return dataset


@router.get("/datasets", response_model=list[DatasetResponse])
async def list_datasets(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Dataset]:
    """List all datasets for the current user."""
    result = await db.execute(
        select(Dataset)
        .where(Dataset.owner_id == current_user.id)
        .offset(skip)
        .limit(limit)
        .order_by(Dataset.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/datasets/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dataset:
    """Get a specific dataset."""
    result = await db.execute(
        select(Dataset).where(
            Dataset.id == dataset_id,
            Dataset.owner_id == current_user.id,
        )
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found",
        )
    return dataset


@router.patch("/datasets/{dataset_id}", response_model=DatasetResponse)
async def update_dataset(
    dataset_id: int,
    dataset_update: DatasetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dataset:
    """Update a dataset."""
    result = await db.execute(
        select(Dataset).where(
            Dataset.id == dataset_id,
            Dataset.owner_id == current_user.id,
        )
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found",
        )

    update_data = dataset_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(dataset, field, value)

    await db.flush()
    await db.refresh(dataset)
    return dataset


@router.delete("/datasets/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a dataset."""
    result = await db.execute(
        select(Dataset).where(
            Dataset.id == dataset_id,
            Dataset.owner_id == current_user.id,
        )
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found",
        )

    # Delete file
    if os.path.exists(dataset.file_path):
        os.remove(dataset.file_path)

    await db.delete(dataset)
