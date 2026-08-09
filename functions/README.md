# Cloud Functions

Region: `me-west1` (co-located with Firestore). Runtime: Node 22.

## Shipped

| Function | Trigger | Purpose | Wave |
|---|---|---|---|
| `setRole` | Callable (owner only) | Assign `role` + `branchId` on a Firebase Auth user; mints a custom claim AND mirrors it into `users/{uid}` so today's `get()`-based rules keep working during the migration. Idempotent. Refuses to demote the last owner. | 2.1 |
| `whoami` | Callable (any signed-in user) | Returns the caller's own `{role, branchId}` from their custom claim + users doc — used by admin UI to gate itself without an extra Firestore round-trip per screen. | 2.1 |

## Backlog

| Function | Trigger | Purpose | Phase |
|---|---|---|---|
| `placeOrder` | Callable (any signed-in customer) | Validate items exist and are available at the picked branch; compute totals in integer halalas; validate coupon; snapshot per-line pricing; reserve orderNo via transaction; write the order doc. **Replaces client-computed `totals`.** | 6 |
| `redeemReward` | Callable (any signed-in customer) | Atomically move an `entitlement` from `AVAILABLE → RESERVED` at checkout, then to `REDEEMED` on order-complete. Rejects double-spend and cross-customer redemption. | 11 |
| `onOrderStatusChange` | Firestore trigger (`orders/{id}` update) | On status change: append to `statusHistory`, send FCM push + write inbox message, and on `completed` award loyalty points via ledger + evaluate streak. | 9 / 12 |
| `onOrderCreate` | Firestore trigger (`orders/{id}` create) | Send FCM push + inbox message confirming order receipt. | 9 |
| `dailyReports` | Pub/Sub scheduled (`0 1 * * *` Asia/Riyadh) | Aggregate previous day's orders per branch into `reports/daily/{yyyy-mm-dd}/branches/{branchId}` — item quantities, menu value vs app value, discounts, rewards, VAT, payment mix, new/returning customers. | 17 |
| `auditLog` | Firestore trigger (multi-collection) | Append immutable log entries when owner/staff edit menu, coupons, rewards, staff, branches, settings. | 2.2 |
| `expireEntitlements` | Pub/Sub scheduled (hourly) | Return `RESERVED` entitlements to `AVAILABLE` if their reservation hold has elapsed. | 11 |

## Local dev

```
cd functions
npm install
npm run build
firebase emulators:start --only functions,firestore,auth
```

## Deploy

```
cd functions && npm install && npm run build && cd ..
firebase deploy --only functions,storage:rules,firestore:rules
```

Requires Blaze plan (unlocked). First-time only: click "Get Started" in the
Firebase Console → Storage tab to provision the default bucket.
