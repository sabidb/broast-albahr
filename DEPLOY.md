# Phase 2 deploy runbook

Two paths. Pick one.

- **A) Cloud Shell** — recommended, nothing to install locally, no service-account JSON to handle.
- **B) Your laptop** — needs Node 20, Firebase CLI, and a service-account key on disk.

---

## Path A · Cloud Shell (~5 min)

1. Open **https://shell.cloud.google.com/?project=broast-al-bahr** (sign in with your Firebase owner account if prompted). A terminal appears in the browser.
2. Clone the repo and check out this branch:
   ```
   git clone https://github.com/sabidb/broast-albahr
   cd broast-albahr
   git checkout claude/repo-analysis-planning-bqd3zf
   ```
3. Install:
   ```
   npm install
   ```
4. Deploy rules + indexes + storage:
   ```
   firebase use broast-al-bahr
   firebase deploy --only firestore:rules,firestore:indexes,storage:rules
   ```
   Ends with `✔  Deploy complete!`.
5. Bootstrap owner role (Cloud Shell already has your credentials — no JSON needed):
   ```
   npm run bootstrap:owner
   ```
   Expected: `✓ Set users/kNrKfoWI83VAICymBRXPa9TYKDj1 → role=owner (…)`.
   If it asks you to run `gcloud auth application-default login`, do that first, then rerun.
6. Merge this branch to `main` in GitHub → Vercel auto-deploys.
7. Same repeat for the admin repo (`Al-bahr-admin`) — merge that branch to `main`; whatever your admin deploy is.

Cloud Shell session is ephemeral — the clone disappears when the shell times out. That's fine, everything is committed.

---

## Path B · Your laptop

### Prerequisites
- Node 20+ (`node -v`).
- Firebase CLI: `npm install -g firebase-tools` → `firebase login`.
- Service-account JSON: Firebase Console → Project settings → Service accounts → Generate new private key. Save as `~/broast-service-account.json`. **Never commit it** — it's in `.gitignore`.

### Steps
```
cd broast-albahr
npm install
firebase use broast-al-bahr
firebase deploy --only firestore:rules,firestore:indexes,storage:rules

GOOGLE_APPLICATION_CREDENTIALS=$HOME/broast-service-account.json \
  npm run bootstrap:owner
```
Then merge to `main`.

---

## Verify after deploy

1. Open the customer app in a fresh incognito window.
2. Sign in with the **test phone number** you added in Firebase Auth → Sign-in method → Phone → Phone numbers for testing. Use the fixed test code.
3. Place a small test order — should land in the admin app.
4. Sign into the admin app with the owner email. Every panel loads.
5. In the customer devtools console:
   ```js
   firebase.firestore().collection('customers').doc('0500000000').get()
   ```
   Should error with `FirebaseError: Missing or insufficient permissions`.

## Rollback

If anything's wrong:
```
git checkout main    # or the previous commit
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```
Nothing to revert for the bootstrap — leaving the `role: 'owner'` doc in place is safe.
