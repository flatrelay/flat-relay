import { NextResponse, type NextRequest } from 'next/server';
import { relayClaim, relayerStatus, type RelayRequest } from '@/lib/relayer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await relayerStatus());
}

export async function POST(req: NextRequest) {
  let body: RelayRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.ip || 'unknown';
  const r = await relayClaim(body, ip);
  return r.ok ? NextResponse.json({ hash: r.hash }) : NextResponse.json({ error: r.error }, { status: r.status });
}
