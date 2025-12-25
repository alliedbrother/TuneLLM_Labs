#!/usr/bin/env python3
"""Main training entry point."""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

import torch
import yaml
from rich.console import Console
from rich.logging import RichHandler

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[RichHandler(rich_tracebacks=True)],
)
logger = logging.getLogger(__name__)
console = Console()


def load_config(config_path: str) -> dict:
    """Load training configuration from YAML or JSON."""
    path = Path(config_path)
    if not path.exists():
        # Try loading from environment variable
        config_str = os.environ.get("JOB_CONFIG")
        if config_str:
            return json.loads(config_str)
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(path) as f:
        if path.suffix in [".yaml", ".yml"]:
            return yaml.safe_load(f)
        else:
            return json.load(f)


def main():
    """Main training function."""
    parser = argparse.ArgumentParser(description="TuneLLM Training Script")
    parser.add_argument("--config", type=str, required=True, help="Path to config file")
    parser.add_argument("--output-dir", type=str, default="/models", help="Output directory")
    args = parser.parse_args()

    # Load configuration
    console.print("[bold blue]TuneLLM Training[/bold blue]")
    console.print(f"Loading config from: {args.config}")

    try:
        config = load_config(args.config)
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        sys.exit(1)

    # Display config
    console.print(f"Run name: {config.get('run_name', 'unnamed')}")
    console.print(f"Base model: {config.get('base_model')}")
    console.print(f"Method: {config.get('method', 'lora')}")

    # Check GPU availability
    if torch.cuda.is_available():
        console.print(f"[green]GPU available: {torch.cuda.get_device_name(0)}[/green]")
        console.print(f"GPU memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    else:
        console.print("[yellow]Warning: No GPU available, training will be slow[/yellow]")

    # Select training method
    method = config.get("method", "lora").lower()

    try:
        if method == "lora":
            from lora_trainer import LoRATrainer

            trainer = LoRATrainer(config, args.output_dir)
        elif method == "qlora":
            from qlora_trainer import QLoRATrainer

            trainer = QLoRATrainer(config, args.output_dir)
        elif method == "dpo":
            from dpo_trainer import DPOTrainer

            trainer = DPOTrainer(config, args.output_dir)
        elif method == "ppo":
            from ppo_trainer import PPOTrainer

            trainer = PPOTrainer(config, args.output_dir)
        elif method == "full":
            from lora_trainer import LoRATrainer

            # Full fine-tuning uses the same trainer without PEFT
            config["lora"] = None
            trainer = LoRATrainer(config, args.output_dir)
        else:
            logger.error(f"Unknown training method: {method}")
            sys.exit(1)

        # Run training
        console.print(f"[cyan]Starting {method.upper()} training...[/cyan]")
        trainer.train()
        console.print("[green]Training completed successfully![/green]")

    except Exception as e:
        logger.exception(f"Training failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
