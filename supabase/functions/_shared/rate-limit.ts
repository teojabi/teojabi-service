// Per-isolate, per-IP best-effort rate limiting for the public Edge Functions.
// Supabase may run multiple isolates, so this is a speed bump, not a hard quota.
// The primary layer remains Cloudflare/WAF in front of the custom domain.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5_000;

const DEFAULT_BOT_PATTERN =
  /(?:GPTBot|ChatGPT-User|OAI-SearchBot|CCBot|ClaudeBot|Claude-Web|anthropic-ai|Google-Extended|Bytespider|PerplexityBot|Amazonbot|Applebot-Extended|meta-externalagent|FacebookBot|cohere-ai|Diffbot|Omgilibot|ImagesiftBot|FriendlyCrawler|Scrapy|AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot|DataForSeoBot|Barkrowler)/i;

export function isBlockedBot(request: Request): boolean {
  return DEFAULT_BOT_PATTERN.test(String(request.headers.get("user-agent") ?? ""));
}

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
};

export function clientIp(request: Request): string {
  const forwarded = String(request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return (
    forwarded[forwarded.length - 1] ||
    String(request.headers.get("x-real-ip") ?? "").trim() ||
    "unknown"
  );
}

export function takeRateLimit(
  request: Request,
  scope: string,
  limit = 120,
  windowMs = 60_000,
): RateLimitResult {
  const now = Date.now();
  const key = `${clientIp(request)}:${scope}`;

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [staleKey, stale] of buckets) {
        if (stale.resetAt <= now) buckets.delete(staleKey);
      }
      if (buckets.size >= MAX_BUCKETS) {
        const oldest = buckets.keys().next().value;
        if (oldest) buckets.delete(oldest);
      }
    }
    bucket = { count: 0, resetAt: now + windowMs };
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return {
    ok: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfter,
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "Retry-After": String(result.retryAfter),
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
  };
}
