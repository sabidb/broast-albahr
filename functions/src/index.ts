/**
 * Broast Al Bahr — Cloud Functions
 *
 * Phase 5 additions:
 *   - submitOrder:        server-side order creation. Validates menu items,
 *                         per-branch availability, restaurant open, quantities,
 *                         and recomputes every total from Firestore-side prices.
 *                         Mints the order number transactionally, seeds a
 *                         `statusHistory` entry, and is idempotent on
 *                         `clientOrderId`.
 *   - updateOrderStatus:  status transitions gated by a fixed table and by
 *                         caller role (branch-scoped staff can only touch orders
 *                         at their branch; customers can only cancel their own
 *                         while still `new`/`pending`).
 *   - refundOrder:        thin wrapper on updateOrderStatus that also stamps a
 *                         `refund` block so reports can distinguish it from a
 *                         plain cancel.
 *
 * Wave 2.1 (pre-Phase 5):
 *   - setRole / whoami — role custom-claim minting for staff.
 *
 * Every write here goes through the Admin SDK, which bypasses Firestore rules —
 * that's the point: it's the trusted server-side hop that lets us lock the
 * client rules to "no direct order create, no direct status update".
 *
 * Region: me-west1 (co-located with Firestore). Runtime: Node 22.
 */

import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { priceOrder, toMinor, type LineIn } from './pricing.js';
import { dispatchNotification, type TemplateName } from './notifications.js';

initializeApp();
setGlobalOptions({ region: 'me-west1', maxInstances: 10 });

type Role = 'owner' | 'branch' | 'staff' | 'none';
const VALID_ROLES: readonly Role[] = ['owner', 'branch', 'staff', 'none'] as const;

interface SetRoleData {
  targetUid: string;
  role: Role;
  branchId?: string;
}

interface RoleClaim {
  role: Role;
  branchId?: string;
}

async function readCallerRole(uid: string): Promise<RoleClaim> {
  const [userRecord, docSnap] = await Promise.all([
    getAuth().getUser(uid),
    getFirestore().doc(`users/${uid}`).get(),
  ]);
  const claim = (userRecord.customClaims || {}) as Partial<RoleClaim>;
  const doc = docSnap.exists ? (docSnap.data() as Partial<RoleClaim>) : {};
  const role = (claim.role || doc.role || 'none') as Role;
  const branchId = claim.branchId || doc.branchId;
  return { role, branchId };
}

export const setRole = onCall<SetRoleData>(async (req: CallableRequest<SetRoleData>) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Only owners can assign roles.');
  }

  const { targetUid, role, branchId } = req.data ?? ({} as SetRoleData);
  if (typeof targetUid !== 'string' || targetUid.length === 0 || targetUid.length > 128) {
    throw new HttpsError('invalid-argument', 'targetUid must be a non-empty string up to 128 chars.');
  }
  if (!VALID_ROLES.includes(role)) {
    throw new HttpsError('invalid-argument', `role must be one of ${VALID_ROLES.join(', ')}.`);
  }
  if (role === 'branch') {
    if (typeof branchId !== 'string' || branchId.length === 0 || branchId.length > 40) {
      throw new HttpsError('invalid-argument', 'branchId is required for role="branch".');
    }
  }

  if (targetUid === req.auth.uid && role !== 'owner') {
    const staff = await getFirestore()
      .collection('users')
      .where('role', '==', 'owner')
      .get();
    if (staff.size <= 1) {
      throw new HttpsError(
        'failed-precondition',
        'Refusing to demote the only owner. Promote another user to owner first.',
      );
    }
  }

  const claim: RoleClaim = { role };
  if (role === 'branch' && branchId) claim.branchId = branchId;

  await getAuth().setCustomUserClaims(targetUid, claim);
  await getFirestore().doc(`users/${targetUid}`).set(
    {
      role,
      branchId: role === 'branch' ? branchId : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.auth.uid,
    },
    { merge: true },
  );

  return {
    ok: true,
    targetUid,
    role,
    branchId: role === 'branch' ? branchId : null,
    signOutRequired: true,
  };
});

export const whoami = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const { role, branchId } = await readCallerRole(req.auth.uid);
  return { uid: req.auth.uid, role, branchId: branchId ?? null };
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 5 — Hardened ordering (Phase 6 upgrades the money math)
// ═══════════════════════════════════════════════════════════════════════════

const SA_PHONE = /^05\d{8}$/;
const PICKUP_SLOTS_ALLOWED = new Set(['ASAP', '15 min', '30 min', '45 min', '1 hour']);
const PAYMENT_METHODS_ALLOWED = new Set(['cash', 'card', 'prepaid']);
const ORDER_TYPES_ALLOWED = new Set(['pickup', 'delivery']);

/** Atomic per-branch order counter — increments by exactly 1. */
async function mintOrderNo(branchId: string): Promise<string> {
  const db = getFirestore();
  const ref = db.doc(`counters/orderNo-${branchId}`);
  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? Number((snap.data() as any).value) : 99999;
    const nxt = Math.max(Number.isFinite(cur) ? cur : 99999, 99999) + 1;
    tx.set(ref, { value: nxt, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return nxt;
  });
  return String(next).padStart(6, '0');
}

interface SubmitOrderItemIn {
  id: string | number;
  qty: number;
  note?: string;
}

interface SubmitOrderData {
  clientOrderId: string;
  branch: string;
  items: SubmitOrderItemIn[];
  paymentMethod?: string;
  pickupTime?: string;
  note?: string;
  couponCode?: string;
  orderType?: string;
}

interface FlatMenuItem {
  id: string | number;
  name?: string;
  nameAr?: string;
  price?: number;      // app selling price (SAR)
  menuPrice?: number;  // Phase 6 — standard restaurant menu price (SAR). Defaults to price when absent.
  emoji?: string;
  available?: boolean;
  branches?: string[];
  availability?: Record<string, boolean>;
}

/**
 * Server-side order submission. The client sends only { itemId, qty, note } —
 * everything the customer sees on the order (prices, names, totals, VAT) is
 * looked up + recomputed here from the trusted menu doc, so a manipulated
 * client bundle cannot inflate discounts or drop prices.
 */
export const submitOrder = onCall<SubmitOrderData>(async (req: CallableRequest<SubmitOrderData>) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uid = req.auth.uid;
  const data = req.data ?? ({} as SubmitOrderData);

  const clientOrderId = String(data.clientOrderId || '').trim();
  if (!clientOrderId || clientOrderId.length > 80) {
    throw new HttpsError('invalid-argument', 'clientOrderId required (1–80 chars).');
  }
  const branchId = String(data.branch || '').trim();
  if (!branchId || branchId.length > 40) {
    throw new HttpsError('invalid-argument', 'branch required.');
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new HttpsError('invalid-argument', 'items required.');
  }
  if (data.items.length > 50) {
    throw new HttpsError('invalid-argument', 'too many items (max 50).');
  }
  const paymentMethod = String(data.paymentMethod || 'cash');
  if (!PAYMENT_METHODS_ALLOWED.has(paymentMethod)) {
    throw new HttpsError('invalid-argument', `paymentMethod must be one of ${[...PAYMENT_METHODS_ALLOWED].join(', ')}.`);
  }
  const orderType = String(data.orderType || 'pickup');
  if (!ORDER_TYPES_ALLOWED.has(orderType)) {
    throw new HttpsError('invalid-argument', `orderType must be one of ${[...ORDER_TYPES_ALLOWED].join(', ')}.`);
  }

  const db = getFirestore();

  // Idempotency: a retried tap with the same clientOrderId returns the
  // original doc verbatim instead of re-writing (which would double-mint the
  // orderNo).
  const orderRef = db.doc(`orders/${clientOrderId}`);
  const existing = await orderRef.get();
  if (existing.exists) {
    const d = existing.data() as any;
    return {
      fbId: existing.id,
      orderNo: d.orderNo,
      status: d.status,
      existing: true,
    };
  }

  // Customer profile — name + phone. Without a filled profile there is no
  // one to notify or hand a bag to at the counter.
  const custSnap = await db.doc(`customers/${uid}`).get();
  if (!custSnap.exists) {
    throw new HttpsError('failed-precondition', 'Complete your profile before ordering.');
  }
  const cust = custSnap.data() as any;
  const userName = String(cust.name || '').trim();
  const userPhone = String(cust.phone || '').trim();
  if (!userName || !SA_PHONE.test(userPhone)) {
    throw new HttpsError('failed-precondition', 'Profile missing name or a valid Saudi phone.');
  }

  // Restaurant open?
  const restSnap = await db.doc('settings/restaurant').get();
  if (restSnap.exists && (restSnap.data() as any).isOpen === false) {
    throw new HttpsError('failed-precondition', 'Restaurant is closed right now.');
  }

  // Branch active?
  const branchSnap = await db.doc(`branches/${branchId}`).get();
  if (!branchSnap.exists) {
    throw new HttpsError('failed-precondition', 'Unknown branch.');
  }
  const branchData = branchSnap.data() as any;
  if (branchData.active === false) {
    throw new HttpsError('failed-precondition', 'This branch is not accepting orders.');
  }

  // Menu lookup.
  const menuSnap = await db.doc('settings/menu').get();
  if (!menuSnap.exists) {
    throw new HttpsError('failed-precondition', 'Menu unavailable.');
  }
  const menu = ((menuSnap.data() as any).menu ?? {}) as Record<string, FlatMenuItem[]>;
  const flat = new Map<string, FlatMenuItem>();
  for (const cat of Object.values(menu)) {
    if (!Array.isArray(cat)) continue;
    for (const it of cat) {
      if (it && it.id != null) flat.set(String(it.id), it);
    }
  }

  // Build the LineIn[] the pricing engine wants. Every field is validated up
  // front so a bad payload never reaches priceOrder — errors surface here as
  // typed HttpsErrors with the offending field.
  const lines: LineIn[] = [];
  for (let i = 0; i < data.items.length; i++) {
    const raw = data.items[i];
    const key = String(raw?.id ?? '');
    const it = flat.get(key);
    if (!it) {
      throw new HttpsError('failed-precondition', `Item ${key || `#${i}`} not on the menu.`);
    }
    if (it.available === false) {
      throw new HttpsError('failed-precondition', `${it.name || key} is unavailable.`);
    }
    if (it.availability && it.availability[branchId] === false) {
      throw new HttpsError('failed-precondition', `${it.name || key} is unavailable at this branch.`);
    }
    if (Array.isArray(it.branches) && it.branches.length > 0
        && !it.branches.includes('all') && !it.branches.includes(branchId)) {
      throw new HttpsError('failed-precondition', `${it.name || key} is not sold at this branch.`);
    }
    const qty = Number(raw?.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      throw new HttpsError('invalid-argument', `Bad quantity for item ${key}.`);
    }
    const appPrice = Number(it.price);
    if (!Number.isFinite(appPrice) || appPrice < 0) {
      throw new HttpsError('failed-precondition', `Item ${key} has no valid price.`);
    }
    // menuPrice defaults to appPrice when the admin has not entered a
    // separate counter price. A menuPrice smaller than the app price is
    // clamped up — a "discount from menu" that is negative would be a
    // reporting lie.
    const menuPriceRaw = Number(it.menuPrice);
    const menuPrice = Number.isFinite(menuPriceRaw) && menuPriceRaw > 0
      ? Math.max(menuPriceRaw, appPrice)
      : appPrice;
    const line: LineIn = {
      id: typeof it.id === 'number' ? it.id : String(it.id),
      name: String(it.name || ''),
      menuPrice,
      appPrice,
      qty,
    };
    if (it.nameAr) line.nameAr = String(it.nameAr);
    if (it.emoji) line.emoji = String(it.emoji);
    if (raw?.note) line.note = String(raw.note).slice(0, 500);
    lines.push(line);
  }

  // Coupon lookup — supports both the legacy `coupons/{code}` docs and the
  // admin's `settings/coupons` items array. Phase 10 replaces this with the
  // full reward engine; keep the shape here so old codes keep working.
  //
  // Discount is computed against the app subtotal (in halalas, via
  // priceOrder). We resolve the coupon type + value here and hand the
  // discount to the pricing engine as an integer minor-unit value.
  let appliedCoupon: string | undefined;
  const rawCode = String(data.couponCode || '').trim().toUpperCase();
  const appSubtotalMinor = lines.reduce((s, l) => s + toMinor(l.appPrice) * l.qty, 0);
  let discountMinor = 0;
  if (rawCode) {
    let value = 0;
    let type: 'percent' | 'fixed' | null = null;
    const cSnap = await db.doc(`coupons/${rawCode}`).get();
    if (cSnap.exists) {
      const c = cSnap.data() as any;
      if (c.active !== false) {
        value = Number(c.value ?? c.discount ?? 0);
        type = c.type === 'fixed' ? 'fixed' : 'percent';
      }
    }
    if (type == null) {
      const bagSnap = await db.doc('settings/coupons').get();
      if (bagSnap.exists) {
        const arr: any[] = (bagSnap.data() as any).items || [];
        const hit = arr.find((c) => String(c.code || '').toUpperCase() === rawCode);
        if (hit && hit.active !== false) {
          value = Number(hit.value ?? hit.discount ?? 0);
          type = hit.type === 'fixed' ? 'fixed' : 'percent';
        }
      }
    }
    if (type && Number.isFinite(value) && value > 0) {
      discountMinor = type === 'percent'
        ? Math.round((appSubtotalMinor * value) / 100)
        : Math.min(toMinor(value), appSubtotalMinor);
      if (discountMinor > 0) appliedCoupon = rawCode;
    }
  }

  const money = priceOrder(lines, discountMinor);
  const snapshotItems = money.items;
  const totals = money.totals;
  const total = totals.total;

  const orderNo = await mintOrderNo(branchId);
  const nowIso = new Date().toISOString();

  const payload: Record<string, unknown> = {
    orderNo,
    userUid: uid,
    userName,
    userPhone,
    branch: branchId,
    branchObj: branchData,
    items: snapshotItems,
    totals,
    total,
    paymentMethod,
    orderType,
    status: 'new',
    statusHistory: [{ status: 'new', at: nowIso, by: 'customer' }],
    clientOrderId,
    createdAt: FieldValue.serverTimestamp(),
    date: nowIso,
    submittedVia: 'submitOrder@v2', // v2 = Phase 6 pricing engine + per-line snapshots
  };
  if (data.pickupTime && PICKUP_SLOTS_ALLOWED.has(data.pickupTime)) {
    payload.pickupTime = data.pickupTime;
  }
  if (data.note) payload.note = String(data.note).slice(0, 500);
  if (appliedCoupon) payload.couponCode = appliedCoupon;

  await orderRef.set(payload);

  return {
    fbId: clientOrderId,
    orderNo,
    status: 'new',
    existing: false,
  };
});

// ── status transition table ─────────────────────────────────────────────
// Terminal states (cancelled / refunded) have an empty exits list so nothing
// can move them back. `payment_failed` exists so a future card/prepaid flow
// can park an order there without wiping the record.
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  new: ['pending', 'accepted', 'preparing', 'cancelled', 'payment_failed'],
  pending: ['accepted', 'preparing', 'cancelled', 'payment_failed'],
  accepted: ['preparing', 'cooking', 'ready', 'cancelled'],
  preparing: ['cooking', 'almost_ready', 'ready', 'cancelled'],
  cooking: ['almost_ready', 'ready', 'cancelled'],
  almost_ready: ['ready', 'cancelled'],
  ready: ['done', 'completed', 'cancelled'],
  done: ['completed', 'refunded'],
  completed: ['refunded'],
  cancelled: [],
  refunded: [],
  payment_failed: ['cancelled', 'new'],
};

interface UpdateOrderStatusData {
  orderId: string;
  status: string;
  reason?: string;
}

/**
 * Change an order's status. Enforces the transition table + who is allowed to
 * do what:
 *   - staff (owner + branch-scoped) drive the kitchen states
 *   - a customer can only cancel their own order while it is still
 *     `new` or `pending` — after the kitchen has accepted it, they have to
 *     call the branch.
 */
export const updateOrderStatus = onCall<UpdateOrderStatusData>(async (req: CallableRequest<UpdateOrderStatusData>) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const orderId = String(req.data?.orderId || '').trim();
  const nextStatus = String(req.data?.status || '').trim();
  const reason = req.data?.reason ? String(req.data.reason).slice(0, 300) : undefined;
  if (!orderId || orderId.length > 128) {
    throw new HttpsError('invalid-argument', 'orderId required.');
  }
  if (!nextStatus || !(nextStatus in ALLOWED_TRANSITIONS)) {
    throw new HttpsError('invalid-argument', `Unknown status "${nextStatus}".`);
  }

  const db = getFirestore();
  const ref = db.doc(`orders/${orderId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Order not found.');
  }
  const cur = snap.data() as any;
  const curStatus = String(cur.status || 'new');
  const branchId = String(cur.branch || '');

  const caller = await readCallerRole(req.auth.uid);
  const isOwner = caller.role === 'owner';
  const isBranchStaff = isOwner || (caller.role === 'branch' && caller.branchId === branchId);
  const ownsOrder = cur.userUid === req.auth.uid;
  const customerCancel = ownsOrder && nextStatus === 'cancelled' && ['new', 'pending'].includes(curStatus);

  if (!isBranchStaff && !customerCancel) {
    throw new HttpsError('permission-denied', 'Not allowed to update this order.');
  }

  const legal = ALLOWED_TRANSITIONS[curStatus] || [];
  if (!legal.includes(nextStatus)) {
    throw new HttpsError('failed-precondition', `Illegal transition ${curStatus} → ${nextStatus}.`);
  }

  const historyEntry: Record<string, unknown> = {
    status: nextStatus,
    at: new Date().toISOString(),
    by: customerCancel ? 'customer' : (caller.role || 'staff'),
  };
  if (reason) historyEntry.reason = reason;

  const patch: Record<string, unknown> = {
    status: nextStatus,
    updatedAt: FieldValue.serverTimestamp(),
    statusHistory: FieldValue.arrayUnion(historyEntry),
  };
  if (customerCancel) patch.cancelledBy = 'customer';
  if (reason && nextStatus === 'cancelled') patch.declineReason = reason;

  await ref.update(patch);

  // Phase 9: dispatch a matching in-app + push notification. Template key is
  // the status verbatim; dedupKey combines orderId + status so a re-fire of
  // the same transition is a no-op.
  const templateName = ('order.' + (nextStatus === 'done' ? 'completed' : nextStatus)) as TemplateName;
  const phone = String(cur.userPhone || '');
  const uid = String(cur.userUid || '');
  if (phone && templateName in (await import('./notifications.js')).TEMPLATES) {
    try {
      await dispatchNotification({
        templateName,
        ctx: { orderNo: String(cur.orderNo || ''), reason: reason || '' },
        phone,
        uid: uid || undefined,
        dedupKey: `order:${orderId}:${nextStatus}`,
        meta: { orderId, orderNo: cur.orderNo, status: nextStatus },
      });
    } catch (err: any) {
      // A notification failure must not roll back the status write — the
      // customer still sees the status change on their tracker.
      try { console.warn('[updateOrderStatus] notification dispatch failed:', err?.message || err); } catch {}
    }
  }
  return { ok: true, status: nextStatus, previous: curStatus };
});

interface RefundOrderData {
  orderId: string;
  reason?: string;
  amount?: number;
}

/**
 * Mark an order as refunded and store a small refund block so financial
 * reporting can separate cancellations from refunds. Owner-only —
 * refunds affect money already collected.
 */
export const refundOrder = onCall<RefundOrderData>(async (req: CallableRequest<RefundOrderData>) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const orderId = String(req.data?.orderId || '').trim();
  if (!orderId || orderId.length > 128) {
    throw new HttpsError('invalid-argument', 'orderId required.');
  }
  const reason = req.data?.reason ? String(req.data.reason).slice(0, 300) : undefined;
  const amountRaw = req.data?.amount;
  const amount = amountRaw != null ? Number(amountRaw) : undefined;
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    throw new HttpsError('invalid-argument', 'amount must be a non-negative number.');
  }

  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Only owners can issue refunds.');
  }

  const db = getFirestore();
  const ref = db.doc(`orders/${orderId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Order not found.');
  }
  const cur = snap.data() as any;
  const curStatus = String(cur.status || 'new');
  const legal = ALLOWED_TRANSITIONS[curStatus] || [];
  if (!legal.includes('refunded')) {
    throw new HttpsError('failed-precondition', `Cannot refund order in status "${curStatus}".`);
  }

  const nowIso = new Date().toISOString();
  const roundSar = (n: number) => Math.round(n * 100) / 100;
  const refundedAmount = amount != null ? roundSar(amount) : roundSar(Number(cur.total) || 0);
  const historyEntry: Record<string, unknown> = {
    status: 'refunded',
    at: nowIso,
    by: 'owner',
    amount: refundedAmount,
  };
  if (reason) historyEntry.reason = reason;

  await ref.update({
    status: 'refunded',
    updatedAt: FieldValue.serverTimestamp(),
    statusHistory: FieldValue.arrayUnion(historyEntry),
    refund: {
      amount: refundedAmount,
      reason: reason || null,
      at: nowIso,
      by: req.auth.uid,
    },
  });
  // Phase 9: refund notification
  try {
    const phone = String(cur.userPhone || '');
    if (phone) {
      await dispatchNotification({
        templateName: 'order.refunded',
        ctx: { orderNo: String(cur.orderNo || ''), amount: refundedAmount.toFixed(2) },
        phone,
        uid: cur.userUid ? String(cur.userUid) : undefined,
        dedupKey: `order:${orderId}:refunded`,
        meta: { orderId, orderNo: cur.orderNo, refundAmount: refundedAmount },
      });
    }
  } catch (err: any) {
    try { console.warn('[refundOrder] notification dispatch failed:', err?.message || err); } catch {}
  }
  return { ok: true, status: 'refunded', amount: refundedAmount };
});

interface RegisterFcmTokenData {
  token: string;
}

/**
 * Register (or refresh) a customer's FCM device token so the notification
 * dispatcher can push to them. Tokens are stored as a de-duplicated array on
 * customers/{uid}.fcmTokens; the singular `fcmToken` mirrors the most recent
 * one for backwards compat.
 */
export const registerFcmToken = onCall<RegisterFcmTokenData>(async (req: CallableRequest<RegisterFcmTokenData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const token = String(req.data?.token || '').trim();
  if (!token || token.length > 500) throw new HttpsError('invalid-argument', 'token required (max 500 chars).');
  const db = getFirestore();
  await db.doc(`customers/${req.auth.uid}`).set(
    {
      fcmToken: token,
      fcmTokens: FieldValue.arrayUnion(token),
      fcmUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ok: true };
});

interface ApplyOrderOverrideData {
  orderId: string;
  amount: number;
  reason: string;
}

/**
 * Owner-only comp / discount override for an already-placed order. Adjusts
 * the persisted `total` server-side — Phase 5 rules block direct client
 * writes to `total` / `totals`, so this callable is the only path.
 *
 * The override is appended to an `overrides` array so history is retained
 * and never rewrites the immutable line snapshots stored under `items`.
 * `total` shrinks by the comp amount (clamped at 0); `totals.discount`
 * grows by the same amount so reports keep balance.
 */
export const applyOrderOverride = onCall<ApplyOrderOverrideData>(async (req: CallableRequest<ApplyOrderOverrideData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const orderId = String(req.data?.orderId || '').trim();
  const amount = Number(req.data?.amount);
  const reason = String(req.data?.reason || '').trim();
  if (!orderId || orderId.length > 128) throw new HttpsError('invalid-argument', 'orderId required.');
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpsError('invalid-argument', 'amount must be > 0.');
  if (!reason || reason.length > 300) throw new HttpsError('invalid-argument', 'reason required (1–300 chars).');

  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Only owners can apply an override.');
  }

  const db = getFirestore();
  const ref = db.doc(`orders/${orderId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Order not found.');
  const cur = snap.data() as any;
  const curTotal = Number(cur.total) || 0;
  const curOverrides: any[] = Array.isArray(cur.overrides) ? cur.overrides : [];
  const alreadyOff = curOverrides.reduce((s, o) => s + (Number(o?.amount) || 0), 0);
  // Refuse to over-comp: cumulative comp cannot exceed the pre-comp total
  // (curTotal + alreadyOff = the total before any comps ever landed).
  const preCompTotal = curTotal + alreadyOff;
  const clamped = Math.min(amount, Math.max(0, preCompTotal - alreadyOff));
  if (clamped <= 0) throw new HttpsError('failed-precondition', 'Nothing left to comp on this order.');

  const roundSar = (n: number) => Math.round(n * 100) / 100;
  const entry = {
    amount: roundSar(clamped),
    reason: reason.slice(0, 300),
    by: req.auth.uid,
    at: new Date().toISOString(),
  };
  const nextTotal = roundSar(Math.max(0, curTotal - clamped));
  const curTotals = (cur.totals && typeof cur.totals === 'object') ? cur.totals : {};
  const nextDiscount = roundSar((Number(curTotals.discount) || 0) + clamped);
  const nextTotals = { ...curTotals, discount: nextDiscount, total: nextTotal };

  await ref.update({
    total: nextTotal,
    totals: nextTotals,
    overrides: FieldValue.arrayUnion(entry),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, total: nextTotal, appliedAmount: entry.amount };
});
