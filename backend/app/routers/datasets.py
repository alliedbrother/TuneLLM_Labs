"""Dataset management router — upload, import from HuggingFace, create from PDF, preview, validate."""

import json
import os
from typing import Optional

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_maker, get_db
from app.models.dataset import Dataset
from app.models.node import Node
from app.models.user import User
from app.routers.hardware import get_node_by_api_key
from app.schemas.dataset import DatasetResponse, DatasetUpdate
from app.services.auth import get_current_user

router = APIRouter()


# --- Validation helpers ---

def _validate_jsonl(file_path: str) -> dict:
    """Validate a JSONL file and return stats."""
    errors = []
    num_rows = 0
    columns = set()
    sample_rows = []

    with open(file_path, "r") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            num_rows += 1
            try:
                row = json.loads(line)
                if not isinstance(row, dict):
                    errors.append(f"Row {i+1}: not a JSON object")
                    continue
                columns.update(row.keys())
                if len(sample_rows) < 5:
                    sample_rows.append(row)
            except json.JSONDecodeError as e:
                errors.append(f"Row {i+1}: invalid JSON — {str(e)[:50]}")
                if len(errors) > 10:
                    errors.append("... (more errors)")
                    break

    # Check for expected training formats
    has_alpaca = {"instruction", "output"}.issubset(columns)
    has_chat = "messages" in columns
    has_openai = {"prompt", "completion"}.issubset(columns)
    format_ok = has_alpaca or has_chat or has_openai

    return {
        "valid": len(errors) == 0 and format_ok,
        "num_rows": num_rows,
        "columns": sorted(columns),
        "errors": errors[:10],
        "format_detected": (
            "alpaca" if has_alpaca else
            "chat" if has_chat else
            "openai" if has_openai else
            "unknown"
        ),
        "sample_rows": sample_rows,
    }


def _validate_csv(file_path: str) -> dict:
    """Validate a CSV file."""
    import csv
    errors = []
    num_rows = 0
    columns = []
    sample_rows = []

    with open(file_path, "r") as f:
        reader = csv.DictReader(f)
        columns = list(reader.fieldnames or [])
        for i, row in enumerate(reader):
            num_rows += 1
            if len(sample_rows) < 5:
                sample_rows.append(dict(row))

    return {
        "valid": num_rows > 0 and len(columns) > 0,
        "num_rows": num_rows,
        "columns": columns,
        "errors": errors,
        "format_detected": "csv",
        "sample_rows": sample_rows,
    }


# --- File browser ---

@router.get("/datasets/browse")
async def browse_filesystem(
    path: str = "/",
    current_user: User = Depends(get_current_user),
) -> dict:
    """Browse the server filesystem. Returns directories and PDF files at the given path."""
    import stat
    from pathlib import Path

    target = Path(path).resolve()
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")

    items = []
    pdf_count = 0
    try:
        for entry in sorted(target.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            # Skip hidden files/dirs
            if entry.name.startswith("."):
                continue
            try:
                is_dir = entry.is_dir()
                is_pdf = entry.suffix.lower() == ".pdf"
                if is_dir or is_pdf:
                    items.append({
                        "name": entry.name,
                        "path": str(entry),
                        "is_dir": is_dir,
                        "size": entry.stat().st_size if not is_dir else None,
                    })
                if is_pdf:
                    pdf_count += 1
            except PermissionError:
                continue
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    return {
        "current_path": str(target),
        "parent_path": str(target.parent) if str(target) != "/" else None,
        "items": items[:200],  # cap at 200 entries
        "pdf_count": pdf_count,
    }


# --- Create from uploaded PDFs ---

@router.post("/datasets/create-from-pdf", response_model=DatasetResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_from_pdf(
    files: list[UploadFile] = File(...),
    name: str = Form(...),
    qa_provider: str = Form("anthropic"),
    qa_api_key: str = Form(""),
    qa_model: str = Form(""),
    num_qa_per_chunk: int = Form(3),
    background_tasks: BackgroundTasks = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dataset:
    """Upload PDF files and generate a Q&A training dataset from them."""
    from app.models.cloud_credential import CloudCredential

    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    # Resolve API key: form input > saved credential > env
    resolved_key = qa_api_key
    if resolved_key:
        # Save/update the key for future use
        result = await db.execute(
            select(CloudCredential).where(
                CloudCredential.user_id == current_user.id,
                CloudCredential.provider == qa_provider,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.api_key = resolved_key
        else:
            db.add(CloudCredential(
                user_id=current_user.id,
                provider=qa_provider,
                api_key=resolved_key,
                label=qa_provider,
            ))
    else:
        # Try loading from saved credentials
        result = await db.execute(
            select(CloudCredential).where(
                CloudCredential.user_id == current_user.id,
                CloudCredential.provider == qa_provider,
            )
        )
        saved = result.scalar_one_or_none()
        if saved:
            resolved_key = saved.api_key

    # Save uploaded PDFs to a temp directory
    import tempfile
    pdf_dir = tempfile.mkdtemp(prefix="tunellm_pdfs_")

    for f in files:
        if not f.filename or not f.filename.lower().endswith(".pdf"):
            continue
        pdf_path = os.path.join(pdf_dir, f.filename)
        async with aiofiles.open(pdf_path, "wb") as out:
            content = await f.read()
            await out.write(content)

    pdf_count = len([f for f in os.listdir(pdf_dir) if f.endswith(".pdf")])
    if pdf_count == 0:
        raise HTTPException(status_code=400, detail="No valid PDF files found")

    # Create placeholder dataset record
    dataset = Dataset(
        name=name,
        description=f"Processing {pdf_count} PDF(s)... generating Q&A pairs",
        file_path="",
        file_size=0,
        format="jsonl",
        num_samples=0,
        owner_id=current_user.id,
    )
    db.add(dataset)
    await db.flush()
    await db.refresh(dataset)

    # Run pipeline in background thread
    import asyncio
    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        None,
        _create_from_pdf_sync,
        pdf_dir, name, qa_provider, resolved_key or "", qa_model or "",
        num_qa_per_chunk, current_user.id, dataset.id,
    )

    return dataset


def _create_from_pdf_sync(
    pdf_dir: str, name: str, qa_provider: str, qa_api_key: str, qa_model: str,
    num_qa_per_chunk: int, user_id: int, dataset_db_id: int,
):
    """Synchronous background: extract text from PDFs, generate Q&A, save JSONL."""
    import logging
    import asyncio
    import shutil

    logger = logging.getLogger(__name__)
    from app.config import settings as app_settings

    try:
        from app.services.pdf_processor import PDFProcessor
        from app.services.qa_generator import QAGenerator

        _update_dataset_db(dataset_db_id, description="Extracting text from PDFs...")

        processor = PDFProcessor()
        all_chunks = []

        pdfs = processor.scan_directory(pdf_dir)
        logger.info(f"PDF->QA: found {len(pdfs)} PDFs in {pdf_dir}")

        for pdf_path in pdfs:
            try:
                pages = processor.extract_text(pdf_path)
                chunks = processor.chunk_text(pages)
                all_chunks.extend(chunks)
                logger.info(f"PDF->QA: {pdf_path} -> {len(pages)} pages, {len(chunks)} chunks")
            except Exception as e:
                logger.warning(f"Skipping {pdf_path}: {e}")

        if not all_chunks:
            _update_dataset_db(dataset_db_id, description="Failed: no text could be extracted from PDFs")
            return

        _update_dataset_db(
            dataset_db_id,
            description=f"Generating Q&A pairs from {len(all_chunks)} text chunks...",
        )

        # Resolve API key
        api_key = qa_api_key
        if not api_key:
            api_key = (
                app_settings.anthropic_api_key
                if qa_provider == "anthropic"
                else app_settings.openai_api_key
            ) or ""

        if not api_key:
            _update_dataset_db(
                dataset_db_id,
                description=f"Failed: no {qa_provider} API key provided. Enter it in the form.",
            )
            return

        generator = QAGenerator(
            provider=qa_provider, api_key=api_key, model=qa_model or None
        )

        # Create a fresh event loop for this thread (can't use asyncio.run in executor thread)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            all_pairs = loop.run_until_complete(
                generator.generate_qa_batch(all_chunks, num_pairs_per_chunk=num_qa_per_chunk)
            )
        finally:
            loop.close()

        logger.info(f"PDF->QA: generated {len(all_pairs)} pairs from {len(all_chunks)} chunks")

        if not all_pairs:
            _update_dataset_db(dataset_db_id, description="Failed: AI generated no Q&A pairs. Check your API key.")
            return

        # Write JSONL
        user_dir = os.path.join(app_settings.storage_path, "datasets", str(user_id))
        os.makedirs(user_dir, exist_ok=True)
        file_path = os.path.join(user_dir, f"{name}.jsonl")

        num_rows = 0
        with open(file_path, "w") as f:
            for pair in all_pairs:
                f.write(json.dumps({
                    "instruction": pair.instruction,
                    "input": pair.input,
                    "output": pair.output,
                }) + "\n")
                num_rows += 1

        file_size = os.path.getsize(file_path)
        _update_dataset_db(
            dataset_db_id,
            file_path=file_path,
            file_size=file_size,
            num_samples=num_rows,
            description=f"Generated from {len(pdfs)} PDF(s): {len(all_chunks)} chunks, {num_rows} Q&A pairs",
        )
        logger.info(f"PDF->QA complete: {num_rows} pairs from {len(pdfs)} PDFs -> {file_path}")

        shutil.rmtree(pdf_dir, ignore_errors=True)

    except Exception as e:
        logger.exception(f"PDF->QA failed: {e}")
        _update_dataset_db(dataset_db_id, description=f"Failed: {str(e)[:200]}")


def _update_dataset_db(dataset_id: int, **fields):
    """Update a dataset record using sync psycopg2."""
    import psycopg2
    from app.config import settings
    try:
        db_url = settings.database_url.replace("postgresql+asyncpg://", "")
        parts = db_url.split("@")
        user_pass, host_db = parts[0], parts[1]
        db_user, db_pass = user_pass.split(":")
        host_port, db_name = host_db.split("/")
        host, port = host_port.split(":") if ":" in host_port else (host_port, "5432")
        conn = psycopg2.connect(dbname=db_name, user=db_user, password=db_pass, host=host, port=port)
        cur = conn.cursor()
        sets = ", ".join(f"{k}=%s" for k in fields)
        vals = list(fields.values()) + [dataset_id]
        cur.execute(f"UPDATE datasets SET {sets} WHERE id=%s", vals)
        conn.commit()
        cur.close()
        conn.close()
    except Exception:
        pass


# --- Upload with validation ---

@router.post("/datasets", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: Optional[str] = Form(None),
    format: str = Form("jsonl"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dataset:
    """Upload a dataset file with validation."""
    if format not in ["jsonl", "csv", "parquet"]:
        raise HTTPException(status_code=400, detail="Format must be jsonl, csv, or parquet")

    user_dir = os.path.join(settings.storage_path, "datasets", str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)

    file_path = os.path.join(user_dir, f"{name}.{format}")
    file_size = 0

    async with aiofiles.open(file_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            await f.write(chunk)
            file_size += len(chunk)

    # Validate the file
    validation = {}
    num_samples = None
    if format == "jsonl":
        validation = _validate_jsonl(file_path)
        num_samples = validation["num_rows"]
        if not validation["valid"]:
            # Still save it but warn
            pass
    elif format == "csv":
        validation = _validate_csv(file_path)
        num_samples = validation["num_rows"]

    desc_parts = []
    if description:
        desc_parts.append(description)
    if validation.get("format_detected"):
        desc_parts.append(f"Format: {validation['format_detected']}")
    if validation.get("columns"):
        desc_parts.append(f"Columns: {', '.join(validation['columns'][:8])}")

    dataset = Dataset(
        name=name,
        description=" | ".join(desc_parts) if desc_parts else description,
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


# --- Import from HuggingFace ---

class HuggingFaceImportRequest(BaseModel):
    dataset_id: str = Field(..., min_length=1, description="HuggingFace dataset ID, e.g. 'squad', 'rajpurkar/squad_v2'")
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    split: str = Field(default="train", description="Dataset split: train, test, validation")
    max_samples: Optional[int] = Field(None, ge=1, le=100000)
    config: Optional[str] = Field(None, description="Dataset config/subset name")


def _import_hf_sync(
    dataset_id_hf: str, name: str, split: str, max_samples: int | None,
    config: str | None, user_id: int, dataset_db_id: int,
):
    """Synchronous background task to download and convert a HuggingFace dataset."""
    import logging
    logger = logging.getLogger(__name__)

    try:
        from datasets import load_dataset
        logger.info(f"HF import: downloading {dataset_id_hf} split={split}")

        kwargs = {"split": split}
        if config:
            ds = load_dataset(dataset_id_hf, config, **kwargs)
        else:
            ds = load_dataset(dataset_id_hf, **kwargs)

        if max_samples and len(ds) > max_samples:
            ds = ds.shuffle(seed=42).select(range(max_samples))

        user_dir = os.path.join(settings.storage_path, "datasets", str(user_id))
        os.makedirs(user_dir, exist_ok=True)
        file_path = os.path.join(user_dir, f"{name}.jsonl")

        num_rows = 0
        with open(file_path, "w") as f:
            for row in ds:
                f.write(json.dumps(dict(row), default=str) + "\n")
                num_rows += 1

        file_size = os.path.getsize(file_path)
        desc = f"Imported from HuggingFace: {dataset_id_hf} (split={split}, {num_rows} rows)"
        logger.info(f"HF import: wrote {num_rows} rows to {file_path}")

        # Update DB synchronously
        from sqlalchemy import create_engine, text
        from app.config import settings as app_settings
        sync_url = app_settings.database_url.replace("+asyncpg", "").replace("asyncpg://", "psycopg2://")
        # Use raw SQL to avoid async complications
        import psycopg2
        # Parse the URL for psycopg2
        db_url = app_settings.database_url.replace("postgresql+asyncpg://", "")
        parts = db_url.split("@")
        user_pass = parts[0]
        host_db = parts[1]
        db_user, db_pass = user_pass.split(":")
        host_port, db_name = host_db.split("/")
        host, port = host_port.split(":") if ":" in host_port else (host_port, "5432")

        conn = psycopg2.connect(dbname=db_name, user=db_user, password=db_pass, host=host, port=port)
        cur = conn.cursor()
        cur.execute(
            "UPDATE datasets SET file_path=%s, file_size=%s, num_samples=%s, format='jsonl', description=%s WHERE id=%s",
            (file_path, file_size, num_rows, desc, dataset_db_id),
        )
        conn.commit()
        cur.close()
        conn.close()
        logger.info(f"HF import: DB updated for dataset #{dataset_db_id}")

    except Exception as e:
        logger.exception(f"HF import failed: {e}")
        try:
            import psycopg2
            db_url = settings.database_url.replace("postgresql+asyncpg://", "")
            parts = db_url.split("@")
            user_pass = parts[0]
            host_db = parts[1]
            db_user, db_pass = user_pass.split(":")
            host_port, db_name = host_db.split("/")
            host, port = host_port.split(":") if ":" in host_port else (host_port, "5432")
            conn = psycopg2.connect(dbname=db_name, user=db_user, password=db_pass, host=host, port=port)
            cur = conn.cursor()
            cur.execute(
                "UPDATE datasets SET description=%s WHERE id=%s",
                (f"Import failed: {str(e)[:200]}", dataset_db_id),
            )
            conn.commit()
            cur.close()
            conn.close()
        except Exception:
            pass


@router.post("/datasets/import-huggingface", response_model=DatasetResponse, status_code=status.HTTP_202_ACCEPTED)
async def import_from_huggingface(
    request: HuggingFaceImportRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dataset:
    """Import a dataset from HuggingFace Hub. Downloads in the background."""
    dataset = Dataset(
        name=request.name,
        description=f"Importing from HuggingFace: {request.dataset_id}...",
        file_path="",
        file_size=0,
        format="jsonl",
        num_samples=0,
        owner_id=current_user.id,
    )
    db.add(dataset)
    await db.flush()
    await db.refresh(dataset)

    # Run sync download in a background thread
    import asyncio
    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        None,
        _import_hf_sync,
        request.dataset_id,
        request.name,
        request.split,
        request.max_samples,
        request.config,
        current_user.id,
        dataset.id,
    )

    return dataset


# --- Preview / View ---

@router.get("/datasets/{dataset_id}/preview")
async def preview_dataset(
    dataset_id: int,
    offset: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Preview a dataset — returns rows and column info."""
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.owner_id == current_user.id)
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if not dataset.file_path or not os.path.exists(dataset.file_path):
        return {"rows": [], "columns": [], "total": 0, "format": dataset.format}

    rows = []
    columns = set()

    if dataset.format == "jsonl":
        with open(dataset.file_path, "r") as f:
            for i, line in enumerate(f):
                if i < offset:
                    continue
                if i >= offset + limit:
                    break
                line = line.strip()
                if line:
                    try:
                        row = json.loads(line)
                        # Truncate long values for preview
                        for k, v in row.items():
                            if isinstance(v, str) and len(v) > 300:
                                row[k] = v[:300] + "..."
                        rows.append(row)
                        columns.update(row.keys())
                    except json.JSONDecodeError:
                        rows.append({"_error": f"Invalid JSON on line {i+1}"})

    elif dataset.format == "csv":
        import csv
        with open(dataset.file_path, "r") as f:
            reader = csv.DictReader(f)
            columns = set(reader.fieldnames or [])
            for i, row in enumerate(reader):
                if i < offset:
                    continue
                if i >= offset + limit:
                    break
                rows.append(dict(row))

    return {
        "rows": rows,
        "columns": sorted(columns),
        "total": dataset.num_samples or 0,
        "offset": offset,
        "limit": limit,
        "format": dataset.format,
    }


# --- Validate ---

@router.get("/datasets/{dataset_id}/validate")
async def validate_dataset(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Validate a dataset format and return diagnostics."""
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.owner_id == current_user.id)
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if not dataset.file_path or not os.path.exists(dataset.file_path):
        return {"valid": False, "errors": ["File not found on disk"]}

    if dataset.format == "jsonl":
        return _validate_jsonl(dataset.file_path)
    elif dataset.format == "csv":
        return _validate_csv(dataset.file_path)
    else:
        return {"valid": True, "format_detected": dataset.format, "errors": []}


# --- List, Get, Update, Delete ---

@router.get("/datasets", response_model=list[DatasetResponse])
async def list_datasets(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Dataset]:
    """List all datasets."""
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
        select(Dataset).where(Dataset.id == dataset_id, Dataset.owner_id == current_user.id)
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.get("/datasets/{dataset_id}/info")
async def get_dataset_info(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    agent_node: Node = Depends(get_node_by_api_key),
) -> dict:
    """Get dataset metadata (called by agent with API key)."""
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {
        "id": dataset.id,
        "name": dataset.name,
        "format": dataset.format,
        "file_size": dataset.file_size,
        "num_samples": dataset.num_samples,
    }


@router.get("/datasets/{dataset_id}/download")
async def download_dataset(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    agent_node: Node = Depends(get_node_by_api_key),
) -> FileResponse:
    """Download a dataset file (called by agent)."""
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if not os.path.exists(dataset.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(dataset.file_path, filename=f"{dataset.name}.{dataset.format}")


@router.patch("/datasets/{dataset_id}", response_model=DatasetResponse)
async def update_dataset(
    dataset_id: int,
    dataset_update: DatasetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dataset:
    """Update a dataset."""
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.owner_id == current_user.id)
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    for field, value in dataset_update.model_dump(exclude_unset=True).items():
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
        select(Dataset).where(Dataset.id == dataset_id, Dataset.owner_id == current_user.id)
    )
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if dataset.file_path and os.path.exists(dataset.file_path):
        os.remove(dataset.file_path)
    await db.delete(dataset)
