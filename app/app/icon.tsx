import { ImageResponse } from 'next/og';

// Favicon / app icon: the sun on the flat horizon.
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#1230C7', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 6, right: 6, top: 40, height: 3, background: '#F4F1E4', display: 'flex' }} />
        <div style={{ position: 'absolute', left: 14, top: 22, width: 36, height: 18, borderTopLeftRadius: 18, borderTopRightRadius: 18, background: '#FFC52E', display: 'flex' }} />
      </div>
    ),
    size,
  );
}
