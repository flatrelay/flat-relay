'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ROUNDS, isHit, makeRounds, sunAt, type Tap } from '@/lib/games/flatline';

type Props = { seed: number; onWin: (run: { taps: Tap[]; misses: number; ms: number }) => void };

export function FlatLineGame({ seed, onWin }: Props) {
  const rounds = useMemo(() => makeRounds(seed), [seed]);
  const [round, setRound] = useState(0);
  const [flash, setFlash] = useState<'hit' | 'miss' | null>(null);
  const [misses, setMisses] = useState(0);
  const sunRef = useRef<HTMLDivElement>(null);
  const roundStart = useRef(0);
  const gameStart = useRef(0);
  const taps = useRef<Tap[]>([]);
  const done = useRef(false);

  // Animate the sun without re-rendering React every frame.
  useEffect(() => {
    roundStart.current = performance.now();
    if (round === 0) gameStart.current = roundStart.current;
    let raf = 0;
    const tick = (now: number) => {
      const x = sunAt(rounds[round], now - roundStart.current);
      if (sunRef.current) sunRef.current.style.left = `${x * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [round, rounds]);

  const tap = useCallback(() => {
    if (done.current) return;
    const ms = Math.round(performance.now() - roundStart.current);
    taps.current.push({ round, ms });
    if (isHit(rounds[round], ms)) {
      setFlash('hit');
      if (round + 1 === ROUNDS) {
        done.current = true;
        setTimeout(() => onWin({ taps: taps.current, misses, ms: Math.round(performance.now() - gameStart.current) }), 450);
      } else {
        setTimeout(() => setRound((r) => r + 1), 350);
      }
    } else {
      setMisses((m) => m + 1);
      setFlash('miss');
    }
    setTimeout(() => setFlash(null), 300);
  }, [round, rounds, misses, onWin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); tap(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tap]);

  const r = rounds[round];
  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between">
        <p className="text-lg">Land the sun in the band.</p>
        <p className="font-mono text-sm text-muted" aria-live="polite">Round {Math.min(round + 1, ROUNDS)} of {ROUNDS}</p>
      </div>

      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); tap(); }}
        aria-label="Tap to land the sun. Space or Enter also works."
        className={`relative mt-4 block h-52 w-full touch-none select-none overflow-hidden rounded-3xl border bg-panel transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-flat ${
          flash === 'hit' ? 'border-flat' : flash === 'miss' ? 'border-red-500/70' : 'border-line'
        }`}
      >
        {/* the band */}
        <span
          className={`absolute inset-y-0 transition-colors ${flash === 'hit' ? 'bg-flat/40' : 'bg-flat/15'}`}
          style={{ left: `${(r.center - r.width / 2) * 100}%`, width: `${r.width * 100}%` }}
        />
        {/* the flat horizon */}
        <span className="absolute inset-x-0 top-1/2 h-px bg-white/40" />
        {/* the sun */}
        <div ref={sunRef} className="absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-flat shadow-[0_0_24px_6px_rgba(215,255,58,0.45)]" />
        {flash === 'miss' && <span className="absolute bottom-3 left-0 right-0 text-center text-sm text-red-300">Missed, try again</span>}
      </button>

      <p className="mt-3 text-center text-xs text-muted">Tap the horizon, or press Space. Three landings unlock the gift.</p>
    </div>
  );
}
