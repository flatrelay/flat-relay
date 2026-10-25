import type { Address } from 'viem';
import type { ActivityItem } from './relay';

/**
 * Relay map: who gifted whom, built only from on-chain events.
 * An edge is creator -> recipient for every claim. A wallet "relays" when it claims a gift
 * and later funds a gift of its own. Self-claims (creator claiming their own gift) are counted
 * but not drawn, since they are not a hand-off.
 */
export type MapNode = { id: string; address: Address; depth: number; row: number; received: bigint; given: bigint; relayed: boolean };
export type MapEdge = { from: string; to: string; campaignId: bigint; amount: bigint; block: bigint };
export type RelayGraph = { nodes: MapNode[]; edges: MapEdge[]; longestChain: number; relayers: number; selfClaims: number };

const MAX_EDGES = 80; // keep the drawing readable; the full list is below it on /proof

export function buildRelayGraph(items: ActivityItem[]): RelayGraph {
  const asc = [...items].sort((a, b) => Number(a.block - b.block));
  const creatorOf = new Map<string, Address>();
  const fundedAt = new Map<string, bigint[]>(); // wallet -> blocks it funded gifts at
  for (const i of asc) {
    if (i.kind !== 'funded') continue;
    creatorOf.set(i.campaignId.toString(), i.actor);
    const k = i.actor.toLowerCase();
    fundedAt.set(k, [...(fundedAt.get(k) ?? []), i.block]);
  }

  let selfClaims = 0;
  let edges: MapEdge[] = [];
  for (const i of asc) {
    if (i.kind !== 'claimed') continue;
    const creator = creatorOf.get(i.campaignId.toString());
    if (!creator) continue;
    if (creator.toLowerCase() === i.actor.toLowerCase()) { selfClaims++; continue; }
    edges.push({ from: creator.toLowerCase(), to: i.actor.toLowerCase(), campaignId: i.campaignId, amount: i.amount, block: i.block });
  }
  edges = edges.slice(-MAX_EDGES);

  const addr = new Map<string, Address>();
  for (const i of asc) addr.set(i.actor.toLowerCase(), i.actor);
  const ids = Array.from(new Set(edges.flatMap((e) => [e.from, e.to])));
  const incoming = new Map<string, MapEdge[]>();
  const outgoing = new Map<string, MapEdge[]>();
  for (const e of edges) {
    incoming.set(e.to, [...(incoming.get(e.to) ?? []), e]);
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e]);
  }

  // Depth = generations from a wallet nobody gifted. BFS, first visit wins, so cycles stay finite.
  const depth = new Map<string, number>();
  // A root gave before it ever received (or never received), e.g. the first sender in a loop.
  const firstBlock = (es: MapEdge[] | undefined) => (es?.length ? es.reduce((m, e) => (e.block < m ? e.block : m), es[0].block) : null);
  const roots = ids.filter((id) => {
    const inB = firstBlock(incoming.get(id));
    const outB = firstBlock(outgoing.get(id));
    return inB === null || (outB !== null && outB < inB);
  });
  const queue = (roots.length ? roots : ids.slice(0, 1)).map((id) => { depth.set(id, 0); return id; });
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of outgoing.get(id) ?? []) {
      if (!depth.has(e.to)) { depth.set(e.to, depth.get(id)! + 1); queue.push(e.to); }
    }
  }
  for (const id of ids) if (!depth.has(id)) depth.set(id, 0); // part of an unrooted cycle

  const rows = new Map<number, number>();
  const nodes: MapNode[] = ids.map((id) => {
    const d = depth.get(id)!;
    const row = rows.get(d) ?? 0;
    rows.set(d, row + 1);
    const inE = incoming.get(id) ?? [];
    const firstReceived = inE.length ? inE[0].block : null;
    const relayed = firstReceived !== null && (fundedAt.get(id) ?? []).some((b) => b > firstReceived);
    return {
      id, address: addr.get(id)!, depth: d, row, relayed,
      received: inE.reduce((s, e) => s + e.amount, 0n),
      given: (outgoing.get(id) ?? []).reduce((s, e) => s + e.amount, 0n),
    };
  });

  return {
    nodes, edges, selfClaims,
    longestChain: nodes.length ? Math.max(...nodes.map((n) => n.depth)) : 0,
    relayers: nodes.filter((n) => n.relayed).length,
  };
}
