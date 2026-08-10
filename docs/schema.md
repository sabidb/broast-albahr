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

---

## Phase 13 — engagement collections

### `settings/tierConfig`

Owner-editable. Overrides the default Bronze/Silver/Gold/VIP ladder.

| field   | type                              | notes |
| ------- | --------------------------------- | ----- |
| `tiers` | array of `{id,name,nameAr?,emoji?,color?,metric,min,pointsMult?,perks?[],perksAr?[]}` | `metric` ∈ `spend|points|orders` |
| `updatedAt` | serverTimestamp | |

Rule: public read (customer needs it to render its badge before sign-in); write is server-only through `saveTierConfig`.

### `customers/{uid}` — Phase 13 additions

| field              | type                                        | notes |
| ------------------ | ------------------------------------------- | ----- |
| `lifetimeSpend`    | number                                      | mirrored from every completed order via server incrementer |
| `lifetimeOrders`   | number                                      | same |
| `tier`             | `TierSnapshot` (see `functions/src/tiers.ts`) | server-computed, mirrored per order |
| `streak`           | `{current,best,windowStart,lastOrderAt,lastMilestone?}` | server-computed from `streakOrders` |

### `customers/{uid}/lifetimeAggregates/{orderId}`

Sentinel doc — presence marks that the order has already contributed to `lifetimeSpend` / `lifetimeOrders`. `reversed:true` marks the refund adjustment.

### `customers/{uid}/streakOrders/{orderId}`

Sentinel doc — presence marks that the order counted towards the streak. `reversed:true` marks the refund adjustment (when `streakConfig.countRefunded === false`).

### `settings/streakConfig`

| field           | type                                                | notes |
| --------------- | --------------------------------------------------- | ----- |
| `enabled`       | boolean                                             | when `false`, evaluator is a no-op |
| `windowDays`    | int 1..365                                          | rolling window |
| `minOrders`     | int 1..100                                          | reserved for future "considered a streak" gating |
| `countRefunded` | boolean                                             | if false, refunds decrement the streak |
| `milestones`    | array of `{threshold,label,labelAr?,bonusPoints?}`  | crossed at-most-once per customer (bonus points via ledger dedup) |

Rule: public read (customer surfaces "next milestone"); write server-only via `saveStreakConfig`.

### `missions/{id}`

Owner-managed. Kinds: `combo`, `product`, `spend`, `quiet_hours`.

| field                 | type              | notes |
| --------------------- | ----------------- | ----- |
| `title` / `titleAr`   | string            | display |
| `description`, `descriptionAr` | string   | free-form |
| `kind`                | string            | predicate selector |
| `active`              | boolean           | evaluator filters on this |
| `fromISO`, `toISO`    | ISO date          | optional window |
| `branches`            | string[]          | scope; missing = any branch |
| `itemIds`, `itemQty`  | array / int       | combo (all present) / product (aggregate qty) |
| `quietFromHHMM`, `quietToHHMM` | string   | wrap-around supported |
| `minSpend`            | number            | for `spend` kind |
| `reward`              | `{label,labelAr?,bonusPoints?,rewardRuleId?}` | one of the two required |
| `maxCompletions`      | int               | 0 / missing = unlimited |
| `maxPerCustomer`      | int               | default 1 |
| `completions`         | int               | evaluator increments |

Rule: public read; write server-only via `saveMission` / `deleteMission`.

### `customerMissions/{missionId__uid}`

Per-customer state row. `status ∈ {completed}`.

| field         | type   | notes |
| ------------- | ------ | ----- |
| `missionId`   | string | back-ref |
| `customerUid` | string | back-ref |
| `status`      | string | `completed` |
| `completions` | int    | count against `maxPerCustomer` |
| `firstAt`, `lastAt`, `lastOrderId`, `lastOrderNo` | | audit fields |

Rule: customer reads own; write server-only.

---

## Phase 14 — referral collections

### `settings/referralConfig`

Owner-editable via `saveReferralConfig` callable.

| field                    | type       | notes |
| ------------------------ | ---------- | ----- |
| `enabled`                | boolean    | master switch |
| `minOrderTotal`          | number     | SAR the referee must spend to qualify |
| `rewardReferrerPoints`   | int        | credited to the code owner on qualify |
| `rewardRefereePoints`    | int        | credited to the new customer on qualify |
| `maxPerReferrerDay`      | int        | rolling-24h ceiling (0 = unlimited) |
| `maxPerReferrerLifetime` | int        | lifetime ceiling (0 = unlimited) |
| `expiryDays`             | int 1..365 | pending referrals expire after this |

### `customers/{uid}` — Phase 14 additions

| field                     | type                | notes |
| ------------------------- | ------------------- | ----- |
| `referralCode`            | string              | server-minted, unique; format `BA[A-Z0-9]{6}` |
| `referredBy`              | string              | the code that referred this customer (set once, before any order) |
| `referredByUid`           | string              | back-ref to referrer |
| `referredAt`              | serverTimestamp     | when attach landed |
| `referralQualifiedCount`  | int                 | number of referrals this customer has already qualified (aggregate mirror) |

### `referralCodes/{code}`

Reverse index only. `{ code, customerUid, createdAt }`. **No client reads** — rules deny both, so a farmer can't harvest codes. Attach validation goes through the callable.

### `referrals/{id}` (id = `refereeUid__code`)

| field                     | type      | notes |
| ------------------------- | --------- | ----- |
| `referrerUid`             | string    | code owner |
| `referrerCode`            | string    | the code used |
| `refereeUid`              | string    | new customer |
| `refereePhone`            | string    | for self-referral audit |
| `status`                  | string    | `pending` → `qualified`/`expired` |
| `createdAt`               | server ts | attach time |
| `expiresAt`               | ISO       | +expiryDays from attach |
| `qualifiedAt`             | ISO       | first qualifying order timestamp |
| `qualifyingOrderId/No/Total` | mixed  | audit fields on qualify |
| `expiredAt`               | ISO       | stamped when the row flips expired |

Rule: either party (`referrerUid` or `refereeUid` = caller) reads; staff reads any; writes server-only.

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
