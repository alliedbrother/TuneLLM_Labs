#!/usr/bin/env python3
"""Download emrQA-msquad and prepare train/test JSONL for TuneLLM.

Usage:
    pip install datasets
    python scripts/prepare_dataset.py [--samples 2000] [--output-dir backend/storage/datasets/sample]
"""

import argparse
import json
import os
import random


def main():
    parser = argparse.ArgumentParser(description="Prepare emrQA-msquad dataset")
    parser.add_argument("--samples", type=int, default=2000, help="Total samples to use")
    parser.add_argument("--test-ratio", type=float, default=0.2, help="Test split ratio")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument(
        "--output-dir",
        type=str,
        default="backend/storage/datasets/sample",
        help="Output directory",
    )
    args = parser.parse_args()

    print("Loading emrQA-msquad dataset from HuggingFace...")
    from datasets import load_dataset

    # Load the dataset
    try:
        ds = load_dataset("Eladio/emrqa-msquad", split="train")
    except Exception:
        # Fallback: use SQuAD if emrqa-msquad is unavailable
        print("emrqa-msquad not available, falling back to SQuAD v2...")
        ds = load_dataset("rajpurkar/squad_v2", split="train")

    print(f"Loaded {len(ds)} total samples")

    # Convert to Alpaca format
    qa_pairs = []
    for item in ds:
        # Handle both SQuAD and emrQA formats
        question = item.get("question", "")
        context = item.get("context", "")
        answers = item.get("answers", {})

        # Extract answer text
        if isinstance(answers, dict):
            answer_texts = answers.get("text", [])
        elif isinstance(answers, list):
            answer_texts = [a.get("text", "") if isinstance(a, dict) else str(a) for a in answers]
        else:
            answer_texts = [str(answers)]

        if not answer_texts or not answer_texts[0]:
            continue  # Skip unanswerable questions

        answer = answer_texts[0]

        # Truncate context to reasonable length for training
        if len(context) > 1000:
            # Find the answer in context and keep surrounding text
            ans_pos = context.find(answer)
            if ans_pos >= 0:
                start = max(0, ans_pos - 400)
                end = min(len(context), ans_pos + len(answer) + 400)
                context = context[start:end]
            else:
                context = context[:1000]

        qa_pairs.append({
            "instruction": question.strip(),
            "input": context.strip(),
            "output": answer.strip(),
        })

    print(f"Converted {len(qa_pairs)} valid Q&A pairs")

    # Subsample
    random.seed(args.seed)
    random.shuffle(qa_pairs)
    qa_pairs = qa_pairs[: args.samples]
    print(f"Subsampled to {len(qa_pairs)} pairs")

    # Split
    split_idx = int(len(qa_pairs) * (1 - args.test_ratio))
    train = qa_pairs[:split_idx]
    test = qa_pairs[split_idx:]
    print(f"Split: {len(train)} train, {len(test)} test")

    # Write output
    os.makedirs(args.output_dir, exist_ok=True)
    train_path = os.path.join(args.output_dir, "emrqa_train.jsonl")
    test_path = os.path.join(args.output_dir, "emrqa_test.jsonl")

    with open(train_path, "w") as f:
        for pair in train:
            f.write(json.dumps(pair) + "\n")

    with open(test_path, "w") as f:
        for pair in test:
            f.write(json.dumps(pair) + "\n")

    print(f"\nWritten:")
    print(f"  Train: {train_path} ({len(train)} samples, {os.path.getsize(train_path)} bytes)")
    print(f"  Test:  {test_path} ({len(test)} samples, {os.path.getsize(test_path)} bytes)")

    # Show a sample
    print("\nSample Q&A pair:")
    sample = train[0]
    print(f"  Q: {sample['instruction'][:100]}...")
    print(f"  Context: {sample['input'][:100]}...")
    print(f"  A: {sample['output'][:100]}")


if __name__ == "__main__":
    main()
