"""Model loading utilities for inference."""

import logging
from pathlib import Path
from typing import Optional, Tuple

import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    PreTrainedModel,
    PreTrainedTokenizer,
)

logger = logging.getLogger(__name__)


class ModelLoader:
    """Handles loading models for inference."""

    def __init__(
        self,
        model_path: str,
        base_model: Optional[str] = None,
        adapter_path: Optional[str] = None,
        quantization: Optional[str] = None,
        device_map: str = "auto",
        torch_dtype: str = "auto",
    ):
        """Initialize the model loader.

        Args:
            model_path: Path to the model or adapter
            base_model: Base model name (required if loading adapter)
            adapter_path: Path to LoRA adapter (alternative to model_path for adapters)
            quantization: Quantization method ("4bit", "8bit", or None)
            device_map: Device mapping strategy
            torch_dtype: Torch data type ("float16", "bfloat16", "float32", "auto")
        """
        self.model_path = model_path
        self.base_model = base_model
        self.adapter_path = adapter_path or model_path
        self.quantization = quantization
        self.device_map = device_map
        self.torch_dtype = self._parse_dtype(torch_dtype)

        self.model: Optional[PreTrainedModel] = None
        self.tokenizer: Optional[PreTrainedTokenizer] = None

    def _parse_dtype(self, dtype_str: str) -> torch.dtype:
        """Parse dtype string to torch.dtype."""
        if dtype_str == "auto":
            if torch.cuda.is_available() and torch.cuda.is_bf16_supported():
                return torch.bfloat16
            return torch.float16

        dtype_map = {
            "float16": torch.float16,
            "bfloat16": torch.bfloat16,
            "float32": torch.float32,
        }
        return dtype_map.get(dtype_str, torch.float16)

    def _get_quantization_config(self) -> Optional[BitsAndBytesConfig]:
        """Get BitsAndBytes quantization config."""
        if not self.quantization:
            return None

        if self.quantization == "4bit":
            return BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=self.torch_dtype,
                bnb_4bit_use_double_quant=True,
            )
        elif self.quantization == "8bit":
            return BitsAndBytesConfig(load_in_8bit=True)

        return None

    def load(self) -> Tuple[PreTrainedModel, PreTrainedTokenizer]:
        """Load the model and tokenizer.

        Returns:
            Tuple of (model, tokenizer)
        """
        model_to_load = self.base_model or self.model_path

        logger.info(f"Loading model: {model_to_load}")

        # Load tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(
            model_to_load,
            trust_remote_code=True,
            padding_side="left",
        )

        # Set pad token if not set
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        # Get quantization config
        quantization_config = self._get_quantization_config()

        # Load model
        model_kwargs = {
            "device_map": self.device_map,
            "torch_dtype": self.torch_dtype,
            "trust_remote_code": True,
        }

        if quantization_config:
            model_kwargs["quantization_config"] = quantization_config
            logger.info(f"Using {self.quantization} quantization")

        self.model = AutoModelForCausalLM.from_pretrained(
            model_to_load,
            **model_kwargs,
        )

        # Load adapter if specified
        if self.base_model and self.adapter_path:
            self._load_adapter()

        # Set to eval mode
        self.model.eval()

        logger.info(f"Model loaded successfully. Parameters: {self.model.num_parameters():,}")

        return self.model, self.tokenizer

    def _load_adapter(self) -> None:
        """Load LoRA adapter and merge with base model."""
        from peft import PeftModel

        logger.info(f"Loading adapter: {self.adapter_path}")

        self.model = PeftModel.from_pretrained(
            self.model,
            self.adapter_path,
        )

        # Merge adapter with base model for faster inference
        logger.info("Merging adapter with base model...")
        self.model = self.model.merge_and_unload()

        logger.info("Adapter merged successfully")

    def unload(self) -> None:
        """Unload the model from memory."""
        if self.model is not None:
            del self.model
            self.model = None

        if self.tokenizer is not None:
            del self.tokenizer
            self.tokenizer = None

        # Clear CUDA cache
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        logger.info("Model unloaded")

    def get_model_info(self) -> dict:
        """Get information about the loaded model."""
        if self.model is None:
            return {"status": "not_loaded"}

        info = {
            "status": "loaded",
            "model_path": self.model_path,
            "base_model": self.base_model,
            "adapter_path": self.adapter_path,
            "quantization": self.quantization,
            "num_parameters": self.model.num_parameters(),
            "device": str(next(self.model.parameters()).device),
            "dtype": str(next(self.model.parameters()).dtype),
        }

        # Add GPU memory usage
        if torch.cuda.is_available():
            info["gpu_memory_allocated_gb"] = (
                torch.cuda.memory_allocated() / (1024**3)
            )
            info["gpu_memory_reserved_gb"] = (
                torch.cuda.memory_reserved() / (1024**3)
            )

        return info
