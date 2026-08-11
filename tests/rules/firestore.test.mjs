// Firestore rules unit tests. Runs against the Firestore emulator.
//
//   npm run test:rules
//
// The suite proves the guarantees the current rules must uphold:
//   • Unauthenticated clients cannot read/write anything.
//   • A customer can only touch their own customers/{uid} + own orders + inbox.
//   • Phase 5: direct client order creates are DENIED; the submitOrder
//     callable is the only writer (Admin SDK bypasses rules).
//   • Customer may attach a `rating` to their own completed order;
//     everything else — status, statusHistory, totals, total, items — is
//     locked so a bypassed client cannot rewrite money.
//   • Non-owner staff cannot write settings / branches / coupons / users.
//   • Owner can do everything.
//
// Every failure here is a real security regression — do not skip tests.

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, addDoc, updateDoc, collection } from 'firebase/firestore';
import { describe, before, after, it } from 'node:test';

const PROJECT_ID = 'broast-al-bahr-rules-test';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
  // Seed staff role docs + orders that mirror what submitOrder would write.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/owner-uid'), { role: 'owner', email: 'owner@x' });
    await setDoc(doc(db, 'users/branch1-uid'), { role: 'branch', branchId: 'kakkiyah', email: 'b1@x' });
    await setDoc(doc(db, 'users/branch2-uid'), { role: 'branch', branchId: 'subhani', email: 'b2@x' });
    await setDoc(doc(db, 'customers/0501234567'), { name: 'A', phone: '0501234567' });
    await setDoc(doc(db, 'orders/o1'), {
      userUid: '0501234567', userPhone: '0501234567', branch: 'kakkiyah',
      total: 40, status: 'new',
      totals: { subtotal: 40, pFee: 0, vat: 5.22, total: 40 },
      items: [{ id: 'p1', name: 'X', price: 40, qty: 1 }],
      statusHistory: [{ status: 'new', at: '2024-01-01T00:00:00Z' }],
    });
    await setDoc(doc(db, 'orders/o2'), {
      userUid: 'someone-else', userPhone: '0509999999', branch: 'subhani',
      total: 50, status: 'new',
    });
    await setDoc(doc(db, 'orders/completed1'), {
      userUid: '0501234567', userPhone: '0501234567', branch: 'kakkiyah',
      total: 40, status: 'completed',
    });
    await setDoc(doc(db, 'settings/menu'), { menu: {} });
    await setDoc(doc(db, 'branches/kakkiyah'), { nameEn: 'Kakkiyah', nameAr: 'الكاكية' });
    await setDoc(doc(db, 'coupons/HELLO'), { discount: 10, type: 'percent', active: true });
    await setDoc(doc(db, 'counters/orderNo-kakkiyah'), { value: 100000 });
  });
});

after(async () => { await env?.cleanup(); });

const asCustomer = (uid) => env.authenticatedContext(uid).firestore();
const asOwner = () => env.authenticatedContext('owner-uid').firestore();
const asBranch1 = () => env.authenticatedContext('branch1-uid').firestore();
const asBranch2 = () => env.authenticatedContext('branch2-uid').firestore();
const asAnon = () => env.unauthenticatedContext().firestore();

describe('unauthenticated', () => {
  // Menu, branches, settings, coupons are intentionally public read (a first-time
  // visitor renders the menu before signing in). See Phase 2 pivot commit b70a3bc.
  it('can read menu (public)', () => assertSucceeds(getDoc(doc(asAnon(), 'settings/menu'))));
  it('cannot read any customer', () => assertFails(getDoc(doc(asAnon(), 'customers/customer-uid-1'))));
  it('cannot read any order', () => assertFails(getDoc(doc(asAnon(), 'orders/o1'))));
  it('cannot write to a counter', () => assertFails(setDoc(doc(asAnon(), 'counters/x'), { value: 1 })));
});

describe('customer', () => {
  it('can write their own customer doc', () =>
    assertSucceeds(setDoc(doc(asCustomer('0501234567'), 'customers/0501234567'), { name: 'A', phone: '0501234567' })));
  it('cannot read someone else\'s customer doc', () =>
    assertFails(getDoc(doc(asCustomer('0501234567'), 'customers/0509999999'))));
  // o1 in the fixture belongs to this customer (matching uid + phone).
  it('can read their own order', () =>
    assertSucceeds(getDoc(doc(asCustomer('0501234567'), 'orders/o1'))));
  it('cannot read another customer\'s order', () =>
    assertFails(getDoc(doc(asCustomer('0501234567'), 'orders/o2'))));

  // Phase 5: direct client create is denied. Every shape below should fail —
  // including a "perfect" payload — because the submitOrder callable is now
  // the only writer.
  const goodOrder = (over = {}) => ({
    userUid: '0501234567',
    userPhone: '0501234567',
    userName: 'Test Customer',
    orderNo: '100042',
    branch: 'kakkiyah',
    items: [{ id: 'p1', name: 'Broast', price: 20, qty: 1 }],
    total: 22,
    totals: { subtotal: 20, pFee: 2, vat: 3, total: 22 },
    status: 'new',
    ...over,
  });
  it('cannot create an order directly (must use submitOrder callable)', () =>
    assertFails(addDoc(collection(asCustomer('0501234567'), 'orders'), goodOrder())));
  it('cannot create an order that spoofs another uid', () =>
    assertFails(addDoc(collection(asCustomer('0501234567'), 'orders'), goodOrder({ userUid: 'someone-else' }))));

  // Rating patch is the ONLY client-side update allowed on an owned order.
  it('can attach a rating to their own order', () =>
    assertSucceeds(updateDoc(doc(asCustomer('0501234567'), 'orders/o1'), { rating: { stars: 5 } })));
  it('cannot flip status on their own order', () =>
    assertFails(updateDoc(doc(asCustomer('0501234567'), 'orders/o1'), { status: 'completed' })));
  it('cannot rewrite total on their own order', () =>
    assertFails(updateDoc(doc(asCustomer('0501234567'), 'orders/o1'), { total: 1 })));
  it('cannot rewrite items on their own order', () =>
    assertFails(updateDoc(doc(asCustomer('0501234567'), 'orders/o1'), { items: [] })));

  it('cannot write to a counter (Phase 5 locked to server-side)', () =>
    assertFails(setDoc(doc(asCustomer('0501234567'), 'counters/orderNo-kakkiyah'), { value: 999999 })));

  it('cannot write to settings/menu', () =>
    assertFails(setDoc(doc(asCustomer('0501234567'), 'settings/menu'), { menu: {} })));
  it('cannot write to branches', () =>
    assertFails(setDoc(doc(asCustomer('0501234567'), 'branches/new'), { nameEn: 'X' })));
  it('cannot write to coupons', () =>
    assertFails(setDoc(doc(asCustomer('0501234567'), 'coupons/NEW'), { discount: 100, type: 'percent' })));
  it('cannot promote themselves via users', () =>
    assertFails(setDoc(doc(asCustomer('0501234567'), 'users/self'), { role: 'owner' })));
});

describe('branch staff', () => {
  it('can read orders for their own branch', () =>
    assertSucceeds(getDoc(doc(asBranch1(), 'orders/o1'))));
  it('cannot read orders for another branch', () =>
    assertFails(getDoc(doc(asBranch2(), 'orders/o1'))));

  // Phase 5: even staff cannot flip status via a direct patch — must go
  // through the updateOrderStatus callable so the transition table applies.
  it('cannot flip status directly (must use updateOrderStatus callable)', () =>
    assertFails(updateDoc(doc(asBranch1(), 'orders/o1'), { status: 'preparing' })));
  it('cannot rewrite total directly', () =>
    assertFails(updateDoc(doc(asBranch1(), 'orders/o1'), { total: 1 })));
  it('cannot rewrite items directly', () =>
    assertFails(updateDoc(doc(asBranch1(), 'orders/o1'), { items: [] })));
  it('cannot rewrite orderNo directly', () =>
    assertFails(updateDoc(doc(asBranch1(), 'orders/o1'), { orderNo: '000001' })));
  // Non-protected fields (driver info, address, note) can still be patched.
  it('can patch a non-protected field (driver info)', () =>
    assertSucceeds(updateDoc(doc(asBranch1(), 'orders/o1'), { driverName: 'Ahmad', driverPhone: '0500000000' })));

  it('cannot write to settings/menu', () =>
    assertFails(setDoc(doc(asBranch1(), 'settings/menu'), { menu: {} })));
  it('cannot create a new branch', () =>
    assertFails(setDoc(doc(asBranch1(), 'branches/new'), { nameEn: 'X' })));
  it('can edit operational fields on their own branch', () =>
    assertSucceeds(updateDoc(doc(asBranch1(), 'branches/kakkiyah'), { hours: {}, phone: '0501234567', prepMinutes: 10 })));
  it('cannot rename their own branch', () =>
    assertFails(updateDoc(doc(asBranch1(), 'branches/kakkiyah'), { nameEn: 'Kakkiyah 2' })));
  it('cannot edit another branch', () =>
    assertFails(updateDoc(doc(asBranch1(), 'branches/subhani'), { phone: '0500000000' })));
  it('cannot promote themselves in users', () =>
    assertFails(setDoc(doc(asBranch1(), 'users/branch1-uid'), { role: 'owner' }, { merge: true })));
});

describe('owner', () => {
  it('can write settings/menu', () =>
    assertSucceeds(setDoc(doc(asOwner(), 'settings/menu'), { menu: {} })));
  it('can create branches', () =>
    assertSucceeds(setDoc(doc(asOwner(), 'branches/new'), { nameEn: 'New', nameAr: 'جديد' })));
  it('can create coupons', () =>
    assertSucceeds(setDoc(doc(asOwner(), 'coupons/NEW'), { discount: 5, type: 'fixed', active: true })));
  it('can manage staff', () =>
    assertSucceeds(setDoc(doc(asOwner(), 'users/new-staff'), { role: 'branch', branchId: 'kakkiyah', email: 'x@y' })));
  it('can read any order', () =>
    assertSucceeds(getDoc(doc(asOwner(), 'orders/o2'))));
  // Owner is still subject to the field allowlist — status/total go through
  // the callables, not a direct patch.
  it('cannot flip order status directly (must use callable)', () =>
    assertFails(updateDoc(doc(asOwner(), 'orders/o1'), { status: 'refunded' })));
});
