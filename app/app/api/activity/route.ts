import { NextResponse, type NextRequest } from 'next/server';
import { blockTimes, fetchActivity, toJSON } from '@/lib/relay';
import { isSupportedChain } from '@/lib/gift';

// Every RelayEscrow event for a chain, read from the chain (server-side cache), with block times.
// Used by My gifts to show where each gift went. Public data only.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const chain = Number(req.nextUrl.searchParams.get('chain') ?? '4663');
  if (!isSupportedChain(chain)) return NextResponse.json({ error: 'Unsupported chain.' }, { status: 400 });
  try {
    const items = await fetchActivity(chain);
    const times = await blockTimes(chain, items.map((i) => i.block));
    return NextResponse.json(
      { items: items.map((i) => toJSON(i, times.get(i.block))) },
      { headers: { 'Cache-Control': 's-maxage=20, stale-while-revalidate=60' } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.split('\n')[0] : 'Chain read failed' }, { status: 502 });
  }
}
