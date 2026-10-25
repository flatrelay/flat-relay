'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FlatLineGame } from '@/components/FlatLineGame';

/** Practice: the real game, no gift, no wallet, nothing paid. */
export default function PlayPage() {
  const [round, setRound] = useState(0); // remounts the game for "Play again"
  const [result, setResult] = useState<{ misses: number; ms: number } | null>(null);
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));

  return (
    <section className="mx-auto max-w-md pt-12">
      <p className="rounded-lg border border-white/50 px-3 py-2 text-sm text-white">
        Practice round. No wallet, no $WIF, nothing is paid.
      </p>
      <h1 className="font-wide mt-6 text-4xl">Try Flat Line</h1>
      <p className="mt-3 text-muted">
        This is how your friends open a gift: land the sun inside the yellow band three times. Each round is faster, and
        from round 2 the sun speeds up and slows down. Tap the box, or press Space or Enter. Gift recipients can also skip
        the game.
      </p>

      {!result ? (
        <FlatLineGame key={round} seed={seed + round} onWin={(r) => setResult({ misses: r.misses, ms: r.ms })} />
      ) : (
        <div className="mt-8 rounded-3xl border border-white/40 bg-panel p-6" role="status">
          <p className="font-wide text-3xl">Landed.</p>
          <p className="mt-2 text-muted">
            {(result.ms / 1000).toFixed(1)} seconds{result.misses ? `, ${result.misses} miss${result.misses > 1 ? 'es' : ''}` : ', no misses'}.
            In a real gift, this is where the $WIF amount appears and you choose where to send it.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => { setResult(null); setRound((r) => r + 1); }}
              className="min-h-11 rounded-full border border-white/50 px-5 py-2.5 hover:border-flat">
              Play again
            </button>
            <Link href="/create" className="inline-flex min-h-11 items-center rounded-full bg-flat px-5 py-2.5 font-semibold text-ink">
              Send a real gift
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
