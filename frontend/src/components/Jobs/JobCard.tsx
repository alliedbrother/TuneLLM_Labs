import { Link } from 'react-router-dom';
import { Clock, Activity, CheckCircle2, AlertCircle, ArrowUpRight } from 'lucide-react';
import type { FineTuneJob } from '../../types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

const statusConfig = {
  pending: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Pending' },
  queued: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Queued' },
  running: { icon: Activity, color: 'text-chart-2', bg: 'bg-chart-2/10', label: 'Running' },
  completed: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Completed' },
  failed: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Failed' },
  cancelled: { icon: AlertCircle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Cancelled' },
};

interface JobCardProps {
  job: FineTuneJob;
}

export default function JobCard({ job }: JobCardProps) {
  const config = statusConfig[job.status] || statusConfig.pending;
  const StatusIcon = config.icon;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card className="group hover:border-primary/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className={`rounded-full p-2 ${config.bg}`}>
            <StatusIcon className={`h-4 w-4 ${config.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">{job.name}</p>
              <Badge variant="secondary" className="text-xs">
                {job.method.toUpperCase()}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {job.base_model} • {formatDate(job.created_at)}
            </p>
            {job.status === 'running' && (
              <Progress
                value={job.total_steps ? (job.current_step / job.total_steps) * 100 : (job.current_epoch / job.total_epochs) * 100}
                className="mt-2 h-1"
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            <Badge className={`${config.bg} ${config.color} border-none`}>
              {config.label}
            </Badge>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/jobs/${job.id}`}>
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
