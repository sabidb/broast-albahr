/**
 * Order streaks — Phase 13 Wave B.
 *
 * A streak here is order-based, not app-open-based (that separate
 * "daily-visit" streak still lives in the customer app for engagement).
 * The rule: N qualifying orders within a rolling W-day window keeps the
 * streak alive; a gap longer than W days resets it. Cancelled and
 * refunded orders never qualify — checked at eval time.
 *
 * State is on customers/{uid}.streak = { current, best, windowStart,
 * lastOrderAt, lastOrderId }. All updates go through this evaluator,
 * which is transactional so two racing evaluations for the same customer
 * cannot double-count. The evaluator is idempotent per orderId — a retry
 * of submitOrder does not push the streak forward twice.
 *
 * Milestones (configurable) award ledger bonus points; the ledger's own
 * dedup guard means the bonus is at-most-once per (customer × milestone).
 */

import { getFirestore, Transaction, FieldValue } from 'firebase-admin/firestore';
import { appendLedger } from './points.js';

export interface StreakMilestone {
  threshold: number;   // hit exactly on this streak count
  label: string;       // "5-order streak"
  labelAr?: string;
  bonusPoints?: number;
}

export interface StreakConfigDoc {
  enabled: boolean;
  windowDays: number;       // orders must sit within this rolling window
  minOrders?: number;       // orders needed inside the window to count as "on a streak" (default 2)
  countRefunded?: boolean;  // true = still counts even if later refunded (defaults false)
  milestones: StreakMilestone[];
  updatedAt?: unknown;
}

export const DEFAULT_STREAK_CONFIG: StreakConfigDoc = {
  enabled: true,
  windowDays: 14,
  minOrders: 2,
  countRefunded: false,
  milestones: [
    { threshold: 3,  label: '3-order streak',  labelAr: 'سلسلة ٣ طلبات',  bonusPoints: 20 },
    { threshold: 5,  label: '5-order streak',  labelAr: 'سلسلة ٥ طلبات',  bonusPoints: 40 },
    { threshold: 10, label: '10-order streak', labelAr: 'سلسلة ١٠ طلبات', bonusPoints: 100 },
    { threshold: 20, label: '20-order streak', labelAr: 'سلسلة ٢٠ طلبات', bonusPoints: 250 },
  ],
};

export async function loadStreakConfig(): Promise<StreakConfigDoc> {
  const db = getFirestore();
  try {
    const snap = await db.doc('settings/streakConfig').get();
    if (!snap.exists) return DEFAULT_STREAK_CONFIG;
    const data = snap.data() as Partial<StreakConfigDoc>;
    return {
      enabled: data.enabled !== false,
      windowDays: clampInt(data.windowDays, 1, 365, DEFAULT_STREAK_CONFIG.windowDays),
      minOrders: clampInt(data.minOrders, 1, 100, DEFAULT_STREAK_CONFIG.minOrders!),
      countRefunded: !!data.countRefunded,
      milestones: Array.isArray(data.milestones) && data.milestones.length > 0
        ? data.milestones.map(sanitizeMilestone).filter((m): m is StreakMilestone => !!m)
        : DEFAULT_STREAK_CONFIG.milestones,
    };
  } catch {
    return DEFAULT_STREAK_CONFIG;
  }
}

function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function sanitizeMilestone(raw: any): StreakMilestone | null {
  if (!raw) return null;
  const threshold = clampInt(raw.threshold, 1, 999, 0);
  if (threshold <= 0) return null;
  const label = String(raw.label || `${threshold}-order streak`).slice(0, 60);
  const out: StreakMilestone = { threshold, label };
  if (raw.labelAr) out.labelAr = String(raw.labelAr).slice(0, 60);
  const bp = Number(raw.bonusPoints);
  if (Number.isFinite(bp) && bp >= 0) out.bonusPoints = Math.floor(bp);
  return out;
}

export interface StreakState {
  current: number;
  best: number;
  windowStart: string | null;  // ISO of the first order in the current window
  lastOrderAt: string | null;
  lastOrderId?: string;
  updatedAt: string;
  lastMilestone?: number;      // highest threshold ever hit; used to dedup awards
}

const DAY_MS = 86400_000;

/**
 * Advance the streak for a new completed order. Non-blocking on the
 * caller — pass a fire-and-forget wrapper if you want.
 */
export async function evaluateOrderStreak(input: {
  customerUid: string;
  orderId: string;
  orderNo: string;
  orderTotal: number;
  phone?: string;
  now?: Date;
}): Promise<{ ok: boolean; streak?: StreakState; milestoneHit?: StreakMilestone }> {
  const db = getFirestore();
  const cfg = await loadStreakConfig();
  if (!cfg.enabled) return { ok: true };
  const custRef = db.doc(`customers/${input.customerUid}`);
  const sentinelRef = db.doc(`customers/${input.customerUid}/streakOrders/${input.orderId}`);
  const now = input.now || new Date();

  try {
    const result = await db.runTransaction(async (tx: Transaction) => {
      const [custSnap, sentSnap] = await Promise.all([tx.get(custRef), tx.get(sentinelRef)]);
      if (!custSnap.exists) return null;
      if (sentSnap.exists) {
        // Already counted this order. Return the current state for reporting.
        const prev = (custSnap.data() as any).streak as StreakState | undefined;
        return { state: prev || newState(now), milestoneHit: undefined, applied: false as const };
      }
      const prev: StreakState = ((custSnap.data() as any).streak as StreakState | undefined) || newState(now);
      const lastAt = prev.lastOrderAt ? new Date(prev.lastOrderAt).getTime() : 0;
      const nowMs = now.getTime();
      const windowMs = cfg.windowDays * DAY_MS;

      let current: number;
      let windowStart: string | null;
      if (!lastAt || nowMs - lastAt > windowMs) {
        // Gap too long — window resets.
        current = 1;
        windowStart = now.toISOString();
      } else {
        current = (prev.current || 0) + 1;
        windowStart = prev.windowStart || now.toISOString();
      }
      const best = Math.max(prev.best || 0, current);
      const next: StreakState = {
        current, best, windowStart,
        lastOrderAt: now.toISOString(),
        lastOrderId: input.orderId,
        updatedAt: now.toISOString(),
        lastMilestone: prev.lastMilestone,
      };
      // Milestone check: first time crossing this threshold.
      const hit = cfg.milestones
        .filter((m) => m.threshold <= current && m.threshold > (prev.lastMilestone || 0))
        .sort((a, b) => b.threshold - a.threshold)[0];
      if (hit) next.lastMilestone = hit.threshold;

      tx.set(sentinelRef, {
        orderId: input.orderId, orderNo: input.orderNo,
        at: now.toISOString(),
        countedAs: current,
      });
      tx.update(custRef, {
        streak: next,
        streakUpdatedAt: FieldValue.serverTimestamp(),
      });
      return { state: next, milestoneHit: hit || undefined, applied: true as const };
    });

    if (!result) return { ok: false };
    // Award milestone points OUTSIDE the transaction so appendLedger's own
    // transaction doesn't nest. Its dedupKey guards against double-award.
    if (result.applied && result.milestoneHit && (result.milestoneHit.bonusPoints || 0) > 0) {
      try {
        await appendLedger({
          customerUid: input.customerUid,
          delta: result.milestoneHit.bonusPoints || 0,
          reason: `Streak bonus: ${result.milestoneHit.label}`,
          source: 'streak.milestone',
          sourceOrderId: input.orderId,
          sourceOrderNo: input.orderNo,
          dedupKey: `streak.milestone:${input.customerUid}:${result.milestoneHit.threshold}`,
        });
      } catch (err) { /* logged inside appendLedger */ }
    }
    return { ok: true, streak: result.state, milestoneHit: result.milestoneHit };
  } catch (err: any) {
    try { console.warn('[streaks.evaluateOrderStreak] failed:', err?.message || err); } catch {}
    return { ok: false };
  }
}

function newState(now: Date): StreakState {
  return { current: 0, best: 0, windowStart: null, lastOrderAt: null, updatedAt: now.toISOString() };
}

/** Called from refundOrder when refunds don't count for streaks. */
export async function reverseOrderStreak(input: {
  customerUid: string;
  orderId: string;
}): Promise<{ ok: boolean }> {
  const db = getFirestore();
  const cfg = await loadStreakConfig();
  if (cfg.countRefunded) return { ok: true }; // config keeps it counted
  const custRef = db.doc(`customers/${input.customerUid}`);
  const sentinelRef = db.doc(`customers/${input.customerUid}/streakOrders/${input.orderId}`);
  try {
    return await db.runTransaction(async (tx: Transaction) => {
      const [custSnap, sentSnap] = await Promise.all([tx.get(custRef), tx.get(sentinelRef)]);
      if (!custSnap.exists || !sentSnap.exists) return { ok: true };
      const s = sentSnap.data() as any;
      if (s.reversed) return { ok: true };
      const cur = ((custSnap.data() as any).streak as StreakState | undefined);
      if (!cur) return { ok: true };
      // Decrement current if this was the most recent counted order.
      const next: StreakState = {
        ...cur,
        current: Math.max(0, cur.current - 1),
        updatedAt: new Date().toISOString(),
      };
      tx.update(sentinelRef, { reversed: true, reversedAt: new Date().toISOString() });
      tx.update(custRef, { streak: next });
      return { ok: true };
    });
  } catch {
    return { ok: false };
  }
}
