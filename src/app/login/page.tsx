"use client";

import { FormEvent, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setMessage(error ? "Unable to send a sign-in link." : "Check your email for the sign-in link.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <form className="w-full max-w-sm space-y-6" onSubmit={submit}>
        <div className="space-y-3 border-l border-primary pl-5">
          <div className="flex items-center gap-2 text-primary"><ShieldCheck className="size-5" /><span className="eyebrow text-primary">Private workspace</span></div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Sign in to Clipflow</h1>
          <p className="text-sm leading-6 text-muted-foreground">This dashboard is restricted to its provisioned owner.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <Button className="w-full font-semibold" disabled={submitting} type="submit">Send sign-in link</Button>
        {message && <p aria-live="polite" className="text-sm text-muted-foreground">{message}</p>}
      </form>
    </main>
  );
}
