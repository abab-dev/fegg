"use client"

import { useEffect, useRef, useState } from "react"
import { useAuthStore } from "@/store/auth"
import { useChatStore, Message } from "@/store/chat"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { MessageBubble } from "@/components/chat/message-bubble"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
    Menu, Plus, Send, Terminal, Layout, Monitor,
    LogOut, MessageSquare, ExternalLink, RefreshCw
} from "lucide-react"
import { toast } from "sonner"

export function Dashboard() {
    const { user, logout, token } = useAuthStore()
    const chatStore = useChatStore()
    const [input, setInput] = useState("")
    const [activity, setActivity] = useState<string | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Fetch sessions on mount
    useEffect(() => {
        async function fetchSessions() {
            try {
                const sessions = await api.get("sessions").json<any[]>()
                chatStore.setSessions(sessions)
                if (sessions.length > 0 && !chatStore.currentSessionId) {
                    selectSession(sessions[0].id)
                }
            } catch (error) {
                toast.error("Failed to load sessions")
            }
        }
        fetchSessions()
    }, [])

    async function createSession() {
        try {
            const session = await api.post("sessions").json<any>()
            chatStore.setSessions([session, ...chatStore.sessions])
            chatStore.setCurrentSession(session.id)
            chatStore.setMessages([])
            chatStore.setPreviewUrl(null)
        } catch (error) {
            toast.error("Failed to create session")
        }
    }

    async function selectSession(id: string) {
        chatStore.setCurrentSession(id)
        chatStore.setPreviewUrl(chatStore.sessions.find(s => s.id === id)?.preview_url || null)
        try {
            const msgs = await api.get(`sessions/${id}/messages`).json<Message[]>()
            chatStore.setMessages(msgs)
        } catch (error) {
            toast.error("Failed to load messages")
        }
    }

    async function sendMessage(e?: React.FormEvent) {
        if (e) e.preventDefault()
        if (!input.trim() || !chatStore.currentSessionId || chatStore.isLoading) return

        const content = input
        setInput("")

        // Add user message
        const userMsg: Message = { role: "user", content }
        chatStore.addMessage(userMsg)
        chatStore.setLoading(true)

        try {
            // 1. Send message
            const res = await api.post(`sessions/${chatStore.currentSessionId}/message`, {
                json: { content }
            }).json<any>()

            const streamUrl = res.stream_url

            // Using fetch for SSE to support Auth headers
            const response = await fetch(`http://localhost:8000${streamUrl}`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            })

            if (!response.body) throw new Error("No response body")

            const reader = response.body.getReader()
            const decoder = new TextDecoder()

            chatStore.setStreaming(true)
            let assistantMsg: Message = { role: "assistant", content: "" }
            chatStore.addMessage(assistantMsg) // Add placeholder

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value)
                const lines = chunk.split("\n\n")

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.slice(6))
                            handleEvent(data)
                        } catch (e) {
                            // Ignore parse errors for partial chunks
                        }
                    }
                }
            }

        } catch (error) {
            console.error(error)
            toast.error("Failed to send message")
            chatStore.setLoading(false)
            chatStore.setStreaming(false)
        }
    }

    function handleEvent(event: any) {
        switch (event.type) {
            case "tool_start":
                setActivity(`Running ${event.tool}...`)
                break
            case "tool_end":
                setActivity(null)
                break
            case "user_message":
                // Set the assistant message content directly
                useChatStore.setState((state) => {
                    const msgs = [...state.messages]
                    if (msgs.length > 0 && msgs[msgs.length - 1].role === "assistant") {
                        msgs[msgs.length - 1] = {
                            ...msgs[msgs.length - 1],
                            content: msgs[msgs.length - 1].content + event.content
                        }
                    }
                    return { messages: msgs }
                })
                break
            case "preview_ready":
                chatStore.setPreviewUrl(event.url)
                toast.success("Preview updated")
                break
            case "done":
                chatStore.setLoading(false)
                chatStore.setStreaming(false)
                setActivity(null)
                break
        }
    }

    // Auto scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [chatStore.messages, activity])

    return (
        <div className="flex h-screen w-full bg-background overflow-hidden relative">
            {/* Sidebar - Desktop */}
            <aside className="w-64 border-r border-border hidden md:flex flex-col bg-sidebar/50 backdrop-blur-xl">
                <div className="p-4 border-b border-border/50 flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                        <Layout className="h-5 w-5 text-primary" />
                    </div>
                    <span className="font-bold text-lg tracking-tight">FeGG</span>
                </div>

                <div className="p-2">
                    <Button onClick={createSession} className="w-full justify-start gap-2" variant="outline">
                        <Plus className="h-4 w-4" /> New Session
                    </Button>
                </div>

                <ScrollArea className="flex-1 px-2">
                    <div className="space-y-1">
                        {chatStore.sessions.map((session) => (
                            <Button
                                key={session.id}
                                variant={chatStore.currentSessionId === session.id ? "secondary" : "ghost"}
                                className={cn(
                                    "w-full justify-start text-sm truncate",
                                    chatStore.currentSessionId === session.id && "bg-secondary/50"
                                )}
                                onClick={() => selectSession(session.id)}
                            >
                                <MessageSquare className="h-4 w-4 mr-2 opacity-50" />
                                <span className="truncate">Session {session.id.slice(0, 8)}</span>
                            </Button>
                        ))}
                    </div>
                </ScrollArea>

                <div className="p-4 border-t border-border/50">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                            {user?.email[0].toUpperCase()}
                        </div>
                        <div className="text-xs truncate opacity-70">
                            {user?.email}
                        </div>
                    </div>
                    <Button onClick={logout} variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-destructive">
                        <LogOut className="h-4 w-4 mr-2" /> Sign out
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col md:flex-row h-full relative">
                {/* Chat Interface */}
                <div className="flex-1 flex flex-col min-w-0 bg-background/50 h-full">
                    {/* Header (Mobile Sidebar Trigger) */}
                    <div className="md:hidden p-4 border-b flex items-center justify-between">
                        <span className="font-bold">FeGG</span>
                        <Sheet>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="w-64 p-0">
                                <div className="flex flex-col h-full bg-sidebar">
                                    <div className="p-4 border-b border-border/50 flex items-center gap-2">
                                        <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
                                            <Layout className="h-5 w-5 text-primary" />
                                        </div>
                                        <span className="font-bold text-lg tracking-tight">FeGG</span>
                                    </div>

                                    <div className="p-2">
                                        <Button onClick={createSession} className="w-full justify-start gap-2" variant="outline">
                                            <Plus className="h-4 w-4" /> New Session
                                        </Button>
                                    </div>

                                    <ScrollArea className="flex-1 px-2">
                                        <div className="space-y-1">
                                            {chatStore.sessions.map((session) => (
                                                <Button
                                                    key={session.id}
                                                    variant={chatStore.currentSessionId === session.id ? "secondary" : "ghost"}
                                                    className={cn(
                                                        "w-full justify-start text-sm truncate",
                                                        chatStore.currentSessionId === session.id && "bg-secondary/50"
                                                    )}
                                                    onClick={() => selectSession(session.id)}
                                                >
                                                    <MessageSquare className="h-4 w-4 mr-2 opacity-50" />
                                                    <span className="truncate">Session {session.id.slice(0, 8)}</span>
                                                </Button>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                        {chatStore.messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50">
                                <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                                    <Monitor className="h-8 w-8 text-primary" />
                                </div>
                                <h3 className="text-lg font-medium">Ready to build</h3>
                                <p className="text-sm max-w-md mt-2">
                                    Describe what you want to create. FeGG will generate, run, and preview your React application in real-time.
                                </p>
                            </div>
                        ) : (
                            chatStore.messages.map((msg, i) => (
                                <MessageBubble key={i} message={msg} />
                            ))
                        )}

                        {/* Activity Indicator */}
                        {activity && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground p-4 animate-pulse">
                                <Terminal className="h-3 w-3" />
                                <span>{activity}</span>
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="p-4 border-t border-border/50 bg-background/50 backdrop-blur-sm">
                        <div className="relative">
                            <Textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault()
                                        sendMessage()
                                    }
                                }}
                                placeholder="Describe your app..."
                                className="min-h-[60px] max-h-[200px] resize-none pr-12 bg-secondary/30 border-primary/20 focus:border-primary/50 transition-all shadow-sm"
                                disabled={chatStore.isLoading || !chatStore.currentSessionId}
                            />
                            <Button
                                size="icon"
                                className="absolute right-2 bottom-2 h-8 w-8 rounded-full shadow-lg hover:shadow-primary/25 transition-all"
                                onClick={() => sendMessage()}
                                disabled={chatStore.isLoading || !input.trim() || !chatStore.currentSessionId}
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-2 text-center">
                            FeGG can make mistakes. Review the code.
                        </div>
                    </div>
                </div>

                {/* Preview Pane */}
                <div className="hidden md:flex flex-col w-[60%] border-l border-border bg-muted/10 h-full relative">
                    <div className="h-12 border-b border-border/50 bg-background/50 backdrop-blur flex items-center justify-between px-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="truncate max-w-[300px]">
                                {chatStore.currentPreviewUrl || "Waiting for server..."}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => chatStore.currentSessionId && selectSession(chatStore.currentSessionId)}
                                title="Refresh Preview"
                            >
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                            {chatStore.currentPreviewUrl && (
                                <Button variant="ghost" size="sm" asChild>
                                    <a href={chatStore.currentPreviewUrl} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 relative bg-white/5">
                        {chatStore.currentPreviewUrl ? (
                            <iframe
                                src={chatStore.currentPreviewUrl}
                                className="w-full h-full border-0"
                                title="Preview"
                                sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
                                <Layout className="h-12 w-12 mb-4 opacity-20" />
                                <p>Preview will appear here</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
