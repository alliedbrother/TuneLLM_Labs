# TuneLLM

**Open-source platform for fine-tuning Large Language Models on cloud GPUs — from PDF to fine-tuned model in one click.**

TuneLLM lets you rent cloud GPUs (Vast.ai), upload data (PDFs, JSONL, HuggingFace datasets), fine-tune open-source LLMs with Unsloth (2x faster), and download the trained adapter — all through a web UI.

---

## What Can You Do?

- **Rent cloud GPUs** from Vast.ai with one click (Lambda Labs, AWS support planned)
- **Create training data** from PDFs using Claude/GPT, import from HuggingFace, or upload JSONL
- **Fine-tune any model** — Qwen, Llama, Phi, Mistral, TinyLlama (powered by Unsloth)
- **Watch training live** — real-time progress, loss charts, step-by-step pipeline visualization
- **Evaluate before & after** — baseline vs fine-tuned metrics (F1, ROUGE, Exact Match)
- **Download the model** — get the LoRA adapter as a zip file

## Architecture

```
Frontend (React)  ←→  Backend (FastAPI)  ←→  GPU Agent (Python)
     :3000              :8000                   Vast.ai
                           ↕
                      PostgreSQL + Redis
```

| Component | Tech | Purpose |
|-----------|------|---------|
| Frontend | React 18, TypeScript, Tailwind, Radix UI | Web dashboard |
| Backend | FastAPI, SQLAlchemy, PostgreSQL | API, job scheduling, data management |
| Agent | Python, httpx, asyncio | Runs on GPU, executes training |
| Training | Unsloth, PyTorch, HuggingFace TRL | Model fine-tuning with 2x speedup |

---

## Quick Start (5 minutes)

### Prerequisites

- **Docker** and **Docker Compose** v2
- A machine with 8GB+ RAM (for the backend — no GPU needed locally)
- A **Vast.ai account** with credits for GPU rental

### 1. Clone and start

```bash
git clone https://github.com/alliedbrother/TuneLLM.git
cd TuneLLM

# Copy environment file
cp docker/.env.example docker/.env
# Edit docker/.env and set a SECRET_KEY:
#   SECRET_KEY=$(openssl rand -hex 32)

# Start all services
cd docker
docker compose up -d
```

This starts:
- **PostgreSQL** (port 5432) — database
- **Redis** (port 6379) — caching
- **Backend** (port 8000) — API server
- **Frontend** (port 80) — web UI

### 2. Open the UI

Go to **http://localhost** in your browser.

- Click **Sign Up** to create an account
- Log in with your credentials

### 3. Add your API keys

Go to **Hardware** page:
1. Click **API Keys**
2. Add your **Vast.ai API key** (get it from https://cloud.vast.ai/cli/)
3. Your running GPU instances will be auto-detected

For PDF-to-Q&A dataset creation, go to **Datasets** → **Create from PDF**:
- Enter your **Anthropic** or **OpenAI** API key (saved for future use)

### 4. Connect a GPU

On the **Hardware** page:
1. Click **Rent Cloud GPU** to browse Vast.ai marketplace
2. Pick a GPU (RTX 3060+ recommended, $0.02-0.05/hr)
3. Wait 1-3 minutes for it to boot
4. Click **Detect GPUs** to see it
5. Click **Connect** — agent deploys automatically (~60 seconds)
6. Node appears as **Online** with green dot

### 5. Create a dataset

On the **Datasets** page, three options:

**Upload JSONL** (for existing data):
```json
{"instruction": "What is X?", "input": "Context about X", "output": "X is..."}
```

**Import from HuggingFace** (one click):
- Enter dataset ID like `rajpurkar/squad` or `openai/gsm8k`
- Choose split and max samples

**Create from PDF** (AI-powered):
- Select PDF files from your computer
- Choose AI provider (Claude or GPT) and model
- Q&A pairs generated automatically

### 6. Launch fine-tuning

On the **Fine-Tuning** page:
1. Select a **model** (Qwen 2.5 1.5B recommended for quick tests)
2. Select your **dataset**
3. Choose **LoRA** method
4. Select your **GPU node**
5. Toggle **Baseline/Post-training Evaluation** on
6. Click **Launch Job**

### 7. Watch training

On the **Job Detail** page:
- Step-by-step progress: Connect → Data → Setup → Load Model → Baseline Eval → Training → Save → Final Eval → Ready
- Live loss display
- Evaluation metrics comparison (baseline vs fine-tuned)
- Training logs in real-time

### 8. Download the model

When training completes:
- Click **Download Model** to get the LoRA adapter as a zip
- The adapter can be loaded with PEFT/Unsloth for inference

---

## Developer Setup (Local Development)

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker (for PostgreSQL + Redis)
- Git

### Backend

```bash
# Start databases
cd docker && docker compose up -d postgres redis && cd ..

# Setup Python environment
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configure
cp .env.example .env  # Edit DATABASE_URL if needed

# Run
uvicorn app.main:app --reload --port 8000
```

API docs at http://localhost:8000/api/v1/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

UI at http://localhost:5173

### Agent (on GPU machine)

```bash
cd agent
pip install -r requirements.txt

# For direct execution (no Docker):
export TUNELLM_AGENT_SERVER_URL=http://your-backend:8000
export TUNELLM_AGENT_API_KEY=<from node registration>
export TUNELLM_AGENT_EXECUTION_MODE=direct
export TUNELLM_AGENT_TRAINING_SCRIPT=/path/to/train_unsloth.py
python -m agent.main
```

### Training Script (standalone)

```bash
cd training
pip install unsloth rouge-score

# Run training directly:
export JOB_CONFIG='{"base_model":"unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit","method":"lora","dataset":{"source":"data.jsonl"},"training":{"epochs":1,"batch_size":2},"lora":{"r":16,"alpha":32}}'
python scripts/train_unsloth.py --config env
```

---

## Project Structure

```
TuneLLM/
├── frontend/              # React web UI
│   ├── src/pages/         # Dashboard, Datasets, FineTuning, Jobs, Hardware, Models
│   ├── src/components/    # Reusable UI components
│   ├── src/services/      # API client
│   └── src/types/         # TypeScript types
│
├── backend/               # FastAPI backend
│   ├── app/routers/       # API endpoints (auth, datasets, jobs, hardware, cloud, pipeline)
│   ├── app/models/        # SQLAlchemy DB models
│   ├── app/schemas/       # Pydantic request/response schemas
│   ├── app/services/      # Business logic (auth, scheduler, vastai, pdf, qa_generator, ssh)
│   └── alembic/           # Database migrations
│
├── agent/                 # GPU agent (runs on remote machines)
│   └── agent/
│       ├── main.py        # Entry point, heartbeat + job polling
│       ├── job_handler.py # Job execution, progress parsing, model upload
│       ├── direct_runner.py # Run training locally (no Docker)
│       └── docker_runner.py # Run training in Docker containers
│
├── training/              # Training scripts
│   └── scripts/
│       ├── train_unsloth.py  # Unified trainer (Unsloth-powered)
│       ├── evaluate.py       # Model evaluation
│       └── utils/            # Metrics, data loading
│
├── docker/                # Docker Compose configs
│   ├── docker-compose.yml # Development
│   └── .env.example       # Environment template
│
└── scripts/               # Utility scripts
    └── prepare_dataset.py # Download & prepare sample datasets
```

## API Endpoints

| Category | Endpoints |
|----------|-----------|
| **Auth** | POST /auth/signup, /auth/login, GET /auth/me |
| **Datasets** | CRUD + /import-huggingface, /create-from-pdf, /{id}/preview, /{id}/validate |
| **Jobs** | CRUD + /pending/{node_id}, /{id}/status, /{id}/logs, /{id}/upload-model, /{id}/download-model |
| **Hardware** | CRUD + /me, /{id}/heartbeat, /detect-local |
| **Cloud** | /providers, /credentials, /detect-gpus/{provider}, /connect, /search-gpus, /provision |
| **Pipeline** | /process-directory, /jobs |

Full OpenAPI docs: http://localhost:8000/api/v1/docs

## Supported Models

| Model | HuggingFace ID | Size | Recommended For |
|-------|---------------|------|-----------------|
| Qwen 2.5 1.5B | `Qwen/Qwen2.5-1.5B-Instruct` | 1.5B | Quick tests, 8GB+ GPU |
| TinyLlama 1.1B | `TinyLlama/TinyLlama-1.1B-Chat-v1.0` | 1.1B | Fastest training |
| Llama 3.2 1B | `meta-llama/Llama-3.2-1B-Instruct` | 1B | Small + capable |
| Phi 3.5 Mini | `microsoft/Phi-3.5-mini-instruct` | 3.8B | Best quality for size |
| Mistral 7B | `mistralai/Mistral-7B-Instruct-v0.3` | 7B | Needs 16GB+ GPU |

## Dataset Formats

TuneLLM accepts training data in these formats:

**Alpaca format** (recommended):
```json
{"instruction": "What is...", "input": "Context...", "output": "Answer..."}
```

**Chat format**:
```json
{"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
```

**Q&A format**:
```json
{"question": "What is...", "answer": "..."}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | (required) | JWT signing key |
| `DATABASE_URL` | `postgresql+asyncpg://tunellm:tunellm_dev@postgres:5432/tunellm` | Database connection |
| `VASTAI_API_KEY` | (optional) | Vast.ai API key (can also set via UI) |
| `ANTHROPIC_API_KEY` | (optional) | For PDF Q&A generation (can also set via UI) |
| `OPENAI_API_KEY` | (optional) | For PDF Q&A generation (can also set via UI) |
| `HF_TOKEN` | (optional) | HuggingFace token for gated models |

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Zustand, React Query, Recharts
- **Backend**: FastAPI, SQLAlchemy 2 (async), PostgreSQL, Redis, Pydantic v2
- **Training**: Unsloth, PyTorch, HuggingFace Transformers/TRL/PEFT, bitsandbytes
- **Infrastructure**: Docker Compose, SSH tunneling, Vast.ai API

## License

Apache 2.0
