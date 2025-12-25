import { Link } from 'react-router-dom';
import { Activity, Box, Cpu, Database, Plus, ArrowUpRight, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useJobs, useDatasets, useModels, useHardwareNodes } from '../hooks/useApi';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';

const gpuUsageData = [
  { time: '00:00', usage: 45 },
  { time: '04:00', usage: 78 },
  { time: '08:00', usage: 92 },
  { time: '12:00', usage: 85 },
  { time: '16:00', usage: 71 },
  { time: '20:00', usage: 88 },
  { time: 'Now', usage: 82 },
];

const statusConfig = {
  pending: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
  running: { icon: Activity, color: 'text-chart-2', bg: 'bg-chart-2/10' },
  completed: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
  failed: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
};

export default function DashboardPage() {
  const { data: jobsData } = useJobs(1, 5);
  const { data: datasetsData } = useDatasets(1, 100);
  const { data: modelsData } = useModels(1, 100);
  const { data: nodes } = useHardwareNodes();

  const runningJobs = jobsData?.items.filter((j) => j.status === 'running').length || 0;
  const onlineNodes = nodes?.filter((n) => n.status === 'online').length || 0;

  const stats = [
    { label: 'Active Jobs', value: runningJobs.toString(), icon: Activity, change: `${jobsData?.total || 0} total jobs` },
    { label: 'Models Trained', value: (modelsData?.total || 0).toString(), icon: Box, change: 'Ready to deploy' },
    { label: 'Datasets', value: (datasetsData?.total || 0).toString(), icon: Database, change: 'Available for training' },
    { label: 'GPU Nodes', value: onlineNodes.toString(), icon: Cpu, change: `${nodes?.length || 0} total nodes` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your fine-tuning projects</p>
        </div>
        <Button asChild>
          <Link to="/fine-tuning">
            <Plus className="mr-2 h-4 w-4" />
            New Job
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <stat.icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{stat.change}</span>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Jobs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Jobs</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/jobs">
                View all <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {jobsData?.items.length ? (
              <div className="space-y-4">
                {jobsData.items.map((job) => {
                  const config = statusConfig[job.status as keyof typeof statusConfig] || statusConfig.pending;
                  return (
                    <div key={job.id} className="flex items-center gap-4 rounded-lg border border-border p-4">
                      <div className={`rounded-full p-2 ${config.bg}`}>
                        <config.icon className={`h-4 w-4 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{job.name}</p>
                          <Badge variant="secondary" className="text-xs">
                            {job.method}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {job.base_model} • Started {new Date(job.created_at).toLocaleDateString()}
                        </p>
                        {job.status === 'running' && <Progress value={job.progress || 0} className="mt-2 h-1" />}
                      </div>
                      <span className="text-sm capitalize text-muted-foreground">{job.status}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Activity className="w-12 h-12 mx-auto text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">No training jobs yet</p>
                <p className="text-sm text-muted-foreground">
                  Create your first fine-tuning job to get started
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* GPU Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">GPU Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={gpuUsageData}>
                  <defs>
                    <linearGradient id="gpuGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'var(--foreground)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="usage"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill="url(#gpuGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
