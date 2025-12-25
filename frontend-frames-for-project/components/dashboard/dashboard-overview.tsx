"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Activity, Box, Cpu, Database, Plus, ArrowUpRight, CheckCircle2, Clock, AlertCircle } from "lucide-react"
import Link from "next/link"
import { Progress } from "@/components/ui/progress"
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"

const stats = [
  { label: "Active Jobs", value: "3", icon: Activity, change: "+2 today" },
  { label: "Models Trained", value: "12", icon: Box, change: "+1 this week" },
  { label: "Datasets", value: "8", icon: Database, change: "3 in use" },
  { label: "GPU Nodes", value: "2", icon: Cpu, change: "1 online" },
]

const recentJobs = [
  {
    id: "job-001",
    name: "llama-2-7b-chat-lora",
    status: "running",
    progress: 67,
    model: "Llama-2-7B",
    method: "LoRA",
    started: "2 hours ago",
  },
  {
    id: "job-002",
    name: "mistral-7b-instruct",
    status: "completed",
    progress: 100,
    model: "Mistral-7B",
    method: "QLoRA",
    started: "5 hours ago",
  },
  {
    id: "job-003",
    name: "falcon-7b-dpo",
    status: "queued",
    progress: 0,
    model: "Falcon-7B",
    method: "DPO",
    started: "Just now",
  },
]

const gpuUsageData = [
  { time: "00:00", usage: 45 },
  { time: "04:00", usage: 78 },
  { time: "08:00", usage: 92 },
  { time: "12:00", usage: 85 },
  { time: "16:00", usage: 71 },
  { time: "20:00", usage: 88 },
  { time: "Now", usage: 82 },
]

const statusConfig = {
  running: { icon: Activity, color: "text-chart-2", bg: "bg-chart-2/10" },
  completed: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
  queued: { icon: Clock, color: "text-warning", bg: "bg-warning/10" },
  failed: { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10" },
}

export function DashboardOverview() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your fine-tuning projects</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/fine-tuning">
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
              <Link href="/dashboard/jobs">
                View all <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentJobs.map((job) => {
                const config = statusConfig[job.status as keyof typeof statusConfig]
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
                        {job.model} • {job.started}
                      </p>
                      {job.status === "running" && <Progress value={job.progress} className="mt-2 h-1" />}
                    </div>
                    <span className="text-sm capitalize text-muted-foreground">{job.status}</span>
                  </div>
                )
              })}
            </div>
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
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="usage"
                    stroke="hsl(var(--chart-1))"
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
  )
}
