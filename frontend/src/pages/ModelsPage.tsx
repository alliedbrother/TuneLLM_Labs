import { CubeIcon, RocketLaunchIcon, StopIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useModels, useDeployModel, useUndeployModel, useDeleteModel } from '../hooks/useApi';
import type { TrainedModel, ModelStatus } from '../types';

const statusStyles: Record<ModelStatus, string> = {
  training: 'bg-yellow-100 text-yellow-700',
  ready: 'bg-green-100 text-green-700',
  deployed: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
};

export default function ModelsPage() {
  const { data, isLoading } = useModels();
  const deployMutation = useDeployModel();
  const undeployMutation = useUndeployModel();
  const deleteMutation = useDeleteModel();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Trained Models</h1>
        <p className="mt-1 text-gray-500">
          Manage and deploy your fine-tuned models
        </p>
      </div>

      {isLoading ? (
        <div className="card text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto" />
        </div>
      ) : data?.items.length ? (
        <div className="grid gap-4">
          {data.items.map((model: TrainedModel) => (
            <div key={model.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <div className="p-2 bg-primary-50 rounded-lg">
                    <CubeIcon className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{model.name}</h3>
                    <p className="text-sm text-gray-500">
                      Based on {model.base_model}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[model.status]}`}
                >
                  {model.status.charAt(0).toUpperCase() + model.status.slice(1)}
                </span>
              </div>

              {/* Metrics */}
              {model.metrics && Object.keys(model.metrics).length > 0 && (
                <div className="mt-4 flex space-x-6">
                  {Object.entries(model.metrics).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-sm text-gray-500">{key}</span>
                      <p className="font-medium">
                        {typeof value === 'number' ? value.toFixed(4) : value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Endpoint URL */}
              {model.endpoint_url && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">Endpoint:</span>{' '}
                    <code className="bg-blue-100 px-1 rounded">
                      {model.endpoint_url}
                    </code>
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex justify-end space-x-3">
                {model.status === 'ready' && (
                  <button
                    onClick={() => deployMutation.mutate(model.id)}
                    disabled={deployMutation.isPending}
                    className="btn btn-primary flex items-center text-sm"
                  >
                    <RocketLaunchIcon className="w-4 h-4 mr-1" />
                    Deploy
                  </button>
                )}
                {model.status === 'deployed' && (
                  <button
                    onClick={() => undeployMutation.mutate(model.id)}
                    disabled={undeployMutation.isPending}
                    className="btn btn-secondary flex items-center text-sm"
                  >
                    <StopIcon className="w-4 h-4 mr-1" />
                    Undeploy
                  </button>
                )}
                {model.status !== 'deployed' && (
                  <button
                    onClick={() => deleteMutation.mutate(model.id)}
                    disabled={deleteMutation.isPending}
                    className="btn btn-danger flex items-center text-sm"
                  >
                    <TrashIcon className="w-4 h-4 mr-1" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <CubeIcon className="w-12 h-12 mx-auto text-gray-400" />
          <p className="mt-4 text-gray-500">No trained models yet</p>
          <p className="text-sm text-gray-400">
            Complete a training job to see your models here
          </p>
        </div>
      )}
    </div>
  );
}
