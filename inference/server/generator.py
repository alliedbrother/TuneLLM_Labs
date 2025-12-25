"""Text generation utilities."""

import asyncio
import logging
from dataclasses import dataclass
from queue import Queue
from threading import Thread
from typing import AsyncIterator, List, Optional

import torch
from transformers import (
    PreTrainedModel,
    PreTrainedTokenizer,
    StoppingCriteria,
    StoppingCriteriaList,
    TextIteratorStreamer,
)

logger = logging.getLogger(__name__)


@dataclass
class GenerationConfig:
    """Configuration for text generation."""

    max_new_tokens: int = 512
    temperature: float = 0.7
    top_p: float = 0.9
    top_k: int = 50
    repetition_penalty: float = 1.1
    do_sample: bool = True
    num_return_sequences: int = 1
    stop_sequences: Optional[List[str]] = None


class StopOnTokens(StoppingCriteria):
    """Stop generation when specific tokens are generated."""

    def __init__(self, stop_token_ids: List[int]):
        self.stop_token_ids = stop_token_ids

    def __call__(
        self,
        input_ids: torch.LongTensor,
        scores: torch.FloatTensor,
        **kwargs,
    ) -> bool:
        for stop_id in self.stop_token_ids:
            if input_ids[0][-1] == stop_id:
                return True
        return False


class TextGenerator:
    """Handles text generation with streaming support."""

    def __init__(
        self,
        model: PreTrainedModel,
        tokenizer: PreTrainedTokenizer,
    ):
        """Initialize the generator.

        Args:
            model: The loaded model
            tokenizer: The tokenizer
        """
        self.model = model
        self.tokenizer = tokenizer
        self.device = next(model.parameters()).device

    def generate(
        self,
        prompt: str,
        config: GenerationConfig,
    ) -> str:
        """Generate text from a prompt.

        Args:
            prompt: Input prompt
            config: Generation configuration

        Returns:
            Generated text (excluding the prompt)
        """
        # Tokenize input
        inputs = self.tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
            max_length=4096 - config.max_new_tokens,
        ).to(self.device)

        input_length = inputs.input_ids.shape[1]

        # Build stopping criteria
        stopping_criteria = self._build_stopping_criteria(config.stop_sequences)

        # Generate
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=config.max_new_tokens,
                temperature=config.temperature if config.do_sample else 1.0,
                top_p=config.top_p if config.do_sample else 1.0,
                top_k=config.top_k if config.do_sample else 0,
                repetition_penalty=config.repetition_penalty,
                do_sample=config.do_sample,
                num_return_sequences=config.num_return_sequences,
                stopping_criteria=stopping_criteria,
                pad_token_id=self.tokenizer.pad_token_id,
                eos_token_id=self.tokenizer.eos_token_id,
            )

        # Decode only the generated part
        generated_ids = outputs[0][input_length:]
        generated_text = self.tokenizer.decode(
            generated_ids,
            skip_special_tokens=True,
        )

        # Remove stop sequences from output
        if config.stop_sequences:
            for seq in config.stop_sequences:
                if seq in generated_text:
                    generated_text = generated_text.split(seq)[0]

        return generated_text.strip()

    async def generate_stream(
        self,
        prompt: str,
        config: GenerationConfig,
    ) -> AsyncIterator[str]:
        """Generate text with streaming output.

        Args:
            prompt: Input prompt
            config: Generation configuration

        Yields:
            Generated text tokens
        """
        # Tokenize input
        inputs = self.tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
            max_length=4096 - config.max_new_tokens,
        ).to(self.device)

        # Create streamer
        streamer = TextIteratorStreamer(
            self.tokenizer,
            skip_prompt=True,
            skip_special_tokens=True,
        )

        # Build stopping criteria
        stopping_criteria = self._build_stopping_criteria(config.stop_sequences)

        # Generate in a separate thread
        generation_kwargs = dict(
            **inputs,
            max_new_tokens=config.max_new_tokens,
            temperature=config.temperature if config.do_sample else 1.0,
            top_p=config.top_p if config.do_sample else 1.0,
            top_k=config.top_k if config.do_sample else 0,
            repetition_penalty=config.repetition_penalty,
            do_sample=config.do_sample,
            stopping_criteria=stopping_criteria,
            pad_token_id=self.tokenizer.pad_token_id,
            eos_token_id=self.tokenizer.eos_token_id,
            streamer=streamer,
        )

        thread = Thread(target=self._generate_thread, args=(generation_kwargs,))
        thread.start()

        # Yield tokens as they're generated
        stop_sequences = config.stop_sequences or []
        buffer = ""

        try:
            for text in streamer:
                buffer += text

                # Check for stop sequences
                should_stop = False
                for seq in stop_sequences:
                    if seq in buffer:
                        # Yield text before stop sequence
                        yield buffer.split(seq)[0]
                        should_stop = True
                        break

                if should_stop:
                    break

                yield text
                await asyncio.sleep(0)  # Allow other async tasks to run

        finally:
            thread.join(timeout=1.0)

    def _generate_thread(self, generation_kwargs: dict) -> None:
        """Run generation in a separate thread."""
        with torch.no_grad():
            self.model.generate(**generation_kwargs)

    def _build_stopping_criteria(
        self,
        stop_sequences: Optional[List[str]],
    ) -> Optional[StoppingCriteriaList]:
        """Build stopping criteria from stop sequences."""
        if not stop_sequences:
            return None

        stop_token_ids = []
        for seq in stop_sequences:
            tokens = self.tokenizer.encode(seq, add_special_tokens=False)
            if tokens:
                stop_token_ids.extend(tokens)

        if not stop_token_ids:
            return None

        return StoppingCriteriaList([StopOnTokens(stop_token_ids)])

    def batch_generate(
        self,
        prompts: List[str],
        config: GenerationConfig,
    ) -> List[str]:
        """Generate text for multiple prompts.

        Args:
            prompts: List of input prompts
            config: Generation configuration

        Returns:
            List of generated texts
        """
        # Tokenize inputs with padding
        inputs = self.tokenizer(
            prompts,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=4096 - config.max_new_tokens,
        ).to(self.device)

        input_lengths = [
            (ids != self.tokenizer.pad_token_id).sum().item()
            for ids in inputs.input_ids
        ]

        # Build stopping criteria
        stopping_criteria = self._build_stopping_criteria(config.stop_sequences)

        # Generate
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=config.max_new_tokens,
                temperature=config.temperature if config.do_sample else 1.0,
                top_p=config.top_p if config.do_sample else 1.0,
                top_k=config.top_k if config.do_sample else 0,
                repetition_penalty=config.repetition_penalty,
                do_sample=config.do_sample,
                stopping_criteria=stopping_criteria,
                pad_token_id=self.tokenizer.pad_token_id,
                eos_token_id=self.tokenizer.eos_token_id,
            )

        # Decode each output
        results = []
        for i, (output, input_length) in enumerate(zip(outputs, input_lengths)):
            generated_ids = output[input_length:]
            generated_text = self.tokenizer.decode(
                generated_ids,
                skip_special_tokens=True,
            )

            # Remove stop sequences
            if config.stop_sequences:
                for seq in config.stop_sequences:
                    if seq in generated_text:
                        generated_text = generated_text.split(seq)[0]

            results.append(generated_text.strip())

        return results
