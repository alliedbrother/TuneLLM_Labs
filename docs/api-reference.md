# TuneLLM API Reference

Base URL: `http://your-server:8000/api/v1`

## Authentication

All API endpoints (except `/auth/login` and `/auth/signup`) require authentication.

Include the JWT token in the Authorization header:
```
Authorization: Bearer <access_token>
```

### POST /auth/signup

Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "securepassword123"
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "johndoe",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z"
}
```

### POST /auth/login

Authenticate and receive tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

### POST /auth/refresh

Refresh an expired access token.

**Request Body:**
```json
{
  "refresh_token": "eyJ..."
}
```

### GET /auth/me

Get current user information.

**Response:** `200 OK`
```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "johndoe",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

## Datasets

### GET /datasets

List all datasets.

**Query Parameters:**
- `page` (int): Page number (default: 1)
- `size` (int): Items per page (default: 10)

**Response:** `200 OK`
```json
{
  "items": [
    {
      "id": 1,
      "name": "my-dataset",
      "description": "Training data for chatbot",
      "format": "json",
      "file_path": "/data/datasets/1/data.json",
      "size_bytes": 1048576,
      "row_count": 5000,
      "user_id": 1,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "size": 10,
  "pages": 1
}
```

### POST /datasets

Upload a new dataset.

**Request:** `multipart/form-data`
- `name` (string): Dataset name
- `description` (string, optional): Description
- `file` (file): Dataset file (JSON, JSONL, CSV, or Parquet)

**Response:** `201 Created`
```json
{
  "id": 1,
  "name": "my-dataset",
  "format": "json",
  "size_bytes": 1048576,
  "row_count": 5000
}
```

### GET /datasets/{id}

Get dataset details.

### DELETE /datasets/{id}

Delete a dataset.

---

## Fine-Tuning Jobs

### GET /jobs

List all training jobs.

**Query Parameters:**
- `page` (int): Page number
- `size` (int): Items per page
- `status` (string, optional): Filter by status

**Response:** `200 OK`
```json
{
  "items": [
    {
      "id": 1,
      "name": "llama2-finetune",
      "base_model": "meta-llama/Llama-2-7b-hf",
      "method": "lora",
      "dataset_id": 1,
      "config": {
        "lora": {"r": 16, "alpha": 32},
        "training": {"num_epochs": 3}
      },
      "status": "running",
      "progress": 45,
      "node_id": 1,
      "user_id": 1,
      "created_at": "2024-01-15T10:30:00Z",
      "started_at": "2024-01-15T10:31:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "size": 10,
  "pages": 1
}
```

### POST /jobs

Create a new training job.

**Request Body:**
```json
{
  "name": "my-finetune-job",
  "base_model": "meta-llama/Llama-2-7b-hf",
  "method": "lora",
  "dataset_id": 1,
  "config": {
    "lora": {
      "r": 16,
      "alpha": 32,
      "dropout": 0.05,
      "target_modules": ["q_proj", "v_proj"]
    },
    "training": {
      "num_epochs": 3,
      "batch_size": 4,
      "learning_rate": 2e-4,
      "max_length": 2048
    }
  }
}
```

**Response:** `201 Created`

### GET /jobs/{id}

Get job details.

### POST /jobs/{id}/cancel

Cancel a running or pending job.

### GET /jobs/{id}/logs

Get job logs.

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "job_id": 1,
    "level": "info",
    "message": "Starting training...",
    "timestamp": "2024-01-15T10:31:00Z"
  }
]
```

---

## Trained Models

### GET /models

List all trained models.

### GET /models/{id}

Get model details.

**Response:** `200 OK`
```json
{
  "id": 1,
  "name": "llama2-finetune-final",
  "base_model": "meta-llama/Llama-2-7b-hf",
  "job_id": 1,
  "model_path": "/data/models/1",
  "status": "ready",
  "metrics": {
    "train_loss": 0.45,
    "eval_loss": 0.52
  },
  "endpoint_url": null,
  "user_id": 1,
  "created_at": "2024-01-15T12:00:00Z"
}
```

### POST /models/{id}/deploy

Deploy a model for inference.

**Response:** `200 OK`
```json
{
  "id": 1,
  "status": "deployed",
  "endpoint_url": "http://node1:8080/generate"
}
```

### POST /models/{id}/undeploy

Stop model deployment.

### DELETE /models/{id}

Delete a trained model.

---

## Hardware Nodes

### GET /hardware/nodes

List all registered nodes.

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "name": "gpu-node-1",
    "status": "online",
    "gpu_type": "NVIDIA A100",
    "gpu_count": 1,
    "gpu_memory_gb": 80,
    "cpu_count": 32,
    "ram_gb": 256,
    "disk_gb": 1000,
    "current_job_id": null,
    "last_heartbeat": "2024-01-15T12:00:00Z"
  }
]
```

### GET /hardware/nodes/{id}

Get node details.

---

## Inference Endpoints

### POST /endpoints/{id}/generate

Generate text using a deployed model.

**Request Body:**
```json
{
  "prompt": "Write a poem about AI",
  "max_new_tokens": 256,
  "temperature": 0.7,
  "top_p": 0.9,
  "stream": false
}
```

**Response:** `200 OK`
```json
{
  "generated_text": "In silicon dreams, a mind awakes...",
  "prompt_tokens": 12,
  "generated_tokens": 45
}
```

For streaming responses, set `stream: true` and the response will be Server-Sent Events.

---

## Error Responses

All errors follow this format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

Common status codes:
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - Not authorized to access resource
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error
