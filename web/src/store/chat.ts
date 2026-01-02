import { create } from 'zustand';

export interface Message {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
    steps?: Step[]; // Persisted tool/status steps
}

export interface Step {
    id: string
    type: "status" | "tool" | "preview" | "error"
    title: string
    status: "running" | "done" | "error"
    detail?: string
}

export interface Session {
    id: string;
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
    setSessions: (sessions: Session[]) => void;
    setCurrentSession: (id: string | null) => void;
    setPreviewUrl: (url: string | null) => void;
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
