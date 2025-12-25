import { Server, Cpu, HardDrive, Activity, Terminal, Copy } from 'lucide-react';
import NodeCard from '../components/Hardware/NodeCard';
import { useHardwareNodes } from '../hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

export default function HardwarePage() {
  const { data: nodes, isLoading } = useHardwareNodes();

  const onlineCount = nodes?.filter((n) => n.status === 'online').length || 0;
  const busyCount = nodes?.filter((n) => n.status === 'busy').length || 0;
  const totalGpus = nodes?.reduce((acc, n) => acc + n.gpu_count, 0) || 0;

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hardware</h1>
        <p className="text-muted-foreground">
          Manage your GPU nodes and compute resources
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Nodes</p>
                <p className="text-2xl font-bold">{nodes?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-success/10 rounded-lg">
                <Activity className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Online</p>
                <p className="text-2xl font-bold text-success">{onlineCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-chart-2/10 rounded-lg">
                <Cpu className="h-5 w-5 text-chart-2" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Busy</p>
                <p className="text-2xl font-bold text-chart-2">{busyCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-accent/10 rounded-lg">
                <HardDrive className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total GPUs</p>
                <p className="text-2xl font-bold">{totalGpus}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Nodes Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">GPU Nodes</CardTitle>
          <CardDescription>Connected compute resources</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            </div>
          ) : nodes?.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {nodes.map((node) => (
                <NodeCard key={node.id} node={node} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Server className="w-12 h-12 mx-auto text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">No nodes connected</p>
              <p className="text-sm text-muted-foreground">
                Run the TuneLLM agent on your GPU machines to connect them
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Terminal className="h-5 w-5 text-primary" />
            Add a Node
          </CardTitle>
          <CardDescription>
            Run the TuneLLM agent on your GPU machine to connect it
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-card border border-border p-4 font-mono text-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground"># Pull the agent image</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyCommand('docker pull ghcr.io/tunellm/agent:latest')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-success">docker pull ghcr.io/tunellm/agent:latest</p>
          </div>

          <div className="rounded-lg bg-card border border-border p-4 font-mono text-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-muted-foreground"># Run the agent</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  copyCommand(
                    'docker run --gpus all -d \\\n  -e SERVER_URL=http://your-server:8000 \\\n  -e NODE_NAME=my-gpu-node \\\n  ghcr.io/tunellm/agent:latest'
                  )
                }
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-success">docker run --gpus all -d \</p>
            <p className="text-success pl-4">-e SERVER_URL=http://your-server:8000 \</p>
            <p className="text-success pl-4">-e NODE_NAME=my-gpu-node \</p>
            <p className="text-success pl-4">ghcr.io/tunellm/agent:latest</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
