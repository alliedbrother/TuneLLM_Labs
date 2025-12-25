import { Server, Cpu, HardDrive, Activity } from 'lucide-react';
import type { HardwareNode, NodeStatus } from '../../types';
import { Badge } from '@/components/ui/badge';

const statusStyles: Record<NodeStatus, { bg: string; color: string; dot?: string }> = {
  online: { bg: 'bg-success/10', color: 'text-success', dot: 'bg-success' },
  offline: { bg: 'bg-muted', color: 'text-muted-foreground' },
  busy: { bg: 'bg-chart-2/10', color: 'text-chart-2', dot: 'bg-chart-2' },
  error: { bg: 'bg-destructive/10', color: 'text-destructive' },
};

interface NodeCardProps {
  node: HardwareNode;
}

export default function NodeCard({ node }: NodeCardProps) {
  const style = statusStyles[node.status];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted rounded-lg">
            <Server className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-medium">{node.name}</h3>
            <p className="text-sm text-muted-foreground">{node.gpu_type || 'No GPU'}</p>
          </div>
        </div>
        <Badge className={`${style.bg} ${style.color} border-none`}>
          {style.dot && <span className={`w-2 h-2 mr-1.5 ${style.dot} rounded-full`} />}
          {node.status.charAt(0).toUpperCase() + node.status.slice(1)}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm">
            <p className="text-muted-foreground">GPUs</p>
            <p className="font-medium">{node.gpu_count}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm">
            <p className="text-muted-foreground">RAM</p>
            <p className="font-medium">{node.ram_gb?.toFixed(0) || '-'} GB</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm">
            <p className="text-muted-foreground">VRAM</p>
            <p className="font-medium">{node.gpu_memory_gb?.toFixed(0) || '-'} GB</p>
          </div>
        </div>
      </div>

      {node.status === 'busy' && (
        <div className="mt-4 flex items-center gap-2 p-3 bg-chart-2/10 rounded-lg">
          <Activity className="h-4 w-4 text-chart-2" />
          <p className="text-sm text-chart-2">Currently running a training job</p>
        </div>
      )}
    </div>
  );
}
