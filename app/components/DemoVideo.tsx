'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The 80-second demo on the home page. Browsers only allow autoplay when the video is muted, so it starts
 * muted with English captions on, and a "Sound on" button switches to sound (captions stay available in the controls).
 * People who ask for reduced motion get the poster and press play themselves.
 */
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
    <figure className="relative mt-12 overflow-hidden rounded-3xl border border-white/30 bg-panel shadow-[0_0_80px_rgba(255,197,46,0.12)]">
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
      {muted && (
        <button
          type="button"
          onClick={soundOn}
          className="absolute right-3 top-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-flat px-4 py-2 text-sm font-semibold text-ink shadow-lg hover:brightness-105"
        >
          <span aria-hidden>🔊</span> Sound on
        </button>
      )}
      <figcaption className="sr-only">
        The demo: fund a gift, share the link, play the 20-second game (or skip it), claim gas-free, pass it on. Voice: ElevenLabs.
      </figcaption>
    </figure>
  );
}
