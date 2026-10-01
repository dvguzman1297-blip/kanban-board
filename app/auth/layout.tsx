// Full-screen overlay so auth pages never show the sidebar shell
// (needed for /auth/reset-password, where the user is briefly signed in).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950 p-4">{children}</div>
  );
}
