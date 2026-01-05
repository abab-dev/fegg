"use client"

import { useAuthStore } from "@/store/auth"
import { AuthScreen } from "@/components/auth-screen"
import { Dashboard } from "@/components/dashboard"
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { LandingPage } from "@/components/landing-page"

export default function Home() {
  const { token, user } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [pendingPrompt, setPendingPrompt] = useState<string | undefined>()

  useEffect(() => {
    setMounted(true)
  }, [])


  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (token && user) {

    return <Dashboard initialPrompt={pendingPrompt} />
  }

  if (showAuth) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowAuth(false)}
          className="absolute top-4 left-4 z-[60] text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
        >
          ← Back to Home
        </button>
        <AuthScreen />
      </div>
    )
  }

  return (
    <LandingPage
      onLoginClick={() => setShowAuth(true)}
      onPromptSubmit={(prompt) => {
        setPendingPrompt(prompt)
        setShowAuth(true)
      }}
    />
  )
}
