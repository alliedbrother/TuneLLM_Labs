import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Square, Clock, CheckCircle2, AlertCircle, Activity, Server, Settings } from 'lucide-react';
import { useJob, useJobLogs, useCancelJob } from '../hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

const statusConfig = {
  pending: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Pending' },
  queued: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Queued' },
  running: { icon: Activity, color: 'text-chart-2', bg: 'bg-chart-2/10', label: 'Running' },
  completed: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Completed' },
  failed: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Failed' },
  cancelled: { icon: AlertCircle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Cancelled' },
};

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading } = useJob(Number(jobId));
  const { data: logs } = useJobLogs(Number(jobId));
  const cancelMutation = useCancelJob();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Job not found</p>
      </div>
    );
  }

  const config = statusConfig[job.status] || statusConfig.pending;
  const StatusIcon = config.icon;

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/jobs')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{job.name}</h1>
              <Badge className={`${config.bg} ${config.color} border-none`}>
                <StatusIcon className="mr-1 h-3 w-3" />
                {config.label}
              </Badge>
            </div>
            <p className="text-muted-foreground">{job.base_model}</p>
          </div>
        </div>
        {(job.status === 'pending' || job.status === 'running' || job.status === 'queued') && (
          <Button
            variant="destructive"
            onClick={() => cancelMutation.mutate(job.id)}
            disabled={cancelMutation.isPending}
          >
            <Square className="mr-2 h-4 w-4" />
            Cancel Job
          </Button>
        )}
      </div>

      {/* Progress */}
      {job.status === 'running' && job.progress !== undefined && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Training Progress</span>
              <span className="text-sm text-muted-foreground">{job.progress}%</span>
            </div>
            <Progress value={job.progress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Details Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-primary" />
              Job Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Method</dt>
                <dd>
                  <Badge variant="secondary">{job.method.toUpperCase()}</Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Created</dt>
                <dd className="font-medium">{formatDate(job.created_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Started</dt>
                <dd className="font-medium">{formatDate(job.started_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Completed</dt>
                <dd className="font-medium">{formatDate(job.completed_at)}</dd>
              </div>
              {job.node_id && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    Node
                  </dt>
                  <dd className="font-medium">Node #{job.node_id}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings className="h-5 w-5 text-primary" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <pre className="bg-muted p-4 rounded-lg text-sm font-mono overflow-x-auto">
                {JSON.stringify(job.config, null, 2)}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Error Message */}
      {job.error_message && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{job.error_message}</p>
          </CardContent>
        </Card>
      )}

      {/* Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Training Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96 rounded-lg bg-card border border-border">
            <div className="p-4 font-mono text-sm">
              {logs?.length ? (
                logs.map((log) => (
                  <div key={log.id} className="flex py-0.5">
                    <span className="text-muted-foreground mr-4 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={
                        log.level === 'error'
                          ? 'text-destructive'
                          : log.level === 'warning'
                          ? 'text-warning'
                          : 'text-foreground'
                      }
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">No logs available</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
