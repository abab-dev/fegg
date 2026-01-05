"use client"

import { cn } from "@/lib/utils"
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { MessagePart } from '@/store/chat'
import { FileCode, Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

interface MessageBubbleProps {
    role: 'user' | 'assistant'
    content: string
    parts?: MessagePart[]
    steps?: any[]
}

function ToolStep({ part }: { part: MessagePart & { type: 'tool' } }) {
    const isRunning = part.status === 'running'

    return (
        <div className="flex items-center gap-2 py-1.5 px-3 bg-secondary/20 rounded-lg border border-border/50 text-xs">
            {isRunning ? (
                <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
            ) : (
                <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className={cn(
                "font-medium",
                isRunning ? "text-primary" : "text-muted-foreground"
            )}>
                {part.title}
            </span>
            {!isRunning && (
                <Check className="h-3 w-3 text-chart-2 ml-auto" />
            )}
        </div>
    )
}

function ToolStepsGroup({ tools }: { tools: (MessagePart & { type: 'tool' })[] }) {
    const [expanded, setExpanded] = useState(false)
    const showCount = 3
    const hasMore = tools.length > showCount
    const visibleTools = expanded ? tools : tools.slice(0, showCount)

    return (
        <div className="space-y-1.5 my-2">
            {visibleTools.map((tool, i) => (
                <ToolStep key={tool.id || i} part={tool} />
            ))}
            {hasMore && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
                >
                    {expanded ? (
                        <>
                            <ChevronUp className="h-3 w-3" />
                            Show less
                        </>
                    ) : (
                        <>
                            <ChevronDown className="h-3 w-3" />
                            {tools.length - showCount} more edits
                        </>
                    )}
                </button>
            )}
        </div>
    )
}

function TextContent({ content }: { content: string }) {
    if (!content.trim()) return null

    return (
        <div className="text-sm text-foreground/90 leading-relaxed prose prose-invert prose-sm max-w-none my-2">
            <ReactMarkdown
                components={{
                    code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '')
                        const isInline = !match
                        return isInline ? (
                            <code className="bg-muted px-1.5 py-0.5 rounded text-primary text-xs" {...props}>
                                {children}
                            </code>
                        ) : (
                            <SyntaxHighlighter
                                style={vscDarkPlus as any}
                                language={match[1]}
                                PreTag="div"
                                className="rounded-lg text-xs !bg-muted !p-4 my-2"
                            >
                                {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                        )
                    },
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    )
}

export function MessageBubble({ role, content, parts = [], steps = [] }: MessageBubbleProps) {
    if (role === 'user') {
        return (
            <div className="flex justify-end max-w-[80%] ml-auto">
                <div className="rounded-2xl px-4 py-3 bg-primary text-primary-foreground text-sm">
                    {content}
                </div>
            </div>
        )
    }


    const groupedParts: (MessagePart | { type: 'tool-group'; tools: (MessagePart & { type: 'tool' })[] })[] = []
    let currentToolGroup: (MessagePart & { type: 'tool' })[] = []

    for (const part of parts) {
        if (part.type === 'tool') {
            currentToolGroup.push(part)
        } else {
            if (currentToolGroup.length > 0) {
                groupedParts.push({ type: 'tool-group', tools: currentToolGroup })
                currentToolGroup = []
            }
            groupedParts.push(part)
        }
    }
    if (currentToolGroup.length > 0) {
        groupedParts.push({ type: 'tool-group', tools: currentToolGroup })
    }


    if (parts.length === 0 && (content || steps.length > 0)) {
        return (
            <div className="flex gap-3 max-w-[90%]">
                <div className="flex-1 min-w-0">
                    {steps.length > 0 && (
                        <ToolStepsGroup tools={steps.map(s => ({
                            type: 'tool' as const,
                            id: s.id,
                            title: s.title,
                            status: s.status
                        }))} />
                    )}
                    {content && <TextContent content={content} />}
                </div>
            </div>
        )
    }

    return (
        <div className="flex gap-3 max-w-[90%]">
            <div className="flex-1 min-w-0">
                {groupedParts.map((part, i) => {
                    if (part.type === 'tool-group') {
                        return <ToolStepsGroup key={i} tools={part.tools} />
                    }
                    if (part.type === 'text') {
                        return <TextContent key={i} content={part.content} />
                    }

                    return null
                })}
            </div>
        </div>
    )
}
