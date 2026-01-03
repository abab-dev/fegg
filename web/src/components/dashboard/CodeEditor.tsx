"use client"

import { cn } from "@/lib/utils"
import { X, ChevronRight } from "lucide-react"
import Editor from '@monaco-editor/react'

interface CodeEditorProps {
    fileTree: string[]
    openFiles: string[]
    activeFile: string | null
    fileContents: Record<string, string>
    isLoadingFile: boolean
    onFileSelect: (path: string) => void
    onFileClose: (path: string) => void
    onContentChange: (path: string, content: string) => void
}

function getLanguage(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase()
    const map: Record<string, string> = {
        'tsx': 'typescript', 'ts': 'typescript', 'jsx': 'javascript', 'js': 'javascript',
        'css': 'css', 'json': 'json', 'html': 'html', 'md': 'markdown'
    }
    return map[ext || ''] || 'plaintext'
}

export function CodeEditor({
    fileTree,
    openFiles,
    activeFile,
    fileContents,
    isLoadingFile,
    onFileSelect,
    onFileClose,
    onContentChange,
}: CodeEditorProps) {
    return (
        <div className="flex flex-1 overflow-hidden">
            {/* File Tree Sidebar */}
            <div className="w-48 border-r border-zinc-800 bg-[#0c0c0e] overflow-y-auto scrollbar-thin">
                <div className="p-2 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                    Files
                </div>
                {fileTree.map((file) => (
                    <button
                        key={file}
                        onClick={() => onFileSelect(file)}
                        className={cn(
                            "w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-zinc-800/50 transition-colors",
                            activeFile === file && "bg-zinc-800 text-white"
                        )}
                    >
                        <ChevronRight className="h-3 w-3 text-zinc-600" />
                        <span className="truncate">{file.split('/').pop()}</span>
                    </button>
                ))}
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col">
                {/* Open File Tabs */}
                {openFiles.length > 0 && (
                    <div className="h-9 border-b border-zinc-800 flex items-center bg-[#0c0c0e] overflow-x-auto scrollbar-thin">
                        {openFiles.map((file) => (
                            <div
                                key={file}
                                className={cn(
                                    "flex items-center gap-2 px-3 h-full border-r border-zinc-800 cursor-pointer group",
                                    activeFile === file ? "bg-[#0a0a0b] text-white" : "text-zinc-500 hover:text-zinc-300"
                                )}
                                onClick={() => onFileSelect(file)}
                            >
                                <span className="text-xs truncate max-w-[100px]">{file.split('/').pop()}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onFileClose(file)
                                    }}
                                    className="opacity-0 group-hover:opacity-100 hover:text-white transition-opacity"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Monaco Editor */}
                <div className="flex-1">
                    {isLoadingFile ? (
                        <div className="flex items-center justify-center h-full text-zinc-500">
                            Loading...
                        </div>
                    ) : activeFile && fileContents[activeFile] !== undefined ? (
                        <Editor
                            height="100%"
                            language={getLanguage(activeFile)}
                            value={fileContents[activeFile]}
                            onChange={(value) => onContentChange(activeFile, value || '')}
                            theme="vs-dark"
                            options={{
                                fontSize: 13,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                smoothScrolling: true,
                                cursorBlinking: 'smooth',
                                padding: { top: 16 },
                            }}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-600">
                            <p className="text-sm">Select a file to edit</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
