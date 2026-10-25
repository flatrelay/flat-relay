'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The 80-second demo on the home page. Browsers only allow autoplay when the video is muted, so it starts
 * muted with English captions on, and a "Sound on" button switches to sound (captions stay available in the controls).
 * People who ask for reduced motion get the poster and press play themselves.
 */
export const YOUTUBE_URL = 'https://www.youtube.com/watch?v=Nuu1TgPQvUk';

export function DemoVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true; // set as a property: React doesn't reliably render the muted attribute
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    v.play().catch(() => { /* autoplay blocked (e.g. data saver): the poster and controls stay */ });
  }, []);

  function soundOn() {
    const v = ref.current;
    if (!v) return;
    v.muted = false;
    v.volume = 1;
    if (v.paused || v.ended) { if (v.ended) v.currentTime = 0; v.play().catch(() => {}); }
    for (const t of Array.from(v.textTracks)) t.mode = 'hidden'; // voice is on now; captions can be turned back on in the controls
    setMuted(false);
  }

  return (
    <div className="mt-12">
      <div className="mb-3 flex items-center justify-between gap-3">
        <a
          href={YOUTUBE_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#FF0033] py-1.5 pl-2.5 pr-3.5 text-xs font-semibold text-white shadow-lg transition hover:bg-[#d9002b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M8 5.5v13l11-6.5z" /></svg>
          Watch on YouTube<span className="sr-only"> (opens in a new tab)</span>
        </a>
        {muted && (
          <button
            type="button"
            onClick={soundOn}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-flat px-3.5 py-1.5 text-xs font-semibold text-ink shadow-lg hover:brightness-105"
          >
            <span aria-hidden>🔊</span> Sound on
          </button>
        )}
      </div>
    <figure className="relative overflow-hidden rounded-3xl border border-white/30 bg-panel shadow-[0_0_80px_rgba(255,197,46,0.12)]">
      <video
        ref={ref}
        className="block aspect-video w-full"
        poster="/video/flat-relay-demo-poster.jpg"
        playsInline
        controls
        preload="metadata"
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        aria-label="FLAT//RELAY demo video, 1 minute 20 seconds"
      >
        <source src="/video/flat-relay-demo.mp4" type="video/mp4" />
        <track kind="captions" src="/video/flat-relay-demo.en.vtt" srcLang="en" label="English" default />
      </video>
      <figcaption className="sr-only">
        The demo: fund a gift, share the link, play the 20-second game (or skip it), claim gas-free, pass it on. Voice: ElevenLabs.
      </figcaption>
    </figure>
    </div>
  );
}
