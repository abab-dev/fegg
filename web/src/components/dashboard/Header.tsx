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

import { ModeToggle } from "@/components/mode-toggle"

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
    onDownload?: () => void
    onLogout: () => void
}

export function Header({
    user,
    currentSession,
    sessions,
    onMenuClick,
    onSelectSession,
    onViewAllProjects,
    onDownload,
    onLogout,
}: HeaderProps) {
    return (
        <div className="absolute top-0 left-0 right-0 h-12 bg-background/80 backdrop-blur-md border-b border-border/50 z-50 flex items-center justify-between px-4">

            <div className="flex items-center gap-3">
                <button
                    onClick={onMenuClick}
                    className="h-8 w-8 p-0 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                    <Menu className="h-4 w-4" />
                </button>

                <div className="h-6 w-6 rounded bg-primary flex items-center justify-center font-bold text-primary-foreground text-xs">
                    F
                </div>
                <span className="font-semibold text-sm text-foreground">FeGG</span>

                {currentSession && (
                    <>
                        <div className="h-4 w-px bg-border" />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground gap-1 text-sm font-normal">
                                    {currentSession.name || `Project ${currentSession.id.slice(0, 6)}`}
                                    <ChevronDown className="h-3 w-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48 bg-popover border-border">
                                {sessions.slice(0, 5).map((session) => (
                                    <DropdownMenuItem
                                        key={session.id}
                                        onClick={() => onSelectSession(session.id)}
                                        className={cn(
                                            "text-sm",
                                            session.id === currentSession.id && "bg-accent"
                                        )}
                                    >
                                        {session.name || `Project ${session.id.slice(0, 6)}`}
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator className="bg-border" />
                                <DropdownMenuItem onClick={onViewAllProjects} className="text-sm text-muted-foreground">
                                    View all projects...
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                )}
            </div>


            <div className="flex items-center gap-2">
                {currentSession && onDownload && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onDownload}
                        className="h-8 gap-2 text-muted-foreground hover:text-foreground px-2 hidden sm:flex"
                    >

                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="lucide lucide-download"
                        >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
                        </svg>
                        <span className="text-xs">Download</span>
                    </Button>
                )}

                <ModeToggle />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 gap-2 text-muted-foreground hover:text-foreground px-2">
                            <div className="h-6 w-6 rounded-full bg-primary/20 ring-1 ring-primary/30" />
                            <ChevronDown className="h-3 w-3" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-popover border-border">
                        <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{user?.email}</div>
                        <DropdownMenuSeparator className="bg-border" />
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
