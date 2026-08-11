/**
 * Phase 16 — Marketing campaigns + Phase 15 audience segments.
 *
 * Storage layout (Firestore):
 *   settings/segments/{segmentId}   — reusable audience: filter rules +
 *                                     explicit include/exclude uids.
 *   settings/campaigns/{campaignId} — a reward-issuing programme scoped to
 *                                     an audience, a branch set, a time
 *                                     window, and a hard budget.
 *   campaignRewards/{id}            — per-customer reward issuance. Links
 *                                     back to campaignId + rewardId
 *                                     (Phase 10/11 reward doc) so a scan
 *                                     ties back to its campaign for
 *                                     reporting.
 *   campaignEvents/{id}             — append-only audit log (issued,
 *                                     redeemed, blocked-by-budget, etc.).
 *
 * Every campaign write is owner-only. Client rules deny direct writes to
 * these collections — the callables here are the only path. The runtime
 * fires reward tokens via the existing Phase 11 mintTokenFor helper so
 * scan/apply/redeem semantics are unchanged.
 */

import { getFirestore, FieldValue, Transaction } from 'firebase-admin/firestore';
import { mintTokenFor } from './rewardTokens.js';

// ── Types ─────────────────────────────────────────────────────────────

export interface SegmentRules {
  tierIn?: string[];              // ["bronze","silver","gold","vip"]
  minSpend?: number;
  maxSpend?: number;
  minOrders?: number;
  maxOrders?: number;
  inactiveDays?: number;          // last order was >= N days ago
  activeWithinDays?: number;      // last order was < N days ago
  favoriteBranch?: string;        // branchId
  minPoints?: number;
  maxPoints?: number;
}

export interface SegmentDoc {
  id: string;
  name: string;
  description?: string;
  rules?: SegmentRules;
  includeUids?: string[];         // always-in
  excludeUids?: string[];         // always-out
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export type CampaignRewardKind =
  | 'sr_discount'                 // fixed SR amount off order
  | 'percent_discount'            // % off order (value = percent 0-100)
  | 'bonus_points'                // extra loyalty points on next order (value = pts)
  | 'free_item'                   // free product on next order
  | 'upgrade'                     // size upgrade free
  | 'free_addon';                 // free side / sauce / drink

export interface CampaignReward {
  kind: CampaignRewardKind;
  value?: number;
  productId?: string | number;
  label: string;                  // human-readable, printed on receipt
  expiresInDays?: number;         // default 30
  minOrderSr?: number;            // optional min basket for redemption
}

export interface CampaignBudget {
  maxRewards?: number;            // hard cap on total issuance
  dailySrCap?: number;            // per-day cap on reward cost (SR)
  perCustomerLimit?: number;      // e.g. 1 per customer (default 1)
}

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'ended';

export interface CampaignDoc {
  id: string;
  name: string;
  description?: string;
  segmentId?: string;             // null → broadcast to all (respect include/exclude in a *broadcast* segment)
  branches?: string[];            // empty → every branch
  reward: CampaignReward;
  budget: CampaignBudget;
  startAt?: string;
  endAt?: string;
  activeHoursStart?: string;      // "HH:mm" — optional daily gate
  activeHoursEnd?: string;
  status: CampaignStatus;
  notifBody?: string;
  stats?: {
    issued?: number;
    redeemed?: number;
    revenueSr?: number;
    blockedByBudget?: number;
    reservedSrToday?: number;
    reservedSrDate?: string;      // "YYYY-MM-DD" — when reservedSrToday last reset
  };
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

// ── Audience resolution ───────────────────────────────────────────────

/**
 * Resolve a segment to a set of customer uids. Reads customers/{uid} in
 * a single 2000-doc scan and filters in memory — plenty of headroom for
 * the current customer base and keeps the implementation index-light.
 * At larger scale we swap in narrow indexed queries per rule.
 */
export async function evaluateSegment(seg: SegmentDoc): Promise<string[]> {
  const db = getFirestore();
  const rules = seg.rules || {};
  const now = Date.now();
  const uids = new Set<string>();

  (seg.includeUids || []).forEach(u => { if (u) uids.add(u); });

  const snap = await db.collection('customers').limit(2000).get();
  snap.forEach(doc => {
    const d = (doc.data() || {}) as any;
    const uid = doc.id;
    if (seg.excludeUids && seg.excludeUids.indexOf(uid) >= 0) return;

    // Tier gate
    if (rules.tierIn && rules.tierIn.length) {
      const tier = String(d.tierId || d.tier || '').toLowerCase();
      if (rules.tierIn.map(t => String(t).toLowerCase()).indexOf(tier) < 0) return;
    }

    // Spend / order-count / points / branch / recency gates
    const spend = Number(d.lifetimeSpend != null ? d.lifetimeSpend : (d.totalSpend || 0)) || 0;
    if (rules.minSpend != null && spend < rules.minSpend) return;
    if (rules.maxSpend != null && spend > rules.maxSpend) return;

    const orders = Number(d.totalOrders || d.ordersCount || 0) || 0;
    if (rules.minOrders != null && orders < rules.minOrders) return;
    if (rules.maxOrders != null && orders > rules.maxOrders) return;

    const points = Number(d.points != null ? d.points : (d.loyaltyPoints || 0)) || 0;
    if (rules.minPoints != null && points < rules.minPoints) return;
    if (rules.maxPoints != null && points > rules.maxPoints) return;

    if (rules.favoriteBranch) {
      const fav = String(d.favBranch || d.lastBranch || '');
      if (fav !== rules.favoriteBranch) return;
    }

    const lastAt = d.lastOrderAt
      ? (typeof d.lastOrderAt === 'string' ? new Date(d.lastOrderAt).getTime() : Number(d.lastOrderAt))
      : 0;
    const daysSince = lastAt ? Math.floor((now - lastAt) / 86_400_000) : Number.MAX_SAFE_INTEGER;
    if (rules.inactiveDays != null && daysSince < rules.inactiveDays) return;
    if (rules.activeWithinDays != null && daysSince > rules.activeWithinDays) return;

    uids.add(uid);
  });

  // Apply manual excludes AFTER include (belt+suspenders — excludes always win)
  (seg.excludeUids || []).forEach(u => uids.delete(u));

  return Array.from(uids);
}

// ── Runtime helpers ──────────────────────────────────────────────────

export function isCampaignActive(c: CampaignDoc, now: number = Date.now()): boolean {
  if (c.status !== 'active') return false;
  const s = c.startAt ? new Date(c.startAt).getTime() : 0;
  const e = c.endAt ? new Date(c.endAt).getTime() : Number.MAX_SAFE_INTEGER;
  if (now < s || now > e) return false;
  if (c.activeHoursStart && c.activeHoursEnd) {
    const d = new Date(now);
    const hm = d.getUTCHours() * 60 + d.getUTCMinutes();
    const [sh, sm] = c.activeHoursStart.split(':').map(Number);
    const [eh, em] = c.activeHoursEnd.split(':').map(Number);
    const sMin = (sh || 0) * 60 + (sm || 0);
    const eMin = (eh || 0) * 60 + (em || 0);
    // Same-day window; wrap not supported — a 22:00→02:00 window would need two entries.
    if (hm < sMin || hm > eMin) return false;
  }
  return true;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Estimate reward cost in SR for the budget check. */
export function estimateRewardCostSr(reward: CampaignReward): number {
  switch (reward.kind) {
    case 'sr_discount': return Number(reward.value) || 0;
    case 'percent_discount':
      // Rough estimate — assume min-order SR is representative if set, else 30 SR baseline.
      return ((Number(reward.value) || 0) / 100) * (Number(reward.minOrderSr) || 30);
    case 'bonus_points':
      // Points aren't SR; treat as zero for the daily SR cap so the cap
      // controls monetary rewards while points can flow freely.
      return 0;
    case 'free_item':
    case 'upgrade':
    case 'free_addon':
      // Without product-cost lookup we conservatively count them as 15 SR each.
      return 15;
    default: return 0;
  }
}

/**
 * Issue a campaign reward to a single customer. Runs inside a transaction:
 * checks the campaign is active, budgets aren't exhausted, and the
 * customer hasn't already been issued more than the per-customer limit.
 * On success, mints a Phase-11 reward token so the customer can scan or
 * type the code at checkout.
 */
export async function issueCampaignRewardTo(campaignId: string, customerUid: string): Promise<{
  ok: boolean;
  rewardId?: string;
  code?: string;
  error?: string;
}> {
  const db = getFirestore();
  const cRef = db.doc(`settings/campaigns/${campaignId}`);
  const custRef = db.doc(`customers/${customerUid}`);
  const rewardRef = db.collection('rewards').doc();
  const issuedRef = db.doc(`campaignRewards/${campaignId}_${customerUid}`);

  const result = await db.runTransaction(async (tx: Transaction) => {
    const [cSnap, custSnap, issuedSnap] = await Promise.all([
      tx.get(cRef), tx.get(custRef), tx.get(issuedRef),
    ]);
    if (!cSnap.exists) return { ok: false, error: 'campaign-not-found' as const };
    const c = cSnap.data() as CampaignDoc;

    if (!isCampaignActive(c)) return { ok: false, error: 'campaign-not-active' as const };
    if (!custSnap.exists) return { ok: false, error: 'customer-not-found' as const };

    const perCustLimit = Math.max(1, Number(c.budget?.perCustomerLimit) || 1);
    const already = issuedSnap.exists ? Number((issuedSnap.data() as any).count) || 0 : 0;
    if (already >= perCustLimit) return { ok: false, error: 'per-customer-limit' as const };

    const stats = c.stats || {};
    const issued = Number(stats.issued) || 0;
    if (c.budget?.maxRewards != null && issued >= c.budget.maxRewards) {
      return { ok: false, error: 'max-rewards' as const };
    }

    const cost = estimateRewardCostSr(c.reward);
    const today = todayIsoDate();
    let reservedToday = stats.reservedSrDate === today ? (Number(stats.reservedSrToday) || 0) : 0;
    if (c.budget?.dailySrCap != null && (reservedToday + cost) > c.budget.dailySrCap) {
      return { ok: false, error: 'daily-cap' as const };
    }

    const phone = String((custSnap.data() as any).phone || '');
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + Math.max(1, Number(c.reward.expiresInDays) || 30) * 86_400_000).toISOString();

    // Mint the reward doc first (Phase 10 shape) so mintTokenFor can attach.
    const rewardId = rewardRef.id;
    tx.set(rewardRef, {
      id: rewardId,
      ruleId: `__campaign__:${campaignId}`,
      ruleName: c.name || 'Campaign reward',
      customerUid,
      customerPhone: phone,
      kind: c.reward.kind,
      value: c.reward.value,
      productId: c.reward.productId,
      label: c.reward.label,
      status: 'available',
      issuedAt: nowIso,
      expiresAt: expiresIso,
      campaignId,
    });

    // Bump the per-(campaign,customer) counter.
    tx.set(issuedRef, {
      campaignId, customerUid,
      count: already + 1,
      lastIssuedAt: nowIso,
      lastRewardId: rewardId,
    }, { merge: true });

    // Update campaign stats atomically.
    tx.update(cRef, {
      'stats.issued': FieldValue.increment(1),
      'stats.reservedSrToday': (reservedToday + cost),
      'stats.reservedSrDate': today,
      updatedAt: nowIso,
    });

    return { ok: true, rewardId, phone } as const;
  });

  if (!result.ok) return { ok: false, error: result.error };

  // Mint the Phase-11 token outside the tx (rewardTokens collection has
  // its own signing key; keeping it out of the tx keeps the transaction
  // short + retriable).
  let code: string | undefined;
  try {
    const tok = await mintTokenFor(result.rewardId!);
    code = tok.code;
  } catch { /* reward exists even if the token step failed — customer can still redeem via panel */ }

  // Audit event (best-effort — never fail issuance because logging failed).
  try {
    await db.collection('campaignEvents').add({
      at: new Date().toISOString(),
      action: 'issued',
      campaignId,
      customerUid,
      rewardId: result.rewardId,
      code: code || null,
    });
  } catch { /* swallow */ }

  return { ok: true, rewardId: result.rewardId, code };
}

/**
 * Batch-issue a campaign to every uid in the audience. Reports per-uid
 * outcomes so the admin UI can show "Issued 42 · skipped 8 (already had
 * one) · blocked 3 (daily cap)". Sequential to keep the transaction load
 * predictable; the current customer base fits comfortably in one
 * function invocation.
 */
export async function issueCampaignToAudience(campaignId: string, uids: string[]): Promise<{
  issued: number;
  skipped: number;
  blocked: number;
  failed: number;
  reasons: Record<string, number>;
}> {
  const out = { issued: 0, skipped: 0, blocked: 0, failed: 0, reasons: {} as Record<string, number> };
  for (const uid of uids) {
    try {
      const r = await issueCampaignRewardTo(campaignId, uid);
      if (r.ok) { out.issued++; continue; }
      out.reasons[r.error || 'unknown'] = (out.reasons[r.error || 'unknown'] || 0) + 1;
      if (r.error === 'per-customer-limit') out.skipped++;
      else if (r.error === 'max-rewards' || r.error === 'daily-cap' || r.error === 'campaign-not-active') out.blocked++;
      else out.failed++;
    } catch {
      out.failed++;
    }
  }
  return out;
}
