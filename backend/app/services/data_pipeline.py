"""Data pipeline orchestrator: PDF -> Q&A -> JSONL dataset."""

import json
import logging
import os
import random
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.dataset import Dataset
from app.services.pdf_processor import PDFProcessor, TextChunk
from app.services.qa_generator import QAGenerator, QAPair

logger = logging.getLogger(__name__)


class DataPipeline:
    """Orchestrate the full PDF-to-dataset pipeline."""

    def __init__(self):
        self.pdf_processor = PDFProcessor()

    async def process_directory(
        self,
        dir_path: str,
        dataset_name: str,
        user_id: int,
        db: AsyncSession,
        qa_provider: str = "anthropic",
        qa_api_key: str = "",
        qa_model: Optional[str] = None,
        num_qa_per_chunk: int = 3,
        chunk_size: int = 1500,
        chunk_overlap: int = 200,
        test_split_ratio: float = 0.2,
        split_seed: int = 42,
        description: Optional[str] = None,
        on_progress: Optional[callable] = None,
    ) -> dict:
        """Process a directory of PDFs into train/test JSONL datasets.

        Returns a dict with pipeline results including dataset IDs.
        """
        # 1. Find PDFs
        pdfs = self.pdf_processor.scan_directory(dir_path)
        if not pdfs:
            raise ValueError(f"No PDF files found in {dir_path}")

        total_pdfs = len(pdfs)
        if on_progress:
            await on_progress({"status": "processing_pdfs", "total_pdfs": total_pdfs})

        # 2. Extract and chunk all PDFs
        all_chunks: list[TextChunk] = []
        for i, pdf_path in enumerate(pdfs):
            try:
                pages = self.pdf_processor.extract_text(pdf_path)
                chunks = self.pdf_processor.chunk_text(
                    pages, chunk_size=chunk_size, overlap=chunk_overlap
                )
                all_chunks.extend(chunks)
            except Exception as e:
                logger.warning(f"Skipping {pdf_path}: {e}")

            if on_progress:
                await on_progress({
                    "status": "processing_pdfs",
                    "processed_pdfs": i + 1,
                    "total_pdfs": total_pdfs,
                    "total_chunks": len(all_chunks),
                })

        if not all_chunks:
            raise ValueError("No text could be extracted from the PDFs")

        logger.info(f"Extracted {len(all_chunks)} chunks from {total_pdfs} PDFs")

        # 3. Generate Q&A pairs
        if on_progress:
            await on_progress({
                "status": "generating_qa",
                "total_chunks": len(all_chunks),
            })

        qa_generator = QAGenerator(
            provider=qa_provider,
            api_key=qa_api_key,
            model=qa_model,
        )
        all_pairs = await qa_generator.generate_qa_batch(
            all_chunks, num_pairs_per_chunk=num_qa_per_chunk
        )

        if not all_pairs:
            raise ValueError("No Q&A pairs could be generated")

        logger.info(f"Generated {len(all_pairs)} Q&A pairs")

        if on_progress:
            await on_progress({
                "status": "splitting",
                "generated_qa_pairs": len(all_pairs),
            })

        # 4. Split and save
        train_pairs, test_pairs = self.split_dataset(
            all_pairs, test_ratio=test_split_ratio, seed=split_seed
        )

        # 5. Write JSONL files
        user_dir = os.path.join(settings.storage_path, "datasets", str(user_id))
        os.makedirs(user_dir, exist_ok=True)

        train_path = os.path.join(user_dir, f"{dataset_name}_train.jsonl")
        test_path = os.path.join(user_dir, f"{dataset_name}_test.jsonl")

        train_count = self.write_jsonl(train_pairs, train_path)
        test_count = self.write_jsonl(test_pairs, test_path)

        # 6. Create dataset records in DB
        train_dataset = Dataset(
            name=f"{dataset_name}_train",
            description=f"{description or 'Generated from PDFs'} (train split)",
            file_path=train_path,
            file_size=os.path.getsize(train_path),
            format="jsonl",
            num_samples=train_count,
            owner_id=user_id,
            split_type="train",
        )
        test_dataset = Dataset(
            name=f"{dataset_name}_test",
            description=f"{description or 'Generated from PDFs'} (test split)",
            file_path=test_path,
            file_size=os.path.getsize(test_path),
            format="jsonl",
            num_samples=test_count,
            owner_id=user_id,
            split_type="test",
        )

        db.add(train_dataset)
        db.add(test_dataset)
        await db.flush()
        await db.refresh(train_dataset)
        await db.refresh(test_dataset)

        # Link parent references
        train_dataset.parent_dataset_id = train_dataset.id
        test_dataset.parent_dataset_id = train_dataset.id

        result = {
            "total_pdfs": total_pdfs,
            "total_chunks": len(all_chunks),
            "total_qa_pairs": len(all_pairs),
            "train_samples": train_count,
            "test_samples": test_count,
            "train_dataset_id": train_dataset.id,
            "test_dataset_id": test_dataset.id,
        }

        if on_progress:
            await on_progress({"status": "completed", **result})

        return result

    def split_dataset(
        self,
        qa_pairs: list[QAPair],
        test_ratio: float = 0.2,
        seed: int = 42,
    ) -> tuple[list[QAPair], list[QAPair]]:
        """Split Q&A pairs into train and test sets."""
        pairs = list(qa_pairs)
        random.seed(seed)
        random.shuffle(pairs)

        split_idx = int(len(pairs) * (1 - test_ratio))
        train = pairs[:split_idx]
        test = pairs[split_idx:]

        logger.info(f"Split: {len(train)} train, {len(test)} test")
        return train, test

    def write_jsonl(self, qa_pairs: list[QAPair], output_path: str) -> int:
        """Write Q&A pairs to a JSONL file in Alpaca format."""
        count = 0
        with open(output_path, "w") as f:
            for pair in qa_pairs:
                record = {
                    "instruction": pair.instruction,
                    "input": pair.input,
                    "output": pair.output,
                }
                f.write(json.dumps(record) + "\n")
                count += 1

        logger.info(f"Wrote {count} records to {output_path}")
        return count
