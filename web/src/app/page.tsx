"use client"

import { useAuthStore } from "@/store/auth"
import { AuthScreen } from "@/components/auth-screen"
import { Dashboard } from "@/components/dashboard"
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

export default function Home() {
  const { token, user } = useAuthStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Show loading screen while hydrating
  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!token || !user) {
    return <AuthScreen />
  }

  return <Dashboard />
}
