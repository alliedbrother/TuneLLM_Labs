"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Search, MoreHorizontal, Eye, StopCircle, Trash2, Activity, CheckCircle2, Clock, XCircle } from "lucide-react"
import Link from "next/link"

const jobs = [
  {
    id: "job-001",
    name: "llama-2-7b-chat-lora",
    status: "running",
    progress: 67,
    model: "Llama-2-7B",
    method: "LoRA",
    dataset: "alpaca-instruct",
    node: "GPU Server 1",
    started: "2024-01-15 14:32",
    eta: "~45 min",
    loss: 0.342,
  },
  {
    id: "job-002",
    name: "mistral-7b-instruct",
    status: "completed",
    progress: 100,
    model: "Mistral-7B",
    method: "QLoRA",
    dataset: "code-assistant-v2",
    node: "Cloud VM",
    started: "2024-01-15 09:15",
    eta: "-",
    loss: 0.218,
  },
  {
    id: "job-003",
    name: "falcon-7b-dpo",
    status: "queued",
    progress: 0,
    model: "Falcon-7B",
    method: "DPO",
    dataset: "preference-pairs",
    node: "GPU Server 1",
    started: "-",
    eta: "Waiting",
    loss: null,
  },
  {
    id: "job-004",
    name: "gpt-j-full-ft",
    status: "failed",
    progress: 23,
    model: "GPT-J-6B",
    method: "Full",
    dataset: "domain-corpus",
    node: "Cloud VM",
    started: "2024-01-14 22:00",
    eta: "-",
    loss: null,
    error: "CUDA out of memory",
  },
  {
    id: "job-005",
    name: "llama-2-13b-qlora",
    status: "completed",
    progress: 100,
    model: "Llama-2-13B",
    method: "QLoRA",
    dataset: "alpaca-instruct",
    node: "GPU Server 1",
    started: "2024-01-14 08:00",
    eta: "-",
    loss: 0.195,
  },
]

const statusConfig = {
  running: { icon: Activity, color: "text-chart-2", bg: "bg-chart-2/10", label: "Running" },
  completed: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10", label: "Completed" },
  queued: { icon: Clock, color: "text-warning", bg: "bg-warning/10", label: "Queued" },
  failed: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Failed" },
}

export function JobsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch = job.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || job.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const counts = {
    all: jobs.length,
    running: jobs.filter((j) => j.status === "running").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    queued: jobs.filter((j) => j.status === "queued").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Training Jobs</h1>
        <p className="text-muted-foreground">Monitor and manage your fine-tuning jobs</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
                <TabsTrigger value="running">Running ({counts.running})</TabsTrigger>
                <TabsTrigger value="completed">Completed ({counts.completed})</TabsTrigger>
                <TabsTrigger value="queued">Queued ({counts.queued})</TabsTrigger>
                <TabsTrigger value="failed">Failed ({counts.failed})</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search jobs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Loss</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.map((job) => {
                const config = statusConfig[job.status as keyof typeof statusConfig]
                return (
                  <TableRow key={job.id}>
                    <TableCell>
                      <Link href={`/dashboard/jobs/${job.id}`} className="font-medium hover:text-primary">
                        {job.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{job.node}</p>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${config.bg} ${config.color} hover:${config.bg}`}>
                        <config.icon className="mr-1 h-3 w-3" />
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={job.progress} className="h-2 w-20" />
                        <span className="text-sm text-muted-foreground">{job.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{job.model}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{job.method}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{job.loss !== null ? job.loss.toFixed(3) : "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{job.eta}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/jobs/${job.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          {job.status === "running" && (
                            <DropdownMenuItem className="text-destructive">
                              <StopCircle className="mr-2 h-4 w-4" />
                              Stop Job
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
