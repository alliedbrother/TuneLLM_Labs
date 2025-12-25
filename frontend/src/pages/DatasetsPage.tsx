import { useState } from 'react';
import { PlusIcon, TrashIcon, CircleStackIcon } from '@heroicons/react/24/outline';
import { useDatasets, useCreateDataset, useDeleteDataset } from '../hooks/useApi';
import type { Dataset } from '../types';

export default function DatasetsPage() {
  const [isUploading, setIsUploading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const { data, isLoading } = useDatasets();
  const createMutation = useCreateDataset();
  const deleteMutation = useDeleteDataset();

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name) return;

    await createMutation.mutateAsync({
      data: { name, description },
      file,
    });

    setName('');
    setDescription('');
    setFile(null);
    setIsUploading(false);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Datasets</h1>
          <p className="mt-1 text-gray-500">Manage your training datasets</p>
        </div>
        <button
          onClick={() => setIsUploading(true)}
          className="btn btn-primary flex items-center"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          Upload Dataset
        </button>
      </div>

      {/* Upload Modal */}
      {isUploading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Upload Dataset</h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Description (optional)</label>
                <textarea
                  className="input"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="label">File (JSON, JSONL, CSV, Parquet)</label>
                <input
                  type="file"
                  accept=".json,.jsonl,.csv,.parquet"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full"
                  required
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsUploading(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="btn btn-primary"
                >
                  {createMutation.isPending ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Datasets List */}
      {isLoading ? (
        <div className="card text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto" />
        </div>
      ) : data?.items.length ? (
        <div className="grid gap-4">
          {data.items.map((dataset: Dataset) => (
            <div key={dataset.id} className="card flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-primary-50 rounded-lg">
                  <CircleStackIcon className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{dataset.name}</h3>
                  <p className="text-sm text-gray-500">
                    {dataset.format.toUpperCase()} - {formatBytes(dataset.size_bytes)}
                    {dataset.row_count && ` - ${dataset.row_count.toLocaleString()} rows`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => deleteMutation.mutate(dataset.id)}
                disabled={deleteMutation.isPending}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <CircleStackIcon className="w-12 h-12 mx-auto text-gray-400" />
          <p className="mt-4 text-gray-500">No datasets yet</p>
          <p className="text-sm text-gray-400">
            Upload your first dataset to start fine-tuning
          </p>
        </div>
      )}
    </div>
  );
}
