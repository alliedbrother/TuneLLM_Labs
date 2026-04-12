// User types
export interface User {
  id: number;
  email: string;
  username: string;
  is_active: boolean;
  is_superuser: boolean;
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
  file_size: number;
  num_samples?: number;
  owner_id: number;
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
  current_epoch: number;
  total_epochs: number;
  current_step: number;
  total_steps?: number;
  train_loss?: number;
  eval_loss?: number;
  error_message?: string;
  baseline_metrics?: Record<string, number>;
  final_metrics?: Record<string, number>;
  phase?: string;
  distributed_config?: Record<string, unknown>;
  node_id?: number;
  owner_id: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

// LoRA configuration
export interface LoRAConfig {
  r: number;
  alpha: number;
  target_modules?: string[];
  dropout?: number;
}

// QLoRA configuration
export interface QLoRAConfig extends LoRAConfig {
  bits?: number;
  double_quant?: boolean;
  compute_dtype?: string;
}

// Training configuration
export interface TrainingConfig {
  epochs?: number;
  batch_size?: number;
  micro_batch_size?: number;
  learning_rate?: number;
  lr_scheduler?: string;
  warmup_ratio?: number;
  mixed_precision?: 'no' | 'fp16' | 'bf16';
  gradient_checkpointing?: boolean;
  gradient_accumulation_steps?: number;
  max_seq_length?: number;
  warmup_steps?: number;
  logging_steps?: number;
  weight_decay?: number;
  seed?: number;
}

// Full job configuration
export interface JobConfig {
  run_name: string;
  base_model: string;
  tokenizer?: string;
  method: TrainingMethod;
  lora?: LoRAConfig;
  qlora?: QLoRAConfig;
  training?: TrainingConfig;
  prompt_template?: string;
  eval_steps?: number;
  evaluate_before?: boolean;
  evaluate_after?: boolean;
}

export interface DistributedConfig {
  strategy: 'auto' | 'ddp' | 'fsdp' | 'deepspeed_zero2' | 'deepspeed_zero3';
}

export interface JobCreate {
  name: string;
  dataset_id: number;
  node_id?: number;
  node_ids?: number[];
  distributed?: DistributedConfig;
  config: JobConfig;
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
  description?: string;
  base_model: string;
  method: TrainingMethod;
  artifact_path: string;
  artifact_size: number;
  status: ModelStatus;
  metrics?: Record<string, number>;
  endpoint_url?: string;
  owner_id: number;
  job_id: number;
  created_at: string;
  updated_at: string;
}

// Hardware/Node types
export type NodeStatus = 'online' | 'offline' | 'busy' | 'error' | 'provisioning';

export interface HardwareNode {
  id: number;
  name: string;
  status: NodeStatus;
  gpu_count: number;
  gpu_type?: string;
  gpu_memory_gb?: number;
  cpu_count?: number;
  ram_gb?: number;
  disk_gb?: number;
  host?: string;
  port?: number;
  gpu_utilization?: number;
  memory_utilization?: number;
  provider: string;
  provider_instance_id?: string;
  hourly_cost?: number;
  owner_id: number;
  is_shared: boolean;
  created_at: string;
  last_heartbeat?: string;
}

// Cloud GPU types
export interface CloudGpuOffer {
  id: number;
  gpu_name: string;
  num_gpus: number;
  gpu_ram_gb: number;
  cpu_cores: number;
  ram_gb: number;
  disk_gb: number;
  dph_total: number;
  reliability: number;
  inet_down: number;
  inet_up: number;
  cuda_max_good?: number;
  machine_id: number;
  verified: boolean;
}

export interface CloudProvisionRequest {
  offer_id: number;
  name: string;
  disk_gb?: number;
  docker_image?: string;
}

export interface CloudProvisionResponse {
  node_id: number;
  provider_instance_id: string;
  status: string;
  message: string;
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
