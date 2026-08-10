"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithUsername } from "@/app/login/actions";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await signInWithUsername(username, password);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-3 border-l border-primary pl-5">
          <div className="flex items-center gap-2 text-primary"><ShieldCheck className="size-5" /><span className="eyebrow text-primary">Private workspace</span></div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Sign in to Clipflow</h1>
          <p className="text-sm leading-6 text-muted-foreground">This dashboard is restricted to its provisioned owner.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-username">Username</Label>
            <Input
              id="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p aria-live="polite" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full font-semibold" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
