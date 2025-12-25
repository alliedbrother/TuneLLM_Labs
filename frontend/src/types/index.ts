// User types
export interface User {
  id: number;
  email: string;
  username: string;
  is_active: boolean;
  created_at: string;
}

// Auth types
export interface LoginRequest {
  email: string;
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
  format: 'json' | 'jsonl' | 'csv' | 'parquet';
  file_path: string;
  size_bytes: number;
  row_count?: number;
  user_id: number;
  created_at: string;
  updated_at: string;
}

export interface DatasetCreate {
  name: string;
  description?: string;
}

// Job types
export type JobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TrainingMethod = 'lora' | 'qlora' | 'dpo' | 'ppo' | 'full';

export interface FineTuneJob {
  id: number;
  name: string;
  base_model: string;
  method: TrainingMethod;
  dataset_id: number;
  dataset?: Dataset;
  config: Record<string, unknown>;
  status: JobStatus;
  progress?: number;
  error_message?: string;
  node_id?: number;
  user_id: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface JobCreate {
  name: string;
  base_model: string;
  method: TrainingMethod;
  dataset_id: number;
  config: Record<string, unknown>;
}

export interface JobLog {
  id: number;
  job_id: number;
  level: string;
  message: string;
  timestamp: string;
}

// Model types
export type ModelStatus = 'training' | 'ready' | 'deployed' | 'failed';

export interface TrainedModel {
  id: number;
  name: string;
  base_model: string;
  job_id: number;
  model_path: string;
  status: ModelStatus;
  metrics?: Record<string, number>;
  endpoint_url?: string;
  user_id: number;
  created_at: string;
}

// Hardware/Node types
export type NodeStatus = 'online' | 'offline' | 'busy' | 'error';

export interface HardwareNode {
  id: number;
  name: string;
  status: NodeStatus;
  gpu_type?: string;
  gpu_count: number;
  gpu_memory_gb?: number;
  cpu_count: number;
  ram_gb: number;
  disk_gb: number;
  current_job_id?: number;
  last_heartbeat?: string;
  created_at: string;
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

// API Error
export interface APIError {
  detail: string;
}
