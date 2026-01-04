"use client"

import { RefObject } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Rocket, ArrowUp, Square } from "lucide-react"
import { MessageBubble } from "./MessageBubble"

interface Message {
    role: 'user' | 'assistant'
    content: string
    parts?: any[]
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
    onStop: () => void
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
    onStop,
}: ChatPanelProps) {
    return (
        <div className="h-full w-full flex flex-col bg-background border-r border-border/50">
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-chart-4/20 flex items-center justify-center mb-6">
                            <Rocket className="h-8 w-8 text-primary" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">What do you want to build?</h3>
                        <p className="text-sm text-muted-foreground max-w-[280px]">
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
                                parts={msg.parts}
                                steps={msg.steps}
                            />
                        ))}

                        {/* Thinking indicator */}
                        {isThinking && (
                            <div className="flex items-center gap-1 py-3 px-1">
                                <span className="flex gap-1">
                                    <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-4">
                <div className="relative">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-chart-4/20 rounded-2xl blur opacity-50" />
                    <div className="relative bg-secondary/40 rounded-2xl border border-border overflow-hidden">
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
                            className="min-h-[48px] max-h-[120px] resize-none border-none bg-transparent focus-visible:ring-0 text-foreground placeholder:text-muted-foreground px-4 py-3 text-sm"
                            disabled={isLoading || !hasSession}
                        />
                        <div className="flex justify-end p-2 pt-0">
                            {isLoading ? (
                                <Button
                                    size="sm"
                                    className="h-8 w-8 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-all"
                                    onClick={onStop}
                                >
                                    <Square className="h-4 w-4 fill-current" />
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    className={cn(
                                        "h-8 w-8 rounded-lg transition-all",
                                        input.trim() ? "bg-primary hover:bg-primary/90 text-primary-foreground" : "bg-secondary text-muted-foreground"
                                    )}
                                    onClick={onSend}
                                    disabled={isLoading || !input.trim() || !hasSession}
                                >
                                    <ArrowUp className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
