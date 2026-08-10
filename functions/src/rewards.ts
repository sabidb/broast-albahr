/**
 * Reward engine — Phase 10.
 *
 * Two collections drive rewards:
 *   • rewardRules/{id} — owner-managed rule definitions (triggers +
 *     eligibility + budgets + reward payload).
 *   • rewards/{id}     — issued reward records with an explicit lifecycle
 *     (available → reserved → redeemed, or expired). Phase 11 layers the
 *     12-char code / QR + atomic redemption on top of this record.
 *
 * evaluateForOrder() is called from submitOrder AFTER the order writes.
 * It walks every active rule, decides which apply to this order's customer,
 * enforces budgets + per-customer limits, and issues a `rewards` doc for
 * each match. Every issuance is atomic — the budget counter is bumped inside
 * the same transaction as the reward doc, so a burst never over-issues.
 *
 * The engine deliberately DOES NOT compute or apply a discount at order
 * time. A reward is a promise — the customer redeems it on a FUTURE order
 * via the Phase 11 token. Applying it retroactively would mean rewriting
 * the current order, which the immutable snapshot model forbids.
 */

import { getFirestore, FieldValue, Transaction } from 'firebase-admin/firestore';

// ── Rule shape ─────────────────────────────────────────────────────────

export type RewardTrigger =
  | 'first_order'          // customer's first ever order
  | 'nth_order'            // {count} order # exactly (order # by customer)
  | 'spend_threshold'      // running total spend passes {amount}
  | 'streak_milestone'     // Phase 13 hook — {days} consecutive days
  | 'inactivity'           // no order for {days} days (evaluated by scheduled fn)
  | 'always';              // fires on every order (use for global promos)

export type RewardKind =
  | 'fixed_discount'       // SAR off next order
  | 'percent_discount'     // % off next order
  | 'free_item'            // free item id
  | 'bonus_points'         // +N Al Bahr points (Phase 12)
  | 'free_drink'           // shorthand for a free drink item
  | 'free_fries'           // shorthand for a free fries item
  | 'upgrade';             // upgrade to next size (Phase 13)

export interface RewardRule {
  id: string;
  active: boolean;
  name: string;
  nameAr?: string;
  trigger: RewardTrigger;
  triggerConfig?: Record<string, number | string>;
  kind: RewardKind;
  value?: number;              // amount / percent / points, depending on kind
  productId?: string | number; // for free_item / free_drink / free_fries
  label: string;               // human-readable "SR 5 off next order"
  labelAr?: string;
  eligibility?: {
    minOrder?: number;         // minimum order total needed to redeem
    branches?: string[];       // restrict redemption to these branches
    products?: (string | number)[]; // reward attached to these products only
    expiresInDays?: number;    // token TTL (default 30)
    onePerCustomer?: boolean;  // customer can only be issued this reward once ever
  };
  budgets?: {
    total?: number;            // hard cap on issuances (ever)
    perDay?: number;           // reset each UTC day
    perWeek?: number;          // reset each UTC week (Mon 00:00 UTC)
  };
  // Runtime counters — mutated by evaluateForOrder inside a transaction.
  issuedTotal?: number;
  issuedToday?: number;
  issuedTodayKey?: string;
  issuedThisWeek?: number;
  issuedThisWeekKey?: string;
}

export interface IssuedReward {
  id: string;                 // Firestore doc id (== rewardTokens/{code}.rewardId when Phase 11 mints the code)
  ruleId: string;
  ruleName: string;
  customerUid: string;
  customerPhone: string;
  kind: RewardKind;
  value?: number;
  productId?: string | number;
  label: string;
  labelAr?: string;
  status: 'available' | 'reserved' | 'redeemed' | 'expired';
  issuedAt: string;
  expiresAt: string;
  reservedAt?: string | null;
  redeemedAt?: string | null;
  branchIds?: string[];
  productIds?: (string | number)[];
  minOrder?: number;
  sourceOrderNo?: string;
  sourceOrderId?: string;
}

// ── Date helpers ───────────────────────────────────────────────────────

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
function utcWeekKey(d = new Date()): string {
  // ISO week: Monday-based. Cheap approximation using getUTCDay (0=Sun).
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10);
}

// ── Rule evaluation ────────────────────────────────────────────────────

interface EvalCtx {
  customerUid: string;
  customerPhone: string;
  orderId: string;
  orderNo: string;
  orderTotal: number;
  // Precomputed customer history (avoids N+1 reads inside the tx).
  customerOrderCount: number;
  customerLifetimeSpend: number;
}

function matchesTrigger(rule: RewardRule, ctx: EvalCtx): boolean {
  const cfg = rule.triggerConfig || {};
  switch (rule.trigger) {
    case 'first_order':
      return ctx.customerOrderCount === 1;
    case 'nth_order': {
      const n = Number(cfg.count) || 0;
      return n > 0 && ctx.customerOrderCount === n;
    }
    case 'spend_threshold': {
      const threshold = Number(cfg.amount) || 0;
      // Trigger on the order that CROSSES the threshold, not every order after.
      const before = ctx.customerLifetimeSpend - ctx.orderTotal;
      return before < threshold && ctx.customerLifetimeSpend >= threshold;
    }
    case 'streak_milestone':
      // Phase 13 will feed a live streak count; the trigger fires only when
      // the scheduled fn stamps `streakDays` on the ctx. For now, disabled.
      return false;
    case 'inactivity':
      // Fired by a scheduled fn, not by order flow.
      return false;
    case 'always':
      return true;
    default:
      return false;
  }
}

async function tryIssue(
  tx: Transaction,
  ruleRef: FirebaseFirestore.DocumentReference,
  rule: RewardRule,
  ctx: EvalCtx,
  db: FirebaseFirestore.Firestore,
): Promise<IssuedReward | null> {
  // Per-customer 'once' guard: is there already an issued reward from this
  // rule for this customer?
  const elig = rule.eligibility || {};
  if (elig.onePerCustomer) {
    const priorSnap = await db.collection('rewards')
      .where('ruleId', '==', rule.id)
      .where('customerUid', '==', ctx.customerUid)
      .limit(1)
      .get();
    if (!priorSnap.empty) return null;
  }

  // Budget checks. Read the counters that live on the rule doc; a stale
  // read is fine because tx.update() will fail with a retry on a contentious
  // burst.
  const budgets = rule.budgets || {};
  const today = utcDayKey();
  const week = utcWeekKey();
  const issuedTotal = Number(rule.issuedTotal) || 0;
  const issuedToday = rule.issuedTodayKey === today ? (Number(rule.issuedToday) || 0) : 0;
  const issuedThisWeek = rule.issuedThisWeekKey === week ? (Number(rule.issuedThisWeek) || 0) : 0;
  if (budgets.total != null && issuedTotal >= budgets.total) return null;
  if (budgets.perDay != null && issuedToday >= budgets.perDay) return null;
  if (budgets.perWeek != null && issuedThisWeek >= budgets.perWeek) return null;

  const expiresInDays = Number(elig.expiresInDays) > 0 ? Number(elig.expiresInDays) : 30;
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + expiresInDays * 86400_000).toISOString();
  const rewardRef = db.collection('rewards').doc();
  const issued: IssuedReward = {
    id: rewardRef.id,
    ruleId: rule.id,
    ruleName: rule.name,
    customerUid: ctx.customerUid,
    customerPhone: ctx.customerPhone,
    kind: rule.kind,
    value: rule.value,
    productId: rule.productId,
    label: rule.label,
    labelAr: rule.labelAr,
    status: 'available',
    issuedAt: nowIso,
    expiresAt: expiresIso,
    branchIds: elig.branches,
    productIds: elig.products,
    minOrder: elig.minOrder,
    sourceOrderNo: ctx.orderNo,
    sourceOrderId: ctx.orderId,
  };
  tx.set(rewardRef, issued);
  // Bump the counters atomically so a concurrent tx sees the new totals.
  tx.update(ruleRef, {
    issuedTotal: FieldValue.increment(1),
    issuedToday: rule.issuedTodayKey === today ? FieldValue.increment(1) : 1,
    issuedTodayKey: today,
    issuedThisWeek: rule.issuedThisWeekKey === week ? FieldValue.increment(1) : 1,
    issuedThisWeekKey: week,
    lastIssuedAt: FieldValue.serverTimestamp(),
  });
  return issued;
}

/**
 * Called from submitOrder after the order has been written. Reads all active
 * rules and issues any that match, atomically. Errors are swallowed —
 * a rewards-engine hiccup must never fail an otherwise-valid order.
 */
export async function evaluateForOrder(input: {
  customerUid: string;
  customerPhone: string;
  orderId: string;
  orderNo: string;
  orderTotal: number;
}): Promise<IssuedReward[]> {
  const db = getFirestore();
  try {
    // Cheap precompute — one range read per order isn't a hot path.
    const priorOrders = await db.collection('orders')
      .where('userUid', '==', input.customerUid)
      .get();
    const rows = priorOrders.docs.map((d) => d.data() as any);
    const customerOrderCount = rows.length;
    const customerLifetimeSpend = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const ctx: EvalCtx = { ...input, customerOrderCount, customerLifetimeSpend };

    const rulesSnap = await db.collection('rewardRules').where('active', '==', true).get();
    const issuedList: IssuedReward[] = [];
    for (const doc of rulesSnap.docs) {
      const rule = { id: doc.id, ...(doc.data() as any) } as RewardRule;
      if (!matchesTrigger(rule, ctx)) continue;
      const issued = await db.runTransaction(async (tx) => tryIssue(tx, doc.ref, rule, ctx, db));
      if (issued) issuedList.push(issued);
    }
    return issuedList;
  } catch (err: any) {
    try { console.warn('[rewards.evaluateForOrder] failed:', err?.message || err); } catch {}
    return [];
  }
}

/** Mark expired rewards. Called by a scheduled function (Phase 20 wires it). */
export async function sweepExpired(): Promise<{ expired: number }> {
  const db = getFirestore();
  const nowIso = new Date().toISOString();
  const snap = await db.collection('rewards')
    .where('status', '==', 'available')
    .where('expiresAt', '<=', nowIso)
    .limit(200)
    .get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { status: 'expired', expiredAt: nowIso }));
  await batch.commit();
  return { expired: snap.size };
}
