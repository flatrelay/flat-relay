import { formatUnits } from 'viem';
import { explorerAddress, type SupportedChainId } from '@/lib/chains';
import type { RelayGraph } from '@/lib/relaymap';

const COL = 230;
const ROW = 72;
const PAD_X = 32;
const PAD_Y = 40;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmt = (v: bigint) => Number(formatUnits(v, 18)).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Server-rendered SVG: generations left to right, one line per claim. */
export function RelayMap({ graph, chain }: { graph: RelayGraph; chain: SupportedChainId }) {
  if (!graph.edges.length) {
    return <p className="rounded-2xl border border-line bg-panel p-6 text-muted">No hand-offs yet. The map draws itself as gifts are claimed.</p>;
  }
  // Several gifts between the same two wallets share one line; the label lists them and sums the amount.
  const merged = new Map<string, { from: string; to: string; ids: string[]; amount: bigint }>();
  for (const e of graph.edges) {
    const k = `${e.from}>${e.to}`;
    const m = merged.get(k) ?? { from: e.from, to: e.to, ids: [], amount: 0n };
    m.ids.push(e.campaignId.toString());
    m.amount += e.amount;
    merged.set(k, m);
  }
  const lines = Array.from(merged.values());
  const pos = new Map(graph.nodes.map((n) => [n.id, { x: PAD_X + n.depth * COL, y: PAD_Y + n.row * ROW }]));
  const cols = Math.max(...graph.nodes.map((n) => n.depth)) + 1;
  const rows = Math.max(...graph.nodes.map((n) => n.row)) + 1;
  const w = PAD_X * 2 + (cols - 1) * COL + 60;
  const gridBottom = PAD_Y + (rows - 1) * ROW;
  const hasBack = lines.some((e) => pos.get(e.to)!.x <= pos.get(e.from)!.x);
  const loopY = gridBottom + 40; // gifts that travel back to an earlier generation loop under the map
  const h = (hasBack ? loopY + 24 : gridBottom + PAD_Y);

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="block min-w-full" role="img"
        aria-label={`Relay map: ${graph.nodes.length} wallets, ${graph.edges.length} hand-offs`}>
        {lines.map((e, i) => {
          const a = pos.get(e.from)!;
          const b = pos.get(e.to)!;
          const forward = b.x > a.x;
          // forward: S-curve between columns. Same column or backwards: a loop under the whole map.
          const d = forward
            ? `M${a.x + 8},${a.y} C${a.x + COL / 2},${a.y} ${b.x - COL / 2},${b.y} ${b.x - 8},${b.y}`
            : `M${a.x},${a.y + 8} C${a.x},${loopY} ${b.x},${loopY} ${b.x},${b.y + 8}`;
          const mx = (a.x + b.x) / 2;
          // under the line, clear of the address labels; for a loop, just under its lowest point
          const my = forward ? (a.y + b.y) / 2 + 18 : 0.125 * (a.y + b.y) + 0.75 * loopY + 14;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="#FFC52E" strokeOpacity={0.55} strokeWidth={1.5} />
              <text x={mx} y={my} textAnchor="middle" className="fill-muted font-mono" fontSize={11}>
                {e.ids.map((id) => `#${id}`).join(' ')} · {fmt(e.amount)}
              </text>
            </g>
          );
        })}
        {graph.nodes.map((n) => {
          const p = pos.get(n.id)!;
          return (
            <a key={n.id} href={explorerAddress(chain, n.address)} target="_blank" rel="noreferrer">
              <title>{`${n.address}\nreceived ${fmt(n.received)} · gave ${fmt(n.given)}${n.relayed ? ' · passed it on' : ''}`}</title>
              <circle cx={p.x} cy={p.y} r={n.relayed ? 8 : 6} fill={n.relayed || n.given > 0n ? '#FFC52E' : '#F4F1E4'} />
              <text x={p.x} y={p.y - 14} textAnchor={n.depth === 0 ? 'start' : 'middle'} dx={n.depth === 0 ? -8 : 0} className="fill-white font-mono" fontSize={12}>
                {short(n.address)}
              </text>
            </a>
          );
        })}
      </svg>
    </div>
  );
}
