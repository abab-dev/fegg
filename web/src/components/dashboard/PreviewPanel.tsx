"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { RefreshCw, ExternalLink, Eye, Code, Loader2 } from "lucide-react"
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
        <div className="h-full w-full flex flex-col bg-[#0a0a0b]">
            {/* v0-style Top Bar */}
            <div className="h-12 border-b border-zinc-800 bg-[#0c0c0e] flex items-center px-4 gap-4 justify-between">
                {/* Left: Toggle */}
                <div className="flex items-center bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                    <button
                        onClick={() => onPanelChange('preview')}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                            rightPanel === 'preview'
                                ? "bg-zinc-800 text-white shadow-sm"
                                : "text-zinc-500 hover:text-zinc-300"
                        )}
                    >
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                    </button>
                    <button
                        onClick={() => {
                            onPanelChange('code')
                            if (fileTree.length === 0) onLoadFileTree()
                        }}
                        className={cn(
                            "px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                            rightPanel === 'code'
                                ? "bg-zinc-800 text-white shadow-sm"
                                : "text-zinc-500 hover:text-zinc-300"
                        )}
                    >
                        <Code className="h-3.5 w-3.5" />
                        Code
                    </button>
                </div>

                {/* Center: Browser Bar */}
                {rightPanel === 'preview' && (
                    <div className="flex-1 max-w-xl">
                        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1.5 text-xs text-zinc-400">
                            <div className={cn("h-2 w-2 rounded-full", previewUrl ? "bg-emerald-500" : "bg-orange-500/50")} />
                            <span className="flex-1 text-center font-mono truncate px-2">
                                {previewUrl ? new URL(previewUrl).host : 'Connecting...'}
                            </span>
                            <button
                                onClick={onRefresh}
                                disabled={!previewUrl}
                                className="hover:text-white transition-colors p-1"
                                title="Refresh Preview"
                            >
                                <RefreshCw className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    {previewUrl && rightPanel === 'preview' && (
                        <Button variant="ghost" size="sm" className="h-8 w-8 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg" asChild>
                            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        </Button>
                    )}
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
