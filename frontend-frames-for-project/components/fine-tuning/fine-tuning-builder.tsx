"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Rocket, Sparkles, Settings2, Database, Cpu, Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const baseModels = [
  { id: "llama-2-7b", name: "Llama 2 7B", params: "7B", recommended: true },
  { id: "llama-2-13b", name: "Llama 2 13B", params: "13B" },
  { id: "mistral-7b", name: "Mistral 7B", params: "7B", recommended: true },
  { id: "falcon-7b", name: "Falcon 7B", params: "7B" },
  { id: "gpt-j-6b", name: "GPT-J 6B", params: "6B" },
  { id: "qwen-7b", name: "Qwen 7B", params: "7B" },
]

const tuningMethods = [
  { id: "lora", name: "LoRA", description: "Low-Rank Adaptation - efficient fine-tuning" },
  { id: "qlora", name: "QLoRA", description: "4-bit quantized LoRA for memory efficiency" },
  { id: "full", name: "Full Fine-tune", description: "Train all model parameters" },
  { id: "dpo", name: "DPO (RLHF)", description: "Direct Preference Optimization" },
]

const datasets = [
  { id: "ds-001", name: "alpaca-instruct", samples: "52k" },
  { id: "ds-002", name: "code-assistant-v2", samples: "128k" },
  { id: "ds-003", name: "preference-pairs", samples: "10k" },
]

const hardwareNodes = [
  { id: "node-1", name: "GPU Server 1", gpus: "4x A100 80GB", status: "online" },
  { id: "node-2", name: "Cloud VM", gpus: "2x RTX 4090", status: "online" },
]

export function FineTuningBuilder() {
  const [selectedModel, setSelectedModel] = useState("")
  const [selectedMethod, setSelectedMethod] = useState("lora")
  const [selectedDataset, setSelectedDataset] = useState("")
  const [selectedNode, setSelectedNode] = useState("")
  const [loraRank, setLoraRank] = useState([16])
  const [loraAlpha, setLoraAlpha] = useState([32])
  const [learningRate, setLearningRate] = useState([0.0002])
  const [epochs, setEpochs] = useState([3])
  const [batchSize, setBatchSize] = useState([4])
  const [gradientAccum, setGradientAccum] = useState([4])
  const [useGradientCheckpoint, setUseGradientCheckpoint] = useState(true)
  const [useFp16, setUseFp16] = useState(true)

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">New Fine-Tuning Job</h1>
            <p className="text-muted-foreground">Configure and launch a new training run</p>
          </div>
          <Button size="lg" disabled={!selectedModel || !selectedDataset || !selectedNode}>
            <Rocket className="mr-2 h-4 w-4" />
            Launch Job
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Base Model */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Base Model
                </CardTitle>
                <CardDescription>Select the foundation model to fine-tune</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {baseModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      className={`relative rounded-lg border p-4 text-left transition-colors ${
                        selectedModel === model.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {model.recommended && (
                        <Badge className="absolute -top-2 right-2 bg-chart-2 text-chart-2-foreground">
                          Recommended
                        </Badge>
                      )}
                      <p className="font-medium">{model.name}</p>
                      <p className="text-sm text-muted-foreground">{model.params} params</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tuning Method */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings2 className="h-5 w-5 text-primary" />
                  Tuning Method
                </CardTitle>
                <CardDescription>Choose how to fine-tune the model</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={selectedMethod} onValueChange={setSelectedMethod}>
                  <TabsList className="grid w-full grid-cols-4">
                    {tuningMethods.map((method) => (
                      <TabsTrigger key={method.id} value={method.id}>
                        {method.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {tuningMethods.map((method) => (
                    <TabsContent key={method.id} value={method.id}>
                      <p className="text-sm text-muted-foreground mt-4">{method.description}</p>
                    </TabsContent>
                  ))}
                </Tabs>

                {(selectedMethod === "lora" || selectedMethod === "qlora") && (
                  <div className="mt-6 space-y-6">
                    <Separator />
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="flex items-center gap-2">
                            LoRA Rank (r)
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-3 w-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                Higher rank = more parameters, better quality but more memory
                              </TooltipContent>
                            </Tooltip>
                          </Label>
                          <span className="text-sm font-mono">{loraRank[0]}</span>
                        </div>
                        <Slider value={loraRank} onValueChange={setLoraRank} min={4} max={64} step={4} />
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="flex items-center gap-2">
                            LoRA Alpha
                            <Tooltip>
                              <TooltipTrigger>
                                <Info className="h-3 w-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>Scaling factor for LoRA weights. Usually 2x rank.</TooltipContent>
                            </Tooltip>
                          </Label>
                          <span className="text-sm font-mono">{loraAlpha[0]}</span>
                        </div>
                        <Slider value={loraAlpha} onValueChange={setLoraAlpha} min={8} max={128} step={8} />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dataset */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Database className="h-5 w-5 text-primary" />
                  Training Dataset
                </CardTitle>
                <CardDescription>Select the dataset to train on</CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a dataset" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((ds) => (
                      <SelectItem key={ds.id} value={ds.id}>
                        <div className="flex items-center gap-2">
                          <span>{ds.name}</span>
                          <span className="text-muted-foreground">({ds.samples} samples)</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Hardware */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Cpu className="h-5 w-5 text-primary" />
                  Hardware
                </CardTitle>
                <CardDescription>Select which GPU node to run on</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {hardwareNodes.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNode(node.id)}
                      className={`rounded-lg border p-4 text-left transition-colors ${
                        selectedNode === node.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{node.name}</p>
                        <Badge variant="secondary" className="bg-success/10 text-success">
                          {node.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{node.gpus}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Hyperparameters Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Hyperparameters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Learning Rate</Label>
                    <span className="text-sm font-mono">{learningRate[0]}</span>
                  </div>
                  <Slider
                    value={learningRate}
                    onValueChange={setLearningRate}
                    min={0.00001}
                    max={0.001}
                    step={0.00001}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Epochs</Label>
                    <span className="text-sm font-mono">{epochs[0]}</span>
                  </div>
                  <Slider value={epochs} onValueChange={setEpochs} min={1} max={10} step={1} />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Batch Size</Label>
                    <span className="text-sm font-mono">{batchSize[0]}</span>
                  </div>
                  <Slider value={batchSize} onValueChange={setBatchSize} min={1} max={32} step={1} />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Gradient Accumulation</Label>
                    <span className="text-sm font-mono">{gradientAccum[0]}</span>
                  </div>
                  <Slider value={gradientAccum} onValueChange={setGradientAccum} min={1} max={16} step={1} />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <Label htmlFor="gradient-checkpoint" className="flex-1">
                    Gradient Checkpointing
                  </Label>
                  <Switch
                    id="gradient-checkpoint"
                    checked={useGradientCheckpoint}
                    onCheckedChange={setUseGradientCheckpoint}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="fp16" className="flex-1">
                    FP16 Mixed Precision
                  </Label>
                  <Switch id="fp16" checked={useFp16} onCheckedChange={setUseFp16} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Job Name</CardTitle>
              </CardHeader>
              <CardContent>
                <Input placeholder="my-finetune-job" />
                <p className="mt-2 text-xs text-muted-foreground">A unique identifier for this training run</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
