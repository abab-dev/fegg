"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, Bot, Code, Zap } from "lucide-react"

interface LandingPageProps {
    onLoginClick: () => void
    onPromptSubmit: (prompt: string) => void
}

function ScrambleText({ text }: { text: string }) {
    const [display, setDisplay] = useState(text)
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"

    const onMouseEnter = () => {
        let iter = 0
        const interval = setInterval(() => {
            setDisplay(
                text.split("")
                    .map((l, i) => {
                        if (i < iter) return text[i]
                        return chars[Math.floor(Math.random() * chars.length)]
                    })
                    .join("")
            )
            if (iter >= text.length) clearInterval(interval)
            iter += 1 / 3
        }, 30)
    }

    return (
        <span
            className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest cursor-default group-hover:text-white transition-colors"
            onMouseEnter={onMouseEnter}
        >
            {display}
        </span>
    )
}

export function LandingPage({ onLoginClick, onPromptSubmit }: LandingPageProps) {
    // Unicorn Studio Initialization
    useEffect(() => {
        const script = document.createElement("script")
        script.src = "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.29/dist/unicornStudio.umd.js"
        script.onload = () => {
            // @ts-ignore
            if (window.UnicornStudio) {
                // @ts-ignore
                window.UnicornStudio.init()
            }
        }
        document.body.appendChild(script)

        return () => {
            if (document.body.contains(script)) {
                document.body.removeChild(script)
            }
        }
    }, [])

    const promptRef = useRef<HTMLTextAreaElement>(null)
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (promptRef.current && promptRef.current.value.trim()) {
            onPromptSubmit(promptRef.current.value.trim())
        }
    }

    return (
        <div className="relative min-h-screen bg-black text-white selection:bg-white selection:text-black overflow-hidden font-sans flex flex-col">
            {/* Global Backgrounds */}
            <div className="fixed inset-0 -z-30 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-black"></div>
                {/* Video background - subtle movement */}
                <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-screen" style={{ filter: "hue-rotate(150deg) contrast(1.1) saturate(0.5)" }}>
                    <source src="https://cdn.coverr.co/videos/coverr-digital-lines-moving-background-4770/1080p.mp4" type="video/mp4" />
                </video>
                {/* Gradient Overlay for professional 'Greyish' feel while keeping purple vibe */}
                <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black"></div>
            </div>

            <div className="fixed inset-0 pointer-events-none z-0 technical-grid opacity-10"></div>

            <div className="noise-overlay opacity-20"></div>

            {/* Navigation */}
            <nav className="fixed z-50 top-6 left-0 right-0 flex w-full max-w-[1400px] mx-auto px-6 items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-4 h-4 bg-white flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.3)]"></div>
                    <span className="text-xs font-bold tracking-widest text-white uppercase">
                        FeGG
                    </span>
                </div>

                <div className="flex items-center gap-4">
                    <button onClick={onLoginClick} className="flex items-center gap-2 text-[10px] font-medium text-zinc-400 uppercase tracking-widest hover:text-white transition-colors border border-transparent hover:border-white/10 px-3 py-1.5 rounded-full">
                        Login
                        <ArrowRight className="w-3 h-3" />
                    </button>
                </div>
            </nav>

            <main className="z-10 relative flex-1 flex flex-col justify-center items-center min-h-screen pb-20">
                {/* Hero */}
                <section className="w-full max-w-[1400px] mx-auto px-6 relative flex flex-col items-center text-center">
                    {/* Unicorn Studio Effect Container */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[800px] mix-blend-screen pointer-events-none -z-10 opacity-60">
                        <div className="absolute w-full h-full left-0 top-0" data-us-project="ILgOO23w4wEyPQOKyLO4"></div>
                    </div>

                    <div className="max-w-5xl mx-auto relative z-20 flex flex-col items-center gap-10">
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="inline-flex items-center gap-3 px-3 py-1.5 border border-white/10 rounded-full bg-zinc-900/50 backdrop-blur-md shadow-xl group cursor-default hover:border-white/20 transition-all"
                        >
                            <div className="flex items-center gap-2 px-1">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-50"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                                </span>
                                <ScrambleText text="AI ENGINE ONLINE" />
                            </div>
                            <div className="h-3 w-px bg-white/10"></div>
                            <span className="text-[10px] text-zinc-500 font-mono">v2.2 PRO</span>
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.3 }}
                            className="text-4xl md:text-5xl lg:text-7xl font-semibold tracking-tighter text-white leading-[1.1] drop-shadow-2xl"
                        >
                            What do you want to
                            <br />
                            <span className="text-zinc-400">
                                build today?
                            </span>
                        </motion.h1>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.4 }}
                            className="w-full max-w-2xl mx-auto mt-6"
                        >
                            {/* Big Input Box - High Visibility Mode */}
                            <form onSubmit={handleSubmit} className="relative group w-full">
                                {/* Subtle Glow */}
                                <div className="absolute -inset-1 bg-gradient-to-r from-white/10 to-zinc-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition duration-700"></div>

                                <div className="relative">
                                    <textarea
                                        ref={promptRef}
                                        placeholder="Describe your application..."
                                        className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-zinc-600 rounded-2xl p-6 text-2xl text-white placeholder:text-zinc-600 focus:ring-0 outline-none resize-none shadow-2xl min-h-[140px] leading-relaxed transition-all backdrop-blur-xl"
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault()
                                                handleSubmit(e)
                                            }
                                        }}
                                        autoFocus
                                    />
                                    <div className="absolute bottom-5 right-5 flex items-center gap-4">
                                        <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider hidden md:inline-block">Return to ship</span>
                                        <button type="submit" className="bg-white text-black px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-colors shadow-lg shadow-white/10">
                                            <span>Generate</span>
                                        </button>
                                    </div>
                                </div>
                            </form>

                            <div className="mt-12 flex items-center justify-center gap-8 text-zinc-600 text-[10px] font-mono uppercase tracking-widest">
                                <span className="flex items-center gap-2 hover:text-zinc-400 transition-colors cursor-default"><Bot className="w-3 h-3" /> GPT-4o</span>
                                <span className="w-px h-3 bg-zinc-800"></span>
                                <span className="flex items-center gap-2 hover:text-zinc-400 transition-colors cursor-default"><Code className="w-3 h-3" /> React 19</span>
                                <span className="w-px h-3 bg-zinc-800"></span>
                                <span className="flex items-center gap-2 hover:text-zinc-400 transition-colors cursor-default"><Zap className="w-3 h-3" /> Instant</span>
                            </div>
                        </motion.div>
                    </div>
                </section>
            </main>

            <footer className="fixed bottom-6 w-full text-center pointer-events-none z-10">
                <p className="text-[9px] text-zinc-700 font-mono uppercase tracking-widest">FeGG Inc. © 2024</p>
            </footer>
        </div>
    )
}
