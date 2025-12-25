# TuneLLM Developer Design Document

**Version:** 1.0.0
**Last Updated:** December 2024
**Authors:** TuneLLM Development Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Project Structure](#3-project-structure)
4. [Backend (Control Plane)](#4-backend-control-plane)
5. [Frontend (Web UI)](#5-frontend-web-ui)
6. [Node Agent (GPU Worker)](#6-node-agent-gpu-worker)
7. [Training Container](#7-training-container)
8. [Inference Server](#8-inference-server)
9. [Database Design](#9-database-design)
10. [API Reference](#10-api-reference)
11. [Authentication & Authorization](#11-authentication--authorization)
12. [Job Execution Flow](#12-job-execution-flow)
13. [Docker & Deployment](#13-docker--deployment)
14. [Development Workflow](#14-development-workflow)
15. [Configuration Reference](#15-configuration-reference)
16. [Security Considerations](#16-security-considerations)
17. [Troubleshooting Guide](#17-troubleshooting-guide)
18. [Contributing Guidelines](#18-contributing-guidelines)

---

## 1. Executive Summary

### 1.1 What is TuneLLM?

TuneLLM is an **open-source platform for fine-tuning Large Language Models (LLMs)** on custom hardware. It provides a complete end-to-end solution for organizations and researchers who want to:

- **Fine-tune open-source LLMs** (LLaMA, Mistral, Falcon, etc.) on their own data
- **Manage distributed GPU resources** across multiple machines
- **Track training experiments** with real-time monitoring and logging
- **Deploy trained models** as inference endpoints
- **Maintain full control** over their models and data (no cloud dependencies)

### 1.2 Key Features

| Feature | Description |
|---------|-------------|
| **Multiple Training Methods** | LoRA, QLoRA, DPO, PPO, and Full Fine-tuning |
| **Web-based UI** | Intuitive React interface for non-technical users |
| **REST API** | Complete API for automation and CI/CD integration |
| **Distributed Training** | Support for multiple GPU nodes with job scheduling |
| **Real-time Monitoring** | Live logs, metrics, and training progress |
| **Model Registry** | Track and version trained models |
| **One-click Deployment** | Deploy models as inference endpoints |
| **Open Source** | Apache 2.0 license, fully customizable |

### 1.3 Technology Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│  React 18 + TypeScript + Vite + Tailwind CSS + Zustand         │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Control Plane)                      │
│  FastAPI + SQLAlchemy + PostgreSQL + Alembic + JWT Auth        │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NODE AGENT(S)                              │
│  Python + Docker SDK + HTTP Client                             │
│  (One agent per GPU machine)                                   │
└─────────────────────────────────────────────────────────────────┘
                              │ Docker
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TRAINING CONTAINER                            │
│  Transformers + PEFT + TRL + PyTorch + CUDA                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. System Architecture Overview

### 2.1 High-Level Architecture

```
                                    ┌──────────────────┐
                                    │   Web Browser    │
                                    │   (React UI)     │
                                    └────────┬─────────┘
                                             │ HTTPS
                                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           NGINX (Reverse Proxy)                        │
│   - Serves static frontend assets                                      │
│   - Proxies /api/* requests to backend                                │
│   - SSL termination (production)                                       │
└────────────────────────────────────────────────────────────────────────┘
                                             │
                    ┌────────────────────────┴────────────────────────┐
                    │                                                 │
                    ▼                                                 ▼
        ┌───────────────────────┐                         ┌───────────────────┐
        │   Frontend (React)    │                         │  Backend (FastAPI)│
        │   Port: 80/443        │                         │  Port: 8000       │
        │   - Dashboard         │                         │  - REST API       │
        │   - Job Management    │                         │  - Auth (JWT)     │
        │   - Model Registry    │                         │  - Job Scheduler  │
        │   - Hardware Monitor  │                         │  - Storage Svc    │
        └───────────────────────┘                         └─────────┬─────────┘
                                                                    │
                                              ┌─────────────────────┼─────────────────────┐
                                              │                     │                     │
                                              ▼                     ▼                     ▼
                                    ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
                                    │   PostgreSQL    │   │     Redis       │   │  File Storage   │
                                    │   Port: 5432    │   │   Port: 6379    │   │   (./storage)   │
                                    │   - Users       │   │   - Job Queue   │   │   - Datasets    │
                                    │   - Jobs        │   │   - Cache       │   │   - Models      │
                                    │   - Models      │   │                 │   │   - Logs        │
                                    │   - Nodes       │   │                 │   │                 │
                                    └─────────────────┘   └─────────────────┘   └─────────────────┘
                                                                    │
                                                                    │ HTTP (Heartbeat, Job Polling)
                    ┌───────────────────────────────────────────────┴───────────────────────────────┐
                    │                                                                               │
                    ▼                                                                               ▼
        ┌───────────────────────────────────────┐                       ┌───────────────────────────────────────┐
        │           GPU NODE 1                  │                       │           GPU NODE 2                  │
        │  ┌─────────────────────────────────┐  │                       │  ┌─────────────────────────────────┐  │
        │  │         Node Agent              │  │                       │  │         Node Agent              │  │
        │  │  - Polls for jobs               │  │                       │  │  - Polls for jobs               │  │
        │  │  - Reports heartbeat            │  │                       │  │  - Reports heartbeat            │  │
        │  │  - Streams logs                 │  │                       │  │  - Streams logs                 │  │
        │  └──────────────┬──────────────────┘  │                       │  └──────────────┬──────────────────┘  │
        │                 │ Docker API          │                       │                 │ Docker API          │
        │                 ▼                     │                       │                 ▼                     │
        │  ┌─────────────────────────────────┐  │                       │  ┌─────────────────────────────────┐  │
        │  │     Training Container          │  │                       │  │     Training Container          │  │
        │  │  - LoRA/QLoRA/DPO/PPO          │  │                       │  │  - LoRA/QLoRA/DPO/PPO          │  │
        │  │  - GPU: NVIDIA RTX 4090        │  │                       │  │  - GPU: NVIDIA A100            │  │
        │  └─────────────────────────────────┘  │                       │  └─────────────────────────────────┘  │
        └───────────────────────────────────────┘                       └───────────────────────────────────────┘
```

### 2.2 Component Communication

| From | To | Protocol | Purpose |
|------|-----|----------|---------|
| Browser | Frontend | HTTPS | Load React SPA |
| Frontend | Backend | HTTP/REST | API calls (auth, CRUD) |
| Agent | Backend | HTTP/REST | Heartbeat, job polling, status updates |
| Agent | Docker | Unix Socket | Container management |
| Backend | PostgreSQL | TCP (asyncpg) | Data persistence |
| Backend | Redis | TCP | Job queue, caching |
| Training | Storage | File I/O | Dataset read, model write |

### 2.3 Data Flow for Training Job

```
1. User uploads dataset via Frontend
   └─→ Backend saves to /storage/datasets/{user_id}/{dataset_id}/

2. User creates fine-tuning job
   └─→ Backend creates job record (status: PENDING)
   └─→ Backend pushes job to scheduler queue

3. Agent polls for pending jobs
   └─→ Backend returns job with config

4. Agent executes job
   └─→ Pulls training Docker image
   └─→ Mounts dataset and model volumes
   └─→ Passes job config as environment variable
   └─→ Starts container with GPU access

5. Training Container runs
   └─→ Loads dataset from mounted volume
   └─→ Downloads base model from HuggingFace
   └─→ Runs fine-tuning (LoRA/QLoRA/DPO/etc.)
   └─→ Saves model to /models/{job_id}/
   └─→ Writes logs to stdout

6. Agent streams logs to Backend
   └─→ Backend stores logs in database

7. Training completes
   └─→ Agent updates job status (COMPLETED/FAILED)
   └─→ Backend creates TrainedModel record

8. User views results in Frontend
   └─→ Can download model or deploy to inference
```

---

## 3. Project Structure

### 3.1 Directory Layout

```
/TuneLLM/
│
├── backend/                          # FastAPI Control Plane
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                   # FastAPI app entry point
│   │   ├── config.py                 # Pydantic settings
│   │   ├── database.py               # SQLAlchemy async engine
│   │   ├── models/                   # SQLAlchemy ORM models
│   │   │   ├── __init__.py
│   │   │   ├── user.py               # User model
│   │   │   ├── dataset.py            # Dataset model
│   │   │   ├── job.py                # FineTuneJob + JobLog models
│   │   │   ├── model.py              # TrainedModel model
│   │   │   └── node.py               # Node (hardware) model
│   │   ├── schemas/                  # Pydantic request/response schemas
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── dataset.py
│   │   │   ├── job.py
│   │   │   ├── model.py
│   │   │   └── node.py
│   │   ├── routers/                  # API route handlers
│   │   │   ├── __init__.py
│   │   │   ├── auth.py               # /api/v1/auth/*
│   │   │   ├── datasets.py           # /api/v1/datasets/*
│   │   │   ├── jobs.py               # /api/v1/finetune-jobs/*
│   │   │   ├── models.py             # /api/v1/models/*
│   │   │   ├── hardware.py           # /api/v1/hardware/*
│   │   │   └── endpoints.py          # /api/v1/endpoints/*
│   │   ├── services/                 # Business logic
│   │   │   ├── __init__.py
│   │   │   ├── auth.py               # Authentication service
│   │   │   ├── scheduler.py          # Job scheduling service
│   │   │   └── storage.py            # File storage service
│   │   └── utils/
│   │       ├── __init__.py
│   │       └── security.py           # Password hashing, JWT utils
│   ├── alembic/                      # Database migrations
│   │   ├── versions/
│   │   └── env.py
│   ├── tests/                        # Backend tests
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   └── .env                          # Environment variables (local dev)
│
├── agent/                            # Node Agent (GPU Worker)
│   ├── agent/
│   │   ├── __init__.py
│   │   ├── main.py                   # CLI entry point
│   │   ├── config.py                 # Agent settings
│   │   ├── api_client.py             # HTTP client for backend
│   │   ├── docker_runner.py          # Docker container management
│   │   └── job_handler.py            # Job execution logic
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
│
├── training/                         # Training Container
│   ├── scripts/
│   │   ├── train.py                  # Main entry point
│   │   ├── lora_trainer.py           # LoRA fine-tuning
│   │   ├── qlora_trainer.py          # QLoRA (4-bit) fine-tuning
│   │   ├── dpo_trainer.py            # DPO training
│   │   ├── ppo_trainer.py            # PPO training (RLHF)
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── data_loader.py        # Dataset loading
│   │       ├── model_utils.py        # Model utilities
│   │       └── metrics.py            # Training metrics
│   ├── configs/                      # Sample training configs
│   │   ├── lora_llama2_7b.yaml
│   │   ├── qlora_mistral_7b.yaml
│   │   └── dpo_example.yaml
│   ├── Dockerfile
│   └── requirements.txt
│
├── inference/                        # Inference Server
│   ├── server/
│   │   ├── __init__.py
│   │   ├── main.py                   # FastAPI inference server
│   │   ├── config.py                 # Server settings
│   │   ├── model_loader.py           # Model loading utilities
│   │   └── generator.py              # Text generation
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                         # React Web UI
│   ├── src/
│   │   ├── App.tsx                   # Main app component
│   │   ├── main.tsx                  # React entry point
│   │   ├── components/               # Reusable components
│   │   │   ├── Layout/
│   │   │   ├── Dashboard/
│   │   │   ├── Datasets/
│   │   │   ├── Jobs/
│   │   │   ├── Models/
│   │   │   ├── Hardware/
│   │   │   └── Auth/
│   │   ├── pages/                    # Page components
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── DatasetsPage.tsx
│   │   │   ├── JobsPage.tsx
│   │   │   ├── JobDetailPage.tsx
│   │   │   ├── ModelsPage.tsx
│   │   │   ├── HardwarePage.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   └── SignupPage.tsx
│   │   ├── hooks/                    # Custom React hooks
│   │   │   └── useApi.ts
│   │   ├── services/                 # API client
│   │   │   └── api.ts
│   │   ├── store/                    # Zustand state management
│   │   │   └── authStore.ts
│   │   └── types/                    # TypeScript types
│   │       └── index.ts
│   ├── public/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── docker/                           # Docker Compose configs
│   ├── docker-compose.yml            # Development
│   ├── docker-compose.prod.yml       # Production
│   └── .env.example                  # Environment template
│
├── docs/                             # Documentation
│   ├── architecture.md
│   ├── api-reference.md
│   ├── quickstart.md
│   └── contributing.md
│
├── recipes/                          # Community fine-tuning recipes
│   └── README.md
│
├── scripts/                          # Utility scripts
│   ├── setup.sh
│   └── dev.sh
│
├── requirements.txt                  # Consolidated Python dependencies
├── Makefile                          # Development commands
├── README.md                         # Project overview
├── LICENSE                           # Apache 2.0
├── run_backend.sh                    # Local backend runner
├── run_frontend.sh                   # Local frontend runner
└── TuneLLMDeveloperDesign.md        # This document
```

### 3.2 Key File Purposes

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI application factory, middleware setup, lifespan events |
| `backend/app/database.py` | SQLAlchemy async engine, session management, DB initialization |
| `backend/app/config.py` | Pydantic Settings for environment-based configuration |
| `agent/agent/main.py` | Agent CLI, heartbeat loop, job polling loop |
| `training/scripts/train.py` | Training entry point, loads config and dispatches to trainers |
| `frontend/src/App.tsx` | React router setup, auth context, layout wrapper |
| `frontend/src/services/api.ts` | Axios client with interceptors for auth token management |

---

## 4. Backend (Control Plane)

### 4.1 Overview

The backend is a **FastAPI application** that serves as the central control plane for TuneLLM. It handles:

- User authentication and authorization
- Dataset management (upload, list, delete)
- Fine-tuning job orchestration
- Trained model registry
- Hardware node management
- Job scheduling and dispatch

### 4.2 Application Entry Point

**File:** `backend/app/main.py`

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db, close_db
from app.routers import auth, datasets, jobs, models, hardware, endpoints

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown events."""
    # Startup: Initialize database tables
    await init_db()
    yield
    # Shutdown: Close database connections
    await close_db()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(datasets.router, prefix="/api/v1/datasets", tags=["datasets"])
app.include_router(jobs.router, prefix="/api/v1/finetune-jobs", tags=["jobs"])
app.include_router(models.router, prefix="/api/v1/models", tags=["models"])
app.include_router(hardware.router, prefix="/api/v1/hardware", tags=["hardware"])
app.include_router(endpoints.router, prefix="/api/v1/endpoints", tags=["endpoints"])

@app.get("/health")
async def health_check():
    """Health check endpoint for container orchestration."""
    return {"status": "healthy", "version": settings.app_version}
```

### 4.3 Configuration

**File:** `backend/app/config.py`

The configuration uses **Pydantic Settings** which automatically loads values from environment variables or `.env` file.

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    app_name: str = "TuneLLM"
    app_version: str = "0.1.0"
    debug: bool = False

    # Database (PostgreSQL with asyncpg driver)
    database_url: str = "postgresql+asyncpg://tunellm:tunellm_dev@localhost:5432/tunellm"

    # JWT Authentication
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Storage
    storage_path: str = "./storage"
    max_upload_size_mb: int = 500

    # CORS (comma-separated origins)
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

settings = Settings()
```

### 4.4 Database Layer

**File:** `backend/app/database.py`

Uses SQLAlchemy 2.0 with async support via asyncpg driver.

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass

# Async engine with connection pooling
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,      # Log SQL queries in debug mode
    pool_pre_ping=True,       # Test connections before use
    pool_size=5,              # Connection pool size
    max_overflow=10,          # Additional connections allowed
)

# Async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency injection for database sessions."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def init_db() -> None:
    """Create all database tables on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

### 4.5 Routers (API Endpoints)

Each router module defines endpoints for a specific resource. Here's the pattern:

**File:** `backend/app/routers/datasets.py` (Example)

```python
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.dataset import Dataset
from app.schemas.dataset import DatasetCreate, DatasetResponse
from app.services.auth import get_current_user
from app.services.storage import storage_service

router = APIRouter()

@router.post("", response_model=DatasetResponse)
async def upload_dataset(
    name: str = Form(...),
    description: str = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Upload a new dataset file."""
    # Validate file type
    if not file.filename.endswith(('.jsonl', '.csv', '.parquet')):
        raise HTTPException(400, "Invalid file format")

    # Save file to storage
    file_path = await storage_service.save_dataset(
        user_id=current_user.id,
        filename=file.filename,
        content=await file.read(),
    )

    # Create database record
    dataset = Dataset(
        name=name,
        description=description,
        file_path=file_path,
        file_size=file.size,
        format=file.filename.split('.')[-1],
        owner_id=current_user.id,
    )
    db.add(dataset)
    await db.commit()
    await db.refresh(dataset)

    return dataset

@router.get("", response_model=list[DatasetResponse])
async def list_datasets(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """List all datasets owned by the current user."""
    result = await db.execute(
        select(Dataset)
        .where(Dataset.owner_id == current_user.id)
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()
```

### 4.6 Services Layer

Services encapsulate business logic and are used by routers.

**Authentication Service** (`backend/app/services/auth.py`):
- Password hashing with bcrypt
- JWT token creation and validation
- Current user dependency for protected routes

**Scheduler Service** (`backend/app/services/scheduler.py`):
- Job queue management
- Node assignment for jobs
- Background task for job dispatch

**Storage Service** (`backend/app/services/storage.py`):
- File upload/download handling
- Path management for datasets and models

---

## 5. Frontend (Web UI)

### 5.1 Overview

The frontend is a **React 18 Single Page Application (SPA)** built with:
- **TypeScript** for type safety
- **Vite** as the build tool
- **Tailwind CSS** for styling
- **Zustand** for state management
- **Axios** for HTTP requests
- **React Router** for navigation

### 5.2 Application Structure

**Entry Point:** `frontend/src/main.tsx`

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

**Main App Component:** `frontend/src/App.tsx`

```typescript
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

// Pages
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import DatasetsPage from './pages/DatasetsPage';
import JobsPage from './pages/JobsPage';
import JobDetailPage from './pages/JobDetailPage';
import ModelsPage from './pages/ModelsPage';
import HardwarePage from './pages/HardwarePage';

// Layout
import Layout from './components/Layout/Layout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* Protected routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="datasets" element={<DatasetsPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="jobs/:jobId" element={<JobDetailPage />} />
        <Route path="models" element={<ModelsPage />} />
        <Route path="hardware" element={<HardwarePage />} />
      </Route>
    </Routes>
  );
}
```

### 5.3 State Management (Zustand)

**Auth Store:** `frontend/src/store/authStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: number;
  email: string;
  username: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;

  setUser: (user: User) => void;
  setTokens: (access: string, refresh: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: true }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      logout: () => set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      }),
    }),
    {
      name: 'auth-storage', // localStorage key
    }
  )
);
```

### 5.4 API Client

**File:** `frontend/src/services/api.ts`

```typescript
import axios, { AxiosInstance, AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';

// Create axios instance with base URL
const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',  // Proxied by Vite in dev, Nginx in prod
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle 401 and refresh token
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      const refreshToken = useAuthStore.getState().refreshToken;
      if (refreshToken) {
        try {
          // Try to refresh the token
          const response = await axios.post('/api/v1/auth/refresh', {
            refresh_token: refreshToken,
          });

          // Update tokens in store
          useAuthStore.getState().setTokens(
            response.data.access_token,
            response.data.refresh_token
          );

          // Retry original request
          if (error.config) {
            error.config.headers.Authorization =
              `Bearer ${response.data.access_token}`;
            return axios(error.config);
          }
        } catch {
          // Refresh failed, logout user
          useAuthStore.getState().logout();
        }
      } else {
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);

// API modules
export const authAPI = {
  login: (data: LoginRequest) =>
    api.post<AuthResponse>('/auth/login', data),
  signup: (data: SignupRequest) =>
    api.post<User>('/auth/signup', data),
  me: () =>
    api.get<User>('/auth/me'),
};

export const datasetsAPI = {
  list: (page = 1, size = 10) =>
    api.get<PaginatedResponse<Dataset>>('/datasets', { params: { page, size } }),
  get: (id: number) =>
    api.get<Dataset>(`/datasets/${id}`),
  create: (data: FormData) =>
    api.post<Dataset>('/datasets', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  delete: (id: number) =>
    api.delete(`/datasets/${id}`),
};

export const jobsAPI = {
  list: (page = 1, size = 10) =>
    api.get<PaginatedResponse<FineTuneJob>>('/finetune-jobs', { params: { page, size } }),
  get: (id: number) =>
    api.get<FineTuneJob>(`/finetune-jobs/${id}`),
  create: (data: JobCreate) =>
    api.post<FineTuneJob>('/finetune-jobs', data),
  cancel: (id: number) =>
    api.post<FineTuneJob>(`/finetune-jobs/${id}/cancel`),
  getLogs: (id: number) =>
    api.get<JobLog[]>(`/finetune-jobs/${id}/logs`),
};

export default api;
```

### 5.5 Type Definitions

**File:** `frontend/src/types/index.ts`

```typescript
// User types
export interface User {
  id: number;
  email: string;
  username: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  username: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

// Dataset types
export interface Dataset {
  id: number;
  name: string;
  description?: string;
  file_path: string;
  file_size: number;
  format: 'jsonl' | 'csv' | 'parquet';
  num_samples?: number;
  owner_id: number;
  created_at: string;
}

// Job types
export type JobStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TrainingMethod =
  | 'full'
  | 'lora'
  | 'qlora'
  | 'dpo'
  | 'ppo';

export interface FineTuneJob {
  id: number;
  name: string;
  status: JobStatus;
  base_model: string;
  method: TrainingMethod;
  config: Record<string, any>;
  current_epoch?: number;
  total_epochs?: number;
  current_step?: number;
  total_steps?: number;
  train_loss?: number;
  eval_loss?: number;
  error_message?: string;
  owner_id: number;
  dataset_id: number;
  node_id?: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

export interface JobLog {
  id: number;
  job_id: number;
  level: 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  timestamp: string;
}

// Model types
export interface TrainedModel {
  id: number;
  name: string;
  description?: string;
  base_model: string;
  method: TrainingMethod;
  artifact_path: string;
  artifact_size?: number;
  status: 'ready' | 'deploying' | 'deployed' | 'failed';
  metrics?: Record<string, any>;
  endpoint_url?: string;
  owner_id: number;
  job_id: number;
  created_at: string;
}

// Hardware types
export interface HardwareNode {
  id: number;
  name: string;
  status: 'offline' | 'online' | 'busy' | 'error';
  gpu_count: number;
  gpu_type?: string;
  gpu_memory_gb?: number;
  cpu_count?: number;
  ram_gb?: number;
  disk_gb?: number;
  gpu_utilization?: number;
  memory_utilization?: number;
  owner_id: number;
  is_shared: boolean;
  last_heartbeat?: string;
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}
```

### 5.6 Vite Configuration

**File:** `frontend/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 3000,
    // Proxy API requests to backend during development
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

---

## 6. Node Agent (GPU Worker)

### 6.1 Overview

The Node Agent is a **Python daemon** that runs on each GPU machine. It:

1. **Registers** with the control plane on startup
2. **Sends heartbeats** periodically with system stats
3. **Polls for jobs** assigned to this node
4. **Executes training jobs** via Docker containers
5. **Streams logs** back to the control plane in real-time
6. **Reports job completion/failure** status

### 6.2 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        NODE AGENT                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Main Event Loop                       │   │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐   │   │
│  │  │ Heartbeat Loop  │  │    Job Polling Loop         │   │   │
│  │  │ (every 30s)     │  │    (every 5s)               │   │   │
│  │  │                 │  │                             │   │   │
│  │  │ - Get GPU stats │  │ - Poll for pending jobs     │   │   │
│  │  │ - Get CPU/RAM   │  │ - Execute via DockerRunner  │   │   │
│  │  │ - Send to API   │  │ - Stream logs               │   │   │
│  │  └─────────────────┘  └─────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    API Client                           │   │
│  │  - register_node()      - get_pending_jobs()           │   │
│  │  - send_heartbeat()     - update_job_status()          │   │
│  │  - send_job_log()                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Docker Runner                          │   │
│  │  - run_training_job()   - stream_logs()                 │   │
│  │  - stop_container()     - wait_for_container()          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                │                               │
└────────────────────────────────│───────────────────────────────┘
                                 │ Docker API
                                 ▼
                    ┌────────────────────────┐
                    │   Training Container   │
                    │   - PyTorch + CUDA     │
                    │   - Transformers       │
                    │   - PEFT/TRL           │
                    └────────────────────────┘
```

### 6.3 Configuration

**File:** `agent/agent/config.py`

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class AgentSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="TUNELLM_AGENT_",  # All env vars start with this prefix
    )

    # Agent identification
    node_name: str = "gpu-node-1"
    api_key: Optional[str] = None  # Generated on first registration

    # Server connection
    server_url: str = "http://localhost:8000"

    # Docker settings
    docker_socket: str = "unix:///var/run/docker.sock"
    training_image: str = "tunellm-training:latest"
    inference_image: str = "tunellm-inference:latest"

    # Resource limits
    gpu_ids: str = "0"  # Comma-separated GPU IDs (e.g., "0,1,2")
    max_concurrent_jobs: int = 1

    # Heartbeat
    heartbeat_interval: int = 30  # seconds

    # Storage paths (mounted into containers)
    data_path: str = "/data"
    model_path: str = "/models"
    log_path: str = "/logs"

    @property
    def gpu_list(self) -> list[int]:
        """Parse GPU IDs from comma-separated string."""
        return [int(x.strip()) for x in self.gpu_ids.split(",") if x.strip()]

settings = AgentSettings()
```

### 6.4 Main Entry Point

**File:** `agent/agent/main.py`

```python
import asyncio
import signal
import sys

import click
import psutil
from rich.console import Console

from agent.api_client import APIClient
from agent.config import settings
from agent.docker_runner import DockerRunner
from agent.job_handler import JobHandler

console = Console()

def get_gpu_info() -> dict:
    """Get GPU information using pynvml."""
    try:
        import pynvml
        pynvml.nvmlInit()
        device_count = pynvml.nvmlDeviceGetCount()

        if device_count == 0:
            return {"gpu_count": 0}

        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        name = pynvml.nvmlDeviceGetName(handle)
        memory = pynvml.nvmlDeviceGetMemoryInfo(handle)
        utilization = pynvml.nvmlDeviceGetUtilizationRates(handle)

        return {
            "gpu_count": device_count,
            "gpu_type": name.decode() if isinstance(name, bytes) else name,
            "gpu_memory_gb": memory.total / (1024**3),
            "gpu_utilization": utilization.gpu,
            "memory_utilization": (memory.used / memory.total) * 100,
        }
    except Exception:
        return {"gpu_count": 0}

def get_system_stats() -> dict:
    """Get complete system statistics."""
    return {
        **get_gpu_info(),
        "cpu_count": psutil.cpu_count(),
        "ram_gb": psutil.virtual_memory().total / (1024**3),
        "disk_gb": psutil.disk_usage("/").total / (1024**3),
    }

class Agent:
    def __init__(self, server_url: str, api_key: str, node_name: str):
        self.server_url = server_url
        self.api_key = api_key
        self.node_name = node_name
        self.node_id: int = None
        self.running = False

        self.api_client = APIClient(server_url, api_key)
        self.docker_runner = DockerRunner()
        self.job_handler = JobHandler(self.api_client, self.docker_runner)

    async def start(self):
        """Start the agent."""
        console.print("[bold blue]TuneLLM Agent v0.1.0[/bold blue]")

        # Register or authenticate
        if not self.api_key:
            result = await self.api_client.register_node(self.node_name)
            self.node_id = result["node_id"]
            self.api_key = result["api_key"]
            console.print(f"[green]Registered as node {self.node_id}[/green]")
            console.print(f"[yellow]Save this API key: {self.api_key}[/yellow]")

        self.running = True

        # Run concurrent loops
        await asyncio.gather(
            self._heartbeat_loop(),
            self._job_poll_loop(),
        )

    async def _heartbeat_loop(self):
        """Send periodic heartbeats."""
        while self.running:
            try:
                stats = get_system_stats()
                await self.api_client.send_heartbeat(self.node_id, stats)
            except Exception as e:
                console.print(f"[yellow]Heartbeat failed: {e}[/yellow]")

            await asyncio.sleep(settings.heartbeat_interval)

    async def _job_poll_loop(self):
        """Poll for and execute jobs."""
        while self.running:
            try:
                if not self.job_handler.get_current_job():
                    jobs = await self.api_client.get_pending_jobs(self.node_id)
                    if jobs:
                        job = jobs[0]
                        console.print(f"[cyan]Starting job: {job['name']}[/cyan]")
                        await self.job_handler.execute_job(job)
            except Exception as e:
                console.print(f"[red]Job poll error: {e}[/red]")

            await asyncio.sleep(5)

@click.command()
@click.option("--server-url", default=settings.server_url)
@click.option("--api-key", default=settings.api_key)
@click.option("--node-name", default=settings.node_name)
def main(server_url: str, api_key: str, node_name: str):
    """Run the TuneLLM node agent."""
    agent = Agent(server_url, api_key, node_name)

    def signal_handler(sig, frame):
        console.print("\n[yellow]Shutting down...[/yellow]")
        asyncio.create_task(agent.stop())
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    asyncio.run(agent.start())

if __name__ == "__main__":
    main()
```

### 6.5 Docker Runner

**File:** `agent/agent/docker_runner.py`

```python
import docker
from docker.types import DeviceRequest

class DockerRunner:
    def __init__(self):
        self.client = docker.from_env()

    async def run_training_job(
        self,
        job_id: int,
        config: dict,
        image: str,
        gpu_ids: list[int],
    ) -> docker.models.containers.Container:
        """Start a training container."""

        # GPU device requests
        device_requests = [
            DeviceRequest(
                device_ids=[str(i) for i in gpu_ids],
                capabilities=[["gpu"]],
            )
        ]

        # Environment variables
        environment = {
            "JOB_ID": str(job_id),
            "JOB_CONFIG": json.dumps(config),
            "HF_HOME": "/models/huggingface",
        }

        # Volume mounts
        volumes = {
            "/data/datasets": {"bind": "/data", "mode": "ro"},
            "/data/models": {"bind": "/models", "mode": "rw"},
            "/data/logs": {"bind": "/logs", "mode": "rw"},
        }

        container = self.client.containers.run(
            image=image,
            name=f"tunellm-job-{job_id}",
            environment=environment,
            volumes=volumes,
            device_requests=device_requests,
            detach=True,
            remove=True,  # Auto-remove when stopped
        )

        return container

    async def stream_logs(self, container, callback):
        """Stream container logs to callback function."""
        for line in container.logs(stream=True, follow=True):
            await callback(line.decode("utf-8").strip())

    async def wait_for_container(self, container) -> int:
        """Wait for container to finish and return exit code."""
        result = container.wait()
        return result["StatusCode"]

    def stop_container(self, container):
        """Stop a running container."""
        container.stop(timeout=30)
```

---

## 7. Training Container

### 7.1 Overview

The training container is a **Docker image** that contains all dependencies for fine-tuning LLMs:

- PyTorch with CUDA support
- HuggingFace Transformers
- PEFT (Parameter-Efficient Fine-Tuning)
- TRL (Transformer Reinforcement Learning)
- bitsandbytes (quantization)

### 7.2 Entry Point

**File:** `training/scripts/train.py`

```python
import argparse
import json
import os
import yaml

from lora_trainer import LoRATrainer
from qlora_trainer import QLoRATrainer
from dpo_trainer import DPOTrainer
from ppo_trainer import PPOTrainer

def load_config():
    """Load config from file or environment variable."""
    # Try environment variable first (from Docker)
    if "JOB_CONFIG" in os.environ:
        return json.loads(os.environ["JOB_CONFIG"])

    # Try config file
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=str, required=True)
    args = parser.parse_args()

    with open(args.config) as f:
        return yaml.safe_load(f)

def get_trainer(method: str):
    """Get trainer class based on method."""
    trainers = {
        "lora": LoRATrainer,
        "qlora": QLoRATrainer,
        "dpo": DPOTrainer,
        "ppo": PPOTrainer,
    }
    return trainers.get(method)

def main():
    config = load_config()

    method = config.get("method", "lora")
    trainer_class = get_trainer(method)

    if not trainer_class:
        raise ValueError(f"Unknown training method: {method}")

    trainer = trainer_class(config)
    trainer.train()
    trainer.save()

    print(f"Training complete! Model saved to {config['output_dir']}")

if __name__ == "__main__":
    main()
```

### 7.3 LoRA Trainer

**File:** `training/scripts/lora_trainer.py`

```python
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
)
from peft import LoraConfig, get_peft_model, TaskType
from datasets import load_dataset

class LoRATrainer:
    def __init__(self, config: dict):
        self.config = config
        self.model = None
        self.tokenizer = None
        self.dataset = None

    def load_model(self):
        """Load base model and apply LoRA configuration."""
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.config["base_model"],
            trust_remote_code=True,
        )

        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        self.model = AutoModelForCausalLM.from_pretrained(
            self.config["base_model"],
            torch_dtype="auto",
            device_map="auto",
            trust_remote_code=True,
        )

        # LoRA configuration
        lora_config = LoraConfig(
            r=self.config.get("lora_r", 16),
            lora_alpha=self.config.get("lora_alpha", 32),
            target_modules=self.config.get(
                "target_modules",
                ["q_proj", "v_proj", "k_proj", "o_proj"]
            ),
            lora_dropout=self.config.get("lora_dropout", 0.05),
            bias="none",
            task_type=TaskType.CAUSAL_LM,
        )

        self.model = get_peft_model(self.model, lora_config)
        self.model.print_trainable_parameters()

    def load_dataset(self):
        """Load and preprocess training dataset."""
        dataset_path = self.config["dataset_path"]

        if dataset_path.endswith(".jsonl"):
            self.dataset = load_dataset("json", data_files=dataset_path)
        else:
            self.dataset = load_dataset(dataset_path)

        # Tokenize
        def tokenize(example):
            return self.tokenizer(
                example["text"],
                truncation=True,
                max_length=self.config.get("max_length", 512),
                padding="max_length",
            )

        self.dataset = self.dataset.map(tokenize, batched=True)

    def train(self):
        """Run training."""
        self.load_model()
        self.load_dataset()

        training_args = TrainingArguments(
            output_dir=self.config["output_dir"],
            num_train_epochs=self.config.get("epochs", 3),
            per_device_train_batch_size=self.config.get("batch_size", 4),
            gradient_accumulation_steps=self.config.get("gradient_accumulation", 4),
            learning_rate=self.config.get("learning_rate", 2e-4),
            warmup_ratio=self.config.get("warmup_ratio", 0.03),
            logging_steps=10,
            save_steps=100,
            fp16=self.config.get("fp16", True),
            report_to="none",
        )

        trainer = Trainer(
            model=self.model,
            args=training_args,
            train_dataset=self.dataset["train"],
            tokenizer=self.tokenizer,
        )

        trainer.train()

    def save(self):
        """Save the trained LoRA adapter."""
        self.model.save_pretrained(self.config["output_dir"])
        self.tokenizer.save_pretrained(self.config["output_dir"])
```

### 7.4 QLoRA Trainer

**File:** `training/scripts/qlora_trainer.py`

QLoRA extends LoRA with 4-bit quantization for more memory-efficient training:

```python
from transformers import BitsAndBytesConfig
import torch

class QLoRATrainer(LoRATrainer):
    def load_model(self):
        """Load model with 4-bit quantization."""
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.config["base_model"],
            trust_remote_code=True,
        )

        # 4-bit quantization config
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )

        self.model = AutoModelForCausalLM.from_pretrained(
            self.config["base_model"],
            quantization_config=bnb_config,
            device_map="auto",
            trust_remote_code=True,
        )

        # Apply LoRA on top of quantized model
        # ... (same as LoRATrainer)
```

### 7.5 DPO Trainer

**File:** `training/scripts/dpo_trainer.py`

Direct Preference Optimization for aligning models with human preferences:

```python
from trl import DPOTrainer as TRLDPOTrainer, DPOConfig

class DPOTrainer:
    def __init__(self, config: dict):
        self.config = config

    def train(self):
        # DPO requires paired preference data:
        # {"prompt": "...", "chosen": "...", "rejected": "..."}

        dpo_config = DPOConfig(
            output_dir=self.config["output_dir"],
            beta=self.config.get("beta", 0.1),  # KL penalty coefficient
            num_train_epochs=self.config.get("epochs", 1),
            per_device_train_batch_size=self.config.get("batch_size", 2),
            learning_rate=self.config.get("learning_rate", 5e-7),
        )

        trainer = TRLDPOTrainer(
            model=self.model,
            ref_model=self.ref_model,  # Reference model for KL divergence
            args=dpo_config,
            train_dataset=self.dataset,
            tokenizer=self.tokenizer,
        )

        trainer.train()
```

### 7.6 Dockerfile

**File:** `training/Dockerfile`

```dockerfile
FROM pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python packages
RUN pip install --no-cache-dir -r requirements.txt

# Copy training scripts
COPY scripts/ ./scripts/
COPY configs/ ./configs/

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV HF_HOME=/models/huggingface
ENV TRANSFORMERS_CACHE=/models/huggingface

# Default command
CMD ["python", "scripts/train.py"]
```

---

## 8. Inference Server

### 8.1 Overview

The inference server is a **FastAPI application** that serves trained models for text generation. It supports:

- Loading base models with LoRA adapters
- Batch and streaming generation
- 4-bit and 8-bit quantization
- Dynamic model loading/unloading

### 8.2 API Endpoints

**File:** `inference/server/main.py`

```python
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

app = FastAPI(title="TuneLLM Inference Server")

class GenerateRequest(BaseModel):
    prompt: str
    max_new_tokens: int = 512
    temperature: float = 0.7
    top_p: float = 0.9
    top_k: int = 50
    repetition_penalty: float = 1.1
    do_sample: bool = True
    stop_sequences: list[str] = []
    stream: bool = False

class GenerateResponse(BaseModel):
    generated_text: str
    prompt_tokens: int
    generated_tokens: int
    model: str

@app.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest):
    """Generate text from a prompt."""
    if not model_loaded:
        raise HTTPException(503, "No model loaded")

    if request.stream:
        return EventSourceResponse(
            stream_generate(request),
            media_type="text/event-stream"
        )

    output = await generator.generate(
        prompt=request.prompt,
        max_new_tokens=request.max_new_tokens,
        temperature=request.temperature,
        top_p=request.top_p,
        top_k=request.top_k,
        repetition_penalty=request.repetition_penalty,
        do_sample=request.do_sample,
        stop_sequences=request.stop_sequences,
    )

    return GenerateResponse(
        generated_text=output.text,
        prompt_tokens=output.prompt_tokens,
        generated_tokens=output.generated_tokens,
        model=current_model_path,
    )

@app.post("/load")
async def load_model(
    model_path: str,
    adapter_path: str = None,
    quantization: str = None,  # "4bit", "8bit", or None
):
    """Load a model (optionally with LoRA adapter)."""
    await model_loader.load(model_path, adapter_path, quantization)
    return {"status": "loaded", "model": model_path}

@app.post("/unload")
async def unload_model():
    """Unload the current model."""
    await model_loader.unload()
    return {"status": "unloaded"}

@app.get("/health")
async def health():
    """Health check with model status."""
    return {
        "status": "healthy",
        "model_loaded": model_loaded,
        "model_path": current_model_path,
    }
```

---

## 9. Database Design

### 9.1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE SCHEMA                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────┐       ┌─────────────────┐       ┌─────────────────┐           │
│  │   users     │       │    datasets     │       │  finetune_jobs  │           │
│  ├─────────────┤       ├─────────────────┤       ├─────────────────┤           │
│  │ id (PK)     │──┐    │ id (PK)         │──┐    │ id (PK)         │           │
│  │ email       │  │    │ name            │  │    │ name            │           │
│  │ username    │  │    │ description     │  │    │ status          │           │
│  │ hashed_pass │  │    │ file_path       │  │    │ base_model      │           │
│  │ is_active   │  │    │ file_size       │  │    │ method          │           │
│  │ is_superuser│  │    │ format          │  │    │ config (JSONB)  │           │
│  │ created_at  │  │    │ num_samples     │  │    │ current_epoch   │           │
│  │ updated_at  │  └──1:N─ owner_id (FK)  │  │    │ total_epochs    │           │
│  └─────────────┘       │ created_at      │  └──1:N─ dataset_id (FK)│           │
│         │              │ updated_at      │       │ owner_id (FK)───┼─────┐     │
│         │              └─────────────────┘       │ node_id (FK)────┼───┐ │     │
│         │                                        │ created_at      │   │ │     │
│         │                                        │ started_at      │   │ │     │
│         │                                        │ finished_at     │   │ │     │
│         │                                        └────────┬────────┘   │ │     │
│         │                                                 │            │ │     │
│         │                    ┌──────────────────1:N───────┘            │ │     │
│         │                    │                                         │ │     │
│         │              ┌─────▼─────────┐       ┌─────────────────┐     │ │     │
│         │              │   job_logs    │       │ trained_models  │     │ │     │
│         │              ├───────────────┤       ├─────────────────┤     │ │     │
│         │              │ id (PK)       │       │ id (PK)         │     │ │     │
│         │              │ job_id (FK)   │       │ name            │     │ │     │
│         │              │ level         │       │ description     │     │ │     │
│         │              │ message       │       │ base_model      │     │ │     │
│         │              │ timestamp     │       │ method          │     │ │     │
│         │              └───────────────┘       │ artifact_path   │     │ │     │
│         │                                      │ artifact_size   │     │ │     │
│         │                                      │ status          │     │ │     │
│         │                                      │ metrics (JSONB) │     │ │     │
│         │                                      │ endpoint_url    │     │ │     │
│         │                                      │ owner_id (FK)───┼─────┼─┘     │
│         │                                      │ job_id (FK)     │     │       │
│         │                                      │ created_at      │     │       │
│         │                                      └─────────────────┘     │       │
│         │                                                              │       │
│         │              ┌─────────────────┐                             │       │
│         │              │     nodes       │◄────────────────────────────┘       │
│         │              ├─────────────────┤                                     │
│         │              │ id (PK)         │                                     │
│         │              │ name            │                                     │
│         │              │ status          │                                     │
│         │              │ gpu_count       │                                     │
│         │              │ gpu_type        │                                     │
│         │              │ gpu_memory_gb   │                                     │
│         │              │ cpu_count       │                                     │
│         │              │ ram_gb          │                                     │
│         │              │ disk_gb         │                                     │
│         │              │ host            │                                     │
│         │              │ port            │                                     │
│         │              │ api_key         │                                     │
│         │              │ gpu_utilization │                                     │
│         │              │ memory_util     │                                     │
│         │              │ extra_data      │                                     │
│         └────────1:N──── owner_id (FK)   │                                     │
│                        │ is_shared       │                                     │
│                        │ created_at      │                                     │
│                        │ last_heartbeat  │                                     │
│                        └─────────────────┘                                     │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Table Definitions

#### Users Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | Unique identifier |
| email | VARCHAR(255) | UNIQUE, NOT NULL, INDEX | User email address |
| username | VARCHAR(100) | UNIQUE, NOT NULL, INDEX | Display name |
| hashed_password | VARCHAR(255) | NOT NULL | Bcrypt hashed password |
| is_active | BOOLEAN | DEFAULT TRUE | Account status |
| is_superuser | BOOLEAN | DEFAULT FALSE | Admin privileges |
| created_at | TIMESTAMP | DEFAULT NOW() | Registration time |
| updated_at | TIMESTAMP | ON UPDATE NOW() | Last update time |

#### Datasets Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Unique identifier |
| name | VARCHAR(255) | NOT NULL | Dataset name |
| description | TEXT | NULLABLE | Description |
| file_path | VARCHAR(500) | NOT NULL | Storage path |
| file_size | BIGINT | NOT NULL | Size in bytes |
| format | VARCHAR(20) | NOT NULL | jsonl/csv/parquet |
| num_samples | INTEGER | NULLABLE | Row count |
| owner_id | INTEGER | FOREIGN KEY (users.id) | Owner reference |
| created_at | TIMESTAMP | DEFAULT NOW() | Upload time |
| updated_at | TIMESTAMP | ON UPDATE NOW() | Last update |

#### FineTuneJobs Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Unique identifier |
| name | VARCHAR(255) | NOT NULL | Job name |
| status | ENUM | NOT NULL | pending/queued/running/completed/failed/cancelled |
| base_model | VARCHAR(255) | NOT NULL | HuggingFace model ID |
| method | ENUM | NOT NULL | full/lora/qlora/dpo/ppo |
| config | JSONB | NOT NULL | Full training configuration |
| current_epoch | INTEGER | NULLABLE | Progress tracking |
| total_epochs | INTEGER | NULLABLE | Total epochs |
| current_step | INTEGER | NULLABLE | Current step |
| total_steps | INTEGER | NULLABLE | Total steps |
| train_loss | FLOAT | NULLABLE | Latest training loss |
| eval_loss | FLOAT | NULLABLE | Latest evaluation loss |
| error_message | TEXT | NULLABLE | Error details if failed |
| owner_id | INTEGER | FOREIGN KEY | Job owner |
| dataset_id | INTEGER | FOREIGN KEY | Training dataset |
| node_id | INTEGER | FOREIGN KEY, NULLABLE | Assigned GPU node |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation time |
| started_at | TIMESTAMP | NULLABLE | Training start time |
| finished_at | TIMESTAMP | NULLABLE | Completion time |

#### JobLogs Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Unique identifier |
| job_id | INTEGER | FOREIGN KEY, INDEX | Parent job |
| level | ENUM | NOT NULL | INFO/WARNING/ERROR |
| message | TEXT | NOT NULL | Log message |
| timestamp | TIMESTAMP | DEFAULT NOW() | Log time |

#### TrainedModels Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Unique identifier |
| name | VARCHAR(255) | NOT NULL | Model name |
| description | TEXT | NULLABLE | Description |
| base_model | VARCHAR(255) | NOT NULL | Base model used |
| method | ENUM | NOT NULL | Training method |
| artifact_path | VARCHAR(500) | NOT NULL | Model file path |
| artifact_size | BIGINT | NULLABLE | Size in bytes |
| status | ENUM | NOT NULL | ready/deploying/deployed/failed |
| metrics | JSONB | NULLABLE | Training metrics |
| endpoint_url | VARCHAR(500) | NULLABLE | Inference endpoint |
| owner_id | INTEGER | FOREIGN KEY | Model owner |
| job_id | INTEGER | FOREIGN KEY | Source job |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation time |
| updated_at | TIMESTAMP | ON UPDATE NOW() | Last update |

#### Nodes Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Unique identifier |
| name | VARCHAR(255) | NOT NULL | Node name |
| status | ENUM | NOT NULL | offline/online/busy/error |
| gpu_count | INTEGER | NOT NULL | Number of GPUs |
| gpu_type | VARCHAR(100) | NULLABLE | GPU model (e.g., "RTX 4090") |
| gpu_memory_gb | FLOAT | NULLABLE | VRAM per GPU |
| cpu_count | INTEGER | NULLABLE | CPU cores |
| ram_gb | FLOAT | NULLABLE | System RAM |
| disk_gb | FLOAT | NULLABLE | Disk space |
| host | VARCHAR(255) | NULLABLE | Hostname/IP |
| port | INTEGER | NULLABLE | Agent port |
| api_key | VARCHAR(255) | NULLABLE | Authentication key |
| gpu_utilization | FLOAT | NULLABLE | Current GPU usage % |
| memory_utilization | FLOAT | NULLABLE | Current memory usage % |
| extra_data | JSONB | NULLABLE | Additional metadata |
| owner_id | INTEGER | FOREIGN KEY | Node owner |
| is_shared | BOOLEAN | DEFAULT FALSE | Shared with all users |
| created_at | TIMESTAMP | DEFAULT NOW() | Registration time |
| last_heartbeat | TIMESTAMP | NULLABLE | Last heartbeat time |

---

## 10. API Reference

### 10.1 Base URL

```
Development: http://localhost:8000/api/v1
Production:  https://your-domain.com/api/v1
```

### 10.2 Authentication Endpoints

#### POST /auth/signup

Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "SecurePassword123!"
}
```

**Response (201 Created):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "johndoe",
  "is_active": true,
  "is_superuser": false,
  "created_at": "2024-12-24T10:00:00Z"
}
```

#### POST /auth/login

Authenticate and receive tokens.

**Request:**
```json
{
  "username": "johndoe",
  "password": "SecurePassword123!"
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

#### GET /auth/me

Get current user profile. Requires authentication.

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "johndoe",
  "is_active": true,
  "is_superuser": false,
  "created_at": "2024-12-24T10:00:00Z"
}
```

#### POST /auth/refresh

Refresh expired access token.

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

### 10.3 Dataset Endpoints

#### POST /datasets

Upload a new dataset. Requires multipart/form-data.

**Request:**
```
Content-Type: multipart/form-data

name: "My Training Dataset"
description: "Customer support conversations"
file: <binary file data>
```

**Response (201 Created):**
```json
{
  "id": 1,
  "name": "My Training Dataset",
  "description": "Customer support conversations",
  "file_path": "/storage/datasets/1/dataset.jsonl",
  "file_size": 1048576,
  "format": "jsonl",
  "num_samples": 5000,
  "owner_id": 1,
  "created_at": "2024-12-24T10:00:00Z"
}
```

#### GET /datasets

List user's datasets with pagination.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | integer | 1 | Page number |
| size | integer | 10 | Items per page |

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": 1,
      "name": "My Training Dataset",
      "format": "jsonl",
      "file_size": 1048576,
      "num_samples": 5000,
      "created_at": "2024-12-24T10:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "size": 10,
  "pages": 1
}
```

### 10.4 Job Endpoints

#### POST /finetune-jobs

Create a new fine-tuning job.

**Request:**
```json
{
  "name": "LLaMA 2 Customer Support",
  "dataset_id": 1,
  "base_model": "meta-llama/Llama-2-7b-hf",
  "method": "lora",
  "config": {
    "epochs": 3,
    "batch_size": 4,
    "learning_rate": 2e-4,
    "lora_r": 16,
    "lora_alpha": 32,
    "target_modules": ["q_proj", "v_proj"],
    "max_length": 512
  }
}
```

**Response (201 Created):**
```json
{
  "id": 1,
  "name": "LLaMA 2 Customer Support",
  "status": "pending",
  "base_model": "meta-llama/Llama-2-7b-hf",
  "method": "lora",
  "config": { ... },
  "dataset_id": 1,
  "owner_id": 1,
  "created_at": "2024-12-24T10:00:00Z"
}
```

#### GET /finetune-jobs/{id}

Get job details including progress and metrics.

**Response (200 OK):**
```json
{
  "id": 1,
  "name": "LLaMA 2 Customer Support",
  "status": "running",
  "base_model": "meta-llama/Llama-2-7b-hf",
  "method": "lora",
  "current_epoch": 2,
  "total_epochs": 3,
  "current_step": 150,
  "total_steps": 300,
  "train_loss": 0.452,
  "eval_loss": 0.521,
  "node_id": 1,
  "started_at": "2024-12-24T10:05:00Z"
}
```

#### GET /finetune-jobs/{id}/logs

Get job logs for monitoring.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| level | string | null | Filter by level (INFO/WARNING/ERROR) |
| limit | integer | 100 | Max logs to return |

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "job_id": 1,
    "level": "INFO",
    "message": "Loading model meta-llama/Llama-2-7b-hf...",
    "timestamp": "2024-12-24T10:05:00Z"
  },
  {
    "id": 2,
    "job_id": 1,
    "level": "INFO",
    "message": "Epoch 1/3 - Step 50/100 - Loss: 0.523",
    "timestamp": "2024-12-24T10:10:00Z"
  }
]
```

#### POST /finetune-jobs/{id}/cancel

Cancel a running or pending job.

**Response (200 OK):**
```json
{
  "id": 1,
  "status": "cancelled",
  "finished_at": "2024-12-24T10:15:00Z"
}
```

### 10.5 Model Endpoints

#### GET /models

List trained models.

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": 1,
      "name": "LLaMA 2 Customer Support v1",
      "base_model": "meta-llama/Llama-2-7b-hf",
      "method": "lora",
      "status": "ready",
      "artifact_size": 52428800,
      "metrics": {
        "final_train_loss": 0.312,
        "final_eval_loss": 0.398
      },
      "created_at": "2024-12-24T11:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "size": 10,
  "pages": 1
}
```

#### POST /models/{id}/deploy

Deploy a model to inference endpoint.

**Response (200 OK):**
```json
{
  "id": 1,
  "status": "deployed",
  "endpoint_url": "http://localhost:8080/v1/generate"
}
```

### 10.6 Hardware Endpoints

#### POST /hardware/register

Register a new GPU node.

**Request:**
```json
{
  "name": "GPU-Node-1",
  "gpu_count": 2,
  "gpu_type": "NVIDIA RTX 4090",
  "gpu_memory_gb": 24,
  "cpu_count": 32,
  "ram_gb": 128,
  "disk_gb": 2000
}
```

**Response (201 Created):**
```json
{
  "node_id": 1,
  "api_key": "node_abc123xyz..."
}
```

#### POST /hardware/{id}/heartbeat

Node agent sends periodic heartbeat.

**Headers:**
```
X-Node-API-Key: node_abc123xyz...
```

**Request:**
```json
{
  "gpu_count": 2,
  "gpu_utilization": 85.5,
  "memory_utilization": 72.3,
  "status": "busy"
}
```

**Response (200 OK):**
```json
{
  "acknowledged": true
}
```

### 10.7 Error Responses

All endpoints may return error responses in this format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

| Status Code | Description |
|-------------|-------------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 422 | Validation Error - Invalid request body |
| 500 | Internal Server Error |

---

## 11. Authentication & Authorization

### 11.1 JWT Token Flow

```
┌────────────┐          ┌────────────┐          ┌────────────┐
│   Client   │          │   Backend  │          │  Database  │
└─────┬──────┘          └─────┬──────┘          └─────┬──────┘
      │                       │                       │
      │  POST /auth/login     │                       │
      │  {username, password} │                       │
      │──────────────────────>│                       │
      │                       │                       │
      │                       │  SELECT user          │
      │                       │  WHERE username = ?   │
      │                       │──────────────────────>│
      │                       │                       │
      │                       │  User record          │
      │                       │<──────────────────────│
      │                       │                       │
      │                       │  Verify password      │
      │                       │  (bcrypt)             │
      │                       │                       │
      │                       │  Generate JWT tokens  │
      │                       │  - access (30 min)    │
      │                       │  - refresh (7 days)   │
      │                       │                       │
      │  {access_token,       │                       │
      │   refresh_token}      │                       │
      │<──────────────────────│                       │
      │                       │                       │
      │  GET /datasets        │                       │
      │  Authorization:       │                       │
      │  Bearer {token}       │                       │
      │──────────────────────>│                       │
      │                       │                       │
      │                       │  Decode & validate    │
      │                       │  JWT token            │
      │                       │                       │
      │                       │  Extract user_id      │
      │                       │  from token payload   │
      │                       │                       │
      │                       │  SELECT datasets      │
      │                       │  WHERE owner_id = ?   │
      │                       │──────────────────────>│
      │                       │                       │
      │  [datasets]           │                       │
      │<──────────────────────│                       │
      │                       │                       │
```

### 11.2 Token Structure

**Access Token Payload:**
```json
{
  "sub": "1",           // User ID (string)
  "exp": 1703419200,    // Expiration timestamp
  "type": "access"
}
```

**Refresh Token Payload:**
```json
{
  "sub": "1",           // User ID (string)
  "exp": 1704024000,    // Expiration timestamp (7 days)
  "type": "refresh"
}
```

### 11.3 Authorization Rules

| Resource | Rule |
|----------|------|
| Datasets | User can only access their own datasets (owner_id = current_user.id) |
| Jobs | User can only access their own jobs |
| Models | User can only access models from their own jobs |
| Nodes | User can access their own nodes + shared nodes (is_shared = true) |

### 11.4 Password Security

- **Hashing Algorithm:** bcrypt with salt
- **Rounds:** 12 (configurable)
- **Implementation:** passlib library

```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
```

---

## 12. Job Execution Flow

### 12.1 Complete Job Lifecycle

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          JOB LIFECYCLE                                   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  User                Backend              Scheduler           Agent      │
│   │                    │                     │                  │        │
│   │ Create Job         │                     │                  │        │
│   │───────────────────>│                     │                  │        │
│   │                    │                     │                  │        │
│   │                    │ Save to DB          │                  │        │
│   │                    │ status: PENDING     │                  │        │
│   │                    │                     │                  │        │
│   │                    │ Add to queue        │                  │        │
│   │                    │────────────────────>│                  │        │
│   │                    │                     │                  │        │
│   │ Job Created        │                     │ Find node        │        │
│   │<───────────────────│                     │ with capacity    │        │
│   │                    │                     │                  │        │
│   │                    │                     │ Assign job       │        │
│   │                    │ Update: QUEUED      │                  │        │
│   │                    │<────────────────────│                  │        │
│   │                    │                     │                  │        │
│   │                    │                     │        Poll jobs │        │
│   │                    │                     │<─────────────────│        │
│   │                    │                     │                  │        │
│   │                    │                     │ Return job       │        │
│   │                    │                     │─────────────────>│        │
│   │                    │                     │                  │        │
│   │                    │                     │                  │ Start  │
│   │                    │                     │                  │ Docker │
│   │                    │                     │                  │        │
│   │                    │ Update: RUNNING     │                  │        │
│   │                    │<────────────────────│                  │        │
│   │                    │                     │                  │        │
│   │                    │ Stream logs         │                  │        │
│   │                    │<────────────────────│                  │        │
│   │                    │                     │                  │        │
│   │ Poll for updates   │                     │                  │        │
│   │───────────────────>│                     │                  │        │
│   │ {status, logs}     │                     │                  │        │
│   │<───────────────────│                     │                  │        │
│   │                    │                     │                  │        │
│   │                    │                     │          Training│        │
│   │                    │                     │          Complete│        │
│   │                    │                     │                  │        │
│   │                    │ Update: COMPLETED   │                  │        │
│   │                    │ Create TrainedModel │                  │        │
│   │                    │<────────────────────│                  │        │
│   │                    │                     │                  │        │
│   │ Poll for updates   │                     │                  │        │
│   │───────────────────>│                     │                  │        │
│   │ {status: completed}│                     │                  │        │
│   │<───────────────────│                     │                  │        │
│   │                    │                     │                  │        │
└──────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Job States

| State | Description | Transitions To |
|-------|-------------|----------------|
| `pending` | Job created, waiting for scheduling | `queued`, `cancelled` |
| `queued` | Assigned to node, waiting to start | `running`, `cancelled` |
| `running` | Training in progress | `completed`, `failed`, `cancelled` |
| `completed` | Training finished successfully | (terminal) |
| `failed` | Training encountered error | (terminal) |
| `cancelled` | User cancelled the job | (terminal) |

### 12.3 Training Configuration

**Example LoRA Config:**
```json
{
  "base_model": "meta-llama/Llama-2-7b-hf",
  "method": "lora",
  "dataset_path": "/data/datasets/1/data.jsonl",
  "output_dir": "/models/job_1",

  "training": {
    "epochs": 3,
    "batch_size": 4,
    "gradient_accumulation_steps": 4,
    "learning_rate": 2e-4,
    "warmup_ratio": 0.03,
    "max_length": 512,
    "fp16": true
  },

  "lora": {
    "r": 16,
    "alpha": 32,
    "dropout": 0.05,
    "target_modules": ["q_proj", "v_proj", "k_proj", "o_proj"]
  },

  "dataset": {
    "format": "alpaca",
    "train_split": 0.9,
    "shuffle": true
  }
}
```

---

## 13. Docker & Deployment

### 13.1 Development Setup

**Start all services:**
```bash
cd docker
docker compose up -d
```

**Services started:**
| Service | Port | Description |
|---------|------|-------------|
| postgres | 5432 | PostgreSQL database |
| redis | 6379 | Cache and job queue |
| backend | 8000 | FastAPI control plane |
| frontend | 80 | Nginx + React |

**View logs:**
```bash
docker compose logs -f backend    # Backend logs
docker compose logs -f frontend   # Frontend logs
docker compose logs -f postgres   # Database logs
```

**Stop services:**
```bash
docker compose down       # Stop containers
docker compose down -v    # Stop and remove volumes
```

### 13.2 Local Development (Without Docker)

**Terminal 1 - Database:**
```bash
cd docker
docker compose up -d postgres redis
```

**Terminal 2 - Backend:**
```bash
cd backend
source ../venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### 13.3 Environment Variables

**Backend (.env):**
```bash
# Database
DATABASE_URL=postgresql+asyncpg://tunellm:tunellm_dev@localhost:5432/tunellm

# Security
SECRET_KEY=your-super-secret-key-change-in-production

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Storage
STORAGE_PATH=./storage

# Debug
DEBUG=true

# Optional: HuggingFace token for private models
# HF_TOKEN=your_huggingface_token
```

**Agent (.env):**
```bash
TUNELLM_AGENT_SERVER_URL=http://localhost:8000
TUNELLM_AGENT_NODE_NAME=local-gpu-node
TUNELLM_AGENT_API_KEY=your_node_api_key
TUNELLM_AGENT_GPU_IDS=0
```

### 13.4 Production Deployment

**Build images:**
```bash
# Build all images
docker compose -f docker-compose.prod.yml build

# Or build individually
docker build -t tunellm-backend:latest ./backend
docker build -t tunellm-frontend:latest ./frontend
docker build -t tunellm-training:latest ./training
docker build -t tunellm-inference:latest ./inference
```

**Production docker-compose.prod.yml considerations:**
- Use external PostgreSQL (managed service)
- Use external Redis (managed service)
- Configure SSL/TLS termination
- Set proper SECRET_KEY
- Use container registry for images
- Configure resource limits
- Set up health checks and restart policies

---

## 14. Development Workflow

### 14.1 Initial Setup

```bash
# Clone repository
git clone https://github.com/your-org/tunellm.git
cd tunellm

# Create Python virtual environment
python -m venv venv
source venv/bin/activate

# Install all Python dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd frontend
npm install
cd ..

# Copy environment file
cp docker/.env.example backend/.env

# Start database services
cd docker
docker compose up -d postgres redis
cd ..

# Initialize database (tables created on first startup)
cd backend
uvicorn app.main:app --reload --port 8000
```

### 14.2 Running Tests

```bash
# Backend tests
cd backend
pytest tests/ -v

# Frontend tests
cd frontend
npm run test

# Coverage report
cd backend
pytest tests/ --cov=app --cov-report=html
```

### 14.3 Code Quality

```bash
# Format Python code
black backend/ agent/ training/ inference/

# Sort imports
isort backend/ agent/ training/ inference/

# Lint Python
ruff check backend/ agent/ training/ inference/

# Type check
mypy backend/app

# Format TypeScript
cd frontend
npm run format

# Lint TypeScript
npm run lint
```

### 14.4 Database Migrations

```bash
cd backend

# Create new migration
alembic revision --autogenerate -m "Add new column to users"

# Apply migrations
alembic upgrade head

# Rollback last migration
alembic downgrade -1

# View migration history
alembic history
```

### 14.5 Adding a New Feature

1. **Create database model** (if needed):
   - Add to `backend/app/models/`
   - Create migration

2. **Create Pydantic schemas**:
   - Add to `backend/app/schemas/`
   - Define request/response models

3. **Create API router**:
   - Add to `backend/app/routers/`
   - Include in `main.py`

4. **Add service logic** (if complex):
   - Add to `backend/app/services/`

5. **Update frontend types**:
   - Add to `frontend/src/types/`

6. **Create API client methods**:
   - Add to `frontend/src/services/api.ts`

7. **Create UI components**:
   - Add to `frontend/src/components/`

8. **Add page/route**:
   - Add to `frontend/src/pages/`
   - Update `App.tsx` routes

9. **Write tests**:
   - Backend: `backend/tests/`
   - Frontend: `frontend/src/__tests__/`

---

## 15. Configuration Reference

### 15.1 Backend Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `APP_NAME` | string | "TuneLLM" | Application name |
| `APP_VERSION` | string | "0.1.0" | Version number |
| `DEBUG` | bool | false | Enable debug mode |
| `DATABASE_URL` | string | required | PostgreSQL connection URL |
| `SECRET_KEY` | string | required | JWT signing key |
| `ALGORITHM` | string | "HS256" | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | int | 30 | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | int | 7 | Refresh token lifetime |
| `STORAGE_PATH` | string | "./storage" | File storage directory |
| `MAX_UPLOAD_SIZE_MB` | int | 500 | Maximum upload size |
| `CORS_ORIGINS` | string | "http://localhost:3000" | Allowed CORS origins |
| `HF_TOKEN` | string | null | HuggingFace API token |

### 15.2 Agent Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TUNELLM_AGENT_NODE_NAME` | string | "gpu-node-1" | Node identifier |
| `TUNELLM_AGENT_API_KEY` | string | null | Authentication key |
| `TUNELLM_AGENT_SERVER_URL` | string | "http://localhost:8000" | Backend URL |
| `TUNELLM_AGENT_DOCKER_SOCKET` | string | "unix:///var/run/docker.sock" | Docker socket |
| `TUNELLM_AGENT_TRAINING_IMAGE` | string | "tunellm-training:latest" | Training image |
| `TUNELLM_AGENT_GPU_IDS` | string | "0" | Comma-separated GPU IDs |
| `TUNELLM_AGENT_HEARTBEAT_INTERVAL` | int | 30 | Heartbeat interval (seconds) |

### 15.3 Training Parameters

**LoRA/QLoRA:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `lora_r` | int | 16 | LoRA rank |
| `lora_alpha` | int | 32 | LoRA scaling factor |
| `lora_dropout` | float | 0.05 | Dropout rate |
| `target_modules` | list | ["q_proj", "v_proj"] | Modules to adapt |
| `epochs` | int | 3 | Training epochs |
| `batch_size` | int | 4 | Per-device batch size |
| `learning_rate` | float | 2e-4 | Learning rate |
| `max_length` | int | 512 | Max sequence length |
| `fp16` | bool | true | Use mixed precision |

**DPO:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `beta` | float | 0.1 | KL penalty coefficient |
| `epochs` | int | 1 | Training epochs |
| `learning_rate` | float | 5e-7 | Learning rate |

---

## 16. Security Considerations

### 16.1 Authentication Security

- **Password Storage:** Bcrypt with salt (12 rounds)
- **Token Signing:** HS256 with secret key
- **Token Expiry:** Access (30 min), Refresh (7 days)
- **Transport:** HTTPS required in production

### 16.2 Authorization Security

- **Resource Isolation:** Users can only access their own resources
- **Owner Validation:** Every CRUD operation checks `owner_id`
- **API Key for Agents:** Separate auth mechanism for node agents

### 16.3 Input Validation

- **Pydantic Models:** All inputs validated against schemas
- **File Upload:** Type and size validation
- **SQL Injection:** SQLAlchemy parameterized queries
- **XSS Prevention:** React's built-in escaping

### 16.4 Secrets Management

**Never commit:**
- `.env` files
- API keys
- Database passwords
- JWT secret keys

**Use:**
- Environment variables
- Secret management services (Vault, AWS Secrets Manager)
- Docker secrets in production

### 16.5 Container Security

- **Non-root user:** Containers run as non-root
- **Read-only filesystem:** Where possible
- **Resource limits:** CPU and memory limits
- **Network isolation:** Docker network for services

---

## 17. Troubleshooting Guide

### 17.1 Backend Won't Start

**Error: `role "tunellm" does not exist`**

PostgreSQL user not created. Check if Docker PostgreSQL is running:
```bash
docker compose ps
docker exec tunellm-postgres psql -U tunellm -d tunellm -c "SELECT 1;"
```

If local PostgreSQL is conflicting:
```bash
brew services stop postgresql@14   # macOS
sudo systemctl stop postgresql      # Linux
```

**Error: `greenlet` or `aiofiles` missing**

Install missing packages:
```bash
pip install greenlet aiofiles
```

### 17.2 Frontend API Errors

**Error: CORS errors in browser**

Check CORS_ORIGINS in backend config includes frontend URL:
```bash
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

**Error: 401 Unauthorized**

Token expired. Check:
1. Token stored in localStorage
2. Token not expired
3. Refresh token logic working

### 17.3 Training Jobs Stuck

**Job stuck in PENDING:**
1. Check agent is running
2. Check agent connected to backend
3. Check node status in hardware page

**Job stuck in RUNNING:**
1. Check Docker container status: `docker ps`
2. Check container logs: `docker logs tunellm-job-{id}`
3. Check GPU availability: `nvidia-smi`

### 17.4 Docker Issues

**Port already in use:**
```bash
lsof -i :8000        # Find process
kill -9 <PID>        # Kill it
```

**Container won't start:**
```bash
docker compose logs <service>   # Check logs
docker compose down -v          # Reset volumes
docker compose up -d            # Restart
```

### 17.5 GPU Not Detected

**Check NVIDIA driver:**
```bash
nvidia-smi
```

**Check Docker GPU support:**
```bash
docker run --rm --gpus all nvidia/cuda:12.1-base-ubuntu22.04 nvidia-smi
```

**Install nvidia-docker:**
```bash
# Ubuntu
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

---

## 18. Contributing Guidelines

### 18.1 Code Style

**Python:**
- Follow PEP 8
- Use Black for formatting (line length: 88)
- Use isort for imports
- Use type hints

**TypeScript:**
- Follow ESLint configuration
- Use Prettier for formatting
- Use strict TypeScript

### 18.2 Commit Messages

Follow conventional commits:
```
feat: add new training method
fix: resolve token refresh issue
docs: update API documentation
refactor: improve scheduler performance
test: add unit tests for auth service
chore: update dependencies
```

### 18.3 Pull Request Process

1. Fork the repository
2. Create feature branch: `git checkout -b feat/my-feature`
3. Make changes with tests
4. Run linting and tests
5. Push to fork
6. Create Pull Request
7. Wait for review
8. Address feedback
9. Merge when approved

### 18.4 Issue Reporting

Include:
- TuneLLM version
- Python/Node versions
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error logs/screenshots

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **LoRA** | Low-Rank Adaptation - efficient fine-tuning that trains adapter layers |
| **QLoRA** | Quantized LoRA - LoRA with 4-bit base model quantization |
| **DPO** | Direct Preference Optimization - alignment without reward model |
| **PPO** | Proximal Policy Optimization - RLHF training algorithm |
| **PEFT** | Parameter-Efficient Fine-Tuning - library for adapter methods |
| **TRL** | Transformer Reinforcement Learning - library for RLHF |
| **JWT** | JSON Web Token - stateless authentication token |
| **RLHF** | Reinforcement Learning from Human Feedback |
| **Adapter** | Small trainable layers added to frozen base model |
| **Base Model** | Pre-trained LLM before fine-tuning |

---

## Appendix B: Supported Models

| Model | LoRA | QLoRA | DPO | Full |
|-------|------|-------|-----|------|
| LLaMA 2 (7B/13B/70B) | ✅ | ✅ | ✅ | ✅ |
| LLaMA 3 (8B/70B) | ✅ | ✅ | ✅ | ✅ |
| Mistral (7B) | ✅ | ✅ | ✅ | ✅ |
| Mixtral (8x7B) | ✅ | ✅ | ✅ | ⚠️ |
| Falcon (7B/40B) | ✅ | ✅ | ✅ | ✅ |
| Phi-2 | ✅ | ✅ | ✅ | ✅ |
| Qwen (7B/14B/72B) | ✅ | ✅ | ✅ | ✅ |

⚠️ = Requires significant VRAM

---

## Appendix C: Hardware Requirements

### Minimum Requirements

| Component | Specification |
|-----------|---------------|
| GPU | NVIDIA with 8GB+ VRAM |
| CUDA | 11.8+ |
| RAM | 16GB |
| Storage | 100GB SSD |

### Recommended for 7B Models

| Component | Specification |
|-----------|---------------|
| GPU | NVIDIA RTX 4090 (24GB) or A100 (40GB) |
| CUDA | 12.1+ |
| RAM | 64GB |
| Storage | 500GB NVMe SSD |

### VRAM Requirements by Method

| Method | 7B Model | 13B Model | 70B Model |
|--------|----------|-----------|-----------|
| QLoRA | 6GB | 10GB | 48GB |
| LoRA | 14GB | 26GB | 140GB |
| Full | 28GB | 52GB | 280GB |

---

*This document is maintained by the TuneLLM development team. For the latest version, see the repository.*
