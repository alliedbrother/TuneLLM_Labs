import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Zap, ArrowRight, Database, Sparkles, Cpu, Box, Github } from "lucide-react"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold">FineTune Studio</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground">
              Features
            </Link>
            <Link href="#" className="text-sm text-muted-foreground hover:text-foreground">
              Docs
            </Link>
            <Link href="#" className="text-sm text-muted-foreground hover:text-foreground">
              GitHub
            </Link>
            <Button asChild>
              <Link href="/dashboard">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden py-24 md:py-32">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
        <div className="container relative mx-auto px-4 text-center">
          <h1 className="mx-auto max-w-4xl text-balance text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
            Fine-tune LLMs <span className="text-primary">on your own hardware</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl">
            The open-source platform for fine-tuning large language models with LoRA, QLoRA, and RLHF. Full control, no
            vendor lock-in.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/dashboard">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#">
                <Github className="mr-2 h-4 w-4" />
                View on GitHub
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-3xl font-bold">Everything you need</h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
            A complete platform for fine-tuning, evaluating, and deploying your custom LLMs.
          </p>
          <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Database,
                title: "Dataset Management",
                description: "Upload and manage datasets in JSON, CSV, or text formats with automatic preprocessing.",
              },
              {
                icon: Sparkles,
                title: "Multiple Methods",
                description: "Support for LoRA, QLoRA, full fine-tuning, and RLHF (DPO/PPO) out of the box.",
              },
              {
                icon: Cpu,
                title: "Bring Your Hardware",
                description: "Connect any GPU machine or cloud VM. No vendor lock-in or expensive managed services.",
              },
              {
                icon: Box,
                title: "Model Registry",
                description: "Track all your fine-tuned models with versioning, metrics, and one-click deployment.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border py-24">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold">Ready to fine-tune?</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Start building custom LLMs in minutes. Free and open source forever.
          </p>
          <Button size="lg" className="mt-8" asChild>
            <Link href="/dashboard">
              Launch Studio <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
