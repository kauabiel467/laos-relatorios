const DEFAULT_SUPABASE_TIMEOUT_MS = 8_000;

function timeoutSignal(timeoutMs: number, signal?: AbortSignal | null) {
  const deadline = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}

/**
 * Prevents a DNS or upstream Supabase failure from consuming the whole Vercel
 * function budget. Authentication/authorization still fails closed in each
 * protected page and API route.
 */
export function createBoundedSupabaseFetch(timeoutMs = DEFAULT_SUPABASE_TIMEOUT_MS): typeof fetch {
  return (input, init) => fetch(input, {
    ...init,
    signal: timeoutSignal(timeoutMs, init?.signal)
  });
}
