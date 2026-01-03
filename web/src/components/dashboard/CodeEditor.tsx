"use client"

import { useState, useMemo } from 'react'
import { cn } from "@/lib/utils"
import { X, ChevronRight, ChevronDown, File, Folder } from "lucide-react"
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

// Tree node structure
interface TreeNode {
    name: string
    path: string
    isFolder: boolean
    children: TreeNode[]
}

// Build nested tree from flat file paths
function buildTree(paths: string[]): TreeNode[] {
    const root: TreeNode[] = []

    for (const path of paths) {
        const parts = path.split('/')
        let current = root
        let currentPath = ''

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i]
            currentPath = currentPath ? `${currentPath}/${part}` : part
            const isLast = i === parts.length - 1

            let existing = current.find(n => n.name === part)
            if (!existing) {
                existing = {
                    name: part,
                    path: currentPath,
                    isFolder: !isLast,
                    children: []
                }
                current.push(existing)
            }
            current = existing.children
        }
    }

    // Sort: folders first, then alphabetically
    const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
        return nodes
            .map(n => ({ ...n, children: sortNodes(n.children) }))
            .sort((a, b) => {
                if (a.isFolder && !b.isFolder) return -1
                if (!a.isFolder && b.isFolder) return 1
                return a.name.localeCompare(b.name)
            })
    }

    return sortNodes(root)
}

// Get file icon color based on extension
function getFileColor(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase()
    const colors: Record<string, string> = {
        'tsx': 'text-blue-400',
        'ts': 'text-blue-400',
        'jsx': 'text-yellow-400',
        'js': 'text-yellow-400',
        'css': 'text-purple-400',
        'json': 'text-yellow-500',
        'html': 'text-orange-400',
        'md': 'text-zinc-400',
    }
    return colors[ext || ''] || 'text-zinc-400'
}

function getLanguage(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase()
    const map: Record<string, string> = {
        'tsx': 'typescript', 'ts': 'typescript', 'jsx': 'javascript', 'js': 'javascript',
        'css': 'css', 'json': 'json', 'html': 'html', 'md': 'markdown'
    }
    return map[ext || ''] || 'plaintext'
}

// Recursive tree node component
function TreeNodeItem({
    node,
    depth,
    expanded,
    activeFile,
    onToggle,
    onSelect
}: {
    node: TreeNode
    depth: number
    expanded: Set<string>
    activeFile: string | null
    onToggle: (path: string) => void
    onSelect: (path: string) => void
}) {
    const isExpanded = expanded.has(node.path)
    const isActive = activeFile === node.path

    return (
        <div>
            <button
                onClick={() => node.isFolder ? onToggle(node.path) : onSelect(node.path)}
                className={cn(
                    "w-full text-left py-1 pr-2 text-xs flex items-center gap-1 hover:bg-zinc-800/50 transition-colors group",
                    isActive && !node.isFolder && "bg-zinc-800 text-white"
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
                {node.isFolder ? (
                    <>
                        {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-zinc-500 flex-shrink-0" />
                        ) : (
                            <ChevronRight className="h-3 w-3 text-zinc-500 flex-shrink-0" />
                        )}
                        <Folder className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
                    </>
                ) : (
                    <>
                        <span className="w-3" />
                        <File className={cn("h-3.5 w-3.5 flex-shrink-0", getFileColor(node.name))} />
                    </>
                )}
                <span className={cn(
                    "truncate",
                    node.isFolder ? "text-zinc-300" : "text-zinc-400 group-hover:text-zinc-200"
                )}>
                    {node.name}
                </span>
            </button>

            {node.isFolder && isExpanded && node.children.map(child => (
                <TreeNodeItem
                    key={child.path}
                    node={child}
                    depth={depth + 1}
                    expanded={expanded}
                    activeFile={activeFile}
                    onToggle={onToggle}
                    onSelect={onSelect}
                />
            ))}
        </div>
    )
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
    // Extract all folder paths and expand them by default
    const allFolders = useMemo(() => {
        const folders = new Set<string>()
        for (const path of fileTree) {
            const parts = path.split('/')
            let current = ''
            for (let i = 0; i < parts.length - 1; i++) {
                current = current ? `${current}/${parts[i]}` : parts[i]
                folders.add(current)
            }
        }
        return folders
    }, [fileTree])

    const [expanded, setExpanded] = useState<Set<string>>(() => allFolders)

    const tree = useMemo(() => buildTree(fileTree), [fileTree])

    const toggleFolder = (path: string) => {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(path)) {
                next.delete(path)
            } else {
                next.add(path)
            }
            return next
        })
    }

    return (
        <div className="flex flex-1 overflow-hidden h-full">
            {/* File Tree Sidebar */}
            <div className="w-56 border-r border-zinc-800 bg-[#0c0c0e] flex flex-col min-h-0">
                <div className="p-2 text-[11px] font-medium text-zinc-500 uppercase tracking-wider border-b border-zinc-800/50 flex-shrink-0">
                    Explorer
                </div>
                <div className="py-1 overflow-y-auto flex-1 scrollbar-thin">
                    {tree.map(node => (
                        <TreeNodeItem
                            key={node.path}
                            node={node}
                            depth={0}
                            expanded={expanded}
                            activeFile={activeFile}
                            onToggle={toggleFolder}
                            onSelect={onFileSelect}
                        />
                    ))}
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Open File Tabs */}
                {openFiles.length > 0 && (
                    <div className="h-9 border-b border-zinc-800 bg-[#0c0c0e] flex-shrink-0 overflow-x-auto scrollbar-thin" style={{ scrollbarWidth: 'thin' }}>
                        <div className="flex items-center h-full min-w-max">
                            {openFiles.map((file) => (
                                <div
                                    key={file}
                                    className={cn(
                                        "flex items-center gap-2 px-3 h-full border-r border-zinc-800 cursor-pointer group flex-shrink-0",
                                        activeFile === file ? "bg-[#0a0a0b] text-white" : "text-zinc-500 hover:text-zinc-300"
                                    )}
                                    onClick={() => onFileSelect(file)}
                                >
                                    <File className={cn("h-3 w-3", getFileColor(file.split('/').pop() || ''))} />
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
                    </div>
                )}

                {/* Monaco Editor */}
                <div className="flex-1 min-h-0">
                    {isLoadingFile ? (
                        <div className="flex items-center justify-center h-full text-zinc-500">
                            Loading...
                        </div>
                    ) : activeFile && fileContents[activeFile] !== undefined ? (
                        <Editor
                            height="100%"
                            language={getLanguage(activeFile)}
                            value={fileContents[activeFile]}
                            theme="vs-dark"
                            options={{
                                fontSize: 13,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                smoothScrolling: true,
                                cursorBlinking: 'smooth',
                                padding: { top: 16 },
                                readOnly: true,
                                domReadOnly: true,
                                scrollBeyondLastLine: false,
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
