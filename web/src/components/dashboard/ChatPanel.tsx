"use client"

import { RefObject } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Rocket, ArrowUp } from "lucide-react"
import { MessageBubble } from "./MessageBubble"

interface Message {
    role: 'user' | 'assistant'
    content: string
    steps?: any[]
}

interface ChatPanelProps {
    messages: Message[]
    input: string
    isLoading: boolean
    isThinking: boolean
    hasSession: boolean
    scrollRef: RefObject<HTMLDivElement>
    onInputChange: (value: string) => void
    onSend: () => void
}

export function ChatPanel({
    messages,
    input,
    isLoading,
    isThinking,
    hasSession,
    scrollRef,
    onInputChange,
    onSend,
}: ChatPanelProps) {
    return (
        <div className="w-full md:w-[35%] flex flex-col bg-gradient-to-b from-[#0c0c0e] to-[#09090b] border-r border-zinc-800/50">
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-purple-500/20 flex items-center justify-center mb-6">
                            <Rocket className="h-8 w-8 text-orange-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-2">What do you want to build?</h3>
                        <p className="text-sm text-zinc-500 max-w-[280px]">
                            Describe your app and watch it come to life
                        </p>
                    </div>
                ) : (
                    <div className="p-4 space-y-6">
                        {messages.map((msg, idx) => (
                            <MessageBubble
                                key={idx}
                                role={msg.role}
                                content={msg.content}
                                steps={msg.steps}
                            />
                        ))}

                        {/* Thinking indicator */}
                        {isThinking && (
                            <div className="flex gap-3 max-w-[90%]">
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-800 flex-shrink-0 flex items-center justify-center">
                                    <div className="h-4 w-4 rounded bg-gradient-to-br from-orange-500 to-purple-500" />
                                </div>
                                <div className="flex items-center gap-1 py-3">
                                    <span className="flex gap-1">
                                        <span className="w-1 h-1 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-1 h-1 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-1 h-1 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-4">
                <div className="relative">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500/20 to-purple-500/20 rounded-2xl blur opacity-50" />
                    <div className="relative bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
                        <Textarea
                            value={input}
                            onChange={(e) => onInputChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault()
                                    onSend()
                                }
                            }}
                            placeholder="Describe what you want to build..."
                            className="min-h-[48px] max-h-[120px] resize-none border-none bg-transparent focus-visible:ring-0 text-zinc-200 placeholder:text-zinc-600 px-4 py-3 text-sm"
                            disabled={isLoading || !hasSession}
                        />
                        <div className="flex justify-end p-2 pt-0">
                            <Button
                                size="sm"
                                className={cn(
                                    "h-8 w-8 rounded-lg transition-all",
                                    input.trim() ? "bg-orange-600 hover:bg-orange-500 text-white" : "bg-zinc-800 text-zinc-500"
                                )}
                                onClick={onSend}
                                disabled={isLoading || !input.trim() || !hasSession}
                            >
                                <ArrowUp className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
