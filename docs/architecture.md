# TuneLLM Architecture

## Overview

TuneLLM is a distributed LLM fine-tuning platform that enables users to fine-tune large language models on their own hardware. The system follows a control plane / data plane architecture.

## System Components

```
                                    +------------------+
                                    |   Web Frontend   |
                                    |   (React + TS)   |
                                    +--------+---------+
                                             |
                                             v
+------------------+              +------------------+              +------------------+
|   PostgreSQL     |<------------>|   Backend API    |<------------>|     Redis        |
|   (Database)     |              |   (FastAPI)      |              |   (Cache/Queue)  |
+------------------+              +--------+---------+              +------------------+
                                           |
                                           | WebSocket / HTTP
                                           v
                    +------------------+   +------------------+   +------------------+
                    |   GPU Node 1     |   |   GPU Node 2     |   |   GPU Node N     |
                    |   (Agent)        |   |   (Agent)        |   |   (Agent)        |
                    +--------+---------+   +--------+---------+   +--------+---------+
                             |                      |                      |
                             v                      v                      v
                    +------------------+   +------------------+   +------------------+
                    | Training         |   | Training         |   | Inference        |
                    | Container        |   | Container        |   | Container        |
                    +------------------+   +------------------+   +------------------+
```

## Component Details

### 1. Backend API (Control Plane)

The FastAPI backend serves as the central control plane for the system.

**Responsibilities:**
- User authentication and authorization (JWT)
- Dataset management (upload, validation, storage)
- Job scheduling and orchestration
- Model registry and deployment
- Hardware node management
- API for frontend and agents

**Key Modules:**
- `app/main.py` - FastAPI application entry point
- `app/routers/` - REST API endpoints
- `app/services/scheduler.py` - Job scheduling logic
- `app/services/storage.py` - File storage management

### 2. Node Agent (Data Plane)

Lightweight Python agent that runs on each GPU node.

**Responsibilities:**
- Register with control plane
- Send periodic heartbeats with system stats
- Poll for assigned jobs
- Execute training/inference containers
- Stream logs back to control plane
- Report job status and metrics

**Key Modules:**
- `agent/main.py` - Agent entry point and main loop
- `agent/docker_runner.py` - Container lifecycle management
- `agent/job_handler.py` - Job execution logic
- `agent/api_client.py` - Control plane communication

### 3. Training Container

Docker container with all dependencies for LLM fine-tuning.

**Supported Methods:**
- **LoRA** - Low-Rank Adaptation using PEFT
- **QLoRA** - 4-bit quantized LoRA with bitsandbytes
- **DPO** - Direct Preference Optimization using TRL
- **PPO** - Proximal Policy Optimization (experimental)
- **Full Fine-tuning** - Standard full model training

**Key Components:**
- HuggingFace Transformers for model loading
- PEFT for parameter-efficient fine-tuning
- TRL for RLHF methods
- bitsandbytes for quantization

### 4. Inference Server

FastAPI-based inference server for deployed models.

**Features:**
- Load base models with LoRA adapters
- Streaming text generation
- Batch inference support
- Dynamic model loading/unloading
- Quantization support

### 5. Frontend

React-based web UI for platform management.

**Pages:**
- Dashboard - Overview and stats
- Datasets - Upload and manage training data
- Jobs - Create, monitor, and manage training jobs
- Models - View and deploy trained models
- Hardware - Monitor GPU nodes

## Data Flow

### Training Job Flow

```
1. User uploads dataset via Frontend
   └── Dataset stored in Storage Service

2. User creates training job with config
   └── Job queued in database

3. Scheduler assigns job to available node
   └── Job status: QUEUED → RUNNING

4. Agent on node receives job
   └── Pulls training container
   └── Mounts dataset and config
   └── Starts training

5. Training container executes
   └── Logs streamed to control plane
   └── Metrics reported periodically

6. Training completes
   └── Model saved to storage
   └── Job status: RUNNING → COMPLETED
   └── Model registered in Model Registry
```

### Inference Flow

```
1. User deploys model via Frontend
   └── Backend spawns inference container on available node

2. Inference server starts
   └── Loads base model
   └── Loads LoRA adapter
   └── Registers endpoint with backend

3. User sends generation request
   └── Request routed to inference server
   └── Response streamed back
```

## Database Schema

### Core Tables

- **users** - User accounts and authentication
- **datasets** - Dataset metadata and file locations
- **fine_tune_jobs** - Training job definitions and status
- **job_logs** - Training logs and metrics
- **trained_models** - Model registry
- **hardware_nodes** - Registered GPU nodes

## Security Model

### Authentication
- JWT-based authentication
- Access tokens (short-lived) + Refresh tokens (long-lived)
- Password hashing with bcrypt

### Authorization
- User-based resource isolation
- Each user can only access their own datasets, jobs, and models
- Admin role for platform management

### Node Security
- API key authentication for agents
- Secure WebSocket connections for log streaming

## Scalability Considerations

### Horizontal Scaling
- Backend can be replicated behind load balancer
- PostgreSQL supports read replicas
- Redis cluster for caching

### GPU Node Scaling
- Add nodes by running agent on new machines
- Automatic discovery and registration
- Load balancing across available nodes

## Configuration

All components are configured via environment variables:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `SECRET_KEY` - JWT signing key
- `STORAGE_PATH` - Local file storage path
- `SERVER_URL` - Control plane URL (for agents)
