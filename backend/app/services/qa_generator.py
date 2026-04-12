"""AI-powered Q&A pair generation from text chunks."""

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Optional

import httpx

from app.services.pdf_processor import TextChunk

logger = logging.getLogger(__name__)

QA_SYSTEM_PROMPT = """You are an expert at creating high-quality question-answer pairs for training language models.
Given a text passage, generate diverse question-answer pairs that:
1. Cover different aspects of the content
2. Include both factual and analytical questions
3. Have complete, self-contained answers
4. Vary in complexity

Output ONLY a JSON array. Each element must have exactly these keys:
- "instruction": the question
- "input": relevant context snippet (1-2 sentences from the passage, or empty string)
- "output": the complete answer

Example output:
[
  {"instruction": "What is X?", "input": "X is defined as...", "output": "X is..."},
  {"instruction": "Why does Y happen?", "input": "", "output": "Y happens because..."}
]"""


@dataclass
class QAPair:
    """A single question-answer pair in Alpaca format."""

    instruction: str
    input: str
    output: str
    source_file: str = ""
    chunk_index: int = 0


class QAGenerator:
    """Generate Q&A pairs from text chunks using AI APIs."""

    def __init__(
        self,
        provider: str = "anthropic",
        api_key: str = "",
        model: Optional[str] = None,
        max_concurrent: int = 5,
    ):
        self.provider = provider
        self.api_key = api_key
        self.model = model or self._default_model()
        self._semaphore = asyncio.Semaphore(max_concurrent)

    def _default_model(self) -> str:
        if self.provider == "anthropic":
            return "claude-haiku-4-5-20251001"
        return "gpt-4o"

    async def generate_qa_pairs(
        self, chunk: TextChunk, num_pairs: int = 3
    ) -> list[QAPair]:
        """Generate Q&A pairs from a single text chunk."""
        async with self._semaphore:
            user_prompt = (
                f"Generate exactly {num_pairs} question-answer pairs from this text:\n\n"
                f"---\n{chunk.text}\n---\n\n"
                f"Output ONLY the JSON array, no other text."
            )

            try:
                if self.provider == "anthropic":
                    raw = await self._call_anthropic(user_prompt)
                else:
                    raw = await self._call_openai(user_prompt)

                pairs = self._parse_response(raw)
                # Attach metadata
                for p in pairs:
                    p.source_file = chunk.source_file
                    p.chunk_index = chunk.chunk_index
                return pairs

            except Exception as e:
                logger.warning(
                    f"Q&A generation failed for chunk {chunk.chunk_index}: {e}"
                )
                return []

    async def generate_qa_batch(
        self, chunks: list[TextChunk], num_pairs_per_chunk: int = 3
    ) -> list[QAPair]:
        """Generate Q&A pairs for multiple chunks concurrently."""
        tasks = [
            self.generate_qa_pairs(chunk, num_pairs_per_chunk)
            for chunk in chunks
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_pairs: list[QAPair] = []
        for result in results:
            if isinstance(result, list):
                all_pairs.extend(result)
            elif isinstance(result, Exception):
                logger.warning(f"Batch Q&A generation error: {result}")

        return all_pairs

    async def _call_anthropic(self, user_prompt: str) -> str:
        """Call the Anthropic Claude API."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": 2048,
                    "system": QA_SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["content"][0]["text"]

    async def _call_openai(self, user_prompt: str) -> str:
        """Call the OpenAI API."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": QA_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": 2048,
                    "temperature": 0.7,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    def _parse_response(self, raw: str) -> list[QAPair]:
        """Parse the AI response into QAPair objects."""
        # Extract JSON array from the response
        text = raw.strip()

        # Try to find JSON array in the response
        start = text.find("[")
        end = text.rfind("]")
        if start == -1 or end == -1:
            logger.warning(f"No JSON array found in response: {text[:200]}")
            return []

        json_str = text[start : end + 1]

        try:
            items = json.loads(json_str)
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON: {e}")
            return []

        pairs: list[QAPair] = []
        for item in items:
            if isinstance(item, dict) and "instruction" in item and "output" in item:
                pairs.append(
                    QAPair(
                        instruction=str(item["instruction"]),
                        input=str(item.get("input", "")),
                        output=str(item["output"]),
                    )
                )

        return pairs
