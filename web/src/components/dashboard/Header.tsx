"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Menu, ChevronDown, LogOut, Settings } from "lucide-react"

interface Session {
    id: string
    name?: string
}

interface HeaderProps {
    user: { email?: string } | null
    currentSession: Session | null
    sessions: Session[]
    onMenuClick: () => void
    onSelectSession: (id: string) => void
    onViewAllProjects: () => void
    onLogout: () => void
}

export function Header({
    user,
    currentSession,
    sessions,
    onMenuClick,
    onSelectSession,
    onViewAllProjects,
    onLogout,
}: HeaderProps) {
    return (
        <div className="absolute top-0 left-0 right-0 h-12 bg-[#09090b]/80 backdrop-blur-md border-b border-zinc-800/50 z-50 flex items-center justify-between px-4">
            {/* Left: Logo + Project */}
            <div className="flex items-center gap-3">
                <button
                    onClick={onMenuClick}
                    className="h-8 w-8 p-0 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                >
                    <Menu className="h-4 w-4" />
                </button>

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
                                {sessions.slice(0, 5).map((session) => (
                                    <DropdownMenuItem
                                        key={session.id}
                                        onClick={() => onSelectSession(session.id)}
                                        className={cn(
                                            "text-sm",
                                            session.id === currentSession.id && "bg-zinc-800"
                                        )}
                                    >
                                        {session.name || `Project ${session.id.slice(0, 6)}`}
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator className="bg-zinc-800" />
                                <DropdownMenuItem onClick={onViewAllProjects} className="text-sm text-zinc-400">
                                    View all projects...
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                )}
            </div>

            {/* Right: User */}
            <div className="flex items-center gap-2">
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
                        <DropdownMenuItem onClick={onLogout} className="text-sm text-red-400">
                            <LogOut className="h-4 w-4 mr-2" /> Logout
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}
