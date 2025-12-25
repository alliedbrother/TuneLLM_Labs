# Fine-Tuning Recipes

This directory contains community-contributed fine-tuning recipes for various models and tasks.

## Using Recipes

1. Browse the recipes below
2. Copy the YAML configuration to your local machine
3. Upload via the UI or submit via API

## Available Recipes

### Instruction Tuning

| Recipe | Base Model | Method | Description |
|--------|------------|--------|-------------|
| `lora_llama2_7b_instruct.yaml` | LLaMA-2-7B | LoRA | Basic instruction tuning |
| `qlora_llama2_13b_instruct.yaml` | LLaMA-2-13B | QLoRA | Memory-efficient instruction tuning |
| `lora_mistral_7b_instruct.yaml` | Mistral-7B | LoRA | Mistral instruction tuning |

### Chat Models

| Recipe | Base Model | Method | Description |
|--------|------------|--------|-------------|
| `lora_llama2_chat.yaml` | LLaMA-2-7B-Chat | LoRA | Conversational fine-tuning |

### RLHF

| Recipe | Base Model | Method | Description |
|--------|------------|--------|-------------|
| `dpo_llama2_7b.yaml` | LLaMA-2-7B | DPO | Direct Preference Optimization |

## Contributing Recipes

1. Fork the repository
2. Add your recipe YAML to this directory
3. Update this README with your recipe details
4. Submit a pull request

### Recipe Format

```yaml
# Recipe metadata
run_name: "descriptive_name"
description: "What this recipe does"
author: "Your Name"
version: "1.0"

# Model configuration
base_model: "model-org/model-name"
tokenizer: "model-org/model-name"

# Data configuration
data:
  format: "instruction"  # or "chat", "completion"
  prompt_template: |
    ### Instruction:
    {input}
    ### Response:

# Fine-tuning method
method: "LoRA"  # or "QLoRA", "Full", "DPO", "PPO"
lora:
  r: 16
  alpha: 32
  target_modules: ["q_proj", "v_proj", "k_proj", "o_proj"]
  dropout: 0.05

# Training hyperparameters
training:
  epochs: 3
  batch_size: 16
  micro_batch_size: 4
  learning_rate: 2e-5
  lr_scheduler: "cosine"
  warmup_ratio: 0.03
  mixed_precision: "bf16"
  gradient_checkpointing: true
  seed: 42
```

## Tips

- Start with recommended recipes and adjust from there
- Use QLoRA for large models (13B+) on consumer GPUs
- Lower batch size if you run out of memory
- Enable gradient checkpointing for memory efficiency
