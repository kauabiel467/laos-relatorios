import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env, getSupabaseBrowserKey, hasSupabaseEnv } from "@/lib/env";

type CookieUpdate = {
  name: string;
  value: string;
  options?: {
    domain?: string;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: "lax" | "strict" | "none" | boolean;
    secure?: boolean;
  };
};

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({
    request
  });

  if (!hasSupabaseEnv()) {
    return response;
  }

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL!, getSupabaseBrowserKey()!, {
    global: { fetch: (url: RequestInfo | URL, options?: RequestInit) => fetch(url, {...options, signal: AbortSignal.timeout(8000)}) },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookieList: CookieUpdate[]) {
        cookieList.forEach(({ name, value }) => request.cookies.set(name, value));
        cookieList.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  try { await supabase.auth.getUser(); } catch { /* Protected pages and APIs still verify authentication. */ }
  return response;
}
