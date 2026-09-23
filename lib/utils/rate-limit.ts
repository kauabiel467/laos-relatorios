import { NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Prevents unbounded growth across the lifetime of a long-lived server process.
function sweepExpired(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Simple in-memory fixed-window limiter. Good enough as an abuse barrier on a
 * single-instance deployment; it does not coordinate across processes, so it
 * is not a substitute for a shared store (e.g. Redis) under multi-instance load.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

export function requestIp(request: { headers: Headers }): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function tooManyRequestsResponse(result: RateLimitResult) {
  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Muitas tentativas. Aguarde um momento antes de tentar novamente." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
