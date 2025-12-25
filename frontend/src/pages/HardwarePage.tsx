import { ServerStackIcon } from '@heroicons/react/24/outline';
import NodeCard from '../components/Hardware/NodeCard';
import { useHardwareNodes } from '../hooks/useApi';

export default function HardwarePage() {
  const { data: nodes, isLoading } = useHardwareNodes();

  const onlineCount = nodes?.filter((n) => n.status === 'online').length || 0;
  const busyCount = nodes?.filter((n) => n.status === 'busy').length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hardware</h1>
        <p className="mt-1 text-gray-500">
          Manage your GPU nodes and compute resources
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500">Total Nodes</p>
          <p className="text-2xl font-semibold text-gray-900">
            {nodes?.length || 0}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Online</p>
          <p className="text-2xl font-semibold text-green-600">{onlineCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Busy</p>
          <p className="text-2xl font-semibold text-blue-600">{busyCount}</p>
        </div>
      </div>

      {/* Nodes */}
      {isLoading ? (
        <div className="card text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto" />
        </div>
      ) : nodes?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {nodes.map((node) => (
            <NodeCard key={node.id} node={node} />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <ServerStackIcon className="w-12 h-12 mx-auto text-gray-400" />
          <p className="mt-4 text-gray-500">No nodes connected</p>
          <p className="text-sm text-gray-400">
            Run the TuneLLM agent on your GPU machines to connect them
          </p>
        </div>
      )}

      {/* Instructions */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Add a Node</h2>
        <p className="text-gray-600 mb-4">
          To add a GPU node to your cluster, run the TuneLLM agent on your
          machine:
        </p>
        <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-300">
          <p># Pull the agent image</p>
          <p className="text-green-400">
            docker pull ghcr.io/tunellm/agent:latest
          </p>
          <br />
          <p># Run the agent</p>
          <p className="text-green-400">
            docker run --gpus all -d \
          </p>
          <p className="text-green-400 pl-4">
            -e SERVER_URL=http://your-server:8000 \
          </p>
          <p className="text-green-400 pl-4">
            -e NODE_NAME=my-gpu-node \
          </p>
          <p className="text-green-400 pl-4">ghcr.io/tunellm/agent:latest</p>
        </div>
      </div>
    </div>
  );
}
