"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Send, RefreshCw, Copy, Sparkles, Settings2 } from "lucide-react"

const deployedModels = [{ id: "model-001", name: "llama-2-7b-chat-lora-v1", baseModel: "Llama-2-7B" }]

const examplePrompts = [
  "Explain quantum computing in simple terms.",
  "Write a Python function to sort a list using quicksort.",
  "What are the benefits of fine-tuning LLMs?",
  "Create a haiku about machine learning.",
]

export function PlaygroundPage() {
  const [selectedModel, setSelectedModel] = useState(deployedModels[0]?.id || "")
  const [prompt, setPrompt] = useState("")
  const [response, setResponse] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [temperature, setTemperature] = useState([0.7])
  const [maxTokens, setMaxTokens] = useState([256])
  const [topP, setTopP] = useState([0.9])

  const handleGenerate = () => {
    setIsGenerating(true)
    // Simulate response
    setTimeout(() => {
      setResponse(
        `This is a simulated response from the model. In a real implementation, this would be the actual output from your fine-tuned LLM.\n\nYour prompt was: "${prompt}"\n\nThe model would process this and generate a contextually appropriate response based on its training. Fine-tuned models can provide specialized knowledge and follow specific instruction formats better than base models.`,
      )
      setIsGenerating(false)
    }, 1500)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Model Playground</h1>
        <p className="text-muted-foreground">Test your deployed models with interactive prompts</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Main Chat Area */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Model Output
                </CardTitle>
                {response && (
                  <Button variant="ghost" size="sm">
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] rounded-lg border border-border bg-secondary/50 p-4">
                {response ? (
                  <p className="whitespace-pre-wrap text-sm">{response}</p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Enter a prompt below and click Generate to see the model's response.
                  </p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="w-[300px]">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {deployedModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    {examplePrompts.slice(0, 2).map((example, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        onClick={() => setPrompt(example)}
                        className="text-xs"
                      >
                        {example.slice(0, 25)}...
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  <Textarea
                    placeholder="Enter your prompt here..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="min-h-[120px] pr-24 resize-none"
                  />
                  <Button
                    className="absolute bottom-3 right-3"
                    onClick={handleGenerate}
                    disabled={!prompt || isGenerating || !selectedModel}
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Generate
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Settings Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Temperature</Label>
                  <span className="text-sm font-mono">{temperature[0]}</span>
                </div>
                <Slider value={temperature} onValueChange={setTemperature} min={0} max={2} step={0.1} />
                <p className="text-xs text-muted-foreground">Higher = more creative, lower = more focused</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Max Tokens</Label>
                  <span className="text-sm font-mono">{maxTokens[0]}</span>
                </div>
                <Slider value={maxTokens} onValueChange={setMaxTokens} min={64} max={2048} step={64} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Top P</Label>
                  <span className="text-sm font-mono">{topP[0]}</span>
                </div>
                <Slider value={topP} onValueChange={setTopP} min={0} max={1} step={0.05} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Example Prompts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {examplePrompts.map((example, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPrompt(example)}
                    className="w-full text-left text-xs text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-secondary transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
