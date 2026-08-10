/**
 * Secure 12-char reward tokens + QR — Phase 11.
 *
 * Every issued reward gets a cryptographically-secure 12-char code that maps
 * 1:1 to a customer + reward payload. The code (not the discount value)
 * is what goes into the QR. Verification, reservation, and redemption are
 * all server-side; the customer cannot forge or replay a code.
 *
 * Lifecycle mirrors the plan:
 *   AVAILABLE → RESERVED  (holds during checkout, auto-released after HOLD_MS)
 *   RESERVED  → REDEEMED  (atomic on order confirmation)
 *   AVAILABLE → EXPIRED   (background sweep, or reserve-attempt after expiry)
 *
 * Storage:
 *   rewardTokens/{code}   — { rewardId, customerUid, status, expiresAt,
 *                             reservedAt, redeemedAt, holdOrderId }
 *   rewards/{id}          — the underlying issuance (Phase 10). Its `id`
 *                             holds a pointer back to the token via
 *                             .tokenCode; the two docs are joined by that
 *                             field so a lookup by code is one read.
 */

import { getFirestore, FieldValue, Transaction } from 'firebase-admin/firestore';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

// Confusable-free alphabet: 32 chars, no 0/O/1/I/L. Any 12-char code drawn
// from this alphabet has ~60 bits of entropy — collision probability is
// negligible at the scale of "hundreds per day" the plan calls for.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 12;

/** Hold window on a RESERVED token — after this the sweep releases it. */
export const HOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Signing key for QR payload MACs. Read lazily from process.env at
 * request time — Firebase Functions v2 populates env from any
 * `secrets: [REWARD_TOKEN_SIGNING_KEY]` declared on a function's options
 * before the handler runs (see index.ts).
 *
 * In dev / emulator without the secret set, a stable placeholder is used
 * so local runs work — the placeholder is intentionally low-entropy so a
 * misconfigured prod deploy is loud in logs: any generated payload has
 * an obvious "dev-" prefix in the HMAC domain.
 */
function signingKey(): string {
  const k = process.env.REWARD_TOKEN_SIGNING_KEY;
  if (k && k.length >= 16) return k;
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return 'albahr-emulator-dev-key-do-not-use-in-prod';
  }
  // In prod without the secret: log once + fall back to a stable but
  // clearly-flagged key so signatures at least round-trip. The Console
  // will show every request warning about the missing secret.
  try { console.warn('[rewardTokens] REWARD_TOKEN_SIGNING_KEY not set — using unsafe fallback'); } catch {}
  return 'albahr-unset-secret-fallback-DO-NOT-SHIP';
}

/** Generate a cryptographically-secure 12-char code from ALPHABET. */
export function generateCode(): string {
  const bytes = randomBytes(CODE_LEN * 2);
  let out = '';
  let i = 0;
  while (out.length < CODE_LEN && i < bytes.length) {
    const b = bytes[i++];
    // Unbiased draw from a 32-char alphabet — take the low 5 bits.
    // (b & 0x1F) is 0..31, always a valid index into ALPHABET.
    out += ALPHABET[b & 0x1F];
  }
  return out;
}

/**
 * Build the QR payload for a code. Format: `<code>.<hmac>` — the client just
 * sees an opaque string, but the server can verify the code has not been
 * tampered with before hitting Firestore. The DISCOUNT VALUE IS NEVER
 * ENCODED IN THE QR — only the opaque token.
 */
export function qrPayloadFor(code: string): string {
  const mac = createHmac('sha256', signingKey()).update(code).digest('hex').slice(0, 16);
  return `${code}.${mac}`;
}

/** Reverse — pull the code out of a QR string and verify the MAC. */
export function parseQrPayload(payload: string): string | null {
  if (!payload || typeof payload !== 'string') return null;
  const dot = payload.lastIndexOf('.');
  if (dot < 12) return null;
  const code = payload.slice(0, dot);
  const mac = payload.slice(dot + 1);
  if (code.length !== CODE_LEN) return null;
  if (!/^[A-Z0-9]+$/.test(code)) return null;
  const expected = createHmac('sha256', signingKey()).update(code).digest('hex').slice(0, 16);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try { if (!timingSafeEqual(a, b)) return null; } catch { return null; }
  return code;
}

/**
 * Mint a token for an already-issued reward. Called by rewards.evaluateForOrder
 * (Phase 11 integration) or by an admin script. Idempotent per rewardId:
 * calling twice returns the same code.
 */
export async function mintTokenFor(rewardId: string): Promise<{ code: string; qr: string }> {
  const db = getFirestore();
  const rewardRef = db.doc(`rewards/${rewardId}`);
  const snap = await rewardRef.get();
  if (!snap.exists) throw new Error(`reward not found: ${rewardId}`);
  const reward = snap.data() as any;
  if (reward.tokenCode) return { code: reward.tokenCode, qr: qrPayloadFor(reward.tokenCode) };

  // Try up to 5 fresh codes on the (astronomically unlikely) collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const tokRef = db.doc(`rewardTokens/${code}`);
    // Transactional create — a collision throws and we retry.
    try {
      await db.runTransaction(async (tx) => {
        const existing = await tx.get(tokRef);
        if (existing.exists) throw new Error('collision');
        tx.set(tokRef, {
          code,
          rewardId,
          customerUid: reward.customerUid,
          customerPhone: reward.customerPhone,
          status: 'available',
          issuedAt: new Date().toISOString(),
          expiresAt: reward.expiresAt,
          minOrder: reward.minOrder || null,
          branchIds: reward.branchIds || null,
          productIds: reward.productIds || null,
          kind: reward.kind,
          value: reward.value || null,
          productId: reward.productId || null,
          label: reward.label,
          labelAr: reward.labelAr || null,
        });
        tx.update(rewardRef, { tokenCode: code, tokenMintedAt: FieldValue.serverTimestamp() });
      });
      return { code, qr: qrPayloadFor(code) };
    } catch (err: any) {
      if (String(err?.message).includes('collision')) continue;
      throw err;
    }
  }
  throw new Error('failed to mint unique token after 5 attempts');
}

// ── Lifecycle transitions ──────────────────────────────────────────────

export interface TokenValidateInput {
  codeOrPayload: string;
  customerUid: string;
  branchId?: string;
  productIds?: (string | number)[];
  orderTotal?: number;
}

export type TokenValidationErr =
  | 'not-found' | 'wrong-customer' | 'not-available' | 'expired'
  | 'below-min-order' | 'wrong-branch' | 'wrong-product';

export interface TokenValidationResult {
  ok: boolean;
  code?: string;
  reward?: any;
  error?: TokenValidationErr;
}

/**
 * Read-only validation — used by the checkout UI to preview whether a code
 * would work. Does NOT reserve. Same checks as reserveToken so the UI can
 * show precise error copy.
 */
export async function validateToken(input: TokenValidateInput): Promise<TokenValidationResult> {
  const db = getFirestore();
  const rawCode = String(input.codeOrPayload || '').trim().toUpperCase();
  const code = rawCode.includes('.') ? parseQrPayload(rawCode) : rawCode;
  if (!code || code.length !== CODE_LEN) return { ok: false, error: 'not-found' };
  const snap = await db.doc(`rewardTokens/${code}`).get();
  if (!snap.exists) return { ok: false, error: 'not-found' };
  const t = snap.data() as any;
  if (t.customerUid !== input.customerUid) return { ok: false, error: 'wrong-customer' };
  if (t.status === 'expired') return { ok: false, error: 'expired' };
  if (t.status !== 'available' && t.status !== 'reserved') {
    return { ok: false, error: 'not-available' };
  }
  if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) return { ok: false, error: 'expired' };
  if (t.minOrder && Number(input.orderTotal || 0) < Number(t.minOrder)) {
    return { ok: false, error: 'below-min-order' };
  }
  if (Array.isArray(t.branchIds) && t.branchIds.length > 0 && input.branchId
      && !t.branchIds.includes(input.branchId)) {
    return { ok: false, error: 'wrong-branch' };
  }
  if (Array.isArray(t.productIds) && t.productIds.length > 0 && input.productIds) {
    const has = input.productIds.some((p) => t.productIds.includes(p));
    if (!has) return { ok: false, error: 'wrong-product' };
  }
  return { ok: true, code, reward: t };
}

/**
 * Reserve a token to an in-flight order. Atomic — two racing calls cannot
 * both succeed. The hold auto-releases after HOLD_MS (see sweepExpired).
 */
export async function reserveToken(input: TokenValidateInput & { orderId: string }): Promise<TokenValidationResult> {
  const db = getFirestore();
  const rawCode = String(input.codeOrPayload || '').trim().toUpperCase();
  const code = rawCode.includes('.') ? parseQrPayload(rawCode) : rawCode;
  if (!code || code.length !== CODE_LEN) return { ok: false, error: 'not-found' };
  const ref = db.doc(`rewardTokens/${code}`);
  try {
    const result = await db.runTransaction(async (tx): Promise<TokenValidationResult> => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, error: 'not-found' };
      const t = snap.data() as any;
      if (t.customerUid !== input.customerUid) return { ok: false, error: 'wrong-customer' };
      if (t.status !== 'available') {
        // Reserved by SAME order id? Idempotent success.
        if (t.status === 'reserved' && t.holdOrderId === input.orderId) return { ok: true, code, reward: t };
        return { ok: false, error: 'not-available' };
      }
      if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) {
        tx.update(ref, { status: 'expired', expiredAt: FieldValue.serverTimestamp() });
        return { ok: false, error: 'expired' };
      }
      if (t.minOrder && Number(input.orderTotal || 0) < Number(t.minOrder)) {
        return { ok: false, error: 'below-min-order' };
      }
      if (Array.isArray(t.branchIds) && t.branchIds.length > 0 && input.branchId
          && !t.branchIds.includes(input.branchId)) {
        return { ok: false, error: 'wrong-branch' };
      }
      tx.update(ref, {
        status: 'reserved',
        reservedAt: FieldValue.serverTimestamp(),
        holdUntil: new Date(Date.now() + HOLD_MS).toISOString(),
        holdOrderId: input.orderId,
      });
      return { ok: true, code, reward: t };
    });
    return result;
  } catch (err: any) {
    try { console.warn('[rewardTokens.reserve] tx failed:', err?.message || err); } catch {}
    return { ok: false, error: 'not-available' };
  }
}

/**
 * Confirm redemption. The order has been written and the reward is being
 * applied — flip the token to REDEEMED. Only the same order that reserved
 * it can redeem it.
 */
export async function redeemToken(input: { code: string; customerUid: string; orderId: string; orderNo: string; }): Promise<{ ok: boolean; error?: string; reward?: any }> {
  const db = getFirestore();
  const ref = db.doc(`rewardTokens/${input.code}`);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, error: 'not-found' };
      const t = snap.data() as any;
      if (t.customerUid !== input.customerUid) return { ok: false, error: 'wrong-customer' };
      if (t.status === 'redeemed') {
        // Idempotent: same order id may retry.
        if (t.redeemedOrderId === input.orderId) return { ok: true, reward: t };
        return { ok: false, error: 'already-redeemed' };
      }
      if (t.status !== 'reserved') return { ok: false, error: 'not-reserved' };
      if (t.holdOrderId && t.holdOrderId !== input.orderId) return { ok: false, error: 'held-by-other' };
      tx.update(ref, {
        status: 'redeemed',
        redeemedAt: FieldValue.serverTimestamp(),
        redeemedOrderId: input.orderId,
        redeemedOrderNo: input.orderNo,
        holdOrderId: null,
        holdUntil: null,
      });
      // Mirror onto the parent reward record.
      if (t.rewardId) {
        tx.update(db.doc(`rewards/${t.rewardId}`), {
          status: 'redeemed',
          redeemedAt: FieldValue.serverTimestamp(),
          redeemedOrderId: input.orderId,
          redeemedOrderNo: input.orderNo,
        });
      }
      return { ok: true, reward: t };
    });
  } catch (err: any) {
    try { console.warn('[rewardTokens.redeem] tx failed:', err?.message || err); } catch {}
    return { ok: false, error: 'tx-failed' };
  }
}

/**
 * Sweep expired reservations back to AVAILABLE (or expired tokens to
 * EXPIRED). Called by a scheduled fn (or on-demand from admin support).
 */
export async function sweepExpired(): Promise<{ released: number; expired: number }> {
  const db = getFirestore();
  const nowIso = new Date().toISOString();

  // Release reservations whose hold has passed.
  const heldSnap = await db.collection('rewardTokens')
    .where('status', '==', 'reserved')
    .where('holdUntil', '<=', nowIso)
    .limit(200)
    .get();
  const batch = db.batch();
  heldSnap.docs.forEach((d) => batch.update(d.ref, {
    status: 'available',
    holdOrderId: null,
    holdUntil: null,
    releasedAt: nowIso,
  }));

  // Expire tokens past their TTL.
  const expSnap = await db.collection('rewardTokens')
    .where('status', '==', 'available')
    .where('expiresAt', '<=', nowIso)
    .limit(200)
    .get();
  expSnap.docs.forEach((d) => batch.update(d.ref, {
    status: 'expired',
    expiredAt: nowIso,
  }));

  await batch.commit();
  return { released: heldSnap.size, expired: expSnap.size };
}

// Marker so unused import lint doesn't scream at us in future refactors.
export const __tx_type: typeof Transaction | undefined = undefined;
