# Al-bahr — Security review checklist (Phase 19)

Every item here has a corresponding server-side enforcement point.
Client bundles are untrusted — none of these gates exist on the client
alone.

## Authentication

- [x] Customer auth: Firebase Phone Auth (anonymous is not enough for
      writes anymore; customers/{uid}.phone must equal
      `request.auth.token.phone_number`).
- [x] Staff auth: email/password Auth; role custom-claim + `users/{uid}`
      role field; owner/branch/staff/none.
- [x] `readCallerRole` reads both custom-claim AND the `users/{uid}`
      document so a downgrade takes effect on the next call, not the
      next token refresh.
- [x] Every callable checks `req.auth` and the role before doing work.

## Authorization (server-enforced)

- [x] Order creation: only `submitOrder` writes; direct client creates
      are denied by `firestore.rules`.
- [x] Order status transitions: `updateOrderStatus` callable enforces
      the transition table and branch-scoped role check.
- [x] Refunds: owner-only via `refundOrder` callable.
- [x] Points adjustments: owner-only via `adjustPoints`.
- [x] Reward redemption: `submitOrder` calls `redeemToken`
      transactionally; a double-redeem hits `already-redeemed`.
- [x] Campaign issuance: owner-only via `issueCampaignNow` and internal
      `evaluateCampaignsForCustomer` from the trusted submitOrder path.
- [x] Rule config writes (tiers/streaks/missions/referrals/segments/
      campaigns): owner-only callables.

## Data protection

- [x] Cross-customer reads blocked by rules — `customers/{uid}` only
      readable by owning uid, matching-phone customer doc, or staff.
- [x] Cross-branch reads for staff bounded by `isBranchStaff(branch)`
      on orders.
- [x] Prices, tax and reward eligibility recomputed server-side in
      `pricing.ts` — the client-supplied totals field is ignored.
- [x] Reward QR carries only an opaque 12-char token
      (`rewardTokens/{code}`) — never the discount value or a phone.
      Phase 11 rule.
- [x] Customer QR on receipts encodes the opaque customer uid, never
      the phone (Phase 11-consistent).

## Anti-abuse

- [x] Reward tokens are AVAILABLE → RESERVED → REDEEMED /
      EXPIRED; the RESERVE→REDEEM transition is transactional so
      concurrent scans can't double-spend.
- [x] Points ledger writes are transactional with the mirrored
      balance — a retry with the same `dedupKey` is a no-op.
- [x] Referrals: self-referral blocked (`refereeUid !== referrerUid`);
      per-day + lifetime caps + min-order gate in `settings/referralConfig`.
- [x] Campaigns: per-customer limit, `maxRewards` hard cap, and
      `dailySrCap` reserved-today check inside the issuance transaction.
- [ ] **TODO** rate-limit customer-facing callables (`validateRewardCode`,
      `reserveRewardCode`, `attachReferralCode`) via App Check + a small
      leaky-bucket in the callable. App Check is enabled; the leaky
      bucket lives on the roadmap for Phase 20.

## Financial hygiene

- [x] Order lines carry immutable snapshot: `menuPrice`, `appPrice`,
      `lineTotal`, `lineMenuValue` at order time.
- [x] VAT stored separately (`totals.vat`) — reports separate revenue,
      tax and reward cost.
- [x] Money uses minor units (`toMinor`) inside `pricing.ts` to avoid
      float drift.
- [x] Historical orders are never mutated when the current menu price
      changes — reports use the snapshotted values.

## Concurrency / consistency

- [x] Order number minting is transactional per branch counter.
- [x] Tier + streak + missions + referral + campaign evaluation all
      run inside `runTransaction` where they touch shared state.
- [x] Points ledger has a `dedupKey`-based idempotency guard for retries.
- [x] Reward token redemption is transactional.

## What still needs a live test

Run these against production once a month:

1. Double-scan the same reward QR from two devices in parallel — only
   one redemption should succeed.
2. Simulate a `submitOrder` retry with the same `clientOrderId` — no
   duplicate order should appear.
3. Fire two `adjustPoints` calls in parallel with the same reason from
   the same admin session — final balance should equal both deltas.
4. Cross-branch: a Kakkiyah manager attempts to update a Subhani
   order → `permission-denied`.
5. A customer directly modifies `total` on their own submitted order
   → `firestore.rules` denies the write.

## Contacts

- Security incidents: owner
- App Check dashboard: Firebase Console → App Check → broast-al-bahr
- Rules audit: `firestore.rules` (mirrored in both repos)
