import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { env, getSupabaseBrowserKey, getSupabaseServerKey, hasServerSupabaseEnv, hasSupabaseEnv } from "@/lib/env";
import { createBoundedSupabaseFetch } from "@/lib/supabase/fetch";

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

export async function getSupabaseServerClient() {
  if (!hasSupabaseEnv()) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL!, getSupabaseBrowserKey()!, {
    global: { fetch: createBoundedSupabaseFetch() },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookieList: CookieUpdate[]) {
        cookieList.forEach(({ name, value, options }) => {
          try { cookieStore.set(name, value, options); } catch { /* Server Components refresh through middleware. */ }
        });
      }
    }
  });
}

export function getSupabaseAdminClient() {
  if (!hasServerSupabaseEnv()) {
    return null;
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, getSupabaseServerKey()!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

// Anonymous, cookie-free client for pages that anyone can open (public report
// links). It carries only the publishable key, so the database itself - not
// application code - limits what it can read to the security-definer RPCs
// explicitly granted to the anon role.
export function getSupabasePublicClient() {
  if (!hasSupabaseEnv()) {
    return null;
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, getSupabaseBrowserKey()!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
