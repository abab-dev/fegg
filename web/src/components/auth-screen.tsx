"use client"

import { useState } from "react"
import { useAuthStore } from "@/store/auth"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Loader2, Sparkles } from "lucide-react"

export function AuthScreen() {
    const setAuth = useAuthStore((state) => state.setAuth)
    const [isLoading, setIsLoading] = useState(false)

    async function onLogin(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setIsLoading(true)
        const formData = new FormData(e.currentTarget)
        const email = formData.get("email") as string
        const password = formData.get("password") as string

        try {
            const res = await api.post("auth/login", { json: { email, password } }).json<any>()
            setAuth(res.access_token, res.user)
            toast.success("Welcome back!")
        } catch (error: any) {
            toast.error("Login failed. Check your credentials.")
        } finally {
            setIsLoading(false)
        }
    }

    async function onRegister(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setIsLoading(true)
        const formData = new FormData(e.currentTarget)
        const email = formData.get("email") as string
        const password = formData.get("password") as string

        try {
            const res = await api.post("auth/register", { json: { email, password } }).json<any>()
            setAuth(res.access_token, res.user)
            toast.success("Account created successfully!")
        } catch (error: any) {
            toast.error("Registration failed. Email might be taken.")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
            {/* Background gradients */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl opacity-50 animate-blob" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-3xl opacity-50 animate-blob animation-delay-2000" />

            <Card className="w-[400px] z-10 glass-dark border-border/50 shadow-2xl">
                <CardHeader className="text-center">
                    <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-2">
                        <Sparkles className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                        FeGG
                    </CardTitle>
                    <CardDescription>
                        AI Frontend Generator
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="login" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="login">Login</TabsTrigger>
                            <TabsTrigger value="register">Register</TabsTrigger>
                        </TabsList>

                        <TabsContent value="login">
                            <form onSubmit={onLogin} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" name="email" type="email" placeholder="m@example.com" required disabled={isLoading} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password">Password</Label>
                                    <Input id="password" name="password" type="password" required disabled={isLoading} />
                                </div>
                                <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isLoading}>
                                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Login
                                </Button>
                            </form>
                        </TabsContent>

                        <TabsContent value="register">
                            <form onSubmit={onRegister} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="register-email">Email</Label>
                                    <Input id="register-email" name="email" type="email" placeholder="m@example.com" required disabled={isLoading} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="register-password">Password</Label>
                                    <Input id="register-password" name="password" type="password" required disabled={isLoading} />
                                </div>
                                <Button type="submit" className="w-full" disabled={isLoading}>
                                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Create Account
                                </Button>
                            </form>
                        </TabsContent>
                    </Tabs>
                </CardContent>
                <CardFooter className="flex justify-center text-xs text-muted-foreground">
                    Protected by industry standard encryption
                </CardFooter>
            </Card>
        </div>
    )
}
