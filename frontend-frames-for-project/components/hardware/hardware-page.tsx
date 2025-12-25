"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Plus,
  Server,
  MoreHorizontal,
  Trash2,
  RefreshCw,
  Cpu,
  HardDrive,
  Activity,
  Wifi,
  WifiOff,
  Copy,
} from "lucide-react"

const nodes = [
  {
    id: "node-1",
    name: "GPU Server 1",
    host: "192.168.1.100",
    status: "online",
    gpus: [
      { name: "NVIDIA A100 80GB", memory: 80, used: 45, temp: 62 },
      { name: "NVIDIA A100 80GB", memory: 80, used: 78, temp: 71 },
      { name: "NVIDIA A100 80GB", memory: 80, used: 0, temp: 35 },
      { name: "NVIDIA A100 80GB", memory: 80, used: 0, temp: 34 },
    ],
    cpuUsage: 34,
    ramUsage: 42,
    diskUsage: 67,
    runningJobs: 1,
    lastSeen: "Just now",
  },
  {
    id: "node-2",
    name: "Cloud VM",
    host: "cloud-gpu-001.example.com",
    status: "online",
    gpus: [
      { name: "NVIDIA RTX 4090", memory: 24, used: 18, temp: 68 },
      { name: "NVIDIA RTX 4090", memory: 24, used: 0, temp: 42 },
    ],
    cpuUsage: 12,
    ramUsage: 28,
    diskUsage: 45,
    runningJobs: 0,
    lastSeen: "2 min ago",
  },
  {
    id: "node-3",
    name: "Dev Workstation",
    host: "192.168.1.50",
    status: "offline",
    gpus: [{ name: "NVIDIA RTX 3090", memory: 24, used: 0, temp: 0 }],
    cpuUsage: 0,
    ramUsage: 0,
    diskUsage: 78,
    runningJobs: 0,
    lastSeen: "3 hours ago",
  },
]

export function HardwarePage() {
  const [registerOpen, setRegisterOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hardware Nodes</h1>
          <p className="text-muted-foreground">Manage your GPU infrastructure</p>
        </div>
        <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Register Node
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Register GPU Node</DialogTitle>
              <DialogDescription>Add a new GPU machine to your cluster</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Node Name</Label>
                <Input placeholder="My GPU Server" />
              </div>
              <div className="space-y-2">
                <Label>Host Address</Label>
                <Input placeholder="192.168.1.100 or hostname" />
              </div>
              <div className="space-y-2">
                <Label>Agent Token</Label>
                <div className="flex gap-2">
                  <Input readOnly value="ftk_a1b2c3d4e5f6g7h8i9j0..." className="font-mono text-sm" />
                  <Button variant="outline" size="icon">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Run the agent on your GPU machine with this token</p>
              </div>
              <div className="rounded-lg bg-secondary p-4">
                <p className="text-sm font-medium mb-2">Quick Setup</p>
                <code className="text-xs text-muted-foreground block">
                  curl -sSL https://finetune.studio/install.sh | bash -s -- --token ftk_a1b2c3...
                </code>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRegisterOpen(false)}>
                Cancel
              </Button>
              <Button>Register</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6">
        {nodes.map((node) => (
          <Card key={node.id}>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                      node.status === "online" ? "bg-success/10" : "bg-muted"
                    }`}
                  >
                    <Server
                      className={`h-6 w-6 ${node.status === "online" ? "text-success" : "text-muted-foreground"}`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">{node.name}</CardTitle>
                      <Badge
                        className={
                          node.status === "online"
                            ? "bg-success/10 text-success hover:bg-success/20"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {node.status === "online" ? (
                          <Wifi className="mr-1 h-3 w-3" />
                        ) : (
                          <WifiOff className="mr-1 h-3 w-3" />
                        )}
                        {node.status}
                      </Badge>
                      {node.runningJobs > 0 && (
                        <Badge variant="secondary">
                          <Activity className="mr-1 h-3 w-3" />
                          {node.runningJobs} job running
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {node.host} • Last seen: {node.lastSeen}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh Status
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Node
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              {/* GPUs */}
              <div className="mb-6">
                <p className="text-sm font-medium mb-3">GPUs ({node.gpus.length})</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {node.gpus.map((gpu, idx) => (
                    <div key={idx} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Cpu className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">GPU {idx}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{gpu.name}</p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>Memory</span>
                          <span>
                            {gpu.used}GB / {gpu.memory}GB
                          </span>
                        </div>
                        <Progress value={(gpu.used / gpu.memory) * 100} className="h-1.5" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{gpu.temp > 0 ? `${gpu.temp}°C` : "-"}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* System Stats */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      CPU Usage
                    </span>
                    <span>{node.cpuUsage}%</span>
                  </div>
                  <Progress value={node.cpuUsage} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      RAM Usage
                    </span>
                    <span>{node.ramUsage}%</span>
                  </div>
                  <Progress value={node.ramUsage} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <HardDrive className="h-4 w-4" />
                      Disk Usage
                    </span>
                    <span>{node.diskUsage}%</span>
                  </div>
                  <Progress value={node.diskUsage} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
