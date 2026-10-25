// Server-side only. Shared rate limits and a send lock for the relayer.
//
// With Upstash Redis configured (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or the KV_REST_API_*
// names the Vercel integration sets), every serverless instance shares the same counters, so limits hold
// no matter how many instances Vercel starts. Without it, or if Redis can't be reached, it falls back to
// per-instance memory: still limited, just less strictly. Talks to Upstash's REST API with fetch, so no
// extra npm packages.

const URL_ = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const PREFIX = 'flatrelay:';

export const limiterBackend = (): 'shared' | 'memory' => (URL_ && TOKEN ? 'shared' : 'memory');

type Cmd = (string | number)[];

async function redis(cmds: Cmd[]): Promise<unknown[]> {
  const res = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
    cache: 'no-store',
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  return out.map((r) => {
    if (r.error) throw new Error(`Upstash: ${r.error}`);
    return r.result;
  });
}

// ---- memory fallback ----
const mem = new Map<string, { n: number; until: number }>();
function memIncr(key: string, ttlSec: number, by = 1) {
  const now = Date.now();
  const e = mem.get(key);
  const cur = e && e.until > now ? e : { n: 0, until: now + ttlSec * 1000 };
  cur.n += by;
  mem.set(key, cur);
  if (mem.size > 5000) for (const [k, v] of mem) if (v.until <= now) mem.delete(k);
  return cur.n;
}
function memGet(key: string) {
  const e = mem.get(key);
  return e && e.until > Date.now() ? e.n : 0;
}

/** Fixed-window counter. Returns true when this hit goes over `max` within the window. */
export async function overLimit(name: string, max: number, windowSec: number): Promise<boolean> {
  const key = `${PREFIX}rl:${name}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  if (limiterBackend() === 'shared') {
    try {
      const [n] = await redis([['INCR', key], ['EXPIRE', key, windowSec + 5]]);
      return Number(n) > max;
    } catch (e) {
      console.warn('[ratelimit] Redis unavailable, using memory', e instanceof Error ? e.message : e);
    }
  }
  return memIncr(key, windowSec + 5) > max;
}

/** Daily counter that only goes up on success (so failed claims don't use up the day). */
const dayKey = () => `${PREFIX}day:${new Date().toISOString().slice(0, 10)}`;
export async function dailyCount(): Promise<number> {
  if (limiterBackend() === 'shared') {
    try { return Number((await redis([['GET', dayKey()]]))[0] ?? 0); } catch {}
  }
  return memGet(dayKey());
}
export async function bumpDaily(): Promise<void> {
  if (limiterBackend() === 'shared') {
    try { await redis([['INCR', dayKey()], ['EXPIRE', dayKey(), 2 * 86400]]); return; } catch {}
  }
  memIncr(dayKey(), 2 * 86400);
}

// ---- send lock: one relayer transaction at a time across all instances (nonce safety) ----
let localQueue: Promise<unknown> = Promise.resolve();
const RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export async function withSendLock<T>(chainId: number, fn: () => Promise<T>): Promise<T> {
  // Always serialise inside this instance.
  const run = localQueue.then(() => withRedisLock(chainId, fn));
  localQueue = run.catch(() => {});
  return run;
}

async function withRedisLock<T>(chainId: number, fn: () => Promise<T>): Promise<T> {
  if (limiterBackend() === 'memory') return fn();
  const key = `${PREFIX}lock:send:${chainId}`;
  const token = crypto.randomUUID();
  const until = Date.now() + 10_000;
  let held = false;
  try {
    while (!held) {
      const [r] = await redis([['SET', key, token, 'NX', 'PX', 20_000]]);
      held = r === 'OK';
      if (!held) {
        if (Date.now() > until) throw new Error('Relayer busy. Try again in a moment.');
        await new Promise((s) => setTimeout(s, 200 + Math.random() * 200));
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Relayer busy')) throw e;
    console.warn('[ratelimit] lock unavailable, sending without it', e instanceof Error ? e.message : e);
    return fn();
  }
  try {
    return await fn();
  } finally {
    await redis([['EVAL', RELEASE, 1, key, token]]).catch(() => {});
  }
}
