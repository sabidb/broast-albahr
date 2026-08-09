// Phase 4 seed — promote the hardcoded BRANCHES list into the Firestore
// `branches` collection so the customer app can drop the fallback and the
// admin panel has real rows to edit.
//
// Idempotent: uses setDoc({ merge: true }) so re-running never clobbers
// changes made from the admin UI. Only fills in missing/new fields.
//
// Auth: same pattern as scripts/set-owner-role.mjs — Application Default
// Credentials in Cloud Shell (`gcloud auth application-default login` on
// a laptop) or GOOGLE_APPLICATION_CREDENTIALS pointing at a service account.

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'node:fs';

const PROJECT_ID = 'broast-al-bahr';

// Kept in sync with src/lib/data.ts BRANCHES.
const SEED = [
  {
    id: 'kakkiyah',
    nameEn: 'Broast Al Bahr (Kakkiyah)',
    nameAr: 'بروست البحر (فرع الكعكية)',
    whatsapp: '966500959394',
    phone: '0500959394',
    lat: 21.3765717,
    lng: 39.8037236,
    active: true,
    prepMinutesPickup: 15,
    prepMinutesDelivery: 30,
  },
  {
    id: 'subhani',
    nameEn: 'Broast Al Bahr (Subhani)',
    nameAr: 'بروست البحر (فرع السبهاني)',
    whatsapp: '966508379339',
    phone: '0508379339',
    lat: 21.3525607,
    lng: 39.7843825,
    active: true,
    prepMinutesPickup: 15,
    prepMinutesDelivery: 30,
  },
  {
    id: 'waliy',
    nameEn: 'Broast Al Bahr (Waliy Al Ahd)',
    nameAr: 'بروست البحر (فرع ولي العهد)',
    whatsapp: '966550061771',
    phone: '0550061771',
    lat: 21.3395794,
    lng: 39.6925430,
    active: true,
    prepMinutesPickup: 15,
    prepMinutesDelivery: 30,
  },
];

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

let created = 0;
let merged = 0;
for (const b of SEED) {
  const ref = db.doc(`branches/${b.id}`);
  const snap = await ref.get();
  const payload = { ...b, updatedAt: FieldValue.serverTimestamp() };
  if (!snap.exists) payload.createdAt = FieldValue.serverTimestamp();
  await ref.set(payload, { merge: true });
  if (snap.exists) merged += 1; else created += 1;
  console.log(`${snap.exists ? '✎ merged  ' : '✓ created '} branches/${b.id}`);
}

console.log(`\nDone — ${created} created, ${merged} merged.`);
process.exit(0);
