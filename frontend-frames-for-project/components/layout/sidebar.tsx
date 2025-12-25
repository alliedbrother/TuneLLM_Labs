"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Database,
  Sparkles,
  Activity,
  Box,
  Cpu,
  MessageSquare,
  Settings,
  ChevronDown,
  Zap,
} from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useState } from "react"

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Datasets", href: "/dashboard/datasets", icon: Database },
  { label: "Fine-Tuning", href: "/dashboard/fine-tuning", icon: Sparkles },
  { label: "Jobs", href: "/dashboard/jobs", icon: Activity },
  { label: "Models", href: "/dashboard/models", icon: Box },
  { label: "Hardware", href: "/dashboard/hardware", icon: Cpu },
  { label: "Playground", href: "/dashboard/playground", icon: MessageSquare },
]

export function Sidebar() {
  const pathname = usePathname()
  const [projectOpen, setProjectOpen] = useState(true)

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-sidebar">
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-border px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold text-foreground">FineTune Studio</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <Collapsible open={projectOpen} onOpenChange={setProjectOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
              <span>My Project</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", projectOpen && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="border-t border-border p-4">
          <Link
            href="/dashboard/settings"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              pathname === "/dashboard/settings"
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </div>
    </aside>
  )
}
