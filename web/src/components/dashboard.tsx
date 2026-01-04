"use client"

import { useEffect, useRef, useState } from "react"
import { useAuthStore } from "@/store/auth"
import { useChatStore, Message } from "@/store/chat"
import { api } from "@/lib/api"
import { toast } from "sonner"
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@/components/ui/resizable"

import { Header } from "./dashboard/Header"
import { ProjectsSheet } from "./dashboard/ProjectsSheet"
import { ChatPanel } from "./dashboard/ChatPanel"
import { PreviewPanel } from "./dashboard/PreviewPanel"

export function Dashboard() {
    const { user, logout, token } = useAuthStore()
    const chatStore = useChatStore()
    const [input, setInput] = useState("")
    const scrollRef = useRef<HTMLDivElement>(null)
    const [iframeKey, setIframeKey] = useState(0)
    const [isThinking, setIsThinking] = useState(false)
    const [sessionsOpen, setSessionsOpen] = useState(false)

    // Code editor state
    const [rightPanel, setRightPanel] = useState<'preview' | 'code'>('preview')
    const [fileTree, setFileTree] = useState<string[]>([])
    const [openFiles, setOpenFiles] = useState<string[]>([])
    const [activeFile, setActiveFile] = useState<string | null>(null)
    const [fileContents, setFileContents] = useState<Record<string, string>>({})
    const [isLoadingFile, setIsLoadingFile] = useState(false)

    // Load sessions on mount
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

    // Auto-scroll on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [chatStore.messages, isThinking])

    // Auto-refresh preview when URL changes
    useEffect(() => {
        if (chatStore.currentPreviewUrl) {
            setIframeKey(prev => prev + 1)
        }
    }, [chatStore.currentPreviewUrl])

    // File operations
    async function loadFileTree() {
        if (!chatStore.currentSessionId) return
        setIsLoadingFile(true)
        try {
            const res = await api.get(`sessions/${chatStore.currentSessionId}/files`).json<{ files: string[] }>()
            const files = res.files || []
            setFileTree(files)
            if (files.length === 0) {
                toast.info("No files in project yet. Ask the AI to create something!")
            }
        } catch (error: any) {
            console.error("Failed to load file tree:", error)
            const msg = error?.message || "Unknown error"
            toast.error(`Failed to load files: ${msg}`)
            setFileTree([])
        } finally {
            setIsLoadingFile(false)
        }
    }

    async function loadFile(path: string) {
        if (!chatStore.currentSessionId) return
        if (fileContents[path]) {
            setActiveFile(path)
            if (!openFiles.includes(path)) setOpenFiles([...openFiles, path])
            return
        }

        setIsLoadingFile(true)
        try {
            const res = await api.get(`sessions/${chatStore.currentSessionId}/files/${encodeURIComponent(path)}`).json<{ content: string }>()
            setFileContents(prev => ({ ...prev, [path]: res.content }))
            setActiveFile(path)
            if (!openFiles.includes(path)) setOpenFiles([...openFiles, path])
        } catch (error) {
            toast.error(`Failed to load ${path}`)
        } finally {
            setIsLoadingFile(false)
        }
    }

    function closeFile(path: string) {
        setOpenFiles(openFiles.filter(f => f !== path))
        if (activeFile === path) {
            setActiveFile(openFiles.filter(f => f !== path)[0] || null)
        }
    }

    function updateFileContent(path: string, content: string) {
        // View-only mode - no saving
    }

    // Session operations
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

    // Send message with SSE streaming
    async function sendMessage() {
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
                                chatStore.addMessage({ role: "assistant", content: "", parts: [] })
                                hasAssistantMessage = true
                            }

                            switch (data.type) {
                                case "token":
                                    setIsThinking(false)
                                    useChatStore.setState(state => {
                                        const msgs = [...state.messages]
                                        const lastMsg = msgs[msgs.length - 1]
                                        if (lastMsg?.role === 'assistant') {
                                            const parts = lastMsg.parts || []
                                            const lastPart = parts[parts.length - 1] as any
                                            // Append to existing text part (unless it's marked complete from user_message)
                                            if (lastPart?.type === 'text' && !lastPart.isComplete) {
                                                lastPart.content += data.content
                                            } else {
                                                parts.push({ type: 'text', content: data.content })
                                            }
                                            lastMsg.parts = parts
                                            lastMsg.content += data.content
                                        }
                                        return { messages: msgs }
                                    })
                                    break

                                case "tool_start":
                                    setIsThinking(false)
                                    if (data.step) {
                                        useChatStore.setState(state => {
                                            const msgs = [...state.messages]
                                            const lastMsg = msgs[msgs.length - 1]
                                            if (lastMsg?.role === 'assistant') {
                                                const parts = lastMsg.parts || []
                                                parts.push({
                                                    type: 'tool',
                                                    id: data.step.id,
                                                    title: data.step.title,
                                                    status: 'running'
                                                })
                                                lastMsg.parts = parts
                                                // Keep steps for compat
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
                                            if (lastMsg?.parts) {
                                                lastMsg.parts = lastMsg.parts.map(p =>
                                                    p.type === 'tool' && p.id === data.step_id
                                                        ? { ...p, status: 'done' as const }
                                                        : p
                                                )
                                            }
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
                                            const parts = lastMsg.parts || []
                                            const hasPreview = parts.some(p => p.type === 'preview')
                                            if (!hasPreview) {
                                                parts.push({
                                                    type: 'preview',
                                                    id: `preview-${Date.now()}`,
                                                    title: 'Preview',
                                                    url: data.url,
                                                    status: 'done'
                                                })
                                                lastMsg.parts = parts
                                            }
                                        }
                                        return { messages: msgs }
                                    })
                                    break

                                case "user_message":
                                    // user_message is a complete message from show_user_message tool
                                    // Mark it complete so tokens don't append to it
                                    setIsThinking(false)
                                    useChatStore.setState(state => {
                                        const msgs = [...state.messages]
                                        const lastMsg = msgs[msgs.length - 1]
                                        if (lastMsg?.role === 'assistant') {
                                            const parts = lastMsg.parts || []
                                            parts.push({ type: 'text', content: data.content, isComplete: true } as any)
                                            lastMsg.parts = parts
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
                                    // Refresh preview to show final result
                                    setIframeKey(prev => prev + 1)
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

    const currentSession = chatStore.sessions.find(s => s.id === chatStore.currentSessionId)

    return (
        <div className="flex h-screen w-full bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
            <Header
                user={user}
                currentSession={currentSession || null}
                sessions={chatStore.sessions}
                onMenuClick={() => setSessionsOpen(true)}
                onSelectSession={selectSession}
                onViewAllProjects={() => setSessionsOpen(true)}
                onLogout={logout}
            />

            <ProjectsSheet
                open={sessionsOpen}
                onOpenChange={setSessionsOpen}
                sessions={chatStore.sessions}
                currentSessionId={chatStore.currentSessionId}
                onSelectSession={selectSession}
                onCreateSession={createSession}
            />

            {/* Main Content */}
            <main className="flex flex-1 pt-12 overflow-hidden h-full">
                <ResizablePanelGroup direction="horizontal" className="h-full w-full">
                    <ResizablePanel defaultSize={35} minSize={20}>
                        <ChatPanel
                            messages={chatStore.messages}
                            input={input}
                            isLoading={chatStore.isLoading}
                            isThinking={isThinking}
                            hasSession={!!chatStore.currentSessionId}
                            scrollRef={scrollRef as any}
                            onInputChange={setInput}
                            onSend={sendMessage}
                        />
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    <ResizablePanel defaultSize={65} minSize={30}>
                        <PreviewPanel
                            rightPanel={rightPanel}
                            previewUrl={chatStore.currentPreviewUrl}
                            iframeKey={iframeKey}
                            isLoading={chatStore.isLoading}
                            fileTree={fileTree}
                            openFiles={openFiles}
                            activeFile={activeFile}
                            fileContents={fileContents}
                            isLoadingFile={isLoadingFile}
                            onPanelChange={setRightPanel}
                            onRefresh={() => setIframeKey(prev => prev + 1)}
                            onLoadFileTree={loadFileTree}
                            onFileSelect={loadFile}
                            onFileClose={closeFile}
                            onContentChange={updateFileContent}
                        />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </main>
        </div>
    )
}
