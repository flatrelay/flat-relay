'use client';

import { useEffect, useRef } from 'react';

/**
 * The landing-page sun. It rises in from the left, then drifts slowly along the horizon, bouncing off
 * the edges. Touch it with the pointer and it's pushed away from where you touched it:
 *   - touch its left side and it shoots right; touch its right side and it shoots left
 *   - touch its bottom and it bounces up, then falls back and bounces a couple of times on the horizon
 *   - touch its top and it dips below the horizon, then pops back up
 * A tap works the same way on touch screens. With reduced motion it only hops sideways, away from the touch.
 */
const MIN = 2; // % of the horizon
const MAX = 92;
const DRIFT = 2.5; // %/s
const BURST = 45; // %/s right after a sideways push
const G = 2200; // px/s², pulls the sun back down onto the horizon
const LIFT = 2600; // px/s², pushes a dunked sun back up
const BOUNCE = 0.5; // energy kept on each bounce off the horizon
const SIDE = 0.3; // how far off-centre (as a fraction of the radius) a touch must be to count as a side/top/bottom touch
const COOLDOWN = 220; // ms between pushes, so one swipe doesn't count several times

export function HorizonSun() {
  const el = useRef<HTMLDivElement>(null);
  const s = useRef({
    x: -6, dir: 1 as 1 | -1, speed: 0, // horizontal: % along the horizon
    y: 0, vy: 0, dunk: false, // vertical: px from the horizon (negative = up)
    squash: 0, entering: true, reduced: false, lastHit: 0,
  });

  useEffect(() => {
    const st = s.current;
    st.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const node = el.current!;
    const place = () => {
      const q = st.squash; // squash on landing: wider and flatter for a moment
      node.style.left = `${st.x}%`;
      node.style.transform = `translateY(calc(-50% + ${st.y.toFixed(1)}px)) scale(${(1 + q * 0.18).toFixed(3)}, ${(1 - q * 0.18).toFixed(3)})`;
    };
    if (st.reduced) { st.x = 68; st.entering = false; place(); return; }

    // Entrance: CSS transition to 68%, then hand over to the animation loop.
    place();
    node.style.transition = 'left 2.8s cubic-bezier(0.22, 0.8, 0.24, 1)';
    const t1 = setTimeout(() => { node.style.left = '68%'; }, 200);
    const t2 = setTimeout(() => { node.style.transition = ''; st.x = 68; st.entering = false; st.speed = DRIFT; }, 3100);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!st.entering) {
        // sideways: ease back to a slow drift, bounce off the ends
        st.speed += (DRIFT - st.speed) * Math.min(1, dt * 1.6);
        st.x += st.dir * st.speed * dt;
        if (st.x > MAX) { st.x = MAX; st.dir = -1; }
        if (st.x < MIN) { st.x = MIN; st.dir = 1; }

        // up and down
        if (st.dunk) {
          st.vy -= LIFT * dt; // below the horizon: pushed back up
          st.y += st.vy * dt;
          if (st.y <= 0 && st.vy < 0) st.dunk = false; // popped out; gravity takes over from here
        } else if (st.y < 0 || st.vy !== 0) {
          st.vy += G * dt;
          st.y += st.vy * dt;
          if (st.y >= 0 && st.vy > 0) { // hit the horizon
            st.y = 0;
            st.squash = Math.min(1, st.vy / 900);
            st.vy = st.vy > 140 ? -st.vy * BOUNCE : 0;
          }
        }
        st.squash = Math.max(0, st.squash - dt * 6);
        place();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { clearTimeout(t1); clearTimeout(t2); cancelAnimationFrame(raf); };
  }, []);

  function push(e: React.PointerEvent<HTMLDivElement>) {
    const st = s.current;
    const node = el.current!;
    if (st.entering) return;
    const now = performance.now();
    if (now - st.lastHit < COOLDOWN) return;
    st.lastHit = now;

    // where on the sun the pointer touched, -1..1 from the centre
    const r = node.getBoundingClientRect();
    const radius = r.width / 2;
    const nx = (e.clientX - (r.left + radius)) / radius;
    const ny = (e.clientY - (r.top + r.height / 2)) / radius;

    // sideways: away from the touch. A straight top/bottom touch keeps its heading; a dead-centre tap turns it around.
    const side = Math.abs(nx) > SIDE;
    const centre = !side && Math.abs(ny) <= SIDE;
    const dir: 1 | -1 = nx > SIDE ? -1 : nx < -SIDE ? 1 : centre ? (st.dir === 1 ? -1 : 1) : st.dir;
    st.dir = dir;

    if (st.reduced) {
      st.x = Math.min(MAX, Math.max(MIN, st.x + dir * 30));
      node.style.left = `${st.x}%`;
      return;
    }
    if (side) st.speed = BURST;
    else if (centre) st.speed = BURST * 0.6;

    // the room above the horizon: half the horizon band, less the sun itself, capped so it doesn't fly into the buttons
    const band = node.parentElement?.getBoundingClientRect().height ?? 160;
    const up = Math.min(120, band * 0.6);
    const down = Math.max(16, band / 2 - radius - 4);
    if (ny > SIDE) { // touched the bottom: bounce up
      st.dunk = false;
      st.vy = -Math.sqrt(2 * G * up * Math.min(1, 0.55 + ny * 0.45));
    } else if (ny < -SIDE) { // touched the top: dip below the horizon, then pop back up
      st.dunk = true;
      st.vy = Math.sqrt(2 * LIFT * down);
    } else if (Math.abs(nx) <= SIDE) { // dead centre (a tap): a small hop as it turns
      st.dunk = false;
      st.vy = -Math.sqrt(2 * G * up * 0.35);
    }
  }

  return (
    <div
      ref={el}
      onPointerEnter={push}
      onPointerDown={push}
      className="absolute top-1/2 h-16 w-16 cursor-pointer rounded-full bg-flat shadow-[0_0_60px_18px_rgba(255,197,46,0.35)] transition-shadow duration-300 hover:shadow-[0_0_80px_28px_rgba(255,197,46,0.55)] sm:h-24 sm:w-24"
      style={{ left: '-6%', transform: 'translateY(-50%)', willChange: 'left, transform' }}
    />
  );
}
