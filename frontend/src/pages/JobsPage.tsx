import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, Clock, AlertCircle, Plus, ArrowUpRight } from 'lucide-react';
import { useJobs } from '../hooks/useApi';
import type { FineTuneJob } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const statusConfig = {
  pending: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Pending' },
  queued: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Queued' },
  running: { icon: Activity, color: 'text-chart-2', bg: 'bg-chart-2/10', label: 'Running' },
  completed: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Completed' },
  failed: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Failed' },
  cancelled: { icon: AlertCircle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Cancelled' },
};

export default function JobsPage() {
  const { data: jobsData, isLoading } = useJobs();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Training Jobs</h1>
          <p className="text-muted-foreground">Manage your fine-tuning jobs</p>
        </div>
        <Button asChild>
          <Link to="/fine-tuning">
            <Plus className="mr-2 h-4 w-4" />
            New Job
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            </div>
          ) : jobsData?.items.length ? (
            <div className="space-y-4">
              {jobsData.items.map((job: FineTuneJob) => {
                const config = statusConfig[job.status] || statusConfig.pending;
                return (
                  <div key={job.id} className="flex items-center gap-4 rounded-lg border border-border p-4">
                    <div className={`rounded-full p-2 ${config.bg}`}>
                      <config.icon className={`h-4 w-4 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{job.name}</p>
                        <Badge variant="secondary" className="text-xs">
                          {job.method.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {job.base_model} • Started {new Date(job.created_at).toLocaleDateString()}
                      </p>
                      {job.status === 'running' && (
                        <Progress
                          value={job.total_steps ? (job.current_step / job.total_steps) * 100 : (job.current_epoch / job.total_epochs) * 100}
                          className="mt-2 h-1"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge
                        variant="secondary"
                        className={`${config.bg} ${config.color} border-none`}
                      >
                        {config.label}
                      </Badge>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/jobs/${job.id}`}>
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Activity className="w-12 h-12 mx-auto text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">No training jobs yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first fine-tuning job to get started
              </p>
              <Button className="mt-4" asChild>
                <Link to="/fine-tuning">
                  <Plus className="mr-2 h-4 w-4" />
                  New Job
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
