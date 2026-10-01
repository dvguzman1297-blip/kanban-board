"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard, inputCls, btnCls } from "@/components/auth-card";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true); setError(null);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) { setError(error.message); setLoading(false); return; }
    router.replace("/");
    router.refresh();
  };

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="password" required placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button disabled={loading} className={btnCls}>{loading ? "Saving…" : "Update password"}</button>
      </form>
    </AuthCard>
  );
}
