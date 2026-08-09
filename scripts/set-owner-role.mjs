// One-time bootstrap: grant `role: 'owner'` in Firestore to the owner UID
// so the Phase 2 Firestore rules recognise them as admin.
//
// Two ways to authenticate:
//
//   A) Cloud Shell (easiest — nothing to download):
//        Open https://shell.cloud.google.com/?project=broast-al-bahr
//        git clone https://github.com/sabidb/broast-albahr && cd broast-albahr
//        npm install
//        gcloud auth application-default login   # only if not already set
//        npm run bootstrap:owner
//
//   B) Local with a service-account JSON:
//        Download from Firebase Console → Project settings → Service accounts.
//        GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
//          npm run bootstrap:owner
//
// Idempotent — safe to run twice.

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'node:fs';

const OWNER_UID = 'kNrKfoWI83VAICymBRXPa9TYKDj1';
const PROJECT_ID = 'broast-al-bahr';

const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (credsPath) {
  if (!fs.existsSync(credsPath)) {
    console.error(`No service-account file at ${credsPath}`);
    process.exit(1);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
  initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
  console.log(`Using service-account key from ${credsPath}`);
} else {
  // Cloud Shell + `gcloud auth application-default login` on a laptop both
  // populate application-default credentials automatically.
  try {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
    console.log('Using Application Default Credentials.');
  } catch (e) {
    console.error('No credentials found. Either set GOOGLE_APPLICATION_CREDENTIALS');
    console.error('or run `gcloud auth application-default login` first.');
    console.error(e?.message || e);
    process.exit(1);
  }
}

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
