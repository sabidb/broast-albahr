/**
 * Al Bahr Points ledger — Phase 12.
 *
 * Immutable append-only ledger under pointsLedger/{id}. Every earn or
 * redeem writes ONE entry with before/change/after so any balance can be
 * reconstructed by summing (or verified by scanning). The customer's live
 * balance mirrors on customers/{uid}.points, but the ledger is the source
 * of truth — a diff between the two is a bug worth surfacing.
 *
 * Concurrency: every mutation runs inside a Firestore transaction that
 * reads the customer doc, computes the new balance, and writes both the
 * ledger entry AND the customer doc atomically. Two racing earns can't
 * both succeed with a stale "before" value — one is retried by the SDK.
 *
 * Points-to-reward conversion happens through the Phase 10/11 reward
 * pipeline: a rule of kind = "bonus_points" tops up the ledger directly;
 * a customer-initiated redeem via redeemPointsForReward mints a reward
 * (Phase 11 token) and debits the ledger in one transaction.
 */

import { getFirestore, FieldValue, Transaction } from 'firebase-admin/firestore';

export type LedgerSource =
  | 'order.earned'
  | 'order.bonus'
  | 'streak.milestone'
  | 'referral.bonus'
  | 'campaign.grant'
  | 'redeem.reward'
  | 'admin.adjust';

export interface LedgerEntry {
  id: string;              // Firestore doc id
  customerUid: string;
  customerPhone: string;
  delta: number;           // positive earn, negative redeem
  before: number;
  after: number;
  reason: string;
  source: LedgerSource;
  sourceOrderId?: string;
  sourceOrderNo?: string;
  sourceRewardId?: string;
  at: string;              // ISO
  by?: string;             // uid of the actor for admin adjustments
}

/**
 * Compute the standard points-earned figure for an order total in SAR.
 * Tiered so smaller orders don't over-reward. Configurable in one place —
 * this mirrors the customer-app pointsForOrder heuristic so no surprises.
 */
export function pointsForOrderTotal(total: number): number {
  if (total >= 500) return 35;
  if (total >= 250) return 20;
  if (total >= 100) return 10;
  return 5;
}

/**
 * Append an entry to the ledger and update the balance atomically. Reject
 * writes that would take the balance negative (unless allowNegative is set,
 * reserved for admin adjustments).
 */
export async function appendLedger(input: {
  customerUid: string;
  delta: number;
  reason: string;
  source: LedgerSource;
  sourceOrderId?: string;
  sourceOrderNo?: string;
  sourceRewardId?: string;
  by?: string;
  allowNegative?: boolean;
  /** Optional stable id (dedup — e.g. `order.earned:{orderId}`) so a retry doesn't double-credit. */
  dedupKey?: string;
}): Promise<{ ok: boolean; entry?: LedgerEntry; error?: string; balance?: number }> {
  const db = getFirestore();
  const delta = Math.round(Number(input.delta) || 0);
  if (!Number.isFinite(delta) || delta === 0) return { ok: false, error: 'zero-delta' };
  const custRef = db.doc(`customers/${input.customerUid}`);
  const ledgerRef = input.dedupKey
    ? db.doc(`pointsLedger/${encodeURIComponent(input.dedupKey)}`)
    : db.collection('pointsLedger').doc();
  try {
    return await db.runTransaction(async (tx: Transaction) => {
      const custSnap = await tx.get(custRef);
      if (!custSnap.exists) return { ok: false, error: 'customer-not-found' };
      const before = Number((custSnap.data() as any).points) || 0;
      // Dedup — a retry with the same dedupKey is a no-op success.
      if (input.dedupKey) {
        const dupSnap = await tx.get(ledgerRef);
        if (dupSnap.exists) return { ok: true, entry: dupSnap.data() as LedgerEntry, balance: before };
      }
      const after = before + delta;
      if (after < 0 && !input.allowNegative) return { ok: false, error: 'insufficient-balance' };
      const nowIso = new Date().toISOString();
      const entry: LedgerEntry = {
        id: ledgerRef.id,
        customerUid: input.customerUid,
        customerPhone: String((custSnap.data() as any).phone || ''),
        delta,
        before,
        after,
        reason: input.reason,
        source: input.source,
        sourceOrderId: input.sourceOrderId,
        sourceOrderNo: input.sourceOrderNo,
        sourceRewardId: input.sourceRewardId,
        at: nowIso,
        by: input.by,
      };
      tx.set(ledgerRef, entry);
      tx.update(custRef, {
        points: after,
        pointsUpdatedAt: FieldValue.serverTimestamp(),
      });
      return { ok: true, entry, balance: after };
    });
  } catch (err: any) {
    try { console.warn('[points.appendLedger] tx failed:', err?.message || err); } catch {}
    return { ok: false, error: err?.message || 'tx-failed' };
  }
}

/** Award standard order-tier points for a completed order. Idempotent per order. */
export async function awardOrderPoints(input: {
  customerUid: string;
  orderId: string;
  orderNo: string;
  orderTotal: number;
}): Promise<{ ok: boolean; delta?: number; balance?: number }> {
  const delta = pointsForOrderTotal(input.orderTotal);
  const res = await appendLedger({
    customerUid: input.customerUid,
    delta,
    reason: `Order #${input.orderNo}`,
    source: 'order.earned',
    sourceOrderId: input.orderId,
    sourceOrderNo: input.orderNo,
    dedupKey: `order.earned:${input.orderId}`,
  });
  return { ok: !!res.ok, delta, balance: res.balance };
}

/** Reverse an award — used when an order is refunded or cancelled after earn. */
export async function reverseOrderPoints(input: {
  customerUid: string;
  orderId: string;
  orderNo: string;
  reason: string;
  by?: string;
}): Promise<{ ok: boolean; delta?: number; balance?: number }> {
  const db = getFirestore();
  const earnKey = `pointsLedger/${encodeURIComponent('order.earned:' + input.orderId)}`;
  const earnSnap = await db.doc(earnKey).get();
  if (!earnSnap.exists) return { ok: false };
  const original = earnSnap.data() as LedgerEntry;
  const res = await appendLedger({
    customerUid: input.customerUid,
    delta: -Math.abs(original.delta),
    reason: `Reversed: ${input.reason}`,
    source: 'admin.adjust',
    sourceOrderId: input.orderId,
    sourceOrderNo: input.orderNo,
    by: input.by,
    allowNegative: true,
    dedupKey: `order.reversed:${input.orderId}`,
  });
  return { ok: !!res.ok, delta: -Math.abs(original.delta), balance: res.balance };
}
