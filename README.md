# TuneLLM

**Open-source platform for fine-tuning Large Language Models on your own hardware.**

Fine-tune LLaMA, Mistral, Falcon, and other open-source LLMs without sending your data to third-party APIs. TuneLLM gives you full control over your models and training data.

## What is TuneLLM?

TuneLLM is a self-hosted platform that lets you:

- **Fine-tune LLMs** on your private data using LoRA, QLoRA, or DPO
- **Manage training jobs** through an intuitive web interface
- **Deploy models** as inference endpoints with one click
- **Scale across GPUs** on local machines or cloud instances

Perfect for teams who need to customize AI models while keeping data on-premise.

## Key Features

| Feature | Description |
|---------|-------------|
| Web Dashboard | Upload datasets, configure jobs, monitor training |
| Multiple Training Methods | LoRA, QLoRA (4-bit), DPO, Full Fine-tuning |
| Real-time Monitoring | Live logs, metrics, and progress tracking |
| Model Registry | Track and version all trained models |
| One-click Deployment | Deploy models as API endpoints |
| REST API | Automate everything programmatically |

## Current Status

### Implemented (v0.1)

- Single-node GPU training with Docker
- LoRA and QLoRA fine-tuning
- DPO training for alignment
- Dataset management (JSONL, CSV, Parquet)
- Job creation, monitoring, and cancellation
- Real-time log streaming
- JWT authentication
- PostgreSQL + Redis backend
- React web UI with Tailwind CSS
- Node Agent for GPU workers

### Roadmap

- [ ] Multi-node distributed training
- [ ] PPO-based RLHF with reward models
- [ ] vLLM/TGI optimized inference
- [ ] Kubernetes deployment
- [ ] Team workspaces and RBAC
- [ ] Experiment tracking integration (W&B, MLflow)
- [ ] Model quantization (GPTQ, AWQ)

## Quick Start

```bash
# Clone and start
git clone https://github.com/yourusername/TuneLLM.git
cd TuneLLM/docker
docker compose up -d

# Access UI at http://localhost
# API docs at http://localhost:8000/docs
```

## Supported Models

Works with any HuggingFace-compatible model:

- LLaMA 2/3 (7B, 13B, 70B)
- Mistral / Mixtral
- Falcon (7B, 40B)
- Qwen, Phi, and more

## License

Apache License 2.0 - Free for commercial use.

---

# For Developers

## Architecture Overview

```
Frontend (React) → Backend (FastAPI) → Node Agent → Training Container (PyTorch)
                         ↓
              PostgreSQL + Redis + File Storage
```

| Component | Tech Stack |
|-----------|------------|
| Backend | FastAPI, SQLAlchemy, PostgreSQL, JWT |
| Frontend | React 18, TypeScript, Vite, Zustand |
| Training | Transformers, PEFT, TRL, PyTorch |
| Agent | Python, Docker SDK |

## Local Development

```bash
# Start databases
cd docker && docker compose up -d postgres redis

# Backend (Terminal 1)
cd backend
pip install -r ../requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (Terminal 2)
cd frontend
npm install && npm run dev
```

## Project Structure

```
backend/     # FastAPI control plane
frontend/    # React web UI
agent/       # GPU node agent
training/    # Training container
inference/   # Inference server
docker/      # Docker Compose configs
```

## Documentation

For complete technical documentation including:
- Database schema and relationships
- API endpoint reference
- Authentication flow
- Job execution lifecycle
- Configuration options
- Troubleshooting guide

**See: [TuneLLMDeveloperDesign.md](TuneLLMDeveloperDesign.md)**

## Contributing

1. Fork the repo
2. Create feature branch
3. Make changes with tests
4. Submit PR

See design doc for code style and conventions.
