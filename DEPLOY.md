# Phase 2 deploy runbook

Run these on **your machine** after this branch merges (or from the branch).
Everything is idempotent and reversible.

## Prerequisites

- Node 20+ and npm 10+ (`node -v`, `npm -v`).
- Firebase CLI: `npm install -g firebase-tools` then `firebase login`.
- The **service-account JSON** you downloaded from Firebase Console →
  Project settings → Service accounts. Save it as `~/broast-service-account.json`
  (or wherever). **Do not commit it** — it is in `.gitignore`.

## 1 · Install deps

```
cd broast-albahr
npm install
```

## 2 · Deploy rules + indexes

```
firebase use broast-al-bahr
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

Expected output ends with `✔  Deploy complete!`. If a rule fails to compile,
nothing is deployed — safe to retry.

## 3 · Bootstrap owner role (one time only)

The Phase 2 rules recognise an owner from `users/{uid}.role == 'owner'`. Grant
that role to the existing admin login:

```
GOOGLE_APPLICATION_CREDENTIALS=$HOME/broast-service-account.json \
  npm run bootstrap:owner
```

Expected output: `✓ Set users/kNrKfoWI83VAICymBRXPa9TYKDj1 → role=owner (…)`
Rerun safely if unsure — the script is idempotent.

## 4 · Deploy the customer app

Push to `main` — Vercel auto-deploys.

## 5 · Verify

1. Open the customer app in a fresh incognito window.
2. Sign in with the test phone number you registered in Firebase Auth →
   Sign-in method → Phone → Phone numbers for testing. Use the fixed test code.
3. Place a small test order. It should land in the admin app.
4. Open the admin app, sign in with the owner email. Every panel should load.
5. Sign in as a *branch* staff (if you have one) — they should only see
   their branch's orders.
6. From another incognito window, try to fetch a customer document you don't
   own via the browser console — it should error with a permission denial.

## Rollback

If anything's wrong: revert this branch on GitHub, then redeploy the rules:

```
git checkout main
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

The service-account JSON stays on your machine — nothing to revert there.
