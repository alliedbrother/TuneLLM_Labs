"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ArrowLeft, Activity, StopCircle, Download, Terminal, LineChart } from "lucide-react"
import Link from "next/link"
import {
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"

const job = {
  id: "job-001",
  name: "llama-2-7b-chat-lora",
  status: "running",
  progress: 67,
  model: "Llama-2-7B",
  method: "LoRA",
  dataset: "alpaca-instruct",
  node: "GPU Server 1",
  started: "2024-01-15 14:32:00",
  config: {
    loraRank: 16,
    loraAlpha: 32,
    learningRate: 0.0002,
    epochs: 3,
    batchSize: 4,
    gradientAccum: 4,
  },
}

const lossData = [
  { step: 0, loss: 2.8 },
  { step: 100, loss: 2.1 },
  { step: 200, loss: 1.6 },
  { step: 300, loss: 1.2 },
  { step: 400, loss: 0.9 },
  { step: 500, loss: 0.65 },
  { step: 600, loss: 0.48 },
  { step: 700, loss: 0.38 },
  { step: 800, loss: 0.34 },
]

const logs = `[2024-01-15 14:32:00] Starting fine-tuning job: llama-2-7b-chat-lora
[2024-01-15 14:32:01] Loading base model: meta-llama/Llama-2-7b-hf
[2024-01-15 14:32:15] Model loaded successfully
[2024-01-15 14:32:16] Configuring LoRA adapter (r=16, alpha=32)
[2024-01-15 14:32:17] Loading dataset: alpaca-instruct (52,000 samples)
[2024-01-15 14:32:25] Dataset tokenized and batched
[2024-01-15 14:32:26] Starting training...
[2024-01-15 14:32:26] Epoch 1/3
[2024-01-15 14:35:00] Step 100/1200 | Loss: 2.1032 | LR: 0.0002
[2024-01-15 14:37:30] Step 200/1200 | Loss: 1.5847 | LR: 0.0002
[2024-01-15 14:40:00] Step 300/1200 | Loss: 1.2103 | LR: 0.0002
[2024-01-15 14:42:30] Step 400/1200 | Loss: 0.8954 | LR: 0.00019
[2024-01-15 14:45:00] Epoch 2/3
[2024-01-15 14:47:30] Step 500/1200 | Loss: 0.6521 | LR: 0.00018
[2024-01-15 14:50:00] Step 600/1200 | Loss: 0.4832 | LR: 0.00016
[2024-01-15 14:52:30] Step 700/1200 | Loss: 0.3847 | LR: 0.00014
[2024-01-15 14:55:00] Step 800/1200 | Loss: 0.3421 | LR: 0.00012
[2024-01-15 14:55:01] Checkpoint saved: checkpoint-800`

export function JobDetailPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/jobs">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{job.name}</h1>
              <Badge className="bg-chart-2/10 text-chart-2 hover:bg-chart-2/20">
                <Activity className="mr-1 h-3 w-3" />
                Running
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {job.model} • {job.method} • {job.node}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download Checkpoint
          </Button>
          <Button variant="destructive">
            <StopCircle className="mr-2 h-4 w-4" />
            Stop Job
          </Button>
        </div>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground">Training Progress</p>
              <p className="text-2xl font-bold">{job.progress}%</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Step</p>
              <p className="text-2xl font-bold">800 / 1200</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Current Loss</p>
              <p className="text-2xl font-bold font-mono">0.342</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">ETA</p>
              <p className="text-2xl font-bold">~45 min</p>
            </div>
          </div>
          <Progress value={job.progress} className="h-3" />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Charts and Logs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="metrics">
            <TabsList>
              <TabsTrigger value="metrics">
                <LineChart className="mr-2 h-4 w-4" />
                Metrics
              </TabsTrigger>
              <TabsTrigger value="logs">
                <Terminal className="mr-2 h-4 w-4" />
                Logs
              </TabsTrigger>
            </TabsList>
            <TabsContent value="metrics" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Training Loss</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsLineChart data={lossData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="step" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                        />
                        <Line type="monotone" dataKey="loss" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                      </RechartsLineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="logs" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Training Logs</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] w-full rounded-lg border border-border bg-secondary p-4">
                    <pre className="font-mono text-xs text-foreground whitespace-pre-wrap">{logs}</pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Config Sidebar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base Model</span>
              <span className="font-medium">{job.model}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Method</span>
              <Badge variant="secondary">{job.method}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dataset</span>
              <span className="font-medium">{job.dataset}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Started</span>
              <span className="text-sm">{job.started}</span>
            </div>
            <hr className="border-border" />
            <div className="flex justify-between">
              <span className="text-muted-foreground">LoRA Rank</span>
              <span className="font-mono">{job.config.loraRank}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">LoRA Alpha</span>
              <span className="font-mono">{job.config.loraAlpha}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Learning Rate</span>
              <span className="font-mono">{job.config.learningRate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Epochs</span>
              <span className="font-mono">{job.config.epochs}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Batch Size</span>
              <span className="font-mono">{job.config.batchSize}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gradient Accum</span>
              <span className="font-mono">{job.config.gradientAccum}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
