'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/** Accessible tabs (WAI-ARIA tabs pattern): arrow keys / Home / End move between tabs. Panels are rendered on the server. */
export function LeaderboardTabs({ tabs }: { tabs: { id: string; label: string; panel: ReactNode }[] }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent) {
    const last = tabs.length - 1;
    const to = e.key === 'ArrowRight' ? (active === last ? 0 : active + 1)
      : e.key === 'ArrowLeft' ? (active === 0 ? last : active - 1)
      : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (to === null) return;
    e.preventDefault();
    setActive(to);
    refs.current[to]?.focus();
  }

  return (
    <div className="mt-4">
      <div role="tablist" aria-label="Leaderboards" className="flex gap-2" onKeyDown={onKey}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el; }}
            id={`${base}-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={i === active}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={`min-h-11 rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              i === active ? 'bg-flat text-ink' : 'border border-white/45 text-white hover:border-flat'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.id} id={`${base}-panel-${t.id}`} role="tabpanel" aria-labelledby={`${base}-tab-${t.id}`} hidden={i !== active} tabIndex={0} className="mt-4">
          {t.panel}
        </div>
      ))}
    </div>
  );
}
