"""Metrics computation and tracking utilities."""

import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class MetricResult:
    """Container for a single metric result."""
    name: str
    value: float
    step: int
    timestamp: float = field(default_factory=time.time)


class MetricsTracker:
    """Track and log training metrics."""

    def __init__(
        self,
        output_dir: str,
        run_name: str = "training",
        use_wandb: bool = False,
        wandb_project: Optional[str] = None,
    ):
        self.output_dir = Path(output_dir)
        self.run_name = run_name
        self.use_wandb = use_wandb
        self.wandb_project = wandb_project

        self.metrics_history: List[Dict[str, Any]] = []
        self.start_time = time.time()
        self.current_step = 0

        # Create metrics directory
        self.metrics_dir = self.output_dir / "metrics"
        self.metrics_dir.mkdir(parents=True, exist_ok=True)

        # Initialize wandb if enabled
        if use_wandb:
            self._init_wandb()

    def _init_wandb(self) -> None:
        """Initialize Weights & Biases logging."""
        try:
            import wandb

            wandb.init(
                project=self.wandb_project or "tunellm",
                name=self.run_name,
                dir=str(self.output_dir),
            )
            logger.info(f"Initialized W&B run: {wandb.run.name}")
        except Exception as e:
            logger.warning(f"Failed to initialize W&B: {e}")
            self.use_wandb = False

    def log(
        self,
        metrics: Dict[str, float],
        step: Optional[int] = None,
    ) -> None:
        """Log metrics for a training step.

        Args:
            metrics: Dictionary of metric names and values
            step: Training step (uses internal counter if not provided)
        """
        if step is not None:
            self.current_step = step
        else:
            self.current_step += 1

        # Add timestamp and step
        record = {
            "step": self.current_step,
            "timestamp": time.time(),
            "elapsed_seconds": time.time() - self.start_time,
            **metrics,
        }

        self.metrics_history.append(record)

        # Log to wandb
        if self.use_wandb:
            try:
                import wandb
                wandb.log(metrics, step=self.current_step)
            except Exception as e:
                logger.warning(f"Failed to log to W&B: {e}")

        # Log to console
        metrics_str = ", ".join(f"{k}: {v:.4f}" for k, v in metrics.items())
        logger.info(f"Step {self.current_step}: {metrics_str}")

    def save(self) -> None:
        """Save metrics history to disk."""
        metrics_file = self.metrics_dir / "training_metrics.json"

        with open(metrics_file, "w") as f:
            json.dump(self.metrics_history, f, indent=2)

        logger.info(f"Saved metrics to {metrics_file}")

    def get_best_metric(
        self,
        metric_name: str,
        mode: str = "min",
    ) -> Optional[Dict[str, Any]]:
        """Get the best value for a metric.

        Args:
            metric_name: Name of the metric to find best value for
            mode: 'min' or 'max' to determine best

        Returns:
            Record with best metric value, or None if metric not found
        """
        values = [
            (r[metric_name], r)
            for r in self.metrics_history
            if metric_name in r
        ]

        if not values:
            return None

        if mode == "min":
            return min(values, key=lambda x: x[0])[1]
        else:
            return max(values, key=lambda x: x[0])[1]

    def finish(self) -> None:
        """Finish tracking and cleanup."""
        self.save()

        if self.use_wandb:
            try:
                import wandb
                wandb.finish()
            except Exception:
                pass

        # Log summary
        elapsed = time.time() - self.start_time
        logger.info(f"Training completed in {elapsed:.1f}s ({self.current_step} steps)")


def compute_metrics(eval_preds) -> Dict[str, float]:
    """Compute metrics for evaluation.

    This is a HuggingFace Trainer compatible metrics function.

    Args:
        eval_preds: EvalPrediction object with predictions and labels

    Returns:
        Dictionary of metric names and values
    """
    predictions, labels = eval_preds

    # For language modeling, we compute perplexity
    if hasattr(predictions, "shape") and len(predictions.shape) == 3:
        # predictions shape: (batch_size, seq_len, vocab_size)
        # This is logits, compute loss
        shift_logits = predictions[..., :-1, :].contiguous()
        shift_labels = labels[..., 1:].contiguous()

        # Flatten
        shift_logits = shift_logits.view(-1, shift_logits.size(-1))
        shift_labels = shift_labels.view(-1)

        # Compute cross-entropy loss
        import torch
        import torch.nn.functional as F

        loss = F.cross_entropy(
            torch.from_numpy(shift_logits),
            torch.from_numpy(shift_labels),
            ignore_index=-100,
        )
        perplexity = np.exp(loss.item())
    else:
        # predictions is already loss values
        perplexity = np.exp(np.mean(predictions))

    return {
        "perplexity": perplexity,
    }


def compute_rouge_metrics(predictions: List[str], references: List[str]) -> Dict[str, float]:
    """Compute ROUGE metrics for text generation.

    Args:
        predictions: List of generated texts
        references: List of reference texts

    Returns:
        Dictionary of ROUGE scores
    """
    try:
        from rouge_score import rouge_scorer

        scorer = rouge_scorer.RougeScorer(
            ["rouge1", "rouge2", "rougeL"],
            use_stemmer=True,
        )

        scores = {"rouge1": [], "rouge2": [], "rougeL": []}

        for pred, ref in zip(predictions, references):
            result = scorer.score(ref, pred)
            for key in scores:
                scores[key].append(result[key].fmeasure)

        return {key: np.mean(values) for key, values in scores.items()}
    except ImportError:
        logger.warning("rouge_score not installed, skipping ROUGE metrics")
        return {}


def compute_bleu_metrics(predictions: List[str], references: List[str]) -> Dict[str, float]:
    """Compute BLEU metrics for text generation.

    Args:
        predictions: List of generated texts
        references: List of reference texts

    Returns:
        Dictionary with BLEU score
    """
    try:
        from nltk.translate.bleu_score import corpus_bleu, SmoothingFunction

        # Tokenize
        pred_tokens = [pred.split() for pred in predictions]
        ref_tokens = [[ref.split()] for ref in references]

        # Compute BLEU with smoothing
        smoothing = SmoothingFunction().method1
        bleu = corpus_bleu(ref_tokens, pred_tokens, smoothing_function=smoothing)

        return {"bleu": bleu}
    except ImportError:
        logger.warning("nltk not installed, skipping BLEU metrics")
        return {}
