/**
 * Flat Line: a sun slides along a flat horizon; tap to land it inside the band. Three rounds,
 * each faster with a narrower band. Pure and deterministic: the same seed + tap times always give
 * the same result, so a server can replay a run to verify it (open-challenge mode, later).
 */

export type Round = { speed: number; center: number; width: number; phase: number };
export type Tap = { round: number; ms: number }; // ms since that round started
export const ROUNDS = 3;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFor(chainId: number, campaignId: bigint): number {
  return Number((campaignId * 2654435761n + BigInt(chainId)) % 2147483647n);
}

export function makeRounds(seed: number): Round[] {
  const r = mulberry32(seed);
  return Array.from({ length: ROUNDS }, (_, i) => ({
    speed: 0.45 + i * 0.18 + r() * 0.1, // horizon crossings per second
    center: 0.18 + r() * 0.64, // band centre, 0..1 across the horizon
    width: 0.18 - i * 0.04, // band width, 0..1
    phase: r(), // where the sun starts
  }));
}

/** Sun position 0..1, bouncing between the two edges of the world. */
export function sunAt(round: Round, ms: number): number {
  const x = (round.phase + (ms / 1000) * round.speed) % 2;
  return x <= 1 ? x : 2 - x;
}

export function isHit(round: Round, ms: number): boolean {
  return Math.abs(sunAt(round, ms) - round.center) <= round.width / 2;
}

/** Replays a run: true if the hits land in order and every round is cleared. */
export function verifyRun(seed: number, taps: Tap[]): boolean {
  const rounds = makeRounds(seed);
  let current = 0;
  for (const t of taps) {
    if (t.round !== current || t.ms < 0 || t.ms > 120_000) return false;
    if (isHit(rounds[current], t.ms)) current += 1;
    if (current === ROUNDS) return true;
  }
  return false;
}
