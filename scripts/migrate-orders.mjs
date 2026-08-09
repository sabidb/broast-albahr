// Phase 3 backfill — bring pre-Phase-2 orders up to the current schema so
// admin queries, rule checks, and Phase 4+ features have consistent data.
//
// What it does, per order doc:
//   1. If userUid is missing, look up customers where phone == userPhone.
//      Unique match → set userUid. Zero or multiple matches → log & skip
//      (the phone-scope read rule still lets the customer see them).
//   2. If totals map is missing, synthesise it from the flat top-level
//      fields (total / vat / platformFee / subtotal / discount) that
//      pre-Phase-2 admin writes used. Preserves the same visible amounts.
//   3. If orderType is missing, default to 'pickup' (the only mode Phase 2
//      supports on the customer side).
//   4. Skip anything already up to date. Idempotent — safe to re-run.
//
// Authenticates the same way as scripts/set-owner-role.mjs — Application
// Default Credentials in Cloud Shell (`gcloud auth application-default
// login` on a laptop) or GOOGLE_APPLICATION_CREDENTIALS pointing at a
// service-account JSON.
//
// Prints a summary and writes a `.migration-report-<timestamp>.json`
// alongside the script so ambiguous phones can be reviewed by hand.

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'broast-al-bahr';
const BATCH_SIZE = 400;
const DRY_RUN = process.argv.includes('--dry-run');

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

console.log(DRY_RUN ? '⚠ DRY-RUN — no writes will happen.' : '✎ Live mode — will write updates.');

// Phone → uid index built once by scanning the customers collection. Small
// enough to fit in memory (Phase 2 keys customers by uid, phone is a field).
console.log('Building phone → uid index from customers…');
const phoneIndex = new Map(); // phone -> array of uids
const custSnap = await db.collection('customers').get();
custSnap.forEach((d) => {
  const ph = String(d.get('phone') || '').trim();
  if (!/^05\d{8}$/.test(ph)) return;
  const arr = phoneIndex.get(ph) || [];
  arr.push(d.id);
  phoneIndex.set(ph, arr);
});
console.log(`  ${custSnap.size} customer docs, ${phoneIndex.size} distinct valid phones.`);

const stats = {
  scanned: 0,
  alreadyOk: 0,
  backfilledUid: 0,
  backfilledTotals: 0,
  backfilledOrderType: 0,
  ambiguousPhone: 0,
  noMatchPhone: 0,
  noPhone: 0,
  written: 0,
};
const ambiguous = []; // {fbId, userPhone, matches}
const orphaned = [];  // {fbId, userPhone}

let batch = db.batch();
let inBatch = 0;
async function flush() {
  if (inBatch === 0) return;
  if (!DRY_RUN) await batch.commit();
  stats.written += inBatch;
  batch = db.batch();
  inBatch = 0;
}

const orderSnap = await db.collection('orders').get();
console.log(`Scanning ${orderSnap.size} orders…`);
for (const doc of orderSnap.docs) {
  stats.scanned += 1;
  const data = doc.data();
  const update = {};

  // 1. userUid backfill
  if (!data.userUid) {
    const ph = String(data.userPhone || '').trim();
    if (!ph) {
      stats.noPhone += 1;
    } else {
      const matches = phoneIndex.get(ph) || [];
      if (matches.length === 1) {
        update.userUid = matches[0];
        stats.backfilledUid += 1;
      } else if (matches.length === 0) {
        stats.noMatchPhone += 1;
        orphaned.push({ fbId: doc.id, userPhone: ph });
      } else {
        stats.ambiguousPhone += 1;
        ambiguous.push({ fbId: doc.id, userPhone: ph, matches });
      }
    }
  }

  // 2. totals backfill
  if (!data.totals || typeof data.totals !== 'object') {
    const total = Number(data.total) || 0;
    const vat = Number(data.vat) || Math.round((total / 1.15) * 0.15 * 100) / 100;
    const pFee = Number(data.platformFee) || 0;
    const subtotal = Number(data.subtotal) || Math.max(0, total - vat - pFee);
    const totals = { subtotal, pFee, vat, total };
    if (data.discount) totals.discount = Number(data.discount) || 0;
    update.totals = totals;
    stats.backfilledTotals += 1;
  }

  // 3. orderType default
  if (!data.orderType) {
    update.orderType = 'pickup';
    stats.backfilledOrderType += 1;
  }

  if (Object.keys(update).length === 0) {
    stats.alreadyOk += 1;
    continue;
  }

  update.migratedAt = FieldValue.serverTimestamp();
  batch.set(doc.ref, update, { merge: true });
  inBatch += 1;
  if (inBatch >= BATCH_SIZE) await flush();
}
await flush();

// Report
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const here = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.join(here, `.migration-report-${stamp}.json`);
fs.writeFileSync(reportPath, JSON.stringify({ mode: DRY_RUN ? 'dry-run' : 'live', stats, ambiguous, orphaned }, null, 2));

console.log('\n── Summary ─────────────────────────────');
Object.entries(stats).forEach(([k, v]) => console.log(`  ${k.padEnd(22)} ${v}`));
console.log(`\n  Report written: ${reportPath}`);
console.log(DRY_RUN ? '  Dry-run — nothing was written.' : '  Live — updates committed.');
if (stats.ambiguousPhone > 0) {
  console.log(`\n  ${stats.ambiguousPhone} orders had multiple matching customers on the same phone.`);
  console.log('  Resolve by hand or leave — phone-scope read rule still lets the customer see them.');
}
process.exit(0);
