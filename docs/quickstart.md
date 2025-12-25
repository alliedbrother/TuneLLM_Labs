# TuneLLM Quickstart Guide

Get started with TuneLLM in minutes.

## Prerequisites

- Docker and Docker Compose
- NVIDIA GPU with CUDA support (for training)
- NVIDIA Container Toolkit installed
- At least 16GB GPU memory (for 7B models)

## Quick Start with Docker Compose

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/tunellm.git
cd tunellm
```

### 2. Configure Environment

```bash
# Copy example environment file
cp docker/.env.example docker/.env

# Edit the configuration
nano docker/.env
```

Key settings to update:
- `POSTGRES_PASSWORD` - Set a secure database password
- `SECRET_KEY` - Generate with `openssl rand -hex 32`

### 3. Start the Services

```bash
# Start all services
cd docker
docker-compose up -d

# Check status
docker-compose ps
```

### 4. Access the Web UI

Open http://localhost in your browser.

1. Create an account
2. Upload a dataset
3. Start a fine-tuning job

## Local Development Setup

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql+asyncpg://tunellm:password@localhost:5432/tunellm"
export SECRET_KEY="dev-secret-key"

# Run database migrations
alembic upgrade head

# Start the server
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### Agent

```bash
cd agent

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the agent
python -m agent.main --server-url http://localhost:8000 --node-name dev-node
```

## Your First Fine-Tuning Job

### 1. Prepare Your Dataset

Create a JSON file with your training data:

```json
[
  {
    "instruction": "Summarize the following text",
    "input": "TuneLLM is an open-source platform...",
    "output": "TuneLLM enables LLM fine-tuning on custom hardware."
  },
  {
    "instruction": "Translate to French",
    "input": "Hello, how are you?",
    "output": "Bonjour, comment allez-vous?"
  }
]
```

### 2. Upload the Dataset

1. Go to **Datasets** in the web UI
2. Click **Upload Dataset**
3. Select your JSON file
4. Give it a name

### 3. Create a Training Job

1. Go to **Jobs**
2. Click **New Job**
3. Configure:
   - **Name**: `my-first-finetune`
   - **Base Model**: `meta-llama/Llama-2-7b-hf`
   - **Dataset**: Select your uploaded dataset
   - **Method**: LoRA (recommended for beginners)
4. Click **Create Job**

### 4. Monitor Training

- View real-time logs in the job detail page
- Training progress is shown as a percentage
- Metrics are displayed as they're computed

### 5. Deploy Your Model

Once training completes:

1. Go to **Models**
2. Find your trained model
3. Click **Deploy**
4. Use the provided endpoint URL for inference

## Training Configuration

### LoRA (Recommended)

Best for most use cases. Memory efficient and fast.

```yaml
method: lora
lora:
  r: 16
  alpha: 32
  dropout: 0.05
  target_modules:
    - q_proj
    - v_proj
training:
  num_epochs: 3
  batch_size: 4
  learning_rate: 2e-4
```

### QLoRA (Large Models)

For 13B+ models or limited GPU memory.

```yaml
method: qlora
qlora:
  r: 64
  alpha: 16
quantization:
  type: nf4
  double_quant: true
training:
  batch_size: 2
  gradient_accumulation_steps: 8
```

### DPO (Preference Learning)

For aligning models with human preferences.

```yaml
method: dpo
dpo:
  beta: 0.1
  loss_type: sigmoid
training:
  learning_rate: 5e-7
  num_epochs: 1
```

## Adding GPU Nodes

To add more GPU capacity:

```bash
# On your GPU machine
docker run --gpus all -d \
  -e SERVER_URL=http://your-server:8000 \
  -e NODE_NAME=gpu-node-1 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/tunellm/agent:latest
```

The node will automatically appear in the **Hardware** page.

## Troubleshooting

### Out of Memory

- Reduce `batch_size`
- Increase `gradient_accumulation_steps`
- Use QLoRA instead of LoRA
- Reduce `max_length`

### Training is Slow

- Check GPU utilization with `nvidia-smi`
- Increase `batch_size` if GPU memory allows
- Enable `flash_attention_2` if supported

### Model Not Learning

- Check your dataset format
- Try lower `learning_rate`
- Increase `num_epochs`
- Review training logs for NaN losses

## Next Steps

- Read the [Architecture](architecture.md) documentation
- Explore the [API Reference](api-reference.md)
- Check out [sample recipes](../recipes/)
- Join our community discussions
