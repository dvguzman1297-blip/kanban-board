"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, inputCls, btnCls } from "@/components/auth-card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  };

  return (
    <AuthCard
  title="Welcome back to FlowDeck"
  subtitle="Sign in to your workspace"
  footer={
    <div className="flex items-center justify-between text-xs text-zinc-500 w-full">
      <span>
        No account?{" "}
        <Link href="/auth/register" className="text-indigo-300 hover:underline">
          Register
        </Link>
      </span>
      <Link href="/auth/forgot-password" className="hover:text-zinc-300">
        Forgot password?
      </Link>
    </div>
  }
>
  <form onSubmit={onSubmit} className="space-y-3">
    <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
    <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
    {error && <p className="text-sm text-rose-400">{error}</p>}
    <button disabled={loading} className={btnCls}>{loading ? "Signing in…" : "Sign in"}</button>
  </form>
</AuthCard>
  );
}
