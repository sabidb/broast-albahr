# Cloud Functions — parked until Blaze

This directory is intentionally empty. Cloud Functions require the Firebase
**Blaze** (pay-as-you-go) plan; Broast Al Bahr is currently on Spark, so
Phase 2 uses in-rule `get()` calls for role checks and a local bootstrap
script (`scripts/set-owner-role.mjs`) instead of a `setRole` callable.

The functions below are the Wave 2 backlog — every one has a specific
trigger and a phase it lands in. Do not implement any of them before Blaze
is enabled.

| Function | Trigger | Purpose | Phase |
|---|---|---|---|
| `setRole` | Callable (owner only) | Assign `role` + `branchId` on a Firebase Auth user; write `users/{uid}`; mint custom claim so rules stop needing `get()` lookups. | 2b (post-Blaze) |
| `placeOrder` | Callable (any signed-in customer) | Validate items exist and are available at the picked branch; compute totals in integer halalas; validate coupon; snapshot per-line pricing; reserve orderNo via transaction; write the order doc. **Replaces client-computed `totals`.** | 6 |
| `redeemReward` | Callable (any signed-in customer) | Atomically move an `entitlement` from `AVAILABLE → RESERVED` at checkout, then to `REDEEMED` on order-complete. Rejects double-spend and cross-customer redemption. | 11 |
| `onOrderStatusChange` | Firestore trigger (`orders/{id}` update) | On status change: append to `statusHistory`, send FCM push + write inbox message, and on `completed` award loyalty points via ledger + evaluate streak. | 9 / 12 |
| `onOrderCreate` | Firestore trigger (`orders/{id}` create) | Send FCM push + inbox message confirming order receipt. | 9 |
| `dailyReports` | Pub/Sub scheduled (`0 1 * * *` in Asia/Riyadh) | Aggregate previous day's orders per branch into `reports/daily/{yyyy-mm-dd}/branches/{branchId}` — item quantities, menu value vs app value, discounts, rewards, VAT, payment mix, new/returning customers. | 17 |
| `auditLog` | Firestore trigger (multi-collection) | Append immutable log entries when owner/staff edit menu, coupons, rewards, staff, branches, settings. | 2b |
| `expireEntitlements` | Pub/Sub scheduled (hourly) | Return `RESERVED` entitlements to `AVAILABLE` if their reservation hold has elapsed. | 11 |

## Deploy region

All functions must deploy to `me-west1` to co-locate with Firestore.

## Local dev

Once Blaze is enabled:
```
cd functions
npm install
npm run build
firebase emulators:start --only functions,firestore,auth
```
