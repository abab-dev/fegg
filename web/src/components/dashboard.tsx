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
    Menu, Plus, ExternalLink, RefreshCw,
    Loader2, Rocket, ArrowUp, Wand2
} from "lucide-react"
import { toast } from "sonner"
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'


export function Dashboard() {
    const { user, logout, token } = useAuthStore()
    const chatStore = useChatStore()
    const [input, setInput] = useState("")
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
        } catch (error) {
            toast.error("Failed to create session")
        }
    }

    async function selectSession(id: string) {
        chatStore.setCurrentSession(id)
        const session = chatStore.sessions.find(s => s.id === id)
        chatStore.setPreviewUrl(session?.preview_url || null)
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
            let hasAssistantMessage = false

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value)
                const lines = chunk.split("\n\n")

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.slice(6))

                            // Ensure assistant message exists for tool/content events
                            if (!hasAssistantMessage && data.type !== 'done' && data.type !== 'error') {
                                chatStore.addMessage({ role: "assistant", content: "", steps: [] })
                                hasAssistantMessage = true
                            }

                            switch (data.type) {
                                case "tool_start":
                                    // Backend sends step object
                                    if (data.step) {
                                        useChatStore.setState(state => {
                                            const msgs = [...state.messages]
                                            const lastMsg = msgs[msgs.length - 1]
                                            if (lastMsg?.role === 'assistant') {
                                                lastMsg.steps = [...(lastMsg.steps || []), data.step]
                                            }
                                            return { messages: msgs }
                                        })
                                    }
                                    break

                                case "tool_end":
                                    // Update step status to done
                                    if (data.step_id) {
                                        useChatStore.setState(state => {
                                            const msgs = [...state.messages]
                                            const lastMsg = msgs[msgs.length - 1]
                                            if (lastMsg?.steps) {
                                                lastMsg.steps = lastMsg.steps.map(s =>
                                                    s.id === data.step_id ? { ...s, status: "done" } : s
                                                )
                                            }
                                            return { messages: msgs }
                                        })
                                    }
                                    break

                                case "user_message":
                                    useChatStore.setState(state => {
                                        const msgs = [...state.messages]
                                        const lastMsg = msgs[msgs.length - 1]
                                        if (lastMsg?.role === 'assistant') {
                                            lastMsg.content += data.content
                                        }
                                        return { messages: msgs }
                                    })
                                    break

                                case "preview_ready":
                                    chatStore.setPreviewUrl(data.url)
                                    chatStore.setSessions(
                                        chatStore.sessions.map(s =>
                                            s.id === chatStore.currentSessionId
                                                ? { ...s, preview_url: data.url }
                                                : s
                                        )
                                    )
                                    // Backend sends step with URL
                                    if (data.step) {
                                        useChatStore.setState(state => {
                                            const msgs = [...state.messages]
                                            const lastMsg = msgs[msgs.length - 1]
                                            if (lastMsg?.role === 'assistant') {
                                                lastMsg.steps = [...(lastMsg.steps || []), data.step]
                                            }
                                            return { messages: msgs }
                                        })
                                    }
                                    break

                                case "error":
                                    toast.error(data.message)
                                    break

                                case "done":
                                    chatStore.setLoading(false)
                                    chatStore.setStreaming(false)
                                    break
                            }
                        } catch (e) {
                            // Ignore parse errors
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
    }, [chatStore.messages])

    // Get current steps for loading state (just the last message's steps if strictly needed, 
    // but the persistent steps handle the view now)
    const currentSteps = chatStore.messages.length > 0 ? chatStore.messages[chatStore.messages.length - 1].steps || [] : []

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
                                            {/* Message Content */}
                                            {msg.content && (
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
                                            )}

                                            {/* Persistent Steps - Tool boxes and Preview URL */}
                                            {msg.steps && msg.steps.length > 0 && (
                                                <div className="mt-4 flex flex-col gap-2">
                                                    {/* Tool steps as compact inline badges */}
                                                    <div className="flex flex-wrap gap-2">
                                                        {msg.steps.filter(s => s.type === 'tool').map((step) => (
                                                            <div
                                                                key={step.id}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800/60 border border-zinc-700/50 text-xs"
                                                            >
                                                                {step.status === "running" ? (
                                                                    <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                                                                ) : (
                                                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                                )}
                                                                <span className="text-zinc-400 font-medium">{step.title}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Preview URL as clickable box */}
                                                    {msg.steps.filter(s => s.type === 'preview' && s.url).map((step) => (
                                                        <a
                                                            key={step.id}
                                                            href={step.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="group flex items-center gap-3 px-4 py-3 rounded-lg bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer"
                                                        >
                                                            <div className="h-8 w-8 rounded-md bg-emerald-500/20 flex items-center justify-center">
                                                                <Rocket className="h-4 w-4 text-emerald-400" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-sm font-medium text-emerald-400">Preview Ready</div>
                                                                <div className="text-xs text-zinc-500 truncate">{step.url}</div>
                                                            </div>
                                                            <ExternalLink className="h-4 w-4 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
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
                                            {currentSteps.slice(-3).map(a => (
                                                <div key={a.id} className="text-xs text-zinc-500 flex items-center gap-2 truncate">
                                                    <div className="h-1 w-1 bg-zinc-600 rounded-full" />
                                                    {a.title}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center opacity-40">
                                        <Rocket className="h-12 w-12 mx-auto mb-4 text-zinc-600" />
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
