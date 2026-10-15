import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (["/flowdeck-mark.svg", "/theme-init.js", "/icon.svg", "/apple-icon.png"].includes(path)) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );
  const { data: { user }, error } = await supabase.auth.getUser();

  // Stale session cookie (refresh token no longer exists): drop it so we stop retrying every request
  const staleSession = error?.code === "refresh_token_not_found" || error?.code === "refresh_token_already_used";
  if (staleSession) {
    const authCookies = req.cookies.getAll().filter(({ name }) => name.startsWith("sb-"));
    const clearCookies = (r: NextResponse) => authCookies.forEach(({ name }) => r.cookies.delete(name));
    if (path.startsWith("/auth") || path === "/invite/accept") {
      authCookies.forEach(({ name }) => req.cookies.delete(name));
      res = NextResponse.next({ request: req });
      clearCookies(res);
      return res;
    }
    const redirect = NextResponse.redirect(new URL("/auth/login", req.url));
    clearCookies(redirect);
    return redirect;
  }

  const isAuthRoute = path.startsWith("/auth");
  const isInviteAcceptance = path === "/invite/accept";
  // These must stay reachable while signed in (recovery link creates a session)
  const allowWhenSignedIn = path.startsWith("/auth/reset-password") || path.startsWith("/auth/callback");

  if (!user && !isAuthRoute && !isInviteAcceptance) return NextResponse.redirect(new URL("/auth/login", req.url));
  if (user && isAuthRoute && !allowWhenSignedIn) return NextResponse.redirect(new URL("/", req.url));
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
