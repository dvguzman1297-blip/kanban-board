"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, inputCls, btnCls } from "@/components/auth-card";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true); setError(null);
    const { data, error } = await createClient().auth.signUp({
      email, password,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setLoading(false); return; }
    if (data.session) { router.replace("/"); router.refresh(); return; } // email confirmation off
    setNotice("Check your email to confirm your account, then sign in.");
    setLoading(false);
  };

  return (
    <AuthCard title="Create your workspace" subtitle="Your first board is set up automatically"
      footer={<>Already registered? <Link href="/auth/login" className="text-indigo-300 hover:underline">Sign in</Link></>}>
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        <input type="password" required placeholder="Password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}
        <button disabled={loading} className={btnCls}>{loading ? "Creating…" : "Create account"}</button>
      </form>
    </AuthCard>
  );
}
