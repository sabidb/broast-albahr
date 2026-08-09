// One-time bootstrap: grant `role: 'owner'` in Firestore to the owner UID
// so the Phase 2 Firestore rules recognise them as admin.
//
// Usage (from repo root):
//   1. Download a service-account JSON from Firebase Console →
//      Project Settings → Service accounts → Generate new private key.
//   2. Run:
//        GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json \
//        node scripts/set-owner-role.mjs
//
// Idempotent — safe to run twice.

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'node:fs';

const OWNER_UID = 'kNrKfoWI83VAICymBRXPa9TYKDj1';
const PROJECT_ID = 'broast-al-bahr';

const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credsPath) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json');
  process.exit(1);
}
if (!fs.existsSync(credsPath)) {
  console.error(`No service-account file at ${credsPath}`);
  process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(credsPath, 'utf8'));

initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });

const db = getFirestore();
const auth = getAuth();

const userRecord = await auth.getUser(OWNER_UID).catch((e) => {
  console.error(`Owner uid ${OWNER_UID} not found in Firebase Auth:`, e.message);
  process.exit(1);
});

const ref = db.doc(`users/${OWNER_UID}`);
const snap = await ref.get();
const payload = {
  role: 'owner',
  email: userRecord.email || snap.get('email') || '',
  updatedAt: FieldValue.serverTimestamp(),
};
if (!snap.exists) payload.createdAt = FieldValue.serverTimestamp();

await ref.set(payload, { merge: true });

console.log(`✓ Set users/${OWNER_UID} → role=owner (${userRecord.email || 'no email'})`);
console.log('  Rules will now recognise this account as owner. You can rerun this script safely.');
process.exit(0);
