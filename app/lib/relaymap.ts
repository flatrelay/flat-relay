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

/** Every hand-off (creator -> claimer, self-claims excluded), oldest first. */
export function claimEdges(items: ActivityItem[]): MapEdge[] {
  const creatorOf = new Map<string, string>();
  for (const i of items) if (i.kind === 'funded') creatorOf.set(i.campaignId.toString(), i.actor.toLowerCase());
  return items
    .filter((i) => i.kind === 'claimed')
    .map((i) => ({ from: creatorOf.get(i.campaignId.toString()) ?? '', to: i.actor.toLowerCase(), campaignId: i.campaignId, amount: i.amount, block: i.block }))
    .filter((e) => e.from && e.from !== e.to)
    .sort((a, b) => Number(a.block - b.block));
}

/**
 * Longest relay chains: sequences of hand-offs where each gift was funded by the previous claimer,
 * after they received. (A sends to B, then B sends to C, ...) Ranked by number of hand-offs.
 */
export type RelayChain = { hops: number; wallets: string[]; gifts: string[]; lastBlock: bigint };
export function relayChains(items: ActivityItem[], limit = 5): RelayChain[] {
  const edges = claimEdges(items);
  const best: { len: number; prev: number }[] = [];
  const byTo = new Map<string, number[]>(); // wallet -> indexes of edges that delivered to it
  edges.forEach((e, i) => {
    let len = 1, prev = -1;
    for (const j of byTo.get(e.from) ?? []) {
      if (edges[j].block < e.block && best[j].len + 1 > len) { len = best[j].len + 1; prev = j; }
    }
    best.push({ len, prev });
    byTo.set(e.to, [...(byTo.get(e.to) ?? []), i]);
  });
  const order = edges.map((_, i) => i).sort((a, b) => best[b].len - best[a].len || Number(edges[b].block - edges[a].block));
  const display = new Map<string, string>(); // lowercase -> checksummed, for display
  for (const i of items) display.set(i.actor.toLowerCase(), i.actor);
  const used = new Set<number>();
  const byPath = new Map<string, RelayChain>(); // same wallets in the same order = one row, gifts merged
  for (const end of order) {
    if (used.has(end)) continue;
    const path: number[] = [];
    for (let k = end; k !== -1; k = best[k].prev) path.unshift(k);
    path.forEach((k) => used.add(k));
    const wallets = [edges[path[0]].from, ...path.map((k) => edges[k].to)];
    const key = wallets.join('>');
    const gifts = path.map((k) => edges[k].campaignId.toString());
    const prev = byPath.get(key);
    if (prev) {
      prev.gifts = Array.from(new Set([...prev.gifts, ...gifts])).sort((x, y) => Number(x) - Number(y));
      continue;
    }
    if (byPath.size >= limit) continue;
    byPath.set(key, { hops: path.length, wallets: wallets.map((w) => display.get(w) ?? w), gifts, lastBlock: edges[end].block });
  }
  return Array.from(byPath.values());
}

/**
 * Everyone a wallet's received $WIF reached next: wallets that claimed its later gifts, then theirs, and so on.
 * Each step must come after the wallet received (block order), so it follows the money forward in time.
 */
function reachFrom(edges: MapEdge[], wallet: string, afterBlock: bigint) {
  const seen = new Set<string>([wallet.toLowerCase()]);
  const gifts = new Set<string>();
  let frontier: { w: string; after: bigint; d: number }[] = [{ w: wallet.toLowerCase(), after: afterBlock, d: 0 }];
  let depth = 0;
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const f of frontier) {
      for (const e of edges) {
        if (e.from === f.w && e.block > f.after && !seen.has(e.to)) {
          seen.add(e.to);
          gifts.add(e.campaignId.toString());
          depth = Math.max(depth, f.d + 1);
          next.push({ w: e.to, after: e.block, d: f.d + 1 });
        }
      }
    }
    frontier = next;
  }
  seen.delete(wallet.toLowerCase());
  return { wallets: seen, gifts, depth };
}

/** Where a wallet's received $WIF went next: wallets reached by later gifts, and the longest onward chain. */
export function downstream(items: ActivityItem[], wallet: string, afterBlock: bigint): { reached: number; depth: number } {
  const r = reachFrom(claimEdges(items), wallet, afterBlock);
  return { reached: r.wallets.size, depth: r.depth };
}

/**
 * Widest reach: for each gift, how many different wallets it reached in the end. That is its own claimers,
 * plus everyone reached by gifts those claimers funded afterwards, and so on. Also the $WIF burned along the way
 * (1% of every gift in that tree). Ranked by wallets reached, then generations, then oldest first.
 */
export type ReachRow = { gift: string; creator: string; reached: number; generations: number; gifts: string[]; burned: bigint };
export function widestReach(items: ActivityItem[], limit = 5): ReachRow[] {
  const edges = claimEdges(items);
  const burnedOf = new Map<string, bigint>();
  const display = new Map<string, string>();
  for (const i of items) {
    display.set(i.actor.toLowerCase(), i.actor);
    if (i.kind === 'funded') burnedOf.set(i.campaignId.toString(), i.burned);
  }
  const rows: (ReachRow & { block: bigint })[] = [];
  for (const f of items) {
    if (f.kind !== 'funded') continue;
    const id = f.campaignId.toString();
    const direct = edges.filter((e) => e.campaignId.toString() === id);
    if (!direct.length) continue;
    const wallets = new Set<string>();
    const gifts = new Set<string>([id]);
    let generations = 1;
    for (const e of direct) {
      wallets.add(e.to);
      const r = reachFrom(edges, e.to, e.block);
      r.wallets.forEach((w) => wallets.add(w));
      r.gifts.forEach((g) => gifts.add(g));
      generations = Math.max(generations, 1 + r.depth);
    }
    wallets.delete(f.actor.toLowerCase()); // a gift that comes back round to its sender doesn't count them
    const giftList = Array.from(gifts).sort((x, y) => Number(x) - Number(y));
    rows.push({
      gift: id, creator: display.get(f.actor.toLowerCase()) ?? f.actor, reached: wallets.size, generations, gifts: giftList,
      burned: giftList.reduce((s, g) => s + (burnedOf.get(g) ?? 0n), 0n), block: f.block,
    });
  }
  return rows
    .filter((r) => r.reached > 0)
    .sort((a, b) => b.reached - a.reached || b.generations - a.generations || Number(a.block - b.block))
    .slice(0, limit)
    .map(({ block: _block, ...r }) => r);
}

/**
 * Activity with our own wallets taken out, for rankings: drops gifts our wallets funded (and all their claims),
 * and claims made by our wallets. What's left are hand-offs between outside wallets only.
 */
export function withoutWallets(items: ActivityItem[], isExcluded: (a: string) => boolean): ActivityItem[] {
  const excludedGifts = new Set(items.filter((i) => i.kind === 'funded' && isExcluded(i.actor)).map((i) => i.campaignId.toString()));
  return items.filter((i) => !excludedGifts.has(i.campaignId.toString()) && !(i.kind === 'claimed' && isExcluded(i.actor)));
}

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
