/**
 * Per-IP rate limiting.
 * 20 requests/day, 5s cooldown between requests.
 * In-memory Map — safe in Bun's single-threaded event loop.
 */

const DAILY_LIMIT = 20;
const COOLDOWN_MS = 5000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const ENTRY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface RateLimitEntry {
  dailyCount: number;
  dayStart: number;
  lastRequest: number;
}

const store = new Map<string, RateLimitEntry>();

// Prune stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store) {
    if (now - entry.lastRequest > ENTRY_TTL_MS) {
      store.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS);

function todayStart(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number; reason?: string } {
  const now = Date.now();
  const dayStart = todayStart();

  let entry = store.get(ip);

  if (!entry) {
    entry = { dailyCount: 0, dayStart, lastRequest: 0 };
    store.set(ip, entry);
  }

  // Reset daily count if new day
  if (entry.dayStart < dayStart) {
    entry.dailyCount = 0;
    entry.dayStart = dayStart;
  }

  // Check cooldown
  const elapsed = now - entry.lastRequest;
  if (entry.lastRequest > 0 && elapsed < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
    return { allowed: false, retryAfter: wait, reason: `Cooldown — wait ${wait}s` };
  }

  // Check daily cap
  if (entry.dailyCount >= DAILY_LIMIT) {
    return { allowed: false, reason: `Daily limit reached (${DAILY_LIMIT} requests/day)` };
  }

  // Allow
  entry.dailyCount++;
  entry.lastRequest = now;
  return { allowed: true };
}
