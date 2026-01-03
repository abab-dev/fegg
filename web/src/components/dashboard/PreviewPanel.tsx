"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { RefreshCw, ExternalLink, Eye, Code, ChevronUp, Loader2 } from "lucide-react"
import { CodeEditor } from "./CodeEditor"

interface PreviewPanelProps {
    rightPanel: 'preview' | 'code'
    previewUrl: string | null
    iframeKey: number
    isLoading: boolean
    fileTree: string[]
    openFiles: string[]
    activeFile: string | null
    fileContents: Record<string, string>
    isLoadingFile: boolean
    onPanelChange: (panel: 'preview' | 'code') => void
    onRefresh: () => void
    onLoadFileTree: () => void
    onFileSelect: (path: string) => void
    onFileClose: (path: string) => void
    onContentChange: (path: string, content: string) => void
}

export function PreviewPanel({
    rightPanel,
    previewUrl,
    iframeKey,
    isLoading,
    fileTree,
    openFiles,
    activeFile,
    fileContents,
    isLoadingFile,
    onPanelChange,
    onRefresh,
    onLoadFileTree,
    onFileSelect,
    onFileClose,
    onContentChange,
}: PreviewPanelProps) {
    return (
        <div className="hidden md:flex flex-col flex-1 bg-[#0a0a0b]">
            {/* v0-style Top Bar */}
            <div className="h-10 border-b border-zinc-800 bg-[#0c0c0e] flex items-center px-2 gap-2">
                {/* Left: Back + Toggle */}
                <div className="flex items-center gap-1">
                    <button className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
                        <ChevronUp className="h-4 w-4 -rotate-90" />
                    </button>
                    <div className="flex items-center bg-zinc-800 rounded-md p-0.5">
                        <button
                            onClick={() => onPanelChange('preview')}
                            className={cn(
                                "p-1.5 rounded transition-all",
                                rightPanel === 'preview'
                                    ? "bg-zinc-700 text-white"
                                    : "text-zinc-500 hover:text-zinc-300"
                            )}
                            title="Preview"
                        >
                            <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={() => {
                                onPanelChange('code')
                                if (fileTree.length === 0) onLoadFileTree()
                            }}
                            className={cn(
                                "p-1.5 rounded transition-all",
                                rightPanel === 'code'
                                    ? "bg-zinc-700 text-white"
                                    : "text-zinc-500 hover:text-zinc-300"
                            )}
                            title="Code"
                        >
                            <Code className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>

                {/* Center: URL Bar */}
                <div className="flex-1 flex justify-center">
                    <div className="flex items-center gap-1 bg-zinc-800/60 rounded-lg px-2 py-1">
                        <button className="p-1 rounded text-zinc-500 hover:text-white transition-colors">
                            <ChevronUp className="h-3.5 w-3.5 -rotate-90" />
                        </button>
                        <button className="p-1 rounded text-zinc-500 hover:text-white transition-colors">
                            <ChevronUp className="h-3.5 w-3.5 rotate-90" />
                        </button>
                        <button className="p-1 rounded text-zinc-400 hover:text-white transition-colors" title="Desktop">
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="2" y="3" width="20" height="14" rx="2" />
                                <line x1="8" y1="21" x2="16" y2="21" />
                                <line x1="12" y1="17" x2="12" y2="21" />
                            </svg>
                        </button>
                        <span className="text-zinc-600 text-sm">/</span>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-0.5">
                    {previewUrl && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 text-zinc-500 hover:text-white hover:bg-zinc-800" asChild>
                            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 text-zinc-500 hover:text-white hover:bg-zinc-800"
                        onClick={onRefresh}
                        disabled={!previewUrl}
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative overflow-hidden">
                {rightPanel === 'preview' ? (
                    previewUrl ? (
                        <iframe
                            key={iframeKey}
                            src={previewUrl}
                            className="w-full h-full border-0 bg-white"
                            title="Preview"
                            sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-600 bg-[#0c0c0e]">
                            {isLoading ? (
                                <div className="text-center">
                                    <div className="relative mb-6">
                                        <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-orange-500/10 to-purple-500/10 flex items-center justify-center">
                                            <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
                                        </div>
                                    </div>
                                    <p className="text-sm text-zinc-500">Building your app...</p>
                                </div>
                            ) : (
                                <div className="text-center">
                                    <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center mb-6 mx-auto">
                                        <Eye className="h-8 w-8 text-zinc-600" />
                                    </div>
                                    <p className="text-sm text-zinc-500">Preview will appear here</p>
                                </div>
                            )}
                        </div>
                    )
                ) : (
                    <CodeEditor
                        fileTree={fileTree}
                        openFiles={openFiles}
                        activeFile={activeFile}
                        fileContents={fileContents}
                        isLoadingFile={isLoadingFile}
                        onFileSelect={onFileSelect}
                        onFileClose={onFileClose}
                        onContentChange={onContentChange}
                    />
                )}
            </div>
        </div>
    )
}
