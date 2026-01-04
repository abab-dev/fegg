"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Plus, MessageSquare, MoreVertical, Pencil, Trash, X, Check } from "lucide-react"

interface Session {
    id: string
    name?: string
    title?: string
}

interface ProjectsSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    sessions: Session[]
    currentSessionId: string | null
    onSelectSession: (id: string) => void
    onCreateSession: () => void
    onRenameSession: (id: string, name: string) => void
    onDeleteSession: (id: string) => void
}

export function ProjectsSheet({
    open,
    onOpenChange,
    sessions,
    currentSessionId,
    onSelectSession,
    onCreateSession,
    onRenameSession,
    onDeleteSession,
}: ProjectsSheetProps) {
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState("")

    function startRenaming(session: Session, e: React.MouseEvent) {
        e.stopPropagation()
        setEditingId(session.id)
        setEditName(session.title || session.name || `Project ${session.id.slice(0, 6)}`)
    }

    function saveRename(e: React.MouseEvent | React.FormEvent) {
        e.stopPropagation()
        if (editingId && editName.trim()) {
            onRenameSession(editingId, editName.trim())
        }
        setEditingId(null)
    }

    function cancelRename(e: React.MouseEvent) {
        e.stopPropagation()
        setEditingId(null)
    }

    function handleDelete(id: string, e: React.MouseEvent) {
        e.stopPropagation()
        onDeleteSession(id)
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="left" className="w-72 bg-[#0c0c0e] border-zinc-800 p-0 text-white">
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
                        <div
                            key={session.id}
                            onClick={() => !editingId && onSelectSession(session.id)}
                            className={cn(
                                "group relative w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between cursor-pointer",
                                session.id === currentSessionId
                                    ? "bg-zinc-800 text-white"
                                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                            )}
                        >
                            <div className="flex items-center gap-2 overflow-hidden flex-1">
                                <MessageSquare className="h-4 w-4 shrink-0" />
                                {editingId === session.id ? (
                                    <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                                        <Input
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            className="h-6 text-xs bg-zinc-900 border-zinc-700 min-w-0"
                                            autoFocus
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') saveRename(e)
                                                if (e.key === 'Escape') setEditingId(null)
                                            }}
                                        />
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveRename}>
                                            <Check className="h-3 w-3" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelRename}>
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <span className="truncate">{session.title || session.name || `Project ${session.id.slice(0, 6)}`}</span>
                                )}
                            </div>

                            {!editingId && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <MoreVertical className="h-3 w-3" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800 text-white w-32">
                                        <DropdownMenuItem onClick={(e) => startRenaming(session, e)}>
                                            <Pencil className="mr-2 h-3 w-3" /> Rename
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={(e) => handleDelete(session.id, e)}
                                            className="text-red-500 hover:text-red-400 focus:text-red-400"
                                        >
                                            <Trash className="mr-2 h-3 w-3" /> Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    )
}
