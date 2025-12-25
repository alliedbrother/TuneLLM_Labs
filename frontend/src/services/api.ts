import axios, { AxiosInstance, AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';
import type {
  AuthResponse,
  LoginRequest,
  SignupRequest,
  User,
  Dataset,
  DatasetCreate,
  FineTuneJob,
  JobCreate,
  JobLog,
  TrainedModel,
  HardwareNode,
  PaginatedResponse,
} from '../types';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
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

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Try to refresh token
      const refreshToken = useAuthStore.getState().refreshToken;
      if (refreshToken) {
        try {
          const response = await axios.post<AuthResponse>('/api/v1/auth/refresh', {
            refresh_token: refreshToken,
          });
          useAuthStore.getState().setTokens(
            response.data.access_token,
            response.data.refresh_token
          );
          // Retry original request
          if (error.config) {
            error.config.headers.Authorization = `Bearer ${response.data.access_token}`;
            return axios(error.config);
          }
        } catch {
          useAuthStore.getState().logout();
        }
      } else {
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login', data);
    return response.data;
  },

  signup: async (data: SignupRequest): Promise<User> => {
    const response = await api.post<User>('/auth/signup', data);
    return response.data;
  },

  me: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },

  refresh: async (refreshToken: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/refresh', {
      refresh_token: refreshToken,
    });
    return response.data;
  },
};

// Datasets API
export const datasetsAPI = {
  list: async (page = 1, size = 10): Promise<PaginatedResponse<Dataset>> => {
    const response = await api.get<PaginatedResponse<Dataset>>('/datasets', {
      params: { page, size },
    });
    return response.data;
  },

  get: async (id: number): Promise<Dataset> => {
    const response = await api.get<Dataset>(`/datasets/${id}`);
    return response.data;
  },

  create: async (data: DatasetCreate, file: File): Promise<Dataset> => {
    const formData = new FormData();
    formData.append('name', data.name);
    if (data.description) {
      formData.append('description', data.description);
    }
    formData.append('file', file);

    const response = await api.post<Dataset>('/datasets', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/datasets/${id}`);
  },
};

// Jobs API
export const jobsAPI = {
  list: async (page = 1, size = 10): Promise<PaginatedResponse<FineTuneJob>> => {
    const response = await api.get<PaginatedResponse<FineTuneJob>>('/jobs', {
      params: { page, size },
    });
    return response.data;
  },

  get: async (id: number): Promise<FineTuneJob> => {
    const response = await api.get<FineTuneJob>(`/jobs/${id}`);
    return response.data;
  },

  create: async (data: JobCreate): Promise<FineTuneJob> => {
    const response = await api.post<FineTuneJob>('/jobs', data);
    return response.data;
  },

  cancel: async (id: number): Promise<FineTuneJob> => {
    const response = await api.post<FineTuneJob>(`/jobs/${id}/cancel`);
    return response.data;
  },

  getLogs: async (id: number): Promise<JobLog[]> => {
    const response = await api.get<JobLog[]>(`/jobs/${id}/logs`);
    return response.data;
  },
};

// Models API
export const modelsAPI = {
  list: async (page = 1, size = 10): Promise<PaginatedResponse<TrainedModel>> => {
    const response = await api.get<PaginatedResponse<TrainedModel>>('/models', {
      params: { page, size },
    });
    return response.data;
  },

  get: async (id: number): Promise<TrainedModel> => {
    const response = await api.get<TrainedModel>(`/models/${id}`);
    return response.data;
  },

  deploy: async (id: number): Promise<TrainedModel> => {
    const response = await api.post<TrainedModel>(`/models/${id}/deploy`);
    return response.data;
  },

  undeploy: async (id: number): Promise<TrainedModel> => {
    const response = await api.post<TrainedModel>(`/models/${id}/undeploy`);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/models/${id}`);
  },
};

// Hardware API
export const hardwareAPI = {
  list: async (): Promise<HardwareNode[]> => {
    const response = await api.get<HardwareNode[]>('/hardware/nodes');
    return response.data;
  },

  get: async (id: number): Promise<HardwareNode> => {
    const response = await api.get<HardwareNode>(`/hardware/nodes/${id}`);
    return response.data;
  },
};

export default api;
