"""PDF text extraction and chunking service."""

import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class PDFPage:
    """Extracted text from a single PDF page."""

    page_num: int
    text: str
    source_file: str


@dataclass
class TextChunk:
    """A chunk of text from a PDF, ready for Q&A generation."""

    text: str
    source_file: str
    page_numbers: list[int] = field(default_factory=list)
    chunk_index: int = 0


class PDFProcessor:
    """Extract and chunk text from PDF files using PyMuPDF."""

    def extract_text(self, pdf_path: str) -> list[PDFPage]:
        """Extract text from all pages of a PDF."""
        import fitz  # PyMuPDF

        pages: list[PDFPage] = []
        try:
            doc = fitz.open(pdf_path)
            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text("text")
                if text.strip():
                    pages.append(
                        PDFPage(
                            page_num=page_num + 1,
                            text=text.strip(),
                            source_file=str(pdf_path),
                        )
                    )
            doc.close()
            logger.info(f"Extracted {len(pages)} pages from {pdf_path}")
        except Exception as e:
            logger.error(f"Failed to extract text from {pdf_path}: {e}")
            raise
        return pages

    def chunk_text(
        self,
        pages: list[PDFPage],
        chunk_size: int = 1500,
        overlap: int = 200,
    ) -> list[TextChunk]:
        """Split extracted pages into overlapping text chunks.

        Uses a sliding window approach with character-based splitting
        at paragraph boundaries.
        """
        # Combine all page text with page markers
        full_text = ""
        page_boundaries: list[tuple[int, int, int]] = []  # (start, end, page_num)
        for page in pages:
            start = len(full_text)
            full_text += page.text + "\n\n"
            page_boundaries.append((start, len(full_text), page.page_num))

        if not full_text.strip():
            return []

        source = pages[0].source_file if pages else ""
        chunks: list[TextChunk] = []
        pos = 0
        chunk_idx = 0

        while pos < len(full_text):
            end = min(pos + chunk_size, len(full_text))

            # Try to break at a paragraph boundary
            if end < len(full_text):
                para_break = full_text.rfind("\n\n", pos, end)
                if para_break > pos + chunk_size // 3:
                    end = para_break + 2

            chunk_text = full_text[pos:end].strip()
            if len(chunk_text) < 50:
                break

            # Find which pages this chunk spans
            chunk_pages = []
            for start_b, end_b, page_num in page_boundaries:
                if start_b < end and end_b > pos:
                    chunk_pages.append(page_num)

            chunks.append(
                TextChunk(
                    text=chunk_text,
                    source_file=source,
                    page_numbers=chunk_pages,
                    chunk_index=chunk_idx,
                )
            )
            chunk_idx += 1

            # Advance — ensure we always move forward
            new_pos = end - overlap
            if new_pos <= pos:
                new_pos = end  # skip overlap if we'd go backwards
            pos = new_pos
            if pos >= len(full_text) - 50:
                break

        logger.info(
            f"Created {len(chunks)} chunks from {len(pages)} pages "
            f"(chunk_size={chunk_size}, overlap={overlap})"
        )
        return chunks

    def scan_directory(self, dir_path: str) -> list[str]:
        """Find all PDF files in a directory (recursive)."""
        path = Path(dir_path)
        if not path.exists():
            raise FileNotFoundError(f"Directory not found: {dir_path}")
        if not path.is_dir():
            raise NotADirectoryError(f"Not a directory: {dir_path}")

        pdfs = sorted(str(p) for p in path.rglob("*.pdf"))
        logger.info(f"Found {len(pdfs)} PDF files in {dir_path}")
        return pdfs
