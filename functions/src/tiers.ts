/**
 * Al Bahr VIP tiers — Phase 13 Wave A.
 *
 * Design:
 *   - Config lives in settings/tierConfig (owner-editable). Every tier
 *     declares its threshold on ONE of: lifetime points, lifetime spend
 *     (SAR), or lifetime completed orders. Defaults ship out of the box so
 *     the app works even without an admin ever opening the editor.
 *   - Progress is computed against the customer's own aggregates on their
 *     customers/{uid} doc: lifetimePoints, lifetimeSpend, lifetimeOrders.
 *     Those aggregates are mirrored by the same server hooks that award
 *     points / stamp completion, so no client can inflate them.
 *   - recomputeTier writes back tier + tierName + tierProgress + nextTier
 *     onto customers/{uid} inside a transaction. It is safe to call from
 *     multiple hooks — the read-then-write inside a Firestore transaction
 *     stops racing writes from stomping on each other.
 *
 * The client renders the mirrored fields; it never picks the tier itself,
 * because the doc rule ("customers can only see their own doc") means the
 * only trusted authority for tier state is the server.
 */

import { getFirestore, Transaction, FieldValue } from 'firebase-admin/firestore';

export type TierMetric = 'points' | 'spend' | 'orders';

export interface TierRule {
  id: string;                // machine key, e.g. "bronze"
  name: string;              // display name (EN)
  nameAr?: string;
  emoji?: string;
  color?: string;
  metric: TierMetric;        // which lifetime aggregate the threshold is measured in
  min: number;               // inclusive lower bound on that aggregate
  pointsMult?: number;       // 1.0 default; applies to future orders
  perks?: string[];          // free-text perk lines (EN)
  perksAr?: string[];
}

export interface TierConfigDoc {
  tiers: TierRule[];
  updatedAt?: unknown;
}

// Baked-in defaults. Kept in the codebase so a fresh Firestore project boots
// with a working tier ladder — Bronze/Silver/Gold/VIP, spend-driven, with a
// mild points multiplier on the upper tiers.
export const DEFAULT_TIERS: TierRule[] = [
  { id: 'bronze', name: 'Bronze', nameAr: 'برونزي', emoji: '🥉', color: '#C97B3C', metric: 'spend', min: 0,    pointsMult: 1.0,  perks: ['Standard points'],          perksAr: ['نقاط قياسية'] },
  { id: 'silver', name: 'Silver', nameAr: 'فضي',   emoji: '🥈', color: '#8A97A6', metric: 'spend', min: 500,  pointsMult: 1.1,  perks: ['1.1× points'],              perksAr: ['نقاط ١.١×'] },
  { id: 'gold',   name: 'Gold',   nameAr: 'ذهبي',  emoji: '🥇', color: '#E8A21C', metric: 'spend', min: 1500, pointsMult: 1.25, perks: ['1.25× points', 'Priority'], perksAr: ['نقاط ١.٢٥×', 'أولوية'] },
  { id: 'vip',    name: 'VIP',    nameAr: 'كبار',  emoji: '💎', color: '#12B5C9', metric: 'spend', min: 4000, pointsMult: 1.5,  perks: ['1.5× points', 'Exclusive rewards'], perksAr: ['نقاط ١.٥×', 'مكافآت حصرية'] },
];

/** Load the config, filling in defaults for missing fields. Empty tiers → defaults. */
export async function loadTierConfig(): Promise<TierConfigDoc> {
  const db = getFirestore();
  try {
    const snap = await db.doc('settings/tierConfig').get();
    if (!snap.exists) return { tiers: DEFAULT_TIERS };
    const data = snap.data() as Partial<TierConfigDoc>;
    const tiers = Array.isArray(data.tiers) && data.tiers.length > 0
      ? data.tiers.map(sanitizeTier).filter((t): t is TierRule => !!t)
      : DEFAULT_TIERS;
    return { tiers: tiers.length ? tiers : DEFAULT_TIERS };
  } catch {
    return { tiers: DEFAULT_TIERS };
  }
}

function sanitizeTier(raw: any): TierRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim().toLowerCase().slice(0, 20);
  const name = String(raw.name || '').trim().slice(0, 40);
  const metric = (['points', 'spend', 'orders'] as const).includes(raw.metric) ? raw.metric : 'spend';
  const min = Math.max(0, Number(raw.min) || 0);
  if (!id || !name) return null;
  const out: TierRule = { id, name, metric, min };
  if (raw.nameAr) out.nameAr = String(raw.nameAr).slice(0, 40);
  if (raw.emoji) out.emoji = String(raw.emoji).slice(0, 6);
  if (raw.color) out.color = String(raw.color).slice(0, 24);
  const mult = Number(raw.pointsMult);
  if (Number.isFinite(mult) && mult > 0 && mult <= 10) out.pointsMult = Math.round(mult * 100) / 100;
  if (Array.isArray(raw.perks)) out.perks = raw.perks.slice(0, 6).map((p: any) => String(p).slice(0, 60));
  if (Array.isArray(raw.perksAr)) out.perksAr = raw.perksAr.slice(0, 6).map((p: any) => String(p).slice(0, 60));
  return out;
}

/** Pure evaluator — sortable, testable. Returns the highest-min tier the metrics qualify for. */
export function pickTier(
  tiers: TierRule[],
  aggregates: { points: number; spend: number; orders: number },
): { current: TierRule; next: TierRule | null; progress: number; remaining: number } {
  // Sort ascending so a customer at 1600 spend against thresholds
  // [0, 500, 1500, 4000] gets Gold rather than Silver.
  const sorted = tiers.slice().sort((a, b) => a.min - b.min);
  const val = (t: TierRule) => aggregates[t.metric] || 0;
  let current = sorted[0];
  for (const t of sorted) if (val(t) >= t.min) current = t;
  const idx = sorted.indexOf(current);
  const next = sorted[idx + 1] || null;
  if (!next) return { current, next: null, progress: 1, remaining: 0 };
  const span = Math.max(1, next.min - current.min);
  const have = val(next) - current.min;
  const progress = Math.max(0, Math.min(1, have / span));
  const remaining = Math.max(0, next.min - val(next));
  return { current, next, progress, remaining };
}

export interface TierSnapshot {
  tierId: string;
  tierName: string;
  tierEmoji?: string;
  tierMetric: TierMetric;
  tierMin: number;
  tierMult: number;
  nextTierId?: string;
  nextTierName?: string;
  nextTierMin?: number;
  nextTierMetric?: TierMetric;
  nextTierRemaining?: number;
  tierProgress: number;      // 0..1
  updatedAt: string;         // ISO
  computedFrom: {            // trace so support can eyeball why tier moved
    points: number;
    spend: number;
    orders: number;
  };
}

/**
 * Recompute the customer's tier snapshot from their current lifetime
 * aggregates and mirror it onto customers/{uid}. Idempotent (same input
 * yields same output) and transactional (races between a submitOrder and
 * an admin adjustment can't corrupt the snapshot).
 *
 * Returns the snapshot the customer doc now carries, or null if the
 * customer doesn't exist. Failures are swallowed and logged — a broken
 * tier update never blocks the order it was triggered from.
 */
export async function recomputeTier(customerUid: string): Promise<TierSnapshot | null> {
  const db = getFirestore();
  const cfg = await loadTierConfig();
  const custRef = db.doc(`customers/${customerUid}`);
  try {
    return await db.runTransaction(async (tx: Transaction) => {
      const custSnap = await tx.get(custRef);
      if (!custSnap.exists) return null;
      const data = custSnap.data() as any;
      const points = Number(data.points || data.loyaltyPoints || 0);
      const spend  = Number(data.lifetimeSpend || 0);
      const orders = Number(data.lifetimeOrders || 0);
      const decision = pickTier(cfg.tiers, { points, spend, orders });
      const snap: TierSnapshot = {
        tierId: decision.current.id,
        tierName: decision.current.name,
        tierEmoji: decision.current.emoji,
        tierMetric: decision.current.metric,
        tierMin: decision.current.min,
        tierMult: decision.current.pointsMult || 1,
        tierProgress: decision.progress,
        updatedAt: new Date().toISOString(),
        computedFrom: { points, spend, orders },
      };
      if (decision.next) {
        snap.nextTierId = decision.next.id;
        snap.nextTierName = decision.next.name;
        snap.nextTierMin = decision.next.min;
        snap.nextTierMetric = decision.next.metric;
        snap.nextTierRemaining = decision.remaining;
      }
      tx.update(custRef, {
        tier: snap,
        tierUpdatedAt: FieldValue.serverTimestamp(),
      });
      return snap;
    });
  } catch (err: any) {
    try { console.warn('[tiers.recomputeTier] failed:', err?.message || err); } catch {}
    return null;
  }
}

/**
 * Add to the customer's lifetime spend + order-count aggregates and then
 * recompute their tier. Called from submitOrder once the order lands. The
 * increment is idempotent per orderId — a retry with the same orderId is
 * a no-op (tracked via a lifetimeAggregates/{orderId} sentinel doc).
 */
export async function bumpLifetimeAndRecompute(input: {
  customerUid: string;
  orderId: string;
  orderTotal: number;
}): Promise<{ ok: boolean; tier?: TierSnapshot; changed?: boolean }> {
  const db = getFirestore();
  const orderTotal = Math.max(0, Number(input.orderTotal) || 0);
  const custRef = db.doc(`customers/${input.customerUid}`);
  const sentinelRef = db.doc(`customers/${input.customerUid}/lifetimeAggregates/${input.orderId}`);
  try {
    const applied = await db.runTransaction(async (tx: Transaction) => {
      const [custSnap, sentinelSnap] = await Promise.all([tx.get(custRef), tx.get(sentinelRef)]);
      if (!custSnap.exists) return { applied: false as const };
      if (sentinelSnap.exists) return { applied: false as const };
      const prevTierId = (custSnap.data() as any)?.tier?.tierId;
      tx.set(sentinelRef, {
        orderId: input.orderId,
        delta: orderTotal,
        at: new Date().toISOString(),
      });
      tx.update(custRef, {
        lifetimeSpend: FieldValue.increment(orderTotal),
        lifetimeOrders: FieldValue.increment(1),
      });
      return { applied: true as const, prevTierId };
    });
    if (!applied.applied) {
      // Fresh customer doc, or duplicate call — still return the current tier.
      const snap = await recomputeTier(input.customerUid);
      return { ok: true, tier: snap || undefined, changed: false };
    }
    const snap = await recomputeTier(input.customerUid);
    const changed = !!snap && snap.tierId !== applied.prevTierId;
    return { ok: true, tier: snap || undefined, changed };
  } catch (err: any) {
    try { console.warn('[tiers.bumpLifetimeAndRecompute] failed:', err?.message || err); } catch {}
    return { ok: false };
  }
}
