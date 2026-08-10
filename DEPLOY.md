# Deploy runbook

Two paths. Pick one:

- **A) Cloud Shell** — recommended. No local install, no service-account JSON.
- **B) Your laptop** — needs Node 20+, Firebase CLI, service-account key.

Every command below assumes you're inside `broast-albahr/` on the branch you want to ship.

---

## First-time only: set the reward-token signing secret

Phase 11's QR payload is signed with an HMAC key. Set it **once**, in prod, before the first Phase-11 deploy:

```
npm run secret:set:reward-key
```

Paste ~64 random characters when prompted (`openssl rand -hex 32` produces a good one). Rotating the key invalidates every outstanding QR — do it deliberately.

---

## Path A · Cloud Shell (~5 min)

1. Open **<https://shell.cloud.google.com/?project=broast-al-bahr>** (sign in with your Firebase owner account if prompted).
2. Clone + check out:
   ```
   git clone https://github.com/sabidb/broast-albahr
   cd broast-albahr
   git checkout claude/review-document-remaining-sbqzgo
   ```
3. Install deps (root + functions):
   ```
   npm install
   npm --prefix functions install
   ```
4. **First-time only:** set the signing secret (see section above).
5. **Deploy everything** — rules, indexes, storage rules, and functions:
   ```
   firebase use broast-al-bahr
   npm run deploy:all
   ```
   Ends with `✔ Deploy complete!` twice (once for rules, once for functions).
6. Bootstrap owner role (Cloud Shell already has your credentials):
   ```
   npm run bootstrap:owner
   ```
   Expected: `✓ Set users/<uid> → role=owner`. If it asks for `gcloud auth application-default login`, do that first.
7. Merge this branch to `main` in GitHub → Vercel auto-deploys the customer app.
8. Same for the admin repo (`Al-bahr-admin`) — merge branch → main → admin re-deploys.

Cloud Shell is ephemeral; the clone disappears when the shell times out. That's fine, everything is committed.

---

## Path B · Your laptop

### Prerequisites
- Node 20+ (`node -v`).
- Firebase CLI: `npm install -g firebase-tools` → `firebase login`.
- Service-account JSON: Firebase Console → Project settings → Service accounts → Generate new private key. Save as `~/broast-service-account.json`. **Never commit it.**

### Steps
```
cd broast-albahr
npm install
npm --prefix functions install
firebase use broast-al-bahr

# First time only
npm run secret:set:reward-key

# Every time
npm run deploy:all

# One-off bootstrap
GOOGLE_APPLICATION_CREDENTIALS=$HOME/broast-service-account.json \
  npm run bootstrap:owner
```
Then merge to `main`.

---

## What `deploy:all` actually does

Under the hood:

1. `firebase deploy --only firestore:rules,firestore:indexes,storage` — pushes Firestore rules (Phase 5-12 lockdown), composite indexes (Phase 6+ collections), and Storage rules. (Use `storage` alone, not `storage:rules` — the colon form requires a named target, which we don't have.)
2. `npm --prefix functions run build` — compiles `functions/src/*.ts` to `functions/lib/*.js`.
3. `firebase deploy --only functions` — deploys every callable:
   - `setRole`, `whoami` (Wave 2.1)
   - `submitOrder`, `updateOrderStatus`, `refundOrder`, `applyOrderOverride` (Phase 5)
   - `registerFcmToken` (Phase 9)
   - `validateRewardCode`, `reserveRewardCode`, `sweepRewardTokensNow` (Phase 11)
   - `adjustPoints`, `redeemPointsForReward` (Phase 12)

All functions run in `me-west1` (see `firebase.json`).

If you only touched rules: `npm run deploy:rules` (skips the functions build).
If you only touched functions: `npm run deploy:functions` (skips the rules push).

---

## Verify after deploy

1. Open the customer app in a fresh incognito window.
2. Sign in with the **test phone number** from Firebase Auth → Sign-in method → Phone → Phone numbers for testing.
3. Place a small test order — should land in the admin app.
4. Sign into the admin app with the owner email. Every panel loads.
5. Devtools console (customer):
   ```js
   firebase.firestore().collection('customers').doc('0500000000').get()
   ```
   Should error with `Missing or insufficient permissions` — proves rules are live.
6. Devtools console (admin, on an accepted order):
   ```js
   firebase.firestore().collection('orders').doc('SOME_FBID').update({ total: 1 })
   ```
   Should error with `Missing or insufficient permissions` — proves Phase 5's field allowlist is live.
7. Trigger a status change on the admin side — the customer inbox should get exactly one entry, and `notifications_log/order:SOME_FBID:preparing` should exist with `status: 'dispatched'`.

## Rollback

If anything's wrong:
```
git checkout main    # or the previous commit
npm run deploy:all
```
Functions and rules go back atomically. The `role: 'owner'` doc from `bootstrap:owner` is idempotent — leave it in place.

---

## Optional next steps (not blocking)

- **FCM push** (Phase 9): browsers won't receive push until you add `public/firebase-messaging-sw.js` and a VAPID key. The in-app inbox always works regardless.
- **Scheduled sweeps** (Phase 11 / Phase 20): the `sweepRewardTokensNow` callable is manual today. Wrap it in `onSchedule('every 15 minutes')` when Phase 20 lands.
