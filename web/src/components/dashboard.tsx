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
    Menu, Plus, Send, Layout, Monitor,
    LogOut, MessageSquare, ExternalLink, RefreshCw,
    Loader2, Check, AlertCircle, FolderOpen, FileCode, Terminal, Rocket
} from "lucide-react"
import { toast } from "sonner"

// Activity item type
interface ActivityItem {
    id: string
    type: "status" | "tool" | "preview" | "error"
    title: string
    status: "running" | "done" | "error"
    detail?: string
}

export function Dashboard() {
    const { user, logout, token } = useAuthStore()
    const chatStore = useChatStore()
    const [input, setInput] = useState("")
    const [activities, setActivities] = useState<ActivityItem[]>([])
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
        const session = chatStore.sessions.find(s => s.id === id)
        chatStore.setPreviewUrl(session?.preview_url || null)
        setActivities([]) // Clear activities when switching sessions
        try {
            const msgs = await api.get(`sessions/${id}/messages`).json<Message[]>()
            chatStore.setMessages(msgs)
        } catch (error) {
            toast.error("Failed to load messages")
        }
    }

    function addActivity(item: Omit<ActivityItem, "id">) {
        const id = `${Date.now()}-${Math.random()}`
        setActivities(prev => [...prev, { ...item, id }])
        return id
    }

    function updateActivity(id: string, updates: Partial<ActivityItem>) {
        setActivities(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
    }

    function getToolIcon(toolName: string) {
        if (toolName.includes("file") || toolName.includes("read") || toolName.includes("write")) {
            return <FileCode className="h-3 w-3" />
        }
        if (toolName.includes("list") || toolName.includes("find")) {
            return <FolderOpen className="h-3 w-3" />
        }
        if (toolName.includes("server") || toolName.includes("dev")) {
            return <Rocket className="h-3 w-3" />
        }
        return <Terminal className="h-3 w-3" />
    }

    async function sendMessage(e?: React.FormEvent) {
        if (e) e.preventDefault()
        if (!input.trim() || !chatStore.currentSessionId || chatStore.isLoading) return

        const content = input
        setInput("")
        setActivities([]) // Clear previous activities

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
            let hasAssistantMessage = false

            // Track tool activities by name
            const toolActivities: Record<string, string> = {}

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value)
                const lines = chunk.split("\n\n")

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.slice(6))

                            switch (data.type) {
                                case "status":
                                    // Status events (setting up environment, etc.)
                                    addActivity({
                                        type: "status",
                                        title: data.message,
                                        status: data.message.includes("ready") ? "done" : "running"
                                    })
                                    break

                                case "tool_start":
                                    // Tool starting
                                    const toolId = addActivity({
                                        type: "tool",
                                        title: data.tool.replace(/_/g, " "),
                                        status: "running"
                                    })
                                    toolActivities[data.tool] = toolId
                                    break

                                case "tool_end":
                                    // Tool completed
                                    const activityId = toolActivities[data.tool]
                                    if (activityId) {
                                        const resultPreview = data.result?.slice(0, 50) || ""
                                        updateActivity(activityId, {
                                            status: "done",
                                            detail: resultPreview + (data.result?.length > 50 ? "..." : "")
                                        })
                                    }
                                    break

                                case "user_message":
                                    // Agent message content
                                    if (!hasAssistantMessage) {
                                        chatStore.addMessage({ role: "assistant", content: "" })
                                        hasAssistantMessage = true
                                    }
                                    useChatStore.setState((state) => {
                                        const msgs = [...state.messages]
                                        if (msgs.length > 0 && msgs[msgs.length - 1].role === "assistant") {
                                            msgs[msgs.length - 1] = {
                                                ...msgs[msgs.length - 1],
                                                content: msgs[msgs.length - 1].content + data.content
                                            }
                                        }
                                        return { messages: msgs }
                                    })
                                    break

                                case "preview_ready":
                                    chatStore.setPreviewUrl(data.url)
                                    addActivity({
                                        type: "preview",
                                        title: "Preview ready",
                                        status: "done"
                                    })
                                    break

                                case "error":
                                    addActivity({
                                        type: "error",
                                        title: data.message,
                                        status: "error"
                                    })
                                    toast.error(data.message)
                                    break

                                case "done":
                                    chatStore.setLoading(false)
                                    chatStore.setStreaming(false)
                                    break
                            }
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

    // Auto scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [chatStore.messages, activities])

    const currentSession = chatStore.sessions.find(s => s.id === chatStore.currentSessionId)
    const isPending = currentSession?.status === "pending"

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
                                {isPending && (
                                    <p className="text-xs text-muted-foreground mt-4">
                                        Environment will be set up when you send your first message.
                                    </p>
                                )}
                            </div>
                        ) : (
                            chatStore.messages.map((msg, i) => (
                                <MessageBubble key={i} message={msg} />
                            ))
                        )}

                        {/* Activity Log */}
                        {activities.length > 0 && (
                            <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                                <div className="space-y-2">
                                    {activities.map((activity) => (
                                        <div key={activity.id} className="flex items-center gap-2 text-xs">
                                            {activity.status === "running" ? (
                                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                            ) : activity.status === "done" ? (
                                                <Check className="h-3 w-3 text-green-500" />
                                            ) : (
                                                <AlertCircle className="h-3 w-3 text-destructive" />
                                            )}

                                            {activity.type === "tool" && getToolIcon(activity.title)}

                                            <span className={cn(
                                                "capitalize",
                                                activity.status === "running" && "text-muted-foreground",
                                                activity.status === "done" && "text-foreground",
                                                activity.status === "error" && "text-destructive"
                                            )}>
                                                {activity.title}
                                            </span>

                                            {activity.detail && (
                                                <span className="text-muted-foreground truncate max-w-[200px]">
                                                    → {activity.detail}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
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
                                {chatStore.isLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
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
                            {chatStore.currentPreviewUrl ? (
                                <>
                                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                    <span className="truncate max-w-[300px]">{chatStore.currentPreviewUrl}</span>
                                </>
                            ) : (
                                <>
                                    <div className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                                    <span>Preview will appear here</span>
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => chatStore.currentSessionId && selectSession(chatStore.currentSessionId)}
                                title="Refresh Preview"
                                disabled={!chatStore.currentPreviewUrl}
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
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                <div className="relative">
                                    <Layout className="h-16 w-16 opacity-10" />
                                    {chatStore.isLoading && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                        </div>
                                    )}
                                </div>
                                <p className="mt-4 text-sm">
                                    {chatStore.isLoading ? "Setting up preview..." : "Send a message to start"}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
