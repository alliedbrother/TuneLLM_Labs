import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authAPI, datasetsAPI, jobsAPI, modelsAPI, hardwareAPI, cloudAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import type { LoginRequest, SignupRequest, DatasetCreate, JobCreate, CloudProvisionRequest } from '../types';

// Auth hooks
export function useLogin() {
  const login = useAuthStore((state) => state.login);
  const setTokens = useAuthStore((state) => state.setTokens);

  return useMutation({
    mutationFn: async (data: LoginRequest) => {
      // First, get tokens from login
      const authResponse = await authAPI.login(data);

      // Store tokens immediately so the next API call can use them
      setTokens(authResponse.access_token, authResponse.refresh_token);

      // Now fetch user with the token available
      const user = await authAPI.me();
      return { authResponse, user };
    },
    onSuccess: ({ authResponse, user }) => {
      login(user, authResponse.access_token, authResponse.refresh_token);
      toast.success('Logged in successfully!');
    },
    onError: () => {
      toast.error('Invalid email or password');
    },
  });
}

export function useSignup() {
  return useMutation({
    mutationFn: (data: SignupRequest) => authAPI.signup(data),
    onSuccess: () => {
      toast.success('Account created! Please log in.');
    },
    onError: () => {
      toast.error('Failed to create account');
    },
  });
}

export function useCurrentUser() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: ['currentUser'],
    queryFn: authAPI.me,
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Dataset hooks
export function useDatasets(page = 1, size = 10) {
  return useQuery({
    queryKey: ['datasets', page, size],
    queryFn: () => datasetsAPI.list(page, size),
  });
}

export function useDataset(id: number) {
  return useQuery({
    queryKey: ['dataset', id],
    queryFn: () => datasetsAPI.get(id),
    enabled: !!id,
  });
}

export function useCreateDataset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, file }: { data: DatasetCreate; file: File }) =>
      datasetsAPI.create(data, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      toast.success('Dataset uploaded successfully!');
    },
    onError: () => {
      toast.error('Failed to upload dataset');
    },
  });
}

export function useDeleteDataset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: datasetsAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      toast.success('Dataset deleted');
    },
    onError: () => {
      toast.error('Failed to delete dataset');
    },
  });
}

// Job hooks
export function useJobs(page = 1, size = 10) {
  return useQuery({
    queryKey: ['jobs', page, size],
    queryFn: () => jobsAPI.list(page, size),
    refetchInterval: 5000, // Refresh every 5 seconds for status updates
  });
}

export function useJob(id: number) {
  return useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsAPI.get(id),
    enabled: !!id,
    refetchInterval: 5000,
  });
}

export function useJobLogs(id: number) {
  return useQuery({
    queryKey: ['jobLogs', id],
    queryFn: () => jobsAPI.getLogs(id),
    enabled: !!id,
    refetchInterval: 3000,
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: JobCreate) => jobsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Training job created!');
    },
    onError: () => {
      toast.error('Failed to create training job');
    },
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: jobsAPI.cancel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job cancelled');
    },
    onError: () => {
      toast.error('Failed to cancel job');
    },
  });
}

// Model hooks
export function useModels(page = 1, size = 10) {
  return useQuery({
    queryKey: ['models', page, size],
    queryFn: () => modelsAPI.list(page, size),
  });
}

export function useModel(id: number) {
  return useQuery({
    queryKey: ['model', id],
    queryFn: () => modelsAPI.get(id),
    enabled: !!id,
  });
}

export function useDeployModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: modelsAPI.deploy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      toast.success('Model deployed!');
    },
    onError: () => {
      toast.error('Failed to deploy model');
    },
  });
}

export function useUndeployModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: modelsAPI.undeploy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      toast.success('Model undeployed');
    },
    onError: () => {
      toast.error('Failed to undeploy model');
    },
  });
}

export function useDeleteModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: modelsAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      toast.success('Model deleted');
    },
    onError: () => {
      toast.error('Failed to delete model');
    },
  });
}

// Hardware hooks
export function useHardwareNodes() {
  return useQuery({
    queryKey: ['hardwareNodes'],
    queryFn: hardwareAPI.list,
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

export function useHardwareNode(id: number) {
  return useQuery({
    queryKey: ['hardwareNode', id],
    queryFn: () => hardwareAPI.get(id),
    enabled: !!id,
  });
}

// Cloud GPU hooks
export function useSearchCloudGpus(params?: {
  min_gpu_ram_gb?: number;
  gpu_type?: string;
  max_dph?: number;
}) {
  return useQuery({
    queryKey: ['cloudGpus', params],
    queryFn: () => cloudAPI.searchGpus(params),
    enabled: false, // Only fetch on demand
  });
}

export function useProvisionCloud() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CloudProvisionRequest) => cloudAPI.provision(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hardwareNodes'] });
      toast.success('Cloud GPU provisioned! It will appear online shortly.');
    },
    onError: () => {
      toast.error('Failed to provision cloud GPU');
    },
  });
}

export function useDestroyCloud() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (nodeId: number) => cloudAPI.destroy(nodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hardwareNodes'] });
      toast.success('Cloud GPU instance destroyed');
    },
    onError: () => {
      toast.error('Failed to destroy cloud instance');
    },
  });
}
