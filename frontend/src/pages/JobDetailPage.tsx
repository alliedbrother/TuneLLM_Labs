import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Square, Clock, CheckCircle2, AlertCircle, Activity, Server, Settings, BarChart3, TrendingUp, TrendingDown, Download, Loader2 } from 'lucide-react';
import { useJob, useJobLogs, useCancelJob } from '../hooks/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const statusConfig: Record<string, { icon: typeof Clock; color: string; bg: string; label: string }> = {
  pending: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Pending' },
  queued: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10', label: 'Queued' },
  running: { icon: Activity, color: 'text-chart-2', bg: 'bg-chart-2/10', label: 'Running' },
  completed: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Completed' },
  failed: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Failed' },
  cancelled: { icon: AlertCircle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Cancelled' },
};

// Pipeline phases in order
const PIPELINE_PHASES = [
  { key: 'connecting', label: 'Connect' },
  { key: 'downloading_data', label: 'Data' },
  { key: 'installing_deps', label: 'Setup' },
  { key: 'loading_model', label: 'Load Model' },
  { key: 'evaluating_base', label: 'Baseline Eval' },
  { key: 'training', label: 'Training' },
  { key: 'saving_model', label: 'Save' },
  { key: 'evaluating_final', label: 'Final Eval' },
  { key: 'completed', label: 'Ready' },
];

function getPhaseIndex(phase: string | undefined | null): number {
  if (!phase) return -1;
  const idx = PIPELINE_PHASES.findIndex((p) => p.key === phase);
  return idx >= 0 ? idx : -1;
}

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
    return <div className="text-center py-12"><p className="text-muted-foreground">Job not found</p></div>;
  }

  const config = statusConfig[job.status] || statusConfig.pending;
  const StatusIcon = config.icon;
  const currentPhaseIdx = getPhaseIndex(job.phase);
  const isRunning = job.status === 'running';
  const isComplete = job.status === 'completed';
  const lossData = (job as any).loss_history || [];

  const formatDate = (d?: string) => d ? new Date(d).toLocaleString() : '-';

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
          <Button variant="destructive" onClick={() => cancelMutation.mutate(job.id)} disabled={cancelMutation.isPending}>
            <Square className="mr-2 h-4 w-4" /> Cancel Job
          </Button>
        )}
      </div>

      {/* Pipeline Progress Tracker */}
      {(isRunning || isComplete || job.phase) && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-1">
              {PIPELINE_PHASES.map((phase, i) => {
                const isDone = currentPhaseIdx > i || isComplete;
                const isCurrent = currentPhaseIdx === i && isRunning;
                return (
                  <div key={phase.key} className="flex-1 flex flex-col items-center">
                    <div className={`
                      w-full h-2 rounded-full mb-2
                      ${isDone ? 'bg-green-500' : isCurrent ? 'bg-primary animate-pulse' : 'bg-muted'}
                    `} />
                    <div className="flex items-center gap-1">
                      {isDone && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                      {isCurrent && <Loader2 className="h-3 w-3 text-primary animate-spin" />}
                      <span className={`text-xs ${isDone ? 'text-green-500' : isCurrent ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                        {phase.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Training Progress (live) */}
      {(isRunning && job.phase === 'training') && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Training Progress</span>
              <span className="text-sm text-muted-foreground">
                Epoch {job.current_epoch}/{job.total_epochs}
                {job.total_steps && ` · Step ${job.current_step}/${job.total_steps}`}
              </span>
            </div>
            <Progress
              value={job.total_steps ? (job.current_step / job.total_steps) * 100 : (job.current_epoch / job.total_epochs) * 100}
              className="h-2"
            />
            {(job.train_loss !== undefined && job.train_loss !== null) && (
              <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                <span>Train Loss: <strong className="text-foreground">{job.train_loss.toFixed(4)}</strong></span>
                {job.eval_loss !== undefined && job.eval_loss !== null && (
                  <span>Eval Loss: <strong className="text-foreground">{job.eval_loss.toFixed(4)}</strong></span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loss Chart */}
      {lossData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Training Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lossData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="step" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }}
                    labelStyle={{ color: 'var(--foreground)' }}
                    formatter={(value: number) => [value?.toFixed(4), 'Loss']}
                    labelFormatter={(label) => `Step ${label}`}
                  />
                  <Line type="monotone" dataKey="loss" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evaluation Metrics */}
      {(job.baseline_metrics || job.final_metrics) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-primary" />
              Evaluation Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Metric</th>
                    {job.baseline_metrics && <th className="px-4 py-2 text-left font-medium">Baseline</th>}
                    {job.final_metrics && <th className="px-4 py-2 text-left font-medium">Fine-tuned</th>}
                    {job.baseline_metrics && job.final_metrics && <th className="px-4 py-2 text-left font-medium">Change</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(() => {
                    const allKeys = new Set([
                      ...Object.keys(job.baseline_metrics || {}),
                      ...Object.keys(job.final_metrics || {}),
                    ]);
                    return Array.from(allKeys).sort().map((key) => {
                      const baseline = job.baseline_metrics?.[key];
                      const final_ = job.final_metrics?.[key];
                      const delta = baseline !== undefined && final_ !== undefined ? final_ - baseline : undefined;
                      const isImprovement = key === 'perplexity' ? (delta !== undefined && delta < 0) : (delta !== undefined && delta > 0);
                      return (
                        <tr key={key} className="hover:bg-muted/30">
                          <td className="px-4 py-2 font-medium">{key}</td>
                          {job.baseline_metrics && <td className="px-4 py-2 font-mono">{baseline !== undefined ? baseline.toFixed(4) : '-'}</td>}
                          {job.final_metrics && <td className="px-4 py-2 font-mono">{final_ !== undefined ? final_.toFixed(4) : '-'}</td>}
                          {job.baseline_metrics && job.final_metrics && (
                            <td className="px-4 py-2">
                              {delta !== undefined ? (
                                <span className={`flex items-center gap-1 font-mono ${isImprovement ? 'text-green-600' : 'text-red-500'}`}>
                                  {isImprovement ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                                  {delta > 0 ? '+' : ''}{delta.toFixed(4)}
                                </span>
                              ) : '-'}
                            </td>
                          )}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Details Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-primary" /> Job Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div className="flex justify-between"><dt className="text-muted-foreground">Method</dt><dd><Badge variant="secondary">{job.method.toUpperCase()}</Badge></dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Created</dt><dd className="font-medium">{formatDate(job.created_at)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Started</dt><dd className="font-medium">{formatDate(job.started_at)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Completed</dt><dd className="font-medium">{formatDate(job.finished_at)}</dd></div>
              {job.node_id && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground flex items-center gap-2"><Server className="h-4 w-4" /> Node</dt>
                  <dd className="font-medium">Node #{job.node_id}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings className="h-5 w-5 text-primary" /> Configuration
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

      {/* Download Model */}
      {isComplete && (
        <Card className="border-green-500/30">
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="font-medium text-green-500">Model Ready</p>
              <p className="text-sm text-muted-foreground">Fine-tuned LoRA adapter is available for download</p>
            </div>
            <Button onClick={async () => {
              try {
                const resp = await fetch(`/api/v1/finetune-jobs/${job.id}/download-model`, {
                  headers: { 'Authorization': `Bearer ${localStorage.getItem('tunellm-auth') ? JSON.parse(localStorage.getItem('tunellm-auth')!).state?.accessToken : ''}` },
                });
                if (!resp.ok) {
                  const err = await resp.json().catch(() => ({ detail: 'Download failed' }));
                  alert(err.detail || 'Download failed');
                  return;
                }
                const blob = await resp.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${job.name}-adapter.zip`;
                a.click();
                window.URL.revokeObjectURL(url);
              } catch {
                alert('Download failed');
              }
            }}>
              <Download className="h-4 w-4 mr-2" /> Download Model
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {job.error_message && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-destructive">
              <AlertCircle className="h-5 w-5" /> Error
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-destructive">{job.error_message}</p></CardContent>
        </Card>
      )}

      {/* Logs */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Training Logs</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-96 rounded-lg bg-card border border-border">
            <div className="p-4 font-mono text-sm">
              {logs?.length ? (
                logs.map((log) => (
                  <div key={log.id} className="flex py-0.5">
                    <span className="text-muted-foreground mr-4 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className={log.level === 'error' ? 'text-destructive' : log.level === 'warning' ? 'text-warning' : 'text-foreground'}>
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
