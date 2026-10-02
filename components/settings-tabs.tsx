"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Camera, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { inputCls } from "@/components/auth-card";
import { applyTheme, type ThemePref } from "@/lib/theme";
import { AVATAR_MAX_BYTES, AVATAR_TYPES, type ActionResult } from "@/lib/settings-schemas";
import {
  changePassword, removeAvatar, requestEmailChange, signOutEverywhere, updatePreferences, updateProfile, uploadAvatar,
} from "@/app/settings/actions";

export type SettingsProfile = {
  first_name: string; last_name: string; display_name: string; job_title: string; bio: string;
  avatar_url: string | null; default_board_id: string | null; theme: ThemePref;
  notify_invites: boolean; notify_mentions: boolean; notify_assignments: boolean;
};

const TABS = [["profile", "Profile"], ["security", "Security"], ["preferences", "Workspace & preferences"]] as const;
type Tab = (typeof TABS)[number][0];

const card = "rounded-xl border border-zinc-800 bg-zinc-900/60 p-5";
const primaryBtn = "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60";
const ghostBtn = "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-60";

function Field({ label, id, error, hint, children }: { label: string; id: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-zinc-300">{label}</label>
      {children}
      {error ? <p role="alert" className="mt-1 text-xs text-rose-300">{error}</p> : hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function Notice({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return result.ok
    ? <p role="status" className="text-sm text-emerald-300">{result.message}</p>
    : <p role="alert" className="text-sm text-rose-300">{result.error}</p>;
}

export function SettingsTabs({ profile, email, verified, pendingEmail, boards }: {
  profile: SettingsProfile; email: string; verified: boolean; pendingEmail: string | null; boards: { id: string; name: string }[];
}) {
  const [tab, setTab] = useState<Tab>("profile");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length][0];
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Settings sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-zinc-800">
        {TABS.map(([id, label], i) => (
          <button key={id} ref={(el) => { tabRefs.current[id] = el; }} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={(e) => onKey(e, i)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === id ? "border-indigo-500 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-5">
        {tab === "profile" && <ProfileTab profile={profile} email={email} />}
        {tab === "security" && <SecurityTab email={email} verified={verified} pendingEmail={pendingEmail} />}
        {tab === "preferences" && <PreferencesTab profile={profile} boards={boards} />}
      </div>
    </div>
  );
}

/* ---------------------------------- Profile ---------------------------------- */

function ProfileTab({ profile, email }: { profile: SettingsProfile; email: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: profile.first_name, last_name: profile.last_name, display_name: profile.display_name,
    job_title: profile.job_title, bio: profile.bio,
  });
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const errs = result && !result.ok ? result.fieldErrors ?? {} : {};

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => { setResult(await updateProfile(form)); router.refresh(); });
  };

  return (
    <>
      <AvatarCard url={profile.avatar_url} name={form.display_name || form.first_name || email} />
      <form onSubmit={save} className={`${card} space-y-4`}>
        <h2 className="text-sm font-semibold">Personal information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" id="first_name" error={errs.first_name}>
            <input id="first_name" required maxLength={40} value={form.first_name} onChange={set("first_name")} className={inputCls} />
          </Field>
          <Field label="Last name" id="last_name" error={errs.last_name}>
            <input id="last_name" maxLength={40} value={form.last_name} onChange={set("last_name")} className={inputCls} />
          </Field>
          <Field label="Display name" id="display_name" error={errs.display_name} hint="Shown to teammates instead of your full name.">
            <input id="display_name" maxLength={40} value={form.display_name} onChange={set("display_name")} className={inputCls} />
          </Field>
          <Field label="Job title / role" id="job_title" error={errs.job_title}>
            <input id="job_title" maxLength={80} value={form.job_title} onChange={set("job_title")} className={inputCls} />
          </Field>
        </div>
        <Field label="Bio / notes" id="bio" error={errs.bio} hint={`${form.bio.length}/500`}>
          <textarea id="bio" rows={4} maxLength={500} value={form.bio} onChange={set("bio")}
            className={`${inputCls} h-auto resize-y py-2`} />
        </Field>
        <div className="flex items-center gap-3">
          <button disabled={pending} className={primaryBtn}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save changes</button>
          <Notice result={result} />
        </div>
      </form>
    </>
  );
}

function AvatarCard({ url, name }: { url: string | null; name: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(url);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const initial = (name.trim()[0] ?? "?").toUpperCase();

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!AVATAR_TYPES[file.type]) return setResult({ ok: false, error: "Use a PNG, JPG, WebP or GIF image." });
    if (file.size > AVATAR_MAX_BYTES) return setResult({ ok: false, error: "Image must be 2 MB or smaller." });
    const fd = new FormData();
    fd.set("avatar", file);
    start(async () => {
      const res = await uploadAvatar(fd);
      setResult(res);
      if (res.ok && res.url) { setPreview(res.url); router.refresh(); }
    });
  };

  const remove = () => start(async () => {
    const res = await removeAvatar();
    setResult(res);
    if (res.ok) { setPreview(null); router.refresh(); }
  });

  return (
    <div className={`${card} flex flex-wrap items-center gap-4`}>
      {preview
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={preview} alt="Your avatar" className="h-20 w-20 rounded-full object-cover" />
        : <span aria-hidden className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-600 text-2xl font-semibold text-white">{initial}</span>}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Profile photo</h2>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept={Object.keys(AVATAR_TYPES).join(",")} onChange={onPick} className="sr-only" aria-label="Upload avatar" tabIndex={-1} />
          <button type="button" disabled={pending} onClick={() => fileRef.current?.click()} className={ghostBtn}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}{preview ? "Change" : "Upload"}
          </button>
          {preview && <button type="button" disabled={pending} onClick={remove} className={ghostBtn}><Trash2 className="h-4 w-4" />Remove</button>}
        </div>
        <p className="text-xs text-zinc-500">PNG, JPG, WebP or GIF, up to 2 MB.</p>
        <Notice result={result} />
      </div>
    </div>
  );
}

/* ---------------------------------- Security ---------------------------------- */

function SecurityTab({ email, verified, pendingEmail }: { email: string; verified: boolean; pendingEmail: string | null }) {
  return (
    <>
      <EmailCard email={email} verified={verified} pendingEmail={pendingEmail} />
      <PasswordCard />
      <SessionsCard />
    </>
  );
}

function EmailCard({ email, verified, pendingEmail }: { email: string; verified: boolean; pendingEmail: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const err = result && !result.ok ? result.fieldErrors?.email : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await requestEmailChange({ email: value });
      setResult(res);
      if (res.ok) { setEditing(false); setValue(""); }
    });
  };

  return (
    <section className={`${card} space-y-3`}>
      <h2 className="text-sm font-semibold">Email address</h2>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{email}</span>
        {verified
          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300"><BadgeCheck className="h-3.5 w-3.5" />Verified</span>
          : <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">Unverified</span>}
        {!editing && <button type="button" onClick={() => setEditing(true)} className={`${ghostBtn} ml-auto`}>Change email</button>}
      </div>
      {pendingEmail && <p className="text-xs text-amber-300">Waiting for confirmation of {pendingEmail}. Check your inbox (you may need to confirm from both addresses).</p>}
      {editing && (
        <form onSubmit={submit} className="space-y-3">
          <Field label="New email address" id="new_email" error={err} hint="We'll send a confirmation link. Your email only changes once you confirm it.">
            <input id="new_email" type="email" required autoComplete="email" value={value} onChange={(e) => setValue(e.target.value)} className={inputCls} />
          </Field>
          <div className="flex gap-2">
            <button disabled={pending} className={primaryBtn}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Send confirmation</button>
            <button type="button" onClick={() => { setEditing(false); setResult(null); }} className={ghostBtn}>Cancel</button>
          </div>
        </form>
      )}
      {!err && <Notice result={result} />}
    </section>
  );
}

function PasswordCard() {
  const empty = { current: "", next: "", confirm: "" };
  const [form, setForm] = useState(empty);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const errs = result && !result.ok ? result.fieldErrors ?? {} : {};

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await changePassword(form);
      setResult(res);
      if (res.ok) setForm(empty);
    });
  };

  return (
    <form onSubmit={submit} className={`${card} space-y-4`}>
      <h2 className="text-sm font-semibold">Change password</h2>
      <Field label="Current password" id="current" error={errs.current}>
        <input id="current" type="password" autoComplete="current-password" required value={form.current} onChange={set("current")} className={inputCls} />
      </Field>
      <Field label="New password" id="next" error={errs.next} hint="At least 8 characters with upper- and lowercase letters and a number.">
        <input id="next" type="password" autoComplete="new-password" required value={form.next} onChange={set("next")} className={inputCls} />
      </Field>
      <Field label="Confirm new password" id="confirm" error={errs.confirm}>
        <input id="confirm" type="password" autoComplete="new-password" required value={form.confirm} onChange={set("confirm")} className={inputCls} />
      </Field>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={primaryBtn}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Update password</button>
        <Notice result={result && (result.ok || !result.fieldErrors) ? result : null} />
      </div>
    </form>
  );
}

function SessionsCard() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const signOutHere = () => start(async () => {
    await createClient().auth.signOut();
    location.href = "/auth/login";
  });
  const signOutAll = () => {
    if (!confirm("Sign out of every device, including this one?")) return;
    start(async () => {
      const res = await signOutEverywhere();
      if (!res.ok) return setError(res.error);
      location.href = "/auth/login";
    });
  };

  return (
    <section className={`${card} space-y-3`}>
      <h2 className="text-sm font-semibold">Sessions</h2>
      <p className="text-sm text-zinc-500">Sign out of this browser, or revoke every active session on all of your devices.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={signOutHere} className={ghostBtn}>Sign out of this session</button>
        <button type="button" disabled={pending} onClick={signOutAll} className="inline-flex h-9 items-center rounded-lg border border-rose-500/40 px-3 text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-60">Sign out of all devices</button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    </section>
  );
}

/* ---------------------------------- Preferences ---------------------------------- */

const THEMES: [ThemePref, string][] = [["system", "System default"], ["dark", "Dark"], ["light", "Light"]];

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm">{label}</p>
        <p className="text-xs text-zinc-500">{hint}</p>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${checked ? "bg-indigo-600" : "bg-zinc-700"}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

function PreferencesTab({ profile, boards }: { profile: SettingsProfile; boards: { id: string; name: string }[] }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState({
    default_board_id: profile.default_board_id, theme: profile.theme,
    notify_invites: profile.notify_invites, notify_mentions: profile.notify_mentions, notify_assignments: profile.notify_assignments,
  });
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await updatePreferences(prefs);
      setResult(res);
      if (res.ok) { applyTheme(prefs.theme, true); router.refresh(); }
    });
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <section className={`${card} space-y-4`}>
        <h2 className="text-sm font-semibold">Workspace</h2>
        <Field label="Default board" id="default_board" hint="Opens automatically after sign-in and when you visit the dashboard. The overview stays available from Home in the sidebar.">
          <select id="default_board" value={prefs.default_board_id ?? ""} className={inputCls}
            onChange={(e) => setPrefs((p) => ({ ...p, default_board_id: e.target.value || null }))}>
            <option value="">Dashboard overview</option>
            {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-zinc-300">Theme</legend>
          <div className="inline-flex rounded-lg border border-zinc-700 p-0.5">
            {THEMES.map(([value, label]) => (
              <label key={value} className={`cursor-pointer rounded-md px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-400 ${prefs.theme === value ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-100"}`}>
                <input type="radio" name="theme" value={value} checked={prefs.theme === value} className="sr-only"
                  onChange={() => { setPrefs((p) => ({ ...p, theme: value })); applyTheme(value); }} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className={`${card} divide-y divide-zinc-800`}>
        <h2 className="pb-2 text-sm font-semibold">Email notifications</h2>
        <Toggle label="Board invitations" hint="When you're invited to a board" checked={prefs.notify_invites} onChange={(v) => setPrefs((p) => ({ ...p, notify_invites: v }))} />
        <Toggle label="Mentions" hint="When someone mentions you in a comment" checked={prefs.notify_mentions} onChange={(v) => setPrefs((p) => ({ ...p, notify_mentions: v }))} />
        <Toggle label="Task assignments" hint="When a task is assigned to you" checked={prefs.notify_assignments} onChange={(v) => setPrefs((p) => ({ ...p, notify_assignments: v }))} />
      </section>

      <div className="flex items-center gap-3">
        <button disabled={pending} className={primaryBtn}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Save preferences</button>
        <Notice result={result} />
      </div>
    </form>
  );
}
