'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The demo video on the home page, embedded from YouTube (privacy-enhanced youtube-nocookie.com domain).
 * Browsers only allow autoplay when muted, so it starts muted with English captions on; "Sound on" unmutes it
 * through YouTube's iframe API messages. People who ask for reduced motion get it paused and press play themselves.
 */
const VIDEO_ID = 'Nuu1TgPQvUk';
export const YOUTUBE_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

export function DemoVideo() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    // Built on the client so the embed knows our origin (needed for the Sound on button) and whether to autoplay.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const p = new URLSearchParams({
      autoplay: reduced ? '0' : '1',
      mute: '1',
      cc_load_policy: '1',
      cc_lang_pref: 'en',
      playsinline: '1',
      rel: '0',
      enablejsapi: '1',
      origin: window.location.origin,
    });
    setSrc(`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?${p}`);
  }, []);

  function soundOn() {
    const w = frame.current?.contentWindow;
    if (!w) return;
    const send = (func: string, args: unknown[] = []) =>
      w.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube-nocookie.com');
    send('unMute');
    send('setVolume', [100]);
    send('playVideo');
    setMuted(false);
  }

  return (
    <div className="mt-12">
      <figure className="relative overflow-hidden rounded-3xl border border-white/30 bg-panel shadow-[0_0_80px_rgba(255,197,46,0.12)]">
        <div className="relative aspect-video w-full">
          {src && (
            <iframe
              ref={frame}
              className="absolute inset-0 h-full w-full"
              src={src}
              title="FLAT//RELAY demo video (YouTube), 1 minute 20 seconds"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}
        </div>
        <figcaption className="sr-only">
          The demo: fund a gift, share the link, play the 20-second game (or skip it), claim gas-free, pass it on. Voice: ElevenLabs.
        </figcaption>
      </figure>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
        {muted && src && (
          <button
            type="button"
            onClick={soundOn}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-flat px-4 py-2 font-semibold text-ink hover:brightness-105"
          >
            <span aria-hidden>🔊</span> Play with sound
          </button>
        )}
        <a className="inline-flex min-h-11 items-center underline decoration-white/40 underline-offset-4 hover:text-white" href={YOUTUBE_URL} target="_blank" rel="noreferrer">
          Watch on YouTube<span aria-hidden>&nbsp;↗</span><span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}
