import {
  ServerIcon,
  CpuChipIcon,
  CircleStackIcon,
} from '@heroicons/react/24/outline';
import type { HardwareNode, NodeStatus } from '../../types';

const statusStyles: Record<NodeStatus, string> = {
  online: 'bg-green-100 text-green-700',
  offline: 'bg-gray-100 text-gray-500',
  busy: 'bg-blue-100 text-blue-700',
  error: 'bg-red-100 text-red-700',
};

interface NodeCardProps {
  node: HardwareNode;
}

export default function NodeCard({ node }: NodeCardProps) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gray-100 rounded-lg">
            <ServerIcon className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">{node.name}</h3>
            <p className="text-sm text-gray-500">{node.gpu_type || 'No GPU'}</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[node.status]}`}
        >
          {node.status === 'online' && (
            <span className="w-2 h-2 mr-1.5 bg-green-500 rounded-full" />
          )}
          {node.status.charAt(0).toUpperCase() + node.status.slice(1)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="flex items-center">
          <CpuChipIcon className="w-4 h-4 mr-2 text-gray-400" />
          <div>
            <p className="text-gray-500">GPUs</p>
            <p className="font-medium">{node.gpu_count}</p>
          </div>
        </div>
        <div className="flex items-center">
          <CircleStackIcon className="w-4 h-4 mr-2 text-gray-400" />
          <div>
            <p className="text-gray-500">RAM</p>
            <p className="font-medium">{node.ram_gb.toFixed(0)} GB</p>
          </div>
        </div>
        <div className="flex items-center">
          <CircleStackIcon className="w-4 h-4 mr-2 text-gray-400" />
          <div>
            <p className="text-gray-500">VRAM</p>
            <p className="font-medium">
              {node.gpu_memory_gb?.toFixed(0) || '-'} GB
            </p>
          </div>
        </div>
      </div>

      {node.current_job_id && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-700">
            Running job #{node.current_job_id}
          </p>
        </div>
      )}
    </div>
  );
}
