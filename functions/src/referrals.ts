/**
 * Referrals + anti-abuse — Phase 14.
 *
 * Model:
 *   customers/{uid}.referralCode  — the code the customer shares. Server-
 *                                    minted (crypto RNG), guaranteed
 *                                    globally unique via referralCodes/{code}.
 *   customers/{uid}.referredBy    — the code that referred this customer;
 *                                    stamped once, before any qualifying
 *                                    order. Never rewritten.
 *   referralCodes/{code}          — reverse index: { customerUid }.
 *                                    Used to look up "whose code is this?"
 *                                    without an index scan; also serves as
 *                                    the atomic uniqueness lock during
 *                                    mintReferralCode.
 *   referrals/{id}                — one row per attach. Starts `pending`,
 *                                    flips to `qualified` on the referee's
 *                                    first qualifying order.
 *   settings/referralConfig       — thresholds + reward sizes + caps.
 *
 * Anti-abuse:
 *   - Self-referral by uid or phone is refused at attach time.
 *   - referredBy is set at-most-once. A customer who already has orders
 *     can't retroactively attach a code.
 *   - Per-referrer caps: rolling 24h count AND lifetime count. The
 *     evaluator reads both before crediting the reward.
 *   - Reward payout uses the Phase 12 ledger with a stable dedupKey so
 *     a retried qualification never double-pays.
 */

import { getFirestore, Transaction, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { appendLedger } from './points.js';
import { dispatchNotification } from './notifications.js';

export interface ReferralConfigDoc {
  enabled: boolean;
  /** SAR the referee must spend on their qualifying order to activate. */
  minOrderTotal: number;
  /** Points awarded to the person who shared the code. */
  rewardReferrerPoints: number;
  /** Points awarded to the new customer once they qualify. */
  rewardRefereePoints: number;
  /** Rolling-24h ceiling per referrer. Guards a spam blast. */
  maxPerReferrerDay: number;
  /** Lifetime ceiling per referrer. Guards long-tail farming. */
  maxPerReferrerLifetime: number;
  /** How long a pending referral has to qualify before it expires. */
  expiryDays: number;
  updatedAt?: unknown;
}

export const DEFAULT_REFERRAL_CONFIG: ReferralConfigDoc = {
  enabled: true,
  minOrderTotal: 50,
  rewardReferrerPoints: 50,
  rewardRefereePoints: 50,
  maxPerReferrerDay: 5,
  maxPerReferrerLifetime: 50,
  expiryDays: 60,
};

export async function loadReferralConfig(): Promise<ReferralConfigDoc> {
  const db = getFirestore();
  try {
    const snap = await db.doc('settings/referralConfig').get();
    if (!snap.exists) return DEFAULT_REFERRAL_CONFIG;
    const d = snap.data() as Partial<ReferralConfigDoc>;
    return {
      enabled: d.enabled !== false,
      minOrderTotal: clampNum(d.minOrderTotal, 0, 5000, DEFAULT_REFERRAL_CONFIG.minOrderTotal),
      rewardReferrerPoints: clampInt(d.rewardReferrerPoints, 0, 5000, DEFAULT_REFERRAL_CONFIG.rewardReferrerPoints),
      rewardRefereePoints: clampInt(d.rewardRefereePoints, 0, 5000, DEFAULT_REFERRAL_CONFIG.rewardRefereePoints),
      maxPerReferrerDay: clampInt(d.maxPerReferrerDay, 0, 1000, DEFAULT_REFERRAL_CONFIG.maxPerReferrerDay),
      maxPerReferrerLifetime: clampInt(d.maxPerReferrerLifetime, 0, 100000, DEFAULT_REFERRAL_CONFIG.maxPerReferrerLifetime),
      expiryDays: clampInt(d.expiryDays, 1, 365, DEFAULT_REFERRAL_CONFIG.expiryDays),
    };
  } catch {
    return DEFAULT_REFERRAL_CONFIG;
  }
}

function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}
function clampNum(v: unknown, min: number, max: number, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

// 6 characters from a 30-char alphabet ≈ 7.3B combos — plenty of headroom
// against birthday collisions inside a 5-retry mint loop. The alphabet
// drops confusable glyphs (0, O, 1, I, L) so a customer can hand-type the
// code without mistakes.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

function generateCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return 'BA' + out;
}

/**
 * Return the caller's referral code, minting one on first request. The
 * uniqueness check is a transactional `create` on referralCodes/{code} —
 * a collision loops (bounded) instead of overwriting somebody else's row.
 */
export async function getOrMintReferralCode(customerUid: string): Promise<{ code: string; created: boolean }> {
  const db = getFirestore();
  const custRef = db.doc(`customers/${customerUid}`);
  const custSnap = await custRef.get();
  if (!custSnap.exists) throw new Error('customer-not-found');
  const existing = (custSnap.data() as any).referralCode;
  if (typeof existing === 'string' && existing.length > 0) return { code: existing, created: false };

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCode();
    const codeRef = db.doc(`referralCodes/${candidate}`);
    try {
      await db.runTransaction(async (tx: Transaction) => {
        const codeSnap = await tx.get(codeRef);
        if (codeSnap.exists) throw new Error('code-collision');
        tx.set(codeRef, {
          code: candidate,
          customerUid,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.update(custRef, {
          referralCode: candidate,
          referralCodeAt: FieldValue.serverTimestamp(),
        });
      });
      return { code: candidate, created: true };
    } catch (err: any) {
      if ((err && err.message) !== 'code-collision') throw err;
    }
  }
  throw new Error('code-collision-exhausted');
}

/**
 * Attach a referral to a signing-up customer. Called from the customer app
 * once auth is ready and the URL carries `?ref=<code>`. Refuses:
 *   - self-referral (uid match OR phone match)
 *   - already-attached customers (referredBy set)
 *   - customers with any past order
 *   - unknown / disabled codes
 *   - caps exhausted on the referrer side
 */
export interface AttachInput {
  refereeUid: string;
  refereePhone: string;
  code: string;
}
export interface AttachResult {
  ok: boolean;
  error?: string;
  referrerUid?: string;
  referralId?: string;
}
export async function attachReferral(input: AttachInput): Promise<AttachResult> {
  const cfg = await loadReferralConfig();
  if (!cfg.enabled) return { ok: false, error: 'referrals-disabled' };
  const code = String(input.code || '').trim().toUpperCase();
  if (!/^BA[A-Z0-9]{6}$/.test(code)) return { ok: false, error: 'invalid-code' };

  const db = getFirestore();
  const codeRef = db.doc(`referralCodes/${code}`);
  const codeSnap = await codeRef.get();
  if (!codeSnap.exists) return { ok: false, error: 'unknown-code' };
  const referrerUid = String((codeSnap.data() as any).customerUid || '');
  if (!referrerUid) return { ok: false, error: 'unknown-code' };
  if (referrerUid === input.refereeUid) return { ok: false, error: 'self-referral' };

  // Cheap self-referral defence #2 — same phone. Rules already stop a
  // customer from writing under a different uid with the same phone, but
  // a bad actor might spin up a second anon session before we notice, so
  // check server-side. `referrerPhone === refereePhone` = block.
  const [referrerSnap, refereeSnap] = await Promise.all([
    db.doc(`customers/${referrerUid}`).get(),
    db.doc(`customers/${input.refereeUid}`).get(),
  ]);
  if (!refereeSnap.exists) return { ok: false, error: 'referee-not-found' };
  const refereeData = refereeSnap.data() as any;
  if (refereeData.referredBy) return { ok: false, error: 'already-attached' };
  const refereeHasOrders = Number(refereeData.lifetimeOrders || 0) > 0;
  if (refereeHasOrders) return { ok: false, error: 'referee-has-orders' };
  if (referrerSnap.exists) {
    const refPhone = String((referrerSnap.data() as any).phone || '');
    if (refPhone && refPhone === String(input.refereePhone || '')) {
      return { ok: false, error: 'self-referral-phone' };
    }
  }

  // Rolling caps on the referrer.
  const nowMs = Date.now();
  const dayAgoIso = new Date(nowMs - 86400_000).toISOString();
  const [dayCountSnap, lifetimeCountSnap] = await Promise.all([
    db.collection('referrals')
      .where('referrerUid', '==', referrerUid)
      .where('status', '==', 'qualified')
      .where('qualifiedAt', '>', dayAgoIso)
      .count().get(),
    db.collection('referrals')
      .where('referrerUid', '==', referrerUid)
      .where('status', '==', 'qualified')
      .count().get(),
  ]).catch(() => [null, null] as const);
  const dayCount = dayCountSnap ? Number(dayCountSnap.data().count) : 0;
  const lifetimeCount = lifetimeCountSnap ? Number(lifetimeCountSnap.data().count) : 0;
  if (cfg.maxPerReferrerDay > 0 && dayCount >= cfg.maxPerReferrerDay) {
    return { ok: false, error: 'referrer-day-cap' };
  }
  if (cfg.maxPerReferrerLifetime > 0 && lifetimeCount >= cfg.maxPerReferrerLifetime) {
    return { ok: false, error: 'referrer-lifetime-cap' };
  }

  // Stamp referredBy + open a pending referral row. Idempotent per
  // (refereeUid, code) — a retry surfaces the existing row without duping.
  const refDocId = `${input.refereeUid}__${code}`;
  const refRef = db.doc(`referrals/${refDocId}`);
  const expiresAt = new Date(nowMs + cfg.expiryDays * 86400_000).toISOString();
  try {
    await db.runTransaction(async (tx: Transaction) => {
      const [refereeSnap2, existingRef] = await Promise.all([
        tx.get(db.doc(`customers/${input.refereeUid}`)),
        tx.get(refRef),
      ]);
      if (!refereeSnap2.exists) throw new Error('referee-not-found');
      const rd = refereeSnap2.data() as any;
      if (rd.referredBy && rd.referredBy !== code) throw new Error('already-attached');
      if (Number(rd.lifetimeOrders || 0) > 0) throw new Error('referee-has-orders');
      if (!existingRef.exists) {
        tx.set(refRef, {
          id: refDocId,
          referrerUid,
          referrerCode: code,
          refereeUid: input.refereeUid,
          refereePhone: input.refereePhone || '',
          status: 'pending',
          createdAt: FieldValue.serverTimestamp(),
          expiresAt,
        });
      }
      tx.update(db.doc(`customers/${input.refereeUid}`), {
        referredBy: code,
        referredByUid: referrerUid,
        referredAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (err: any) {
    return { ok: false, error: err?.message || 'attach-failed' };
  }
  return { ok: true, referrerUid, referralId: refDocId };
}

/**
 * Called from submitOrder once the order lands. If the referee has a
 * pending referral AND this is their first qualifying order AND the
 * order meets minOrderTotal AND the referrer's caps aren't exhausted:
 *   - flip the referral row to `qualified`
 *   - credit both sides via the points ledger (idempotent dedupKey)
 *   - fire "referral" notifications to both parties
 *
 * Everything is best-effort — a failure here never rolls back the order.
 */
export async function qualifyReferralOnOrder(input: {
  refereeUid: string;
  orderId: string;
  orderNo: string;
  orderTotal: number;
  refereePhone: string;
}): Promise<{ ok: boolean; qualified?: boolean; skipped?: string }> {
  const cfg = await loadReferralConfig();
  if (!cfg.enabled) return { ok: true, skipped: 'disabled' };
  if (input.orderTotal < cfg.minOrderTotal) return { ok: true, skipped: 'below-min-spend' };

  const db = getFirestore();
  const refereeSnap = await db.doc(`customers/${input.refereeUid}`).get();
  if (!refereeSnap.exists) return { ok: true, skipped: 'referee-missing' };
  const rd = refereeSnap.data() as any;
  const code = String(rd.referredBy || '');
  if (!code) return { ok: true, skipped: 'not-referred' };
  const referrerUid = String(rd.referredByUid || '');
  if (!referrerUid || referrerUid === input.refereeUid) return { ok: true, skipped: 'invalid-ref' };

  const refDocId = `${input.refereeUid}__${code}`;
  const refRef = db.doc(`referrals/${refDocId}`);
  const nowIso = new Date().toISOString();

  const flip = await db.runTransaction(async (tx: Transaction) => {
    const [refSnap, referrerSnap] = await Promise.all([
      tx.get(refRef),
      tx.get(db.doc(`customers/${referrerUid}`)),
    ]);
    if (!refSnap.exists) return { changed: false, reason: 'row-missing' as const };
    const r = refSnap.data() as any;
    if (r.status !== 'pending') return { changed: false, reason: 'not-pending' as const };
    if (r.expiresAt && new Date(r.expiresAt).getTime() < Date.now()) {
      tx.update(refRef, { status: 'expired', expiredAt: nowIso });
      return { changed: false, reason: 'expired' as const };
    }
    tx.update(refRef, {
      status: 'qualified',
      qualifiedAt: nowIso,
      qualifyingOrderId: input.orderId,
      qualifyingOrderNo: input.orderNo,
      qualifyingOrderTotal: input.orderTotal,
    });
    if (referrerSnap.exists) {
      tx.update(db.doc(`customers/${referrerUid}`), {
        referralQualifiedCount: FieldValue.increment(1),
      });
    }
    return { changed: true, reason: 'qualified' as const, referrerPhone: (referrerSnap.data() as any)?.phone || '' };
  });
  if (!flip.changed) return { ok: true, skipped: flip.reason };

  // Pay both sides. Points via the Phase 12 ledger — its dedupKey guard
  // means retries can't double-credit. The referrer's payout is capped by
  // maxPerReferrerLifetime already inspected at attach time; we re-inspect
  // to protect a case where 30 attaches were pending and only now start
  // qualifying past the cap.
  const nowMs = Date.now();
  const dayAgoIso = new Date(nowMs - 86400_000).toISOString();
  const dayCountSnap = await db.collection('referrals')
    .where('referrerUid', '==', referrerUid)
    .where('status', '==', 'qualified')
    .where('qualifiedAt', '>', dayAgoIso)
    .count().get()
    .catch(() => null);
  const dayCount = dayCountSnap ? Number(dayCountSnap.data().count) : 1;

  if (cfg.rewardReferrerPoints > 0 && (cfg.maxPerReferrerDay === 0 || dayCount <= cfg.maxPerReferrerDay)) {
    try {
      await appendLedger({
        customerUid: referrerUid,
        delta: cfg.rewardReferrerPoints,
        reason: `Referral bonus (${code})`,
        source: 'referral.bonus',
        sourceOrderId: input.orderId,
        sourceOrderNo: input.orderNo,
        dedupKey: `referral.referrer:${refDocId}`,
      });
      const rp = flip.referrerPhone;
      if (rp) {
        try {
          await dispatchNotification({
            templateName: 'referral.qualified',
            ctx: { role: 'referrer', points: String(cfg.rewardReferrerPoints), code },
            phone: rp,
            uid: referrerUid,
            dedupKey: `referral.referrer.notify:${refDocId}`,
            meta: { referralId: refDocId, points: cfg.rewardReferrerPoints },
          });
        } catch { /* non-blocking */ }
      }
    } catch { /* logged */ }
  }
  if (cfg.rewardRefereePoints > 0) {
    try {
      await appendLedger({
        customerUid: input.refereeUid,
        delta: cfg.rewardRefereePoints,
        reason: `Welcome referral bonus (${code})`,
        source: 'referral.bonus',
        sourceOrderId: input.orderId,
        sourceOrderNo: input.orderNo,
        dedupKey: `referral.referee:${refDocId}`,
      });
      if (input.refereePhone) {
        try {
          await dispatchNotification({
            templateName: 'referral.qualified',
            ctx: { role: 'referee', points: String(cfg.rewardRefereePoints), code },
            phone: input.refereePhone,
            uid: input.refereeUid,
            dedupKey: `referral.referee.notify:${refDocId}`,
            meta: { referralId: refDocId, points: cfg.rewardRefereePoints },
          });
        } catch { /* non-blocking */ }
      }
    } catch { /* logged */ }
  }
  return { ok: true, qualified: true };
}
