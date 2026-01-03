"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Plus, MessageSquare } from "lucide-react"

interface Session {
    id: string
    name?: string
}

interface ProjectsSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    sessions: Session[]
    currentSessionId: string | null
    onSelectSession: (id: string) => void
    onCreateSession: () => void
}

export function ProjectsSheet({
    open,
    onOpenChange,
    sessions,
    currentSessionId,
    onSelectSession,
    onCreateSession,
}: ProjectsSheetProps) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
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
                        onClick={onCreateSession}
                        className="w-full justify-start gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-none h-9 text-sm"
                    >
                        <Plus className="h-4 w-4" /> New Project
                    </Button>
                </div>
                <div className="flex-1 overflow-auto px-2">
                    <div className="text-xs text-zinc-500 px-2 pb-2 font-medium">Recent</div>
                    {sessions.map((session) => (
                        <button
                            key={session.id}
                            onClick={() => onSelectSession(session.id)}
                            className={cn(
                                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                                session.id === currentSessionId
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
    )
}
