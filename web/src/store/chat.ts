import { create } from 'zustand';

// A "part" is either text or a tool step, stored in order
export type MessagePart =
    | { type: 'text'; content: string }
    | { type: 'tool'; id: string; title: string; status: 'running' | 'done' | 'error' }
    | { type: 'preview'; id: string; title: string; url: string; status: 'done' }

export interface Message {
    id?: string;
    role: 'user' | 'assistant';
    content: string;  // Keep for backwards compat / user messages
    timestamp?: string;
    parts?: MessagePart[];  // New: ordered list of text chunks and tool steps
    steps?: Step[];  // Deprecated but keep for loading old messages
}

export interface Step {
    id: string
    type: "status" | "tool" | "preview" | "error"
    title: string
    status: "running" | "done" | "error"
    detail?: string
    url?: string
}

export interface Session {
    id: string;
    name?: string;
    preview_url: string | null;
    status: string;
    created_at: string;
    title?: string;
}

interface ChatState {
    // Session State
    sessions: Session[];
    currentSessionId: string | null;
    currentPreviewUrl: string | null;

    // Message State
    messages: Message[];
    isLoading: boolean;
    isStreaming: boolean;

    // Actions
    // Actions
    setSessions: (sessions: Session[]) => void;
    setCurrentSession: (id: string | null) => void;
    setPreviewUrl: (url: string | null) => void;
    updateSession: (id: string, updates: Partial<Session>) => void;
    deleteSession: (id: string) => void;
    setMessages: (messages: Message[]) => void;
    addMessage: (message: Message) => void;
    updateLastMessage: (content: string) => void;
    setLoading: (loading: boolean) => void;
    setStreaming: (streaming: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
    sessions: [],
    currentSessionId: null,
    currentPreviewUrl: null,
    messages: [],
    isLoading: false,
    isStreaming: false,

    setSessions: (sessions) => set({ sessions }),
    setCurrentSession: (id) => set({ currentSessionId: id }),
    setPreviewUrl: (url) => set({ currentPreviewUrl: url }),

    updateSession: (id, updates) => set((state) => ({
        sessions: state.sessions.map(s => s.id === id ? { ...s, ...updates } : s)
    })),

    deleteSession: (id) => set((state) => ({
        sessions: state.sessions.filter(s => s.id !== id),
        currentSessionId: state.currentSessionId === id ? null : state.currentSessionId,
        messages: state.currentSessionId === id ? [] : state.messages,
        currentPreviewUrl: state.currentSessionId === id ? null : state.currentPreviewUrl
    })),

    setMessages: (messages) => set({ messages }),

    addMessage: (message) => set((state) => ({
        messages: [...state.messages, message]
    })),

    updateLastMessage: (content) => set((state) => {
        const msgs = [...state.messages];
        if (msgs.length > 0) {
            msgs[msgs.length - 1].content = content;
        }
        return { messages: msgs };
    }),

    setLoading: (isLoading) => set({ isLoading }),
    setStreaming: (isStreaming) => set({ isStreaming }),
}));
