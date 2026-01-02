import { cn } from "@/lib/utils"
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Message } from "@/store/chat"
import { Bot, User } from "lucide-react"

interface MessageBubbleProps {
    message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
    const isUser = message.role === "user"

    return (
        <div className={cn(
            "flex w-full gap-4 p-4",
            isUser ? "bg-muted/50" : "bg-transparent"
        )}>
            <div className="flex-shrink-0">
                <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg border",
                    isUser ? "bg-background border-border" : "bg-primary border-primary text-primary-foreground"
                )}>
                    {isUser ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                <div className="prose prose-invert max-w-none">
                    <ReactMarkdown
                        components={{
                            code({ node, className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || '')
                                return match ? (
                                    <SyntaxHighlighter
                                        {...props}
                                        style={vscDarkPlus}
                                        language={match[1]}
                                        PreTag="div"
                                        className="rounded-md border border-border/50 !bg-background/50 !p-4"
                                    >
                                        {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                ) : (
                                    <code {...props} className={cn("bg-muted px-1.5 py-0.5 rounded-sm font-mono text-sm", className)}>
                                        {children}
                                    </code>
                                )
                            }
                        }}
                    >
                        {message.content}
                    </ReactMarkdown>
                </div>
            </div>
        </div>
    )
}
