# TuneLLM

An open-source platform for fine-tuning Large Language Models (LLMs) on your own hardware.

## Overview

TuneLLM provides a complete solution for fine-tuning open-source LLMs with support for:

- **LoRA & QLoRA** - Efficient parameter-efficient fine-tuning
- **RLHF** - DPO and PPO training methods
- **Multi-GPU Support** - Local and cloud GPU training
- **Web UI** - User-friendly interface for managing datasets, jobs, and models
- **REST API** - Full API for automation and integration
- **Model Serving** - Deploy fine-tuned models with optimized inference

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web UI (React)                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Control Plane (FastAPI)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │   Auth   │  │  Jobs    │  │ Datasets │  │    Scheduler     │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Node Agent                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Training Container (Docker)                 │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │   │
│  │  │  LoRA   │  │  QLoRA  │  │   DPO   │  │   PPO   │     │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### MVP (v0.1)
- [x] Single-node GPU training support
- [x] LoRA and QLoRA fine-tuning
- [x] DPO training for RLHF
- [x] Dataset upload and management
- [x] Job monitoring with logs
- [x] Model deployment and inference
- [x] JWT authentication
- [x] PostgreSQL metadata storage

### Planned
- [ ] Multi-node distributed training
- [ ] PPO-based RLHF
- [ ] vLLM/TGI inference optimization
- [ ] Kubernetes integration
- [ ] Team/organization support

## Quick Start

### Prerequisites
- Docker and Docker Compose
- NVIDIA GPU with CUDA support (for training)
- Python 3.10+
- Node.js 18+

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/TuneLLM.git
   cd TuneLLM
   ```

2. **Copy environment file**
   ```bash
   cp docker/.env.example docker/.env
   ```

3. **Start services**
   ```bash
   make dev
   ```

4. **Access the UI**
   Open http://localhost:3000 in your browser

### Running the Node Agent

On your GPU machine:

```bash
cd agent
pip install -r requirements.txt
python -m agent.main --server-url http://your-server:8000 --token YOUR_TOKEN
```

## Project Structure

```
TuneLLM/
├── backend/          # FastAPI control plane
├── agent/            # Node agent for GPU workers
├── training/         # Training container
├── inference/        # Inference server
├── frontend/         # React web UI
├── docker/           # Docker Compose configs
├── docs/             # Documentation
└── recipes/          # Community fine-tuning recipes
```

## Supported Models

- LLaMA 2 (7B, 13B, 70B)
- LLaMA 3
- Mistral (7B)
- Falcon (7B, 40B)
- GPT-J / GPT-NeoX
- Qwen
- Any HuggingFace-compatible model

## Configuration

Fine-tuning jobs are configured via YAML:

```yaml
run_name: "llama2_7b_lora"
base_model: "meta-llama/Llama-2-7b-hf"

method: "LoRA"
lora:
  r: 16
  alpha: 32
  target_modules: ["q_proj", "v_proj"]

training:
  epochs: 3
  batch_size: 16
  learning_rate: 2e-5
  mixed_precision: "bf16"
```

## API Documentation

See [docs/api-reference.md](docs/api-reference.md) for the full API documentation.

### Quick Examples

```bash
# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "user", "password": "pass"}'

# Upload dataset
curl -X POST http://localhost:8000/api/v1/datasets \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@data.jsonl" \
  -F "name=my-dataset"

# Start fine-tuning job
curl -X POST http://localhost:8000/api/v1/finetune-jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @config.json
```

## Development

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
make test
```

## Contributing

See [CONTRIBUTING.md](docs/contributing.md) for guidelines.

## License

Apache License 2.0 - see [LICENSE](LICENSE)

## Acknowledgments

Built with:
- [HuggingFace Transformers](https://huggingface.co/transformers/)
- [PEFT](https://github.com/huggingface/peft)
- [TRL](https://github.com/huggingface/trl)
- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://react.dev/)
