import { useState } from 'react';
import { PlusIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import JobCard from '../components/Jobs/JobCard';
import { useJobs, useDatasets, useCreateJob } from '../hooks/useApi';
import type { JobCreate, TrainingMethod } from '../types';

const TRAINING_METHODS: { value: TrainingMethod; label: string; description: string }[] = [
  { value: 'lora', label: 'LoRA', description: 'Low-Rank Adaptation - efficient fine-tuning' },
  { value: 'qlora', label: 'QLoRA', description: '4-bit quantized LoRA for large models' },
  { value: 'dpo', label: 'DPO', description: 'Direct Preference Optimization' },
  { value: 'full', label: 'Full', description: 'Full fine-tuning (requires more memory)' },
];

const POPULAR_MODELS = [
  'meta-llama/Llama-2-7b-hf',
  'meta-llama/Llama-2-13b-hf',
  'mistralai/Mistral-7B-v0.1',
  'mistralai/Mixtral-8x7B-v0.1',
  'tiiuae/falcon-7b',
  'google/gemma-7b',
];

export default function JobsPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<JobCreate>>({
    method: 'lora',
  });

  const { data: jobsData, isLoading } = useJobs();
  const { data: datasetsData } = useDatasets(1, 100);
  const createMutation = useCreateJob();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.base_model || !formData.dataset_id) return;

    await createMutation.mutateAsync({
      name: formData.name,
      base_model: formData.base_model,
      method: formData.method || 'lora',
      dataset_id: formData.dataset_id,
      config: {},
    });

    setFormData({ method: 'lora' });
    setIsCreating(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Training Jobs</h1>
          <p className="mt-1 text-gray-500">Manage your fine-tuning jobs</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="btn btn-primary flex items-center"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          New Job
        </button>
      </div>

      {/* Create Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Create Training Job</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">Job Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="my-llama-finetune"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="label">Base Model</label>
                <select
                  className="input"
                  value={formData.base_model || ''}
                  onChange={(e) => setFormData({ ...formData, base_model: e.target.value })}
                  required
                >
                  <option value="">Select a model</option>
                  {POPULAR_MODELS.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Dataset</label>
                <select
                  className="input"
                  value={formData.dataset_id || ''}
                  onChange={(e) => setFormData({ ...formData, dataset_id: Number(e.target.value) })}
                  required
                >
                  <option value="">Select a dataset</option>
                  {datasetsData?.items.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Training Method</label>
                <div className="grid grid-cols-2 gap-3">
                  {TRAINING_METHODS.map((method) => (
                    <label
                      key={method.value}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        formData.method === method.value
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="method"
                        value={method.value}
                        checked={formData.method === method.value}
                        onChange={(e) => setFormData({ ...formData, method: e.target.value as TrainingMethod })}
                        className="sr-only"
                      />
                      <span className="font-medium text-gray-900">{method.label}</span>
                      <p className="text-xs text-gray-500 mt-1">{method.description}</p>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="btn btn-primary"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Jobs List */}
      {isLoading ? (
        <div className="card text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto" />
        </div>
      ) : jobsData?.items.length ? (
        <div className="grid gap-4">
          {jobsData.items.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <CpuChipIcon className="w-12 h-12 mx-auto text-gray-400" />
          <p className="mt-4 text-gray-500">No training jobs yet</p>
          <p className="text-sm text-gray-400">
            Create your first fine-tuning job to get started
          </p>
        </div>
      )}
    </div>
  );
}
