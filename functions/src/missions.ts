/**
 * Missions — Phase 13 Wave C.
 *
 * A mission is a short-lived, low-cost engagement task. It fires whenever
 * an order lands and matches the mission's target predicate. Kinds
 * shipped in this wave:
 *   - "combo"          — order includes item X AND item Y
 *   - "quiet_hours"    — order placed inside a time window (local HH:MM)
 *   - "product"        — order includes item X at least N times
 *   - "spend"          — order total ≥ N SAR
 *
 * Data lives in two places:
 *   missions/{id}                              — the definition (admin-managed)
 *   customerMissions/{missionId__customerUid}  — per-customer state row.
 * The composite id keeps a single doc-per-customer-per-mission which the
 * evaluator can look up by point read (no query) — Firestore stays cheap.
 *
 * All eligibility + payout runs server-side. The reward is either bonus
 * points (via the ledger) or a reward-rule id (which mints a Phase 11
 * token). Rewards are budget-capped per-mission and per-customer.
 *
 * Failures never roll back the order they were triggered from — mission
 * loss is not user-visible.
 */

import { getFirestore, Transaction, FieldValue } from 'firebase-admin/firestore';
import { appendLedger } from './points.js';
import { mintTokenFor } from './rewardTokens.js';
import { dispatchNotification } from './notifications.js';

export type MissionKind = 'combo' | 'quiet_hours' | 'product' | 'spend';

export interface MissionReward {
  bonusPoints?: number;      // if set, add these points
  rewardRuleId?: string;     // if set, mint a reward token from this rule
  label: string;             // for the notification body
  labelAr?: string;
}

export interface MissionDoc {
  id: string;
  title: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
  kind: MissionKind;
  active: boolean;
  fromISO?: string;
  toISO?: string;
  branches?: string[];       // empty / missing = any branch
  // Predicate fields — only the ones relevant to `kind` are read.
  itemIds?: string[];        // for combo (all must be in the cart) / product (any one)
  itemQty?: number;          // for product: minimum aggregate qty of listed items
  quietFromHHMM?: string;    // "22:00"
  quietToHHMM?: string;      // "04:00"  (may wrap past midnight)
  minSpend?: number;         // for spend
  reward: MissionReward;
  // Budget / cap
  maxCompletions?: number;             // total across all customers
  maxPerCustomer?: number;             // default 1
  completions?: number;                // running counter, updated by evaluator
  createdAt?: unknown;
  updatedAt?: unknown;
}

export async function loadMissions(): Promise<MissionDoc[]> {
  const db = getFirestore();
  try {
    const snap = await db.collection('missions').where('active', '==', true).get();
    return snap.docs.map((d) => sanitize({ id: d.id, ...(d.data() as any) })).filter((m): m is MissionDoc => !!m);
  } catch {
    return [];
  }
}

function sanitize(raw: any): MissionDoc | null {
  if (!raw?.id || !raw?.title || !raw?.kind || !raw?.reward) return null;
  const kind = (['combo', 'quiet_hours', 'product', 'spend'] as const).includes(raw.kind) ? raw.kind : null;
  if (!kind) return null;
  const reward = sanitizeReward(raw.reward);
  if (!reward) return null;
  const out: MissionDoc = {
    id: String(raw.id),
    title: String(raw.title).slice(0, 80),
    kind,
    active: raw.active !== false,
    reward,
  };
  if (raw.titleAr) out.titleAr = String(raw.titleAr).slice(0, 80);
  if (raw.description) out.description = String(raw.description).slice(0, 300);
  if (raw.descriptionAr) out.descriptionAr = String(raw.descriptionAr).slice(0, 300);
  if (raw.fromISO) out.fromISO = String(raw.fromISO);
  if (raw.toISO) out.toISO = String(raw.toISO);
  if (Array.isArray(raw.branches)) out.branches = raw.branches.map((s: any) => String(s)).slice(0, 20);
  if (Array.isArray(raw.itemIds)) out.itemIds = raw.itemIds.map((s: any) => String(s)).slice(0, 30);
  const qty = Number(raw.itemQty); if (Number.isFinite(qty) && qty > 0) out.itemQty = Math.floor(qty);
  if (raw.quietFromHHMM) out.quietFromHHMM = String(raw.quietFromHHMM).slice(0, 5);
  if (raw.quietToHHMM) out.quietToHHMM = String(raw.quietToHHMM).slice(0, 5);
  const s = Number(raw.minSpend); if (Number.isFinite(s) && s > 0) out.minSpend = s;
  const maxT = Number(raw.maxCompletions); if (Number.isFinite(maxT) && maxT > 0) out.maxCompletions = Math.floor(maxT);
  const maxC = Number(raw.maxPerCustomer); if (Number.isFinite(maxC) && maxC > 0) out.maxPerCustomer = Math.floor(maxC);
  else out.maxPerCustomer = 1;
  const done = Number(raw.completions); if (Number.isFinite(done) && done >= 0) out.completions = Math.floor(done);
  return out;
}

function sanitizeReward(raw: any): MissionReward | null {
  if (!raw) return null;
  const label = String(raw.label || 'Mission reward').slice(0, 60);
  const out: MissionReward = { label };
  if (raw.labelAr) out.labelAr = String(raw.labelAr).slice(0, 60);
  const bp = Number(raw.bonusPoints);
  if (Number.isFinite(bp) && bp > 0) out.bonusPoints = Math.floor(bp);
  if (raw.rewardRuleId) out.rewardRuleId = String(raw.rewardRuleId).slice(0, 60);
  if (!out.bonusPoints && !out.rewardRuleId) return null;
  return out;
}

interface OrderContext {
  customerUid: string;
  orderId: string;
  orderNo: string;
  orderTotal: number;
  branch: string;
  items: Array<{ id: string; qty: number; name: string }>;
  phone?: string;
  now?: Date;
}

/**
 * Match a mission's predicate against an order. Pure so it's easy to test.
 * Returns true only when the order fully satisfies the mission's target.
 */
export function orderMatchesMission(m: MissionDoc, o: OrderContext): boolean {
  const now = o.now || new Date();
  if (!m.active) return false;
  if (m.fromISO && now < new Date(m.fromISO)) return false;
  if (m.toISO && now > new Date(m.toISO)) return false;
  if (m.branches && m.branches.length > 0 && !m.branches.includes(o.branch)) return false;
  if ((m.maxCompletions || 0) > 0 && (m.completions || 0) >= (m.maxCompletions || 0)) return false;

  switch (m.kind) {
    case 'combo': {
      const ids = m.itemIds || [];
      if (ids.length === 0) return false;
      const present = new Set(o.items.map((i) => String(i.id)));
      return ids.every((id) => present.has(String(id)));
    }
    case 'product': {
      const ids = new Set((m.itemIds || []).map(String));
      if (ids.size === 0) return false;
      const need = m.itemQty || 1;
      const total = o.items.reduce((sum, it) => ids.has(String(it.id)) ? sum + (Number(it.qty) || 0) : sum, 0);
      return total >= need;
    }
    case 'spend': {
      return o.orderTotal >= (m.minSpend || 0);
    }
    case 'quiet_hours': {
      const [fH, fM] = (m.quietFromHHMM || '00:00').split(':').map(Number);
      const [tH, tM] = (m.quietToHHMM   || '00:00').split(':').map(Number);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const fromMin = (fH || 0) * 60 + (fM || 0);
      const toMin   = (tH || 0) * 60 + (tM || 0);
      if (fromMin === toMin) return false;
      // A wrap-around window (e.g. 22:00 → 04:00) is two disjoint intervals.
      return fromMin < toMin
        ? nowMin >= fromMin && nowMin < toMin
        : nowMin >= fromMin || nowMin < toMin;
    }
    default:
      return false;
  }
}

/**
 * Walk every active mission, mark newly-completed ones for this customer,
 * and issue their rewards. Idempotent per (mission × customer × order).
 */
export async function evaluateMissionsForOrder(o: OrderContext): Promise<{ ok: boolean; completed: number }> {
  const db = getFirestore();
  const missions = await loadMissions();
  if (missions.length === 0) return { ok: true, completed: 0 };

  let completed = 0;
  for (const m of missions) {
    try {
      if (!orderMatchesMission(m, o)) continue;
      const stateId = `${m.id}__${o.customerUid}`;
      const stateRef = db.doc(`customerMissions/${stateId}`);
      const missionRef = db.doc(`missions/${m.id}`);

      const applied = await db.runTransaction(async (tx: Transaction) => {
        const [stateSnap, missionSnap] = await Promise.all([tx.get(stateRef), tx.get(missionRef)]);
        if (!missionSnap.exists || (missionSnap.data() as any).active === false) return false;
        const priorCompletions = Number((missionSnap.data() as any).completions || 0);
        if ((m.maxCompletions || 0) > 0 && priorCompletions >= (m.maxCompletions || 0)) return false;
        const cur = stateSnap.exists ? (stateSnap.data() as any) : null;
        const priorCustCompletions = Number(cur?.completions || 0);
        if (priorCustCompletions >= (m.maxPerCustomer || 1)) return false;
        // Same-order idempotency — if we already stamped this order id we're a retry.
        if (cur?.lastOrderId === o.orderId) return false;

        tx.set(stateRef, {
          missionId: m.id,
          customerUid: o.customerUid,
          status: 'completed',
          completions: priorCustCompletions + 1,
          lastOrderId: o.orderId,
          lastOrderNo: o.orderNo,
          lastAt: new Date().toISOString(),
          firstAt: cur?.firstAt || new Date().toISOString(),
        }, { merge: true });
        tx.update(missionRef, {
          completions: FieldValue.increment(1),
          lastCompletedAt: FieldValue.serverTimestamp(),
        });
        return true;
      });

      if (!applied) continue;
      completed += 1;

      // Payout — bonus points OR a reward token. Order matters: points
      // through the ledger first (idempotent per dedupKey); token mint
      // after. Neither blocks the loop for other missions if it throws.
      if (m.reward.bonusPoints && m.reward.bonusPoints > 0) {
        try {
          await appendLedger({
            customerUid: o.customerUid,
            delta: m.reward.bonusPoints,
            reason: `Mission: ${m.reward.label}`,
            source: 'campaign.grant',
            sourceOrderId: o.orderId,
            sourceOrderNo: o.orderNo,
            dedupKey: `mission:${m.id}:${o.customerUid}:${o.orderId}`,
          });
        } catch (err) { /* logged */ }
      }
      if (m.reward.rewardRuleId) {
        try { await mintTokenFor(m.reward.rewardRuleId); } catch (err) { /* logged */ }
      }
      if (o.phone) {
        try {
          await dispatchNotification({
            templateName: 'mission.completed',
            ctx: { title: m.title, titleAr: m.titleAr || m.title, reward: m.reward.label, rewardAr: m.reward.labelAr || m.reward.label },
            phone: o.phone,
            uid: o.customerUid,
            dedupKey: `mission.completed:${m.id}:${o.customerUid}:${o.orderId}`,
            meta: { missionId: m.id, orderId: o.orderId },
          });
        } catch (err) { /* logged */ }
      }
    } catch (err: any) {
      try { console.warn('[missions.evaluate] mission failed:', m.id, err?.message || err); } catch {}
    }
  }
  return { ok: true, completed };
}
