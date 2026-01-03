"use client"

import { cn } from "@/lib/utils"
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ToolSteps } from './ToolSteps'

interface Step {
    id?: string
    type: string
    title: string
    status: string
}

interface MessageBubbleProps {
    role: 'user' | 'assistant'
    content: string
    steps?: Step[]
}

export function MessageBubble({ role, content, steps = [] }: MessageBubbleProps) {
    if (role === 'user') {
        return (
            <div className="flex justify-end max-w-[80%] ml-auto">
                <div className="rounded-2xl px-4 py-3 bg-gradient-to-r from-orange-600 to-orange-500 text-white text-sm">
                    {content}
                </div>
            </div>
        )
    }

    return (
        <div className="flex gap-3 max-w-[90%]">
            <div className="flex-1 min-w-0">
                <ToolSteps steps={steps} />
                {content && (
                    <div className="text-sm text-zinc-300 leading-relaxed prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown
                            components={{
                                code({ className, children, ...props }) {
                                    const match = /language-(\w+)/.exec(className || '')
                                    const isInline = !match
                                    return isInline ? (
                                        <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-orange-400 text-xs" {...props}>
                                            {children}
                                        </code>
                                    ) : (
                                        <SyntaxHighlighter
                                            style={vscDarkPlus as any}
                                            language={match[1]}
                                            PreTag="div"
                                            className="rounded-lg text-xs !bg-zinc-900 !p-4 my-2"
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
                )}
            </div>
        </div>
    )
}
