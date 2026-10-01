"use client";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, inputCls, btnCls } from "@/components/auth-card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/auth/reset-password`,
    });
    setLoading(false);
    if (error) setError(error.message); else setSent(true);
  };

  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a reset link"
      footer={<Link href="/auth/login" className="text-indigo-300 hover:underline">Back to sign in</Link>}>
      {sent ? (
        <p className="text-sm text-emerald-400">If that email has an account, a reset link is on its way.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button disabled={loading} className={btnCls}>{loading ? "Sending…" : "Send reset link"}</button>
        </form>
      )}
    </AuthCard>
  );
}
