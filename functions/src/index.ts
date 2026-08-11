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
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Transaction } from 'firebase-admin/firestore';
import { priceOrder, toMinor, type LineIn } from './pricing.js';
import { dispatchNotification, type TemplateName } from './notifications.js';
import { evaluateForOrder as evaluateRewardsForOrder } from './rewards.js';
import {
  mintTokenFor, validateToken as validateRewardToken,
  reserveToken as reserveRewardToken, redeemToken as redeemRewardToken,
  parseQrPayload as parseRewardQr, qrPayloadFor as rewardQrPayload,
  sweepExpired as sweepRewardTokens,
} from './rewardTokens.js';
import {
  awardOrderPoints, reverseOrderPoints, appendLedger,
} from './points.js';
import {
  bumpLifetimeAndRecompute, recomputeTier,
  type TierRule,
} from './tiers.js';
import {
  evaluateOrderStreak, reverseOrderStreak, DEFAULT_STREAK_CONFIG,
  type StreakConfigDoc,
} from './streaks.js';
import {
  evaluateMissionsForOrder,
} from './missions.js';
import {
  attachReferral, qualifyReferralOnOrder, getOrMintReferralCode,
  DEFAULT_REFERRAL_CONFIG, type ReferralConfigDoc,
} from './referrals.js';
import {
  evaluateSegment, issueCampaignToAudience, evaluateCampaignsForCustomer,
  type SegmentDoc, type CampaignDoc,
} from './campaigns.js';

initializeApp();
setGlobalOptions({ region: 'me-west1', maxInstances: 10 });

/**
 * REWARD_TOKEN_SIGNING_KEY — HMAC key for the Phase 11 QR payload.
 *
 * Set once in prod:
 *   firebase functions:secrets:set REWARD_TOKEN_SIGNING_KEY
 *
 * Every callable that reads or writes a rewardTokens doc attaches this
 * secret via `secrets: [REWARD_TOKEN_SIGNING_KEY]` on its options so the
 * runtime injects it into process.env before the handler runs. Rotating
 * the key invalidates every outstanding QR — do it deliberately.
 */
const REWARD_TOKEN_SIGNING_KEY = defineSecret('REWARD_TOKEN_SIGNING_KEY');

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
  /** Phase 11 — 12-char reward token or full QR payload. */
  rewardToken?: string;
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
export const submitOrder = onCall<SubmitOrderData>({ secrets: [REWARD_TOKEN_SIGNING_KEY] }, async (req: CallableRequest<SubmitOrderData>) => {
  try {
    return await submitOrderImpl(req);
  } catch (err: any) {
    // HttpsError is returned to the client automatically, but callable v2
    // does not stderr-log it by default — which makes triaging a "customer
    // says nothing works" report impossible without browser access. Log
    // every failure with the code + message + uid + clientOrderId so
    // `functions:log --only submitOrder` shows the real reason.
    const code = err?.code || err?.name || 'unknown';
    const msg = err?.message || String(err);
    const cid = req.data?.clientOrderId || '';
    const uid = req.auth?.uid || '';
    try { console.error(`[submitOrder] ${code}: ${msg} (uid=${uid} clientOrderId=${cid})`); } catch {}
    throw err;
  }
});

async function submitOrderImpl(req: CallableRequest<SubmitOrderData>) {
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

  // Phase 10 + 11: evaluate reward rules AFTER the order lands. Every
  // issued reward is minted a 12-char token (Phase 11); the token code is
  // what the customer sees on the invoice + notification, and it is what
  // they scan/enter at the counter. The token has an opaque QR payload
  // (HMAC of the code) so a scan can't be spoofed offline.
  let issuedRewards: any[] = [];
  try {
    issuedRewards = await evaluateRewardsForOrder({
      customerUid: uid,
      customerPhone: userPhone,
      orderId: clientOrderId,
      orderNo,
      orderTotal: total,
    });
    for (const r of issuedRewards) {
      try {
        const tok = await mintTokenFor(r.id);
        r.tokenCode = tok.code;
        r.qrPayload = tok.qr;
      } catch (err) { /* mint failure logged, reward stays sans token */ }
      try {
        await dispatchNotification({
          templateName: 'reward.issued',
          ctx: { label: r.label, code: r.tokenCode || r.id.slice(0, 8).toUpperCase() },
          phone: userPhone,
          uid,
          dedupKey: `reward:${r.id}:issued`,
          meta: { rewardId: r.id, ruleId: r.ruleId, kind: r.kind, code: r.tokenCode || null },
        });
      } catch (err) { /* dispatch failure never rolls back the reward */ }
    }
    // Stamp the first issued reward onto the order doc so the admin's
    // print pipeline can render its QR + code block. Prefer the token
    // code (Phase 11 secure) over the raw rewardId. Only the first
    // reward makes it onto the paper — the rest still live in
    // rewards/{id} and land as inbox notifications above.
    const firstToken = issuedRewards.find((r) => !!r.tokenCode);
    if (firstToken && firstToken.tokenCode) {
      try {
        await orderRef.update({
          reward: {
            code: firstToken.tokenCode,
            label: firstToken.label || 'Reward unlocked',
            rewardId: firstToken.id,
          },
        });
      } catch (err) { /* non-blocking */ }
    }
  } catch (err: any) {
    try { console.warn('[submitOrder] reward evaluation failed:', err?.message || err); } catch {}
  }

  // Phase 11 redemption confirmation: if the client passed a reward token as
  // `rewardToken` (parallel to couponCode), the reservation should already
  // have been claimed by validateAndReserveRewardToken during the checkout
  // preview. Flip it to REDEEMED now that the order has landed. Failures
  // are non-fatal — the order still stands; support can manually resolve.
  const rewardTokenClaimed = String(data.rewardToken || '').trim().toUpperCase();
  if (rewardTokenClaimed) {
    try {
      const code = rewardTokenClaimed.includes('.') ? parseRewardQr(rewardTokenClaimed) : rewardTokenClaimed;
      if (code) {
        const res = await redeemRewardToken({ code, customerUid: uid, orderId: clientOrderId, orderNo });
        if (res.ok) {
          await orderRef.update({ redeemedRewardCode: code });
          try {
            await dispatchNotification({
              templateName: 'reward.redeemed',
              ctx: { label: (res.reward && res.reward.label) || 'reward', orderNo },
              phone: userPhone,
              uid,
              dedupKey: `reward:${code}:redeemed:${clientOrderId}`,
              meta: { orderId: clientOrderId, orderNo, code },
            });
          } catch (err) { /* no-op */ }
        }
      }
    } catch (err) { /* no-op */ }
  }

  // Phase 12: award standard points for this order. Idempotent per orderId
  // (a retry doesn't double-credit). Balance is mirrored on
  // customers/{uid}.points; ledger under pointsLedger/{id} is the truth.
  let pointsAwarded = 0;
  try {
    const res = await awardOrderPoints({
      customerUid: uid, orderId: clientOrderId, orderNo, orderTotal: total,
    });
    if (res.ok && typeof res.delta === 'number') {
      pointsAwarded = res.delta;
      try {
        await dispatchNotification({
          templateName: 'points.earned',
          ctx: { orderNo, points: String(res.delta), balance: String(res.balance || 0) },
          phone: userPhone,
          uid,
          dedupKey: `points.earned:${clientOrderId}`,
          meta: { orderId: clientOrderId, orderNo, points: res.delta, balance: res.balance },
        });
      } catch (err) { /* no-op */ }
    }
  } catch (err: any) {
    try { console.warn('[submitOrder] points award failed:', err?.message || err); } catch {}
  }

  // Phase 13 Wave A — VIP tier bump. Lifetime spend/orders climb by exactly
  // one order's worth (idempotent on orderId). A tier upgrade fires a
  // notification once, non-blocking on the return path.
  let tierChanged = false;
  let tierAfter: string | undefined;
  try {
    const res = await bumpLifetimeAndRecompute({
      customerUid: uid, orderId: clientOrderId, orderTotal: total,
    });
    tierChanged = !!res.changed;
    tierAfter = res.tier?.tierId;
    if (res.changed && res.tier) {
      try {
        await dispatchNotification({
          templateName: 'tier.upgraded',
          ctx: { tier: res.tier.tierName, emoji: res.tier.tierEmoji || '⭐' },
          phone: userPhone,
          uid,
          dedupKey: `tier.upgraded:${uid}:${res.tier.tierId}`,
          meta: { tierId: res.tier.tierId, orderId: clientOrderId },
        });
      } catch (err) { /* non-blocking */ }
    }
  } catch (err: any) {
    try { console.warn('[submitOrder] tier bump failed:', err?.message || err); } catch {}
  }

  // Phase 13 Wave B — order-streak evaluator. Counts qualifying orders (any
  // non-cancelled) within the configured window; awards bonus points on
  // milestone hit via the ledger. Idempotent per orderId via the ledger's
  // dedupKey. Failure never rolls back the order.
  let streakAfter: number | undefined;
  let streakMilestone: string | undefined;
  try {
    const res = await evaluateOrderStreak({
      customerUid: uid, orderId: clientOrderId, orderNo, orderTotal: total, phone: userPhone,
    });
    streakAfter = res.streak?.current;
    if (res.milestoneHit) {
      streakMilestone = res.milestoneHit.label;
      try {
        await dispatchNotification({
          templateName: 'streak.milestone',
          ctx: { count: String(res.streak?.current || 0), label: res.milestoneHit.label },
          phone: userPhone,
          uid,
          dedupKey: `streak.milestone:${uid}:${res.milestoneHit.threshold}`,
          meta: { threshold: res.milestoneHit.threshold, points: res.milestoneHit.bonusPoints || 0 },
        });
      } catch (err) { /* non-blocking */ }
    }
  } catch (err: any) {
    try { console.warn('[submitOrder] streak evaluation failed:', err?.message || err); } catch {}
  }

  // Phase 13 Wave C — mission evaluator. Walks active missions and marks
  // any newly-completed ones for this customer; the evaluator itself
  // handles bonus-point payout via the ledger and any reward token mint.
  try {
    await evaluateMissionsForOrder({
      customerUid: uid, orderId: clientOrderId, orderNo, orderTotal: total,
      branch: branchId, items: (snapshotItems || []).map((i: any) => ({
        id: String(i.id), qty: Number(i.qty) || 1, name: String(i.name || ''),
      })), phone: userPhone,
    });
  } catch (err: any) {
    try { console.warn('[submitOrder] mission evaluation failed:', err?.message || err); } catch {}
  }

  // Phase 14 — referral qualification. If the customer arrived through a
  // valid ?ref=… code AND this order clears the min-spend threshold AND
  // caps aren't exhausted, both sides get the configured points bonus.
  // Idempotent per referral row (ledger dedupKey handles retries).
  try {
    await qualifyReferralOnOrder({
      refereeUid: uid, orderId: clientOrderId, orderNo,
      orderTotal: total, refereePhone: userPhone,
    });
  } catch (err: any) {
    try { console.warn('[submitOrder] referral qualify failed:', err?.message || err); } catch {}
  }

  // Phase 15/16 — evaluate every active campaign against this customer.
  // Non-inactivity campaigns fire immediately (e.g. "new customer welcome
  // reward" hits on the first order). Silent on failure — a campaign
  // eval error must NEVER break the order pipeline.
  try {
    const campaignRes = await evaluateCampaignsForCustomer(uid, 'order');
    if (campaignRes.issued > 0) {
      try {
        await dispatchNotification({
          templateName: 'campaign.available' as TemplateName,
          ctx: { count: String(campaignRes.issued) },
          uid,
          phone: userPhone,
          dedupKey: `campaign.issued:${clientOrderId}`,
          meta: { source: 'submitOrder', orderNo, issued: campaignRes.issued },
        });
      } catch { /* notification is best-effort */ }
    }
  } catch (err: any) {
    try { console.warn('[submitOrder] campaign eval failed:', err?.message || err); } catch {}
  }

  return {
    fbId: clientOrderId,
    orderNo,
    status: 'new',
    existing: false,
    rewardsIssued: issuedRewards.length,
    pointsAwarded,
    tierChanged,
    tierAfter,
    streakAfter,
    streakMilestone,
  };
}

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

  // Phase 12/13 reversal on cancellation. The tier + streak bumps + points
  // land inside submitOrder (at placement time) so a customer who cancels
  // right after placing would keep credit they never earned. Reverse now.
  // Idempotent per orderId (each reversal helper carries its own sentinel).
  if (nextStatus === 'cancelled' && uid) {
    try {
      await reverseOrderPoints({
        customerUid: uid, orderId, orderNo: String(cur.orderNo || ''),
        reason: reason || 'cancelled', by: req.auth.uid,
      });
    } catch (err: any) { try { console.warn('[updateOrderStatus] point reversal failed:', err?.message || err); } catch {} }
    try {
      const db2 = getFirestore();
      const custRef = db2.doc(`customers/${uid}`);
      const sentinelRef = db2.doc(`customers/${uid}/lifetimeAggregates/${orderId}`);
      await db2.runTransaction(async (tx: Transaction) => {
        const [custSnap, sentSnap] = await Promise.all([tx.get(custRef), tx.get(sentinelRef)]);
        if (!custSnap.exists) return;
        const s = sentSnap.exists ? (sentSnap.data() as any) : null;
        if (!s || s.reversed) return;
        const delta = Math.max(0, Number(s.delta) || 0);
        tx.update(custRef, {
          lifetimeSpend: FieldValue.increment(-delta),
          lifetimeOrders: FieldValue.increment(-1),
        });
        tx.update(sentinelRef, { reversed: true, reversedAt: new Date().toISOString() });
      });
      await recomputeTier(uid);
    } catch (err: any) { try { console.warn('[updateOrderStatus] tier reversal failed:', err?.message || err); } catch {} }
    try {
      await reverseOrderStreak({ customerUid: uid, orderId });
    } catch (err: any) { try { console.warn('[updateOrderStatus] streak reversal failed:', err?.message || err); } catch {} }
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

  // Phase 12: reverse the points that were awarded when this order landed.
  // Idempotent per orderId (dedupKey inside reverseOrderPoints).
  try {
    if (cur.userUid) {
      await reverseOrderPoints({
        customerUid: String(cur.userUid),
        orderId,
        orderNo: String(cur.orderNo || ''),
        reason: reason || 'refund',
        by: req.auth.uid,
      });
    }
  } catch (err: any) {
    try { console.warn('[refundOrder] point reversal failed:', err?.message || err); } catch {}
  }

  // Phase 13 Wave B: streak reversal on refund. Config's countRefunded
  // gate is inside reverseOrderStreak — if the owner opted to keep
  // refunded orders in the streak, this is a no-op.
  try {
    if (cur.userUid) {
      await reverseOrderStreak({ customerUid: String(cur.userUid), orderId });
    }
  } catch (err: any) { try { console.warn('[refundOrder] streak reversal failed:', err?.message || err); } catch {} }

  // Phase 13 Wave A: shave the refunded amount back off lifetimeSpend and
  // decrement the order count, then recompute the tier so a customer who
  // was pushed into a higher tier by a since-refunded order settles back.
  // The sentinel key mirrors the bump path so we don't double-adjust.
  try {
    if (cur.userUid) {
      const db2 = getFirestore();
      const custRef = db2.doc(`customers/${cur.userUid}`);
      const sentinelRef = db2.doc(`customers/${cur.userUid}/lifetimeAggregates/${orderId}`);
      await db2.runTransaction(async (tx: Transaction) => {
        const [custSnap, sentSnap] = await Promise.all([tx.get(custRef), tx.get(sentinelRef)]);
        if (!custSnap.exists) return;
        // Only reverse if we actually applied the increment before AND we
        // haven't already reversed. The sentinel is stamped `reversed: true`
        // on the reverse pass so a retry is a no-op.
        const s = sentSnap.exists ? (sentSnap.data() as any) : null;
        if (!s || s.reversed) return;
        const delta = Math.max(0, Number(s.delta) || 0);
        tx.update(custRef, {
          lifetimeSpend: FieldValue.increment(-delta),
          lifetimeOrders: FieldValue.increment(-1),
        });
        tx.update(sentinelRef, { reversed: true, reversedAt: new Date().toISOString() });
      });
      await recomputeTier(String(cur.userUid));
    }
  } catch (err: any) {
    try { console.warn('[refundOrder] tier reversal failed:', err?.message || err); } catch {}
  }

  return { ok: true, status: 'refunded', amount: refundedAmount };
});

// ── Phase 12: points callables ──────────────────────────────────────────

interface AdjustPointsData {
  customerUid: string;
  delta: number;
  reason: string;
  allowNegative?: boolean;
}

/** Owner-only manual points adjustment. Writes a `admin.adjust` ledger entry. */
export const adjustPoints = onCall<AdjustPointsData>(async (req: CallableRequest<AdjustPointsData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  const customerUid = String(req.data?.customerUid || '').trim();
  const delta = Math.round(Number(req.data?.delta) || 0);
  const reason = String(req.data?.reason || '').trim();
  if (!customerUid) throw new HttpsError('invalid-argument', 'customerUid required.');
  if (!reason) throw new HttpsError('invalid-argument', 'reason required.');
  if (delta === 0) throw new HttpsError('invalid-argument', 'delta must be non-zero.');
  const res = await appendLedger({
    customerUid, delta, reason, source: 'admin.adjust',
    by: req.auth.uid,
    allowNegative: !!req.data?.allowNegative || delta > 0, // positive is always fine
  });
  if (!res.ok) throw new HttpsError('failed-precondition', res.error || 'append failed');
  return { ok: true, balance: res.balance, delta };
});

/**
 * Redeem points for a reward. Debits the ledger and issues a Phase 10/11
 * reward + token in one transaction. The customer scans/uses the token on
 * a future order.
 */
interface RedeemPointsData {
  cost: number;       // points to deduct
  label: string;      // human-readable "SR 10 off"
  kind: string;       // reward kind — mirrors Phase 10 RewardKind
  value?: number;
  productId?: string | number;
  expiresInDays?: number;
}
export const redeemPointsForReward = onCall<RedeemPointsData>({ secrets: [REWARD_TOKEN_SIGNING_KEY] }, async (req: CallableRequest<RedeemPointsData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = req.auth.uid;
  const cost = Math.round(Number(req.data?.cost) || 0);
  const label = String(req.data?.label || '').trim();
  const kind = String(req.data?.kind || '').trim();
  if (cost <= 0) throw new HttpsError('invalid-argument', 'cost must be positive.');
  if (!label) throw new HttpsError('invalid-argument', 'label required.');
  if (!kind) throw new HttpsError('invalid-argument', 'kind required.');

  const db = getFirestore();
  const custSnap = await db.doc(`customers/${uid}`).get();
  if (!custSnap.exists) throw new HttpsError('failed-precondition', 'Complete your profile first.');
  const phone = String((custSnap.data() as any).phone || '');

  // Debit the ledger — will fail with 'insufficient-balance' if not enough.
  const debit = await appendLedger({
    customerUid: uid, delta: -cost,
    reason: `Redeemed: ${label}`,
    source: 'redeem.reward',
  });
  if (!debit.ok) {
    throw new HttpsError(
      debit.error === 'insufficient-balance' ? 'failed-precondition' : 'internal',
      debit.error || 'debit failed',
    );
  }

  // Mint the reward record + token so the customer can redeem it later.
  const expiresInDays = Number(req.data?.expiresInDays) > 0 ? Number(req.data?.expiresInDays) : 30;
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + expiresInDays * 86400_000).toISOString();
  const rewardRef = db.collection('rewards').doc();
  await rewardRef.set({
    id: rewardRef.id,
    ruleId: '__points_redeem__',
    ruleName: 'Points Redemption',
    customerUid: uid,
    customerPhone: phone,
    kind,
    value: req.data?.value,
    productId: req.data?.productId,
    label,
    status: 'available',
    issuedAt: nowIso,
    expiresAt: expiresIso,
    pointsCost: cost,
  });
  let tokenCode: string | undefined;
  try {
    const tok = await mintTokenFor(rewardRef.id);
    tokenCode = tok.code;
  } catch (err) { /* token failed but reward remains */ }

  try {
    await dispatchNotification({
      templateName: 'points.redeemed',
      ctx: { points: String(cost), label, balance: String(debit.balance || 0) },
      phone, uid,
      dedupKey: `points.redeemed:${rewardRef.id}`,
      meta: { rewardId: rewardRef.id, code: tokenCode || null },
    });
  } catch (err) { /* no-op */ }

  return { ok: true, rewardId: rewardRef.id, code: tokenCode, balance: debit.balance };
});

// ── Phase 11 reward-token callables ────────────────────────────────────

interface ValidateRewardCodeData {
  codeOrPayload: string;
  branchId?: string;
  productIds?: (string | number)[];
  orderTotal?: number;
}

/** Read-only preview — used by the checkout UI to show "Reward applies" before reserving. */
export const validateRewardCode = onCall<ValidateRewardCodeData>({ secrets: [REWARD_TOKEN_SIGNING_KEY] }, async (req: CallableRequest<ValidateRewardCodeData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const res = await validateRewardToken({
    codeOrPayload: String(req.data?.codeOrPayload || ''),
    customerUid: req.auth.uid,
    branchId: req.data?.branchId,
    productIds: req.data?.productIds,
    orderTotal: Number(req.data?.orderTotal || 0),
  });
  return res;
});

interface ReserveRewardCodeData extends ValidateRewardCodeData { orderId: string; }
/** Reserve a token to a specific clientOrderId — atomic, single-writer. */
export const reserveRewardCode = onCall<ReserveRewardCodeData>({ secrets: [REWARD_TOKEN_SIGNING_KEY] }, async (req: CallableRequest<ReserveRewardCodeData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const orderId = String(req.data?.orderId || '').trim();
  if (!orderId) throw new HttpsError('invalid-argument', 'orderId required.');
  const res = await reserveRewardToken({
    codeOrPayload: String(req.data?.codeOrPayload || ''),
    customerUid: req.auth.uid,
    branchId: req.data?.branchId,
    productIds: req.data?.productIds,
    orderTotal: Number(req.data?.orderTotal || 0),
    orderId,
  });
  return res;
});

/** Owner-triggered sweep — releases expired reservations, marks TTL'd tokens expired. */
export const sweepRewardTokensNow = onCall({ secrets: [REWARD_TOKEN_SIGNING_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  return sweepRewardTokens();
});

// Keep parseRewardQr / rewardQrPayload visible so callers of this module can
// share the same code paths without duplicating the format.
export const rewardTokenHelpers = { parseRewardQr, rewardQrPayload };

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

// ── Phase 13 callables — tiers / streaks / missions ────────────────────

interface SaveTierConfigData { tiers: TierRule[] }

/** Owner-only: replace the tier config wholesale. Sanitized server-side. */
export const saveTierConfig = onCall<SaveTierConfigData>(async (req: CallableRequest<SaveTierConfigData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  const tiers = Array.isArray(req.data?.tiers) ? req.data.tiers : [];
  if (tiers.length === 0 || tiers.length > 12) {
    throw new HttpsError('invalid-argument', 'tiers must be a 1–12 entry array.');
  }
  await getFirestore().doc('settings/tierConfig').set({
    tiers, updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, tiers: tiers.length };
});

interface RecomputeTierData { customerUid?: string }

/** Force a tier recompute for one customer (self by default, staff for any). */
export const forceRecomputeTier = onCall<RecomputeTierData>(async (req: CallableRequest<RecomputeTierData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const target = String(req.data?.customerUid || req.auth.uid).trim();
  if (target !== req.auth.uid) {
    const caller = await readCallerRole(req.auth.uid);
    if (caller.role !== 'owner' && caller.role !== 'branch') {
      throw new HttpsError('permission-denied', 'Staff only for other customers.');
    }
  }
  const snap = await recomputeTier(target);
  return { ok: true, tier: snap };
});

interface SaveStreakConfigData { config: StreakConfigDoc }

/** Owner-only: replace the streak config. */
export const saveStreakConfig = onCall<SaveStreakConfigData>(async (req: CallableRequest<SaveStreakConfigData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  const c = req.data?.config;
  if (!c || typeof c !== 'object') throw new HttpsError('invalid-argument', 'config required.');
  await getFirestore().doc('settings/streakConfig').set({
    enabled: c.enabled !== false,
    windowDays: Math.max(1, Math.min(365, Math.floor(Number(c.windowDays) || DEFAULT_STREAK_CONFIG.windowDays))),
    minOrders: Math.max(1, Math.min(100, Math.floor(Number(c.minOrders) || DEFAULT_STREAK_CONFIG.minOrders!))),
    countRefunded: !!c.countRefunded,
    milestones: Array.isArray(c.milestones)
      ? c.milestones.slice(0, 20).map((m) => ({
          threshold: Math.max(1, Math.floor(Number(m.threshold) || 0)),
          label: String(m.label || '').slice(0, 60),
          labelAr: m.labelAr ? String(m.labelAr).slice(0, 60) : undefined,
          bonusPoints: Math.max(0, Math.floor(Number(m.bonusPoints) || 0)),
        })).filter((m) => m.threshold > 0 && m.label)
      : DEFAULT_STREAK_CONFIG.milestones,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

interface SaveMissionData {
  mission: {
    id?: string;
    title: string; titleAr?: string;
    description?: string; descriptionAr?: string;
    kind: 'combo' | 'quiet_hours' | 'product' | 'spend';
    active?: boolean;
    fromISO?: string; toISO?: string;
    branches?: string[];
    itemIds?: string[]; itemQty?: number;
    quietFromHHMM?: string; quietToHHMM?: string;
    minSpend?: number;
    reward: { bonusPoints?: number; rewardRuleId?: string; label: string; labelAr?: string };
    maxCompletions?: number; maxPerCustomer?: number;
  };
}

/** Owner-only: upsert a mission. Server generates the id when the caller omits it. */
export const saveMission = onCall<SaveMissionData>(async (req: CallableRequest<SaveMissionData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  const m = req.data?.mission;
  if (!m || !m.title || !m.kind || !m.reward) {
    throw new HttpsError('invalid-argument', 'mission.title / .kind / .reward required.');
  }
  const db = getFirestore();
  const id = String(m.id || db.collection('missions').doc().id).slice(0, 60);
  const payload: Record<string, unknown> = {
    id,
    title: String(m.title).slice(0, 80),
    kind: m.kind,
    active: m.active !== false,
    reward: {
      label: String(m.reward.label || 'Reward').slice(0, 60),
      ...(m.reward.labelAr ? { labelAr: String(m.reward.labelAr).slice(0, 60) } : {}),
      ...(m.reward.bonusPoints ? { bonusPoints: Math.floor(Number(m.reward.bonusPoints)) } : {}),
      ...(m.reward.rewardRuleId ? { rewardRuleId: String(m.reward.rewardRuleId).slice(0, 60) } : {}),
    },
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (m.titleAr) payload.titleAr = String(m.titleAr).slice(0, 80);
  if (m.description) payload.description = String(m.description).slice(0, 300);
  if (m.descriptionAr) payload.descriptionAr = String(m.descriptionAr).slice(0, 300);
  if (m.fromISO) payload.fromISO = String(m.fromISO);
  if (m.toISO) payload.toISO = String(m.toISO);
  if (Array.isArray(m.branches)) payload.branches = m.branches.map((s) => String(s)).slice(0, 20);
  if (Array.isArray(m.itemIds)) payload.itemIds = m.itemIds.map((s) => String(s)).slice(0, 30);
  if (m.itemQty) payload.itemQty = Math.max(1, Math.floor(Number(m.itemQty)));
  if (m.quietFromHHMM) payload.quietFromHHMM = String(m.quietFromHHMM).slice(0, 5);
  if (m.quietToHHMM) payload.quietToHHMM = String(m.quietToHHMM).slice(0, 5);
  if (m.minSpend) payload.minSpend = Number(m.minSpend);
  if (m.maxCompletions) payload.maxCompletions = Math.max(1, Math.floor(Number(m.maxCompletions)));
  if (m.maxPerCustomer) payload.maxPerCustomer = Math.max(1, Math.floor(Number(m.maxPerCustomer)));
  const existing = await db.doc(`missions/${id}`).get();
  if (!existing.exists) {
    payload.createdAt = FieldValue.serverTimestamp();
    payload.completions = 0;
  }
  await db.doc(`missions/${id}`).set(payload, { merge: true });
  return { ok: true, id };
});

interface DeleteMissionData { id: string }

export const deleteMission = onCall<DeleteMissionData>(async (req: CallableRequest<DeleteMissionData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  const id = String(req.data?.id || '').trim();
  if (!id) throw new HttpsError('invalid-argument', 'id required.');
  await getFirestore().doc(`missions/${id}`).delete();
  return { ok: true };
});

// ── Phase 14 callables — referrals ─────────────────────────────────────

interface AttachReferralData { code: string }

/** Customer-signed-in call: attach a referral code to my customer profile. */
export const attachReferralCode = onCall<AttachReferralData>(async (req: CallableRequest<AttachReferralData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = req.auth.uid;
  const code = String(req.data?.code || '').trim().toUpperCase();
  if (!code) throw new HttpsError('invalid-argument', 'code required.');
  const db = getFirestore();
  const cust = await db.doc(`customers/${uid}`).get();
  const phone = cust.exists ? String((cust.data() as any).phone || '') : '';
  const res = await attachReferral({ refereeUid: uid, refereePhone: phone, code });
  return res;
});

/** Return the caller's own referral code, minting on first call. */
export const getMyReferralCode = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  try {
    const res = await getOrMintReferralCode(req.auth.uid);
    return { ok: true, ...res };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'mint-failed' };
  }
});

// ── Customer 360° admin panel — server-authorized writes ─────────────
// Staff notes and profile edits ride through callables so the panel's
// mutations get the same rules gate as points and orders. Notes append
// server-side (arrayUnion), profile edits pass through a whitelist so a
// rogue client can't overwrite tier/points fields, and both write with
// serverTimestamp so cross-device viewers see the same clock.

interface AddCustomerNoteData { customerUid: string; text: string }
export const addCustomerNote = onCall<AddCustomerNoteData>(async (req: CallableRequest<AddCustomerNoteData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (!(caller.role === 'owner' || caller.role === 'branch' || caller.role === 'staff'))
    throw new HttpsError('permission-denied', 'Staff only.');
  const uid  = String(req.data?.customerUid || '').trim();
  const text = String(req.data?.text || '').trim().slice(0, 500);
  if (!uid || !text) throw new HttpsError('invalid-argument', 'customerUid + text required.');
  const entry = {
    text,
    staffUid: req.auth.uid,
    staffName: (req.auth.token && (req.auth.token.name || req.auth.token.email)) || '',
    at: new Date().toISOString(),
  };
  await getFirestore().doc(`customers/${uid}`).set(
    { notes: FieldValue.arrayUnion(entry), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return { ok: true, entry };
});

interface UpdateCustomerInfoData {
  customerUid: string;
  patch: { name?: string; email?: string; dob?: string; lang?: string; prefBranch?: string; blocked?: boolean };
}
export const updateCustomerInfo = onCall<UpdateCustomerInfoData>(async (req: CallableRequest<UpdateCustomerInfoData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (!(caller.role === 'owner' || caller.role === 'branch'))
    throw new HttpsError('permission-denied', 'Owner or branch manager only.');
  const uid = String(req.data?.customerUid || '').trim();
  if (!uid) throw new HttpsError('invalid-argument', 'customerUid required.');
  const raw = req.data?.patch || {};
  // Whitelist — never let the panel overwrite points/tier/lifetime fields
  // from the client. Those move only through the server ledger.
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (typeof raw.name       === 'string') patch.name       = raw.name.slice(0, 80);
  if (typeof raw.email      === 'string') patch.email      = raw.email.slice(0, 120);
  if (typeof raw.dob        === 'string') patch.dob        = raw.dob.slice(0, 20);
  if (typeof raw.lang       === 'string') patch.lang       = raw.lang.slice(0, 8);
  if (typeof raw.prefBranch === 'string') patch.prefBranch = raw.prefBranch.slice(0, 40);
  if (typeof raw.blocked    === 'boolean' && caller.role === 'owner') patch.blocked = raw.blocked;
  await getFirestore().doc(`customers/${uid}`).set(patch, { merge: true });
  return { ok: true };
});

interface SaveReferralConfigData { config: ReferralConfigDoc }

/** Owner-only: replace the referral config. */
export const saveReferralConfig = onCall<SaveReferralConfigData>(async (req: CallableRequest<SaveReferralConfigData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  const c = req.data?.config;
  if (!c || typeof c !== 'object') throw new HttpsError('invalid-argument', 'config required.');
  await getFirestore().doc('settings/referralConfig').set({
    enabled: c.enabled !== false,
    minOrderTotal: Math.max(0, Math.min(5000, Number(c.minOrderTotal) || DEFAULT_REFERRAL_CONFIG.minOrderTotal)),
    rewardReferrerPoints: Math.max(0, Math.min(5000, Math.floor(Number(c.rewardReferrerPoints) || DEFAULT_REFERRAL_CONFIG.rewardReferrerPoints))),
    rewardRefereePoints: Math.max(0, Math.min(5000, Math.floor(Number(c.rewardRefereePoints) || DEFAULT_REFERRAL_CONFIG.rewardRefereePoints))),
    maxPerReferrerDay: Math.max(0, Math.min(1000, Math.floor(Number(c.maxPerReferrerDay) || DEFAULT_REFERRAL_CONFIG.maxPerReferrerDay))),
    maxPerReferrerLifetime: Math.max(0, Math.min(100000, Math.floor(Number(c.maxPerReferrerLifetime) || DEFAULT_REFERRAL_CONFIG.maxPerReferrerLifetime))),
    expiryDays: Math.max(1, Math.min(365, Math.floor(Number(c.expiryDays) || DEFAULT_REFERRAL_CONFIG.expiryDays))),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

// ── Phase 16: Marketing campaigns + Phase 15 audience segments ──────────

interface SaveSegmentData { segment: SegmentDoc }
/** Owner-only: create or update a customer segment. */
export const saveSegment = onCall<SaveSegmentData>(async (req: CallableRequest<SaveSegmentData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  const seg = req.data?.segment;
  if (!seg || typeof seg !== 'object') throw new HttpsError('invalid-argument', 'segment required.');
  const id = String(seg.id || '').trim() || getFirestore().collection('_ids').doc().id;
  const name = String(seg.name || '').trim();
  if (!name) throw new HttpsError('invalid-argument', 'name required.');
  const nowIso = new Date().toISOString();
  const doc: SegmentDoc = {
    id,
    name,
    description: seg.description ? String(seg.description).slice(0, 500) : undefined,
    rules: seg.rules || {},
    includeUids: Array.isArray(seg.includeUids) ? seg.includeUids.filter(Boolean).slice(0, 500) : [],
    excludeUids: Array.isArray(seg.excludeUids) ? seg.excludeUids.filter(Boolean).slice(0, 500) : [],
    updatedAt: nowIso,
    createdBy: req.auth.uid,
  };
  const ref = getFirestore().doc(`segments/${id}`);
  const existing = await ref.get();
  if (!existing.exists) doc.createdAt = nowIso;
  await ref.set(doc, { merge: true });
  return { ok: true, id };
});

interface DeleteSegmentData { segmentId: string }
export const deleteSegment = onCall<DeleteSegmentData>(async (req: CallableRequest<DeleteSegmentData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  const id = String(req.data?.segmentId || '').trim();
  if (!id) throw new HttpsError('invalid-argument', 'segmentId required.');
  await getFirestore().doc(`segments/${id}`).delete();
  return { ok: true };
});

interface ResolveSegmentPreviewData { segment: SegmentDoc; sampleSize?: number }
/**
 * Owner-only preview — resolves the segment audience server-side and
 * returns the count plus a small sample (uid + name + phone) so the
 * admin UI can render "213 customers match — e.g. Ali, Sara, Omar…"
 * without shipping the full uid list to the browser.
 */
export const resolveSegmentPreview = onCall<ResolveSegmentPreviewData>(async (req: CallableRequest<ResolveSegmentPreviewData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  const seg = req.data?.segment;
  if (!seg || typeof seg !== 'object') throw new HttpsError('invalid-argument', 'segment required.');
  const uids = await evaluateSegment(seg);
  const sampleN = Math.max(1, Math.min(20, Math.floor(Number(req.data?.sampleSize) || 8)));
  const sampleUids = uids.slice(0, sampleN);
  const db = getFirestore();
  const samples = await Promise.all(sampleUids.map(async uid => {
    try {
      const s = await db.doc(`customers/${uid}`).get();
      if (!s.exists) return { uid, name: '(unknown)', phone: '' };
      const d = s.data() as any;
      return { uid, name: String(d.name || '(unnamed)'), phone: String(d.phone || '') };
    } catch { return { uid, name: '(error)', phone: '' }; }
  }));
  return { ok: true, count: uids.length, sample: samples };
});

interface SaveCampaignData { campaign: CampaignDoc }
/** Owner-only: create or update a campaign. Status transitions honoured. */
export const saveCampaign = onCall<SaveCampaignData>(async (req: CallableRequest<SaveCampaignData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  const c = req.data?.campaign;
  if (!c || typeof c !== 'object') throw new HttpsError('invalid-argument', 'campaign required.');
  const id = String(c.id || '').trim() || getFirestore().collection('_ids').doc().id;
  const name = String(c.name || '').trim();
  if (!name) throw new HttpsError('invalid-argument', 'name required.');
  if (!c.reward || !c.reward.kind) throw new HttpsError('invalid-argument', 'reward.kind required.');
  const nowIso = new Date().toISOString();
  const validStatus: CampaignDoc['status'][] = ['draft', 'active', 'paused', 'ended'];
  const status = validStatus.indexOf(c.status as any) >= 0 ? c.status : 'draft';
  const doc: CampaignDoc = {
    id,
    name,
    description: c.description ? String(c.description).slice(0, 1000) : undefined,
    segmentId: c.segmentId ? String(c.segmentId) : undefined,
    branches: Array.isArray(c.branches) ? c.branches.filter(Boolean).slice(0, 50) : [],
    reward: {
      kind: c.reward.kind,
      value: Number(c.reward.value) || 0,
      productId: c.reward.productId,
      label: String(c.reward.label || name).slice(0, 200),
      expiresInDays: Math.max(1, Math.min(365, Math.floor(Number(c.reward.expiresInDays) || 30))),
      minOrderSr: Number(c.reward.minOrderSr) > 0 ? Number(c.reward.minOrderSr) : undefined,
    },
    budget: {
      maxRewards: c.budget?.maxRewards != null ? Math.max(0, Math.floor(Number(c.budget.maxRewards))) : undefined,
      dailySrCap: c.budget?.dailySrCap != null ? Math.max(0, Number(c.budget.dailySrCap)) : undefined,
      perCustomerLimit: Math.max(1, Math.min(50, Math.floor(Number(c.budget?.perCustomerLimit) || 1))),
    },
    startAt: c.startAt || undefined,
    endAt: c.endAt || undefined,
    activeHoursStart: c.activeHoursStart || undefined,
    activeHoursEnd: c.activeHoursEnd || undefined,
    status,
    notifBody: c.notifBody ? String(c.notifBody).slice(0, 500) : undefined,
    updatedAt: nowIso,
    createdBy: req.auth.uid,
  };
  const ref = getFirestore().doc(`campaigns/${id}`);
  const existing = await ref.get();
  if (!existing.exists) {
    doc.createdAt = nowIso;
    doc.stats = { issued: 0, redeemed: 0, revenueSr: 0, blockedByBudget: 0, reservedSrToday: 0, reservedSrDate: nowIso.slice(0, 10) };
  }
  await ref.set(doc, { merge: true });
  return { ok: true, id };
});

interface DeleteCampaignData { campaignId: string }
export const deleteCampaign = onCall<DeleteCampaignData>(async (req: CallableRequest<DeleteCampaignData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  const id = String(req.data?.campaignId || '').trim();
  if (!id) throw new HttpsError('invalid-argument', 'campaignId required.');
  await getFirestore().doc(`campaigns/${id}`).delete();
  return { ok: true };
});

interface SetCampaignStatusData { campaignId: string; status: 'active' | 'paused' | 'ended' | 'draft' }
export const setCampaignStatus = onCall<SetCampaignStatusData>({ secrets: [REWARD_TOKEN_SIGNING_KEY] }, async (req: CallableRequest<SetCampaignStatusData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  const id = String(req.data?.campaignId || '').trim();
  const status = String(req.data?.status || '').trim() as SetCampaignStatusData['status'];
  if (!id) throw new HttpsError('invalid-argument', 'campaignId required.');
  if (['active', 'paused', 'ended', 'draft'].indexOf(status) < 0) throw new HttpsError('invalid-argument', 'bad status');
  await getFirestore().doc(`campaigns/${id}`).update({
    status,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true };
});

interface IssueCampaignNowData { campaignId: string }
/**
 * Owner-only: run the campaign's audience through the reward issuer once.
 * Uses the campaign's stored segmentId (or broadcast when omitted).
 * Returns a summary { issued, skipped, blocked, failed, reasons } so the
 * admin UI can show "Issued 42 · 8 skipped (already had one) · 3 blocked
 * (daily cap)".
 */
export const issueCampaignNow = onCall<IssueCampaignNowData>({ secrets: [REWARD_TOKEN_SIGNING_KEY] }, async (req: CallableRequest<IssueCampaignNowData>) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = await readCallerRole(req.auth.uid);
  if (caller.role !== 'owner') throw new HttpsError('permission-denied', 'Owner only.');
  const id = String(req.data?.campaignId || '').trim();
  if (!id) throw new HttpsError('invalid-argument', 'campaignId required.');
  const db = getFirestore();
  const cSnap = await db.doc(`campaigns/${id}`).get();
  if (!cSnap.exists) throw new HttpsError('not-found', 'campaign not found');
  const c = cSnap.data() as CampaignDoc;
  if (c.status !== 'active') throw new HttpsError('failed-precondition', 'campaign not active');

  let uids: string[];
  if (c.segmentId) {
    const sSnap = await db.doc(`segments/${c.segmentId}`).get();
    if (!sSnap.exists) throw new HttpsError('failed-precondition', 'segment missing');
    uids = await evaluateSegment(sSnap.data() as SegmentDoc);
  } else {
    // Broadcast — every customer
    const custs = await db.collection('customers').limit(2000).get();
    uids = custs.docs.map(d => d.id);
  }
  const summary = await issueCampaignToAudience(id, uids);
  return { ok: true, audience: uids.length, ...summary };
});

/**
 * Phase 15/16 — scheduled runner for inactivity-based campaigns.
 * Runs once a day at 07:00 Riyadh time (04:00 UTC). Iterates active
 * campaigns whose segments are inactivity-based, resolves the audience,
 * and issues rewards. Non-inactivity campaigns skip this pass because
 * they already fire on submitOrder — running them here would just spam
 * duplicate "per-customer-limit" no-ops.
 */
export const runScheduledCampaigns = onSchedule(
  { schedule: '0 4 * * *', timeZone: 'UTC', secrets: [REWARD_TOKEN_SIGNING_KEY] },
  async () => {
    const db = getFirestore();
    const campSnap = await db.collection('campaigns').get();
    let totalIssued = 0, totalMatched = 0;
    for (const doc of campSnap.docs) {
      const c = doc.data() as CampaignDoc;
      if (c.status !== 'active') continue;
      if (!c.segmentId) continue; // broadcast campaigns run manually — spamming everyone daily would be spammy
      const segSnap = await db.doc(`segments/${c.segmentId}`).get();
      if (!segSnap.exists) continue;
      const seg = segSnap.data() as SegmentDoc;
      // Only run inactivity-based segments here; other segments already
      // fire from submitOrder as customers do their thing.
      if (!(seg.rules?.inactiveDays && seg.rules.inactiveDays > 0)) continue;
      const uids = await evaluateSegment(seg);
      totalMatched += uids.length;
      const summary = await issueCampaignToAudience(c.id, uids);
      totalIssued += summary.issued;
      try {
        await db.collection('campaignEvents').add({
          at: new Date().toISOString(),
          action: 'scheduled-run',
          campaignId: c.id,
          matched: uids.length,
          ...summary,
        });
      } catch { /* audit best-effort */ }
    }
    console.log(`[runScheduledCampaigns] matched=${totalMatched} issued=${totalIssued}`);
  }
);
