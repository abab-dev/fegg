"use client"

import { useEffect, useRef, useState } from "react"
import { useAuthStore } from "@/store/auth"
import { useChatStore, Message } from "@/store/chat"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
    Menu, Plus, Layout,
    LogOut, MessageSquare, ExternalLink, RefreshCw,
    Loader2, Check, Terminal, Rocket,
    ArrowUp, Sparkles, Wand2
} from "lucide-react"
import { toast } from "sonner"
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

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
    const [iframeKey, setIframeKey] = useState(0)

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
            setActivities([])
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
                                    // Also update the session in the sessions array
                                    chatStore.setSessions(
                                        chatStore.sessions.map(s =>
                                            s.id === chatStore.currentSessionId
                                                ? { ...s, preview_url: data.url }
                                                : s
                                        )
                                    )
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

    return (
        <div className="flex h-screen w-full bg-[#09090b] text-zinc-100 overflow-hidden relative font-sans">
            {/* Sidebar - Desktop */}
            <aside className="w-64 border-r border-[#27272a] hidden md:flex flex-col bg-[#09090b]">
                <div className="p-4 flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-orange-600 flex items-center justify-center font-bold text-black text-xs">
                        F
                    </div>
                    <span className="font-bold text-sm tracking-tight text-white">FeGG</span>
                </div>

                <div className="px-2 py-2">
                    <Button
                        onClick={createSession}
                        className="w-full justify-start gap-2 bg-[#27272a] hover:bg-[#3f3f46] text-zinc-300 border-none h-9 text-sm font-normal"
                        variant="outline"
                    >
                        <Plus className="h-4 w-4" /> New Chat
                    </Button>
                </div>

                <div className="flex-1 overflow-auto px-2 py-2">
                    <div className="space-y-0.5">
                        <div className="px-2 pb-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">Recents</div>
                        {chatStore.sessions.map((session) => (
                            <Button
                                key={session.id}
                                variant="ghost"
                                className={cn(
                                    "w-full justify-start text-sm truncate h-8 font-normal text-zinc-400 hover:text-zinc-100 hover:bg-[#27272a]",
                                    chatStore.currentSessionId === session.id && "bg-[#27272a] text-zinc-100"
                                )}
                                onClick={() => selectSession(session.id)}
                            >
                                <span className="truncate">
                                    {/* Try to extract a title from first message or just ID */}
                                    New Project
                                </span>
                                <span className="ml-auto text-xs text-zinc-600 font-mono">
                                    {session.created_at ? new Date(session.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                                </span>
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t border-[#27272a]">
                    <Button onClick={logout} variant="ghost" size="sm" className="w-full justify-start text-zinc-500 hover:text-zinc-300 px-0 hover:bg-transparent">
                        <div className="h-6 w-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 mr-2">
                            {user?.email[0].toUpperCase()}
                        </div>
                        <span className="truncate text-xs">{user?.email}</span>
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col md:flex-row h-full relative">
                {/* Chat Interface */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#09090b] h-full relative z-10 border-r border-[#27272a]">
                    {/* Header (Mobile Sidebar Trigger) */}
                    <div className="md:hidden p-4 border-b border-[#27272a] flex items-center justify-between">
                        <span className="font-bold">FeGG</span>
                        <Sheet>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="w-64 p-0 bg-[#09090b] border-[#27272a]">
                                {/* Mobile Sidebar Content (simplified) */}
                                <div className="p-4">FeGG Mobile</div>
                            </SheetContent>
                        </Sheet>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
                        {chatStore.messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8">
                                <h1 className="text-3xl font-bold tracking-tight text-zinc-100 mb-2">What can I build for you?</h1>
                                <p className="text-zinc-500 max-w-md">
                                    I will build your full-stack web application.
                                </p>
                            </div>
                        ) : (
                            <>
                                {chatStore.messages.map((msg, i) => (
                                    <div key={i} className={cn("flex flex-col gap-2 mb-4", msg.role === "user" ? "items-end" : "items-start")}>
                                        <div className={cn(
                                            "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed overflow-hidden",
                                            msg.role === "user"
                                                ? "bg-[#27272a] text-zinc-100"
                                                : "bg-transparent text-zinc-300 pl-0"
                                        )}>
                                            <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent">
                                                <ReactMarkdown
                                                    components={{
                                                        code({ node, className, children, ...props }: any) {
                                                            const match = /language-(\w+)/.exec(className || '')
                                                            return match ? (
                                                                <SyntaxHighlighter
                                                                    {...props}
                                                                    style={vscDarkPlus}
                                                                    language={match[1]}
                                                                    PreTag="div"
                                                                    className="rounded-md border border-zinc-800 !bg-[#000000] !p-4 my-2"
                                                                >
                                                                    {String(children).replace(/\n$/, '')}
                                                                </SyntaxHighlighter>
                                                            ) : (
                                                                <code {...props} className={cn("bg-white/10 px-1 py-0.5 rounded font-mono text-xs", className)}>
                                                                    {children}
                                                                </code>
                                                            )
                                                        }
                                                    }}
                                                >
                                                    {msg.content}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* Activity Log (Styled like steps) */}
                                {activities.length > 0 && (
                                    <div className="ml-0 mt-2 space-y-3 font-mono text-xs text-zinc-500 px-4">
                                        {activities.map((activity) => (
                                            <div key={activity.id} className="flex items-center gap-3">
                                                <div className="w-4 flex justify-center">
                                                    {activity.status === "running" ? (
                                                        <Loader2 className="h-3 w-3 animate-spin text-orange-500" />
                                                    ) : activity.status === "done" ? (
                                                        <Check className="h-3 w-3 text-emerald-500" />
                                                    ) : (
                                                        <div className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {activity.type === "tool" && <Terminal className="h-3 w-3 opacity-50" />}
                                                    <span className={cn(
                                                        activity.status === "running" && "text-zinc-400",
                                                        activity.status === "done" && "text-zinc-600 line-through opacity-50"
                                                    )}>
                                                        {activity.title}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                        {chatStore.isLoading && activities.every(a => a.status === 'done') && (
                                            <div className="flex items-center gap-3 animate-pulse">
                                                <div className="w-4 flex justify-center">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                                                </div>
                                                <span className="text-zinc-400">Thinking...</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="p-4 md:p-6 bg-[#09090b]">
                        <div className="relative group">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500/20 to-purple-500/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition duration-1000"></div>
                            <div className="relative bg-[#18181b] rounded-xl border border-[#27272a] p-2 focus-within:ring-1 focus-within:ring-zinc-700 transition-all">
                                <Textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault()
                                            sendMessage()
                                        }
                                    }}
                                    placeholder="Ask FeGG..."
                                    className="min-h-[20px] max-h-[200px] resize-none border-none bg-transparent focus-visible:ring-0 text-zinc-200 placeholder:text-zinc-600 px-3 py-2 text-base"
                                    disabled={chatStore.isLoading || !chatStore.currentSessionId}
                                />
                                <div className="flex justify-between items-center px-2 pb-1 mt-2">
                                    <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-500 gap-1 hover:text-zinc-300 hover:bg-zinc-800">
                                        <Wand2 className="h-3 w-3" /> Visual edits
                                    </Button>
                                    <Button
                                        size="icon"
                                        className={cn(
                                            "h-8 w-8 rounded-lg transition-all",
                                            input.trim() ? "bg-orange-600 hover:bg-orange-500 text-white" : "bg-zinc-800 text-zinc-500"
                                        )}
                                        onClick={() => sendMessage()}
                                        disabled={chatStore.isLoading || !input.trim() || !chatStore.currentSessionId}
                                    >
                                        <ArrowUp className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Preview Pane */}
                <div className="hidden md:flex flex-col w-[60%] bg-[#000000] relative">
                    <div className="h-14 border-b border-[#27272a] bg-[#09090b] flex items-center justify-between px-4">
                        <div className="flex items-center gap-2 bg-[#18181b] px-3 py-1.5 rounded-md border border-[#27272a]">
                            <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                            <span className="text-xs text-zinc-400 font-mono">
                                {chatStore.currentPreviewUrl ? 'Preview Ready' : 'Initializing...'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-[#27272a]"
                                onClick={() => setIframeKey(prev => prev + 1)}
                                title="Refresh Preview"
                                disabled={!chatStore.currentPreviewUrl}
                            >
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                            {chatStore.currentPreviewUrl && (
                                <Button variant="ghost" size="sm" className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-[#27272a]" asChild>
                                    <a href={chatStore.currentPreviewUrl} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 relative overflow-hidden">
                        {chatStore.currentPreviewUrl ? (
                            <iframe
                                key={iframeKey}
                                src={chatStore.currentPreviewUrl}
                                className="w-full h-full border-0 bg-white"
                                title="Preview"
                                sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-600 bg-[#0c0c0e]">
                                {chatStore.isLoading ? (
                                    <>
                                        <div className="relative mb-8">
                                            <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full"></div>
                                            <Loader2 className="h-12 w-12 animate-spin text-orange-600 relative z-10" />
                                        </div>
                                        <h3 className="text-zinc-300 font-medium mb-2">Building your app</h3>
                                        <div className="flex flex-col gap-2 w-64">
                                            {activities.slice(-3).map(a => (
                                                <div key={a.id} className="text-xs text-zinc-500 flex items-center gap-2 truncate">
                                                    <div className="h-1 w-1 bg-zinc-600 rounded-full" />
                                                    {a.title}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center opacity-40">
                                        <Sparkles className="h-12 w-12 mx-auto mb-4 text-zinc-600" />
                                        <p className="text-sm">Preview will appear here</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
