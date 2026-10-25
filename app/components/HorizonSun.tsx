'use client';

import { useEffect, useRef } from 'react';

/**
 * The landing-page sun. It rises in from the left, then drifts slowly along the horizon, bouncing
 * at the edges. Hover (or tap) it and it turns around with a quick burst of speed, then eases back
 * to a drift. With reduced motion it stays put and just hops the other way on hover.
 */
const MIN = 2; // % of the horizon
const MAX = 92;
const DRIFT = 2.5; // %/s
const BURST = 45; // %/s right after a turn

export function HorizonSun() {
  const el = useRef<HTMLDivElement>(null);
  const s = useRef({ x: -6, dir: 1 as 1 | -1, speed: 0, entering: true, reduced: false });

  useEffect(() => {
    const st = s.current;
    st.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const node = el.current!;
    if (st.reduced) { st.x = 68; st.entering = false; node.style.left = '68%'; return; }

    // Entrance: CSS transition to 68%, then hand over to the drift loop.
    node.style.transition = 'left 2.8s cubic-bezier(0.22, 0.8, 0.24, 1)';
    const t1 = setTimeout(() => { node.style.left = '68%'; }, 200);
    const t2 = setTimeout(() => { node.style.transition = ''; st.x = 68; st.entering = false; st.speed = DRIFT; }, 3100);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!st.entering) {
        st.speed += (DRIFT - st.speed) * Math.min(1, dt * 1.6); // ease back to a drift
        st.x += st.dir * st.speed * dt;
        if (st.x > MAX) { st.x = MAX; st.dir = -1; }
        if (st.x < MIN) { st.x = MIN; st.dir = 1; }
        node.style.left = `${st.x}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { clearTimeout(t1); clearTimeout(t2); cancelAnimationFrame(raf); };
  }, []);

  function turn() {
    const st = s.current;
    if (st.entering) return;
    st.dir = st.dir === 1 ? -1 : 1;
    if (st.reduced) {
      st.x = Math.min(MAX, Math.max(MIN, st.x + st.dir * 30));
      el.current!.style.left = `${st.x}%`;
    } else {
      st.speed = BURST;
    }
  }

  return (
    <div
      ref={el}
      onPointerEnter={turn}
      onPointerDown={turn}
      className="absolute top-1/2 h-16 w-16 -translate-y-1/2 cursor-pointer rounded-full bg-flat shadow-[0_0_60px_18px_rgba(255,197,46,0.35)] transition-shadow duration-300 hover:shadow-[0_0_80px_28px_rgba(255,197,46,0.55)] sm:h-24 sm:w-24"
      style={{ left: '-6%' }}
    />
  );
}
