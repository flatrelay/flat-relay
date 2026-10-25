/**
 * Flat Line: a sun slides along a flat horizon; tap to land it inside the band. Three rounds,
 * each faster with a narrower band. From round 2 the sun drifts: it speeds up and slows down
 * by a random amount, so you react instead of counting.
 *
 * Every play gets a fresh random seed (see newRunSeed), so the layout can't be memorised.
 * The engine is pure and deterministic for a given seed: the same seed + tap times always give
 * the same result, so a server can replay a run to verify it (open-challenge mode, later).
 */

export type Round = { speed: number; center: number; width: number; phase: number; drift: number; driftHz: number };
export type Tap = { round: number; ms: number }; // ms since that round started
export const ROUNDS = 3;

const SPEEDS = [0.6, 0.85, 1.1]; // base horizon crossings per second
const WIDTHS = [0.16, 0.125, 0.1]; // band width, 0..1 of the horizon
const DRIFT = [0, 0.22, 0.32]; // max speed swing (fraction of speed) per round

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable per-gift seed (kept for reference and for server-issued challenges later). */
export function seedFor(chainId: number, campaignId: bigint): number {
  return Number((campaignId * 2654435761n + BigInt(chainId)) % 2147483647n);
}

/** A fresh seed for one play: the gift's seed mixed with browser randomness. */
export function newRunSeed(base: number): number {
  const r = new Uint32Array(1);
  crypto.getRandomValues(r);
  return (base ^ r[0]) >>> 0;
}

export function makeRounds(seed: number): Round[] {
  const r = mulberry32(seed);
  return Array.from({ length: ROUNDS }, (_, i) => ({
    speed: SPEEDS[i] + r() * 0.15,
    center: 0.16 + r() * 0.68,
    width: WIDTHS[i],
    phase: r() * 2,
    drift: DRIFT[i] * (0.5 + r() * 0.5), // between half and full of the round's max swing
    driftHz: 0.45 + r() * 0.5, // how often the speed swings
  }));
}

/**
 * Sun position 0..1, bouncing between the two edges of the world.
 * Travel u(t) = speed·t + (speed·drift / ω)·sin(ωt): its rate is speed·(1 + drift·cos ωt), which
 * stays positive because drift < 1, so the sun never reverses on its own, it just surges and eases.
 */
export function sunAt(round: Round, ms: number): number {
  const t = ms / 1000;
  const w = 2 * Math.PI * round.driftHz;
  const u = round.speed * t + (round.drift ? (round.speed * round.drift / w) * Math.sin(w * t) : 0);
  const x = (((round.phase + u) % 2) + 2) % 2;
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
