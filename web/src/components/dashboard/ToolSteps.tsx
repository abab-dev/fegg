"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Loader2, Terminal, FileCode2 } from "lucide-react"

interface Step {
    id?: string
    type: string
    title: string
    status: string
}

interface ToolStepsProps {
    steps: Step[]
}

export function ToolSteps({ steps }: ToolStepsProps) {
    const [expanded, setExpanded] = useState(false)
    const toolSteps = steps.filter(s => s.type === 'tool')

    if (toolSteps.length === 0) return null

    const latestStep = toolSteps[toolSteps.length - 1]

    const getIcon = (step: Step) => {
        if (step.status === "running") return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        if (step.title.toLowerCase().includes("run") || step.title.toLowerCase().includes("command")) {
            return <Terminal className="h-4 w-4 text-zinc-500" />
        }
        return <FileCode2 className="h-4 w-4 text-zinc-500" />
    }

    if (!expanded) {
        return (
            <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 my-2 w-full max-w-md">
                <div className="flex items-center gap-3 min-w-0">
                    {getIcon(latestStep)}
                    <span className="text-[13px] text-zinc-400 truncate">{latestStep.title}</span>
                </div>
                {toolSteps.length > 1 && (
                    <button
                        onClick={() => setExpanded(true)}
                        className="text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-all duration-200 ml-3 flex-shrink-0"
                    >
                        Show all
                    </button>
                )}
            </div>
        )
    }

    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden my-2 w-full max-w-md animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/50 bg-zinc-900/50">
                <span className="text-[11px] font-medium text-zinc-500">Activity ({toolSteps.length})</span>
                <button
                    onClick={() => setExpanded(false)}
                    className="text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-all duration-200"
                >
                    Hide
                </button>
            </div>
            <div className="max-h-[200px] overflow-y-auto py-1 scrollbar-thin">
                {toolSteps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-800/30 transition-colors">
                        {getIcon(step)}
                        <span className={cn(
                            "text-[13px] truncate flex-1",
                            step.status === "running" ? "text-blue-300" : "text-zinc-400"
                        )}>
                            {step.title}
                        </span>
                        {step.status === "done" && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/50 flex-shrink-0" />}
                    </div>
                ))}
            </div>
        </div>
    )
}
