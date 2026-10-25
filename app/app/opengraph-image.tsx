import { ImageResponse } from 'next/og';

// Link preview for every page (gift links included). It never shows amounts or messages:
// those live in the link's #fragment, which preview bots never receive.
export const alt = 'FLAT//RELAY: land the sun, keep the $WIF';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#1230C7', color: '#F4F1E4', position: 'relative', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', padding: '64px 72px 0', fontSize: 30, letterSpacing: 2, fontWeight: 700 }}>FLAT//RELAY</div>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '24px 72px 0', fontSize: 84, fontWeight: 800, lineHeight: 1.04 }}>
          <span>Land the sun.</span><span style={{ color: '#FFC52E' }}>Keep the $WIF.</span>
        </div>
        <div style={{ display: 'flex', padding: '24px 72px 0', fontSize: 30, color: '#C3CAF2' }}>
          Send $WIF as a link to play. Claim gas-free on Robinhood Chain.
        </div>
        {/* horizon */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, background: '#0B1E8C', display: 'flex' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 120, height: 2, background: '#F4F1E4', display: 'flex' }} />
        <div style={{ position: 'absolute', left: 820, bottom: 120, width: 180, height: 90, borderTopLeftRadius: 90, borderTopRightRadius: 90, background: '#FFC52E', display: 'flex' }} />
      </div>
    ),
    size,
  );
}
