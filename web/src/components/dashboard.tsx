"use client"

import { useEffect, useRef, useState } from "react"
import { useAuthStore } from "@/store/auth"
import { useChatStore, Message } from "@/store/chat"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Menu, Plus, ExternalLink, RefreshCw,
    Loader2, Rocket, ArrowUp, ChevronDown, LogOut, Settings, MessageSquare, ChevronUp, Terminal, FileCode2
} from "lucide-react"
import { toast } from "sonner"
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'


// Tool steps component with Lovable-style collapsed/expanded view
function ToolSteps({ steps }: { steps: any[] }) {
    const [expanded, setExpanded] = useState(false)
    const toolSteps = steps.filter(s => s.type === 'tool')

    if (toolSteps.length === 0) return null

    const latestStep = toolSteps[toolSteps.length - 1]

    // Helper for icons
    const getIcon = (step: any) => {
        if (step.status === "running") return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        if (step.title.toLowerCase().includes("run") || step.title.toLowerCase().includes("command")) return <Terminal className="h-4 w-4 text-zinc-500" />
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
            <div className="max-h-[200px] overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent hover:scrollbar-thumb-zinc-600">
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


export function Dashboard() {
    const { user, logout, token } = useAuthStore()
    const chatStore = useChatStore()
    const [input, setInput] = useState("")
    const scrollRef = useRef<HTMLDivElement>(null)
    const [iframeKey, setIframeKey] = useState(0)
    const [isThinking, setIsThinking] = useState(false)
    const [sessionsOpen, setSessionsOpen] = useState(false)

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
            setSessionsOpen(false)
        } catch (error) {
            toast.error("Failed to create session")
        }
    }

    async function selectSession(id: string) {
        chatStore.setCurrentSession(id)
        const session = chatStore.sessions.find(s => s.id === id)
        chatStore.setPreviewUrl(session?.preview_url || null)
        setSessionsOpen(false)
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

        const userMsg: Message = { role: "user", content }
        chatStore.addMessage(userMsg)
        chatStore.setLoading(true)

        try {
            const res = await api.post(`sessions/${chatStore.currentSessionId}/message`, {
                json: { content }
            }).json<any>()

            const streamUrl = res.stream_url

            const response = await fetch(`http://localhost:8000${streamUrl}`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            })

            if (!response.body) throw new Error("No response body")

            const reader = response.body.getReader()
            const decoder = new TextDecoder()

            chatStore.setStreaming(true)
            setIsThinking(true)
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

                            if (!hasAssistantMessage && data.type !== 'done' && data.type !== 'error') {
                                chatStore.addMessage({ role: "assistant", content: "", steps: [] })
                                hasAssistantMessage = true
                            }

                            switch (data.type) {
                                case "tool_start":
                                    setIsThinking(false)
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

                                case "preview_url":
                                case "preview_ready":
                                    chatStore.setPreviewUrl(data.url)
                                    useChatStore.setState(state => {
                                        const msgs = [...state.messages]
                                        const lastMsg = msgs[msgs.length - 1]
                                        if (lastMsg?.role === 'assistant') {
                                            const hasPreview = lastMsg.steps?.some(s => s.type === 'preview')
                                            if (!hasPreview) {
                                                lastMsg.steps = [
                                                    ...(lastMsg.steps || []),
                                                    { id: `preview-${Date.now()}`, type: 'preview', title: 'Preview', url: data.url, status: 'done' }
                                                ]
                                            }
                                        }
                                        return { messages: msgs }
                                    })
                                    break

                                case "user_message":
                                    setIsThinking(false)
                                    useChatStore.setState(state => {
                                        const msgs = [...state.messages]
                                        const lastMsg = msgs[msgs.length - 1]
                                        if (lastMsg?.role === 'assistant') {
                                            lastMsg.content += data.content
                                        }
                                        return { messages: msgs }
                                    })
                                    break

                                case "error":
                                    toast.error(data.message)
                                    break

                                case "done":
                                    setIsThinking(false)
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
            setIsThinking(false)
            chatStore.setLoading(false)
            chatStore.setStreaming(false)
        }
    }

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [chatStore.messages, isThinking])

    const currentSession = chatStore.sessions.find(s => s.id === chatStore.currentSessionId)

    return (
        <div className="flex h-screen w-full bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
            {/* Compact Header */}
            <div className="absolute top-0 left-0 right-0 h-12 bg-[#09090b]/80 backdrop-blur-md border-b border-zinc-800/50 z-50 flex items-center justify-between px-4">
                {/* Left: Logo + Sessions Sheet */}
                <div className="flex items-center gap-3">
                    <Sheet open={sessionsOpen} onOpenChange={setSessionsOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-zinc-800">
                                <Menu className="h-4 w-4" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-72 bg-[#0c0c0e] border-zinc-800 p-0">
                            <SheetHeader className="p-4 border-b border-zinc-800">
                                <SheetTitle className="text-left text-white flex items-center gap-2">
                                    <div className="h-6 w-6 rounded bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center font-bold text-white text-xs">
                                        F
                                    </div>
                                    Projects
                                </SheetTitle>
                            </SheetHeader>
                            <div className="p-3">
                                <Button
                                    onClick={createSession}
                                    className="w-full justify-start gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-none h-9 text-sm"
                                >
                                    <Plus className="h-4 w-4" /> New Project
                                </Button>
                            </div>
                            <div className="flex-1 overflow-auto px-2">
                                <div className="text-xs text-zinc-500 px-2 pb-2 font-medium">Recent</div>
                                {chatStore.sessions.map((session) => (
                                    <button
                                        key={session.id}
                                        onClick={() => selectSession(session.id)}
                                        className={cn(
                                            "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                                            session.id === chatStore.currentSessionId
                                                ? "bg-zinc-800 text-white"
                                                : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                                        )}
                                    >
                                        <MessageSquare className="h-4 w-4 shrink-0" />
                                        <span className="truncate">{session.name || `Project ${session.id.slice(0, 6)}`}</span>
                                    </button>
                                ))}
                            </div>
                        </SheetContent>
                    </Sheet>

                    <div className="h-6 w-6 rounded bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center font-bold text-white text-xs">
                        F
                    </div>
                    <span className="font-semibold text-sm text-white">FeGG</span>

                    {currentSession && (
                        <>
                            <div className="h-4 w-px bg-zinc-700" />
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-zinc-400 hover:text-white gap-1 text-sm font-normal">
                                        {currentSession.name || `Project ${currentSession.id.slice(0, 6)}`}
                                        <ChevronDown className="h-3 w-3" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-48 bg-zinc-900 border-zinc-800">
                                    {chatStore.sessions.slice(0, 5).map((session) => (
                                        <DropdownMenuItem
                                            key={session.id}
                                            onClick={() => selectSession(session.id)}
                                            className={cn(
                                                "text-sm",
                                                session.id === chatStore.currentSessionId && "bg-zinc-800"
                                            )}
                                        >
                                            {session.name || `Project ${session.id.slice(0, 6)}`}
                                        </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator className="bg-zinc-800" />
                                    <DropdownMenuItem onClick={() => setSessionsOpen(true)} className="text-sm text-zinc-400">
                                        View all projects...
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </>
                    )}
                </div>

                {/* Right: User menu */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 gap-2 text-zinc-400 hover:text-white px-2">
                            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-purple-500 to-orange-500" />
                            <ChevronDown className="h-3 w-3" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-800">
                        <div className="px-2 py-1.5 text-xs text-zinc-500 truncate">{user?.email}</div>
                        <DropdownMenuSeparator className="bg-zinc-800" />
                        <DropdownMenuItem className="text-sm">
                            <Settings className="h-4 w-4 mr-2" /> Settings
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={logout} className="text-sm text-red-400">
                            <LogOut className="h-4 w-4 mr-2" /> Logout
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Main Content - 35/65 Split */}
            <main className="flex flex-1 pt-12">
                {/* Chat Panel - 35% */}
                <div className="w-full md:w-[35%] flex flex-col bg-gradient-to-b from-[#0c0c0e] to-[#09090b] border-r border-zinc-800/50">
                    {/* Messages */}
                    <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin">
                        {chatStore.messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-purple-500/20 flex items-center justify-center mb-6">
                                    <Rocket className="h-8 w-8 text-orange-500" />
                                </div>
                                <h2 className="text-xl font-semibold text-white mb-2">What do you want to build?</h2>
                                <p className="text-zinc-500 text-sm max-w-xs">
                                    Describe your app and I'll create it with React, Tailwind, and shadcn/ui
                                </p>
                            </div>
                        ) : (
                            <div className="p-6 space-y-8">
                                {chatStore.messages.map((msg, i) => {
                                    const previewStep = msg.steps?.find(s => s.type === 'preview' && s.url)

                                    return (
                                        <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                                            {msg.role === "user" && (
                                                <div className="flex justify-end max-w-[80%] ml-auto">
                                                    <div className="rounded-2xl px-4 py-3 bg-gradient-to-r from-orange-600 to-orange-500 text-white text-sm">
                                                        {msg.content}
                                                    </div>
                                                </div>
                                            )}
                                            {msg.role === "assistant" && (
                                                <div className="max-w-[95%] space-y-3">
                                                    {/* Message content */}
                                                    {msg.content && (
                                                        <div className="text-[15px] leading-relaxed text-zinc-200 prose prose-invert prose-sm max-w-none">
                                                            <ReactMarkdown
                                                                components={{
                                                                    code({ node, className, children, ...props }: any) {
                                                                        const match = /language-(\w+)/.exec(className || '')
                                                                        return match ? (
                                                                            <SyntaxHighlighter
                                                                                style={vscDarkPlus}
                                                                                language={match[1]}
                                                                                PreTag="div"
                                                                                className="rounded-lg !bg-black/50 !p-3 my-3 text-xs"
                                                                            >
                                                                                {String(children).replace(/\n$/, '')}
                                                                            </SyntaxHighlighter>
                                                                        ) : (
                                                                            <code {...props} className={cn("bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs", className)}>
                                                                                {children}
                                                                            </code>
                                                                        )
                                                                    }
                                                                }}
                                                            >
                                                                {msg.content.replace(/Preview:\s*https?:\/\/[^\s]+/gi, '').replace(/https?:\/\/\S*e2b\.app\S*/gi, '').trim()}
                                                            </ReactMarkdown>
                                                        </div>
                                                    )}

                                                    {/* Tool activity - subtle list */}
                                                    {msg.steps && <ToolSteps steps={msg.steps} />}

                                                    {/* Preview button - separate and prominent */}
                                                    {previewStep && (
                                                        <a
                                                            href={previewStep.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all duration-200 hover:scale-[1.02]"
                                                        >
                                                            <Rocket className="h-4 w-4" />
                                                            Open Preview
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}

                                {/* Thinking indicator - minimal */}
                                {isThinking && (
                                    <div className="flex items-center gap-2 animate-in fade-in duration-300">
                                        <span className="text-zinc-500 text-sm">Thinking</span>
                                        <span className="flex gap-0.5">
                                            <span className="w-1 h-1 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-1 h-1 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="w-1 h-1 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Input - Floating style */}
                    <div className="p-4">
                        <div className="relative">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500/20 to-purple-500/20 rounded-2xl blur opacity-50" />
                            <div className="relative bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
                                <Textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault()
                                            sendMessage()
                                        }
                                    }}
                                    placeholder="Describe what you want to build..."
                                    className="min-h-[48px] max-h-[120px] resize-none border-none bg-transparent focus-visible:ring-0 text-zinc-200 placeholder:text-zinc-600 px-4 py-3 text-sm"
                                    disabled={chatStore.isLoading || !chatStore.currentSessionId}
                                />
                                <div className="flex justify-end p-2 pt-0">
                                    <Button
                                        size="sm"
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

                {/* Preview Panel - 65% */}
                <div className="hidden md:flex flex-col flex-1 bg-[#000000]">
                    {/* Preview content */}
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
                                    <div className="text-center">
                                        <div className="relative mb-6">
                                            <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full" />
                                            <Loader2 className="h-12 w-12 animate-spin text-orange-500 relative" />
                                        </div>
                                        <h3 className="text-zinc-300 font-medium mb-2">Building your app</h3>
                                        <p className="text-zinc-500 text-sm">Preview will appear shortly...</p>
                                    </div>
                                ) : (
                                    <div className="text-center opacity-40">
                                        <Rocket className="h-12 w-12 mx-auto mb-4 text-zinc-600" />
                                        <p className="text-sm">Preview will appear here</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* URL Bar - Bottom */}
                    <div className="h-12 border-t border-zinc-800 bg-[#09090b] flex items-center justify-between px-4">
                        <div className="flex items-center gap-2 bg-zinc-800/50 px-3 py-1.5 rounded-lg flex-1 max-w-md">
                            <div className={cn(
                                "h-2 w-2 rounded-full",
                                chatStore.currentPreviewUrl ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-zinc-600"
                            )} />
                            <span className="text-xs text-zinc-400 font-mono truncate">
                                {chatStore.currentPreviewUrl || 'Waiting for preview...'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800"
                                onClick={() => setIframeKey(prev => prev + 1)}
                                disabled={!chatStore.currentPreviewUrl}
                            >
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                            {chatStore.currentPreviewUrl && (
                                <Button variant="ghost" size="sm" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800" asChild>
                                    <a href={chatStore.currentPreviewUrl} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
