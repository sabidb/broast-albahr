# Firestore schema — Phase 3 baseline

Every doc the customer app writes must go through a guard in
`src/lib/schema.ts`. Rules mirror the same shape server-side. Admin writes
follow the same shape (mirrored inline in `Al-bahr-admin/index.html`).

This file is the single human-readable reference. Update it whenever you
change a shape.

---

## `customers/{uid}`

Keyed by the customer's Firebase Auth uid (anonymous). One doc per customer.

| field           | type                              | required | notes |
| --------------- | --------------------------------- | -------- | ----- |
| `uid`           | string, matches doc id            | ✓        | duplicates the id for query convenience |
| `name`          | string, 1–60 chars                | ✓        | trimmed |
| `phone`         | string, `/^05\d{8}$/`             | ✓        | Saudi mobile format — enforced by rule + guard |
| `firstSeen`     | ISO string                        | –        | set on first VerifyStep submission |
| `lastSeen`      | serverTimestamp                   | –        | bumped by every `saveCustomer` |
| `loyaltyPoints` | number ≥ 0 OR `increment(n)`      | –        | server increments on every order |
| `lastAddress`   | string, ≤ 500                     | –        | free-form; convenience for delivery |
| `addresses`     | array<{id,label,line,locationLink?}> | –     | saved delivery locations |

Rule: `read, write` for owning uid OR any staff.

---

## `orders/{clientOrderId}`

Keyed by the customer-generated clientOrderId (uuid or random) so a retried
tap is naturally idempotent. Never mutated in place except for `status`,
`statusHistory`, and `rating`.

| field           | type                                                           | required | notes |
| --------------- | -------------------------------------------------------------- | -------- | ----- |
| `orderNo`       | string, `/^\d{6}$/`                                            | ✓        | per-branch counter starting at 100000 |
| `userUid`       | string, must equal `request.auth.uid` at create                | ✓        | anti-spoof |
| `userName`      | string, 1–60                                                   | ✓        | snapshot at time of order |
| `userPhone`     | string, `/^05\d{8}$/`                                          | ✓        | anchors phone-scope history reads |
| `branch`        | string (existing branch id)                                    | ✓        | |
| `branchObj`     | `{id, nameEn, nameAr, phone?, …}`                              | –        | snapshot so print doesn't need a live lookup |
| `items`         | array<`OrderItem`>, non-empty                                  | ✓        | see below |
| `totals`        | `{subtotal, pFee, vat, discount?, total}` (all numbers ≥ 0)    | ✓        | canonical amount breakdown |
| `total`         | number ≥ 0                                                     | ✓        | mirrors `totals.total` for legacy readers |
| `pickupTime`    | string, ≤ 40                                                   | –        | free-form label ("ASAP", "6:30 PM") |
| `paymentMethod` | `cash \| card \| prepaid`                                      | –        | defaults to `cash` |
| `couponCode`    | string, ≤ 32                                                   | –        | uppercased at checkout |
| `note`          | string, ≤ 500                                                  | –        | customer's free-form note |
| `status`        | `new \| pending \| accepted \| preparing \| cooking \| almost_ready \| ready \| done \| completed \| cancelled \| refunded` | ✓ | initial `new` |
| `statusHistory` | array<`{status, at:ISO}`>                                      | –        | appended to (never rewritten) |
| `orderType`     | `pickup \| delivery`                                           | –        | Phase 2 only ships pickup |
| `date`          | ISO string                                                     | –        | client's local time; server has `createdAt` |
| `createdAt`     | serverTimestamp                                                | ✓        | set at create; never changes |
| `clientOrderId` | string, ≤ 80, matches doc id                                   | ✓        | dedup key |
| `rating`        | `{stars:1..5, comment?, at:timestamp}`                         | –        | customer attaches post-completion |
| `driverName` / `driverPhone` / `locationLink` / `address` / `overrides` | admin-owned         | –        | trusted paths only; delivery workflow |

### `OrderItem`

| field  | type                       | required |
| ------ | -------------------------- | -------- |
| `id`   | string or number, 1–60     | ✓        |
| `name` | string, 1–120              | ✓        |
| `nameAr` | string, ≤ 120            | –        |
| `price`  | number ≥ 0               | ✓        |
| `qty`    | integer 1–999            | ✓        |
| `note`   | string, ≤ 500            | –        |
| `emoji`  | string, ≤ 8              | –        |

Rules:
- **create**: signed in, `userUid == auth.uid`, all required fields present with correct types, `items` non-empty.
- **read**: owning uid OR owning phone (via `callerPhone()`) OR branch-scoped staff.
- **update**: branch-scoped staff (any field), OR owning uid (only `rating`).
- **delete**: owner only.

---

## `branches/{branchId}`

| field           | type                          | required | notes |
| --------------- | ----------------------------- | -------- | ----- |
| `id`            | string, matches doc id        | ✓        | |
| `nameEn`        | string, 1–80                  | ✓        | |
| `nameAr`        | string, 1–80                  | ✓        | |
| `active`        | boolean                       | –        | defaults to true |
| `phone`         | string, ≤ 20                  | –        | printed on ticket |
| `address`       | string, ≤ 500                 | –        | |
| `lat` / `lng`   | number                        | –        | used by BranchSelectStep for proximity sort |
| `hours`         | `{open:HH:MM, close:HH:MM}`   | –        | |
| `menuOverrides` | array<itemId>                 | –        | items unavailable at this branch |
| `prepMinutesPickup` / `prepMinutesDelivery` | number       | –        | drives ready-by ETA on print |

Rule: `read` public; `create/delete` owner; `update` branch-scoped staff.

---

## `users/{uid}` (staff)

| field       | type                                          | required |
| ----------- | --------------------------------------------- | -------- |
| `uid`       | string, matches doc id                        | ✓        |
| `email`     | string                                        | ✓        |
| `role`      | `owner \| branch`                             | ✓        |
| `branchId`  | string (required when role is `branch`)       | –        |
| `createdAt` | serverTimestamp                               | ✓        |

Rule: `read` staff-only; `write` owner-only. Wave 2.1 moves writes behind
a `setRole` callable so a branch manager can never bypass the check.

---

## `settings/*`

- `settings/menu` — `{ menu: Menu, updatedAt }`
- `settings/restaurant` — `{ isOpen: boolean, autoAccept?: boolean, soundOn?: boolean, updatedAt }`
- `settings/announcement` — `{ active, text, textAr, kind?, updatedAt }`
- `settings/invoiceConfig` — `{ global?, byBranch?, updatedAt }`
- `settings/coupons` — `{ items: [...], updatedAt }`
- `settings/offers` — `{ items: [...], updatedAt }`

Rule: `read` public (customer needs them pre-auth); `write` owner-only.

---

## `notifications/{phone}/items/{id}`

Customer inbox. Keyed by phone (admin sends by phone from an order).

| field       | type                       | required |
| ----------- | -------------------------- | -------- |
| `title`     | string, 1–120              | ✓        |
| `body`      | string, 1–1000             | ✓        |
| `titleAr` / `bodyAr` | string, ≤ same    | –        |
| `kind`      | string, ≤ 30               | –        |
| `orderNo`   | string, ≤ 20               | –        |
| `read`      | boolean                    | –        |
| `createdAt` | serverTimestamp            | ✓        |

Rule: `read, update` for the caller-owns-phone check OR staff; `create` staff-only; `delete` owner-only.

---

## `counters/{counterId}`

Per-branch order-number counters (`orderNo-{branchId}`, starts at 100000).

Rule: `read, write` for any signed-in user (Phase 6 locks this to a
server callable when Blaze arrives).

---

## Migration

`scripts/migrate-orders.mjs` brings pre-Phase-2 orders up to this shape:

- Backfills `userUid` from a `phone → uid` index built off `customers`.
- Synthesises `totals` from flat `total` / `vat` / `platformFee` when the
  composite map is missing.
- Defaults `orderType` to `pickup` when unset.
- Ambiguous phones (multiple customers on same number) are logged, not
  changed. The phone-scope rule still lets those customers read them.

Run:

```
npm run migrate:orders:dry   # scan + report, no writes
npm run migrate:orders       # live
```

Idempotent. Safe to re-run.
