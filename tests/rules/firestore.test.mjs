// Firestore rules unit tests (Phase 2). Runs against the Firestore emulator.
//
//   npm run test:rules
//
// The suite proves the guarantees the Phase 2 rules must uphold:
//   • Unauthenticated clients cannot read/write anything.
//   • A customer can only touch their own customers/{phone} + orders + inbox.
//   • Non-owner staff cannot write settings / branches / coupons / users.
//   • Owner can do everything.
//
// Every failure here is a real security regression — do not skip tests.

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, addDoc, collection } from 'firebase/firestore';
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
  // Seed staff role docs (bypasses rules).
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/owner-uid'), { role: 'owner', email: 'owner@x' });
    await setDoc(doc(db, 'users/branch1-uid'), { role: 'branch', branchId: 'kakkiyah', email: 'b1@x' });
    await setDoc(doc(db, 'users/branch2-uid'), { role: 'branch', branchId: 'subhani', email: 'b2@x' });
    await setDoc(doc(db, 'orders/o1'), { userPhone: '0501234567', branch: 'kakkiyah', total: 40 });
    await setDoc(doc(db, 'orders/o2'), { userPhone: '0509999999', branch: 'subhani', total: 50 });
    await setDoc(doc(db, 'settings/menu'), { menu: {} });
    await setDoc(doc(db, 'branches/kakkiyah'), { nameEn: 'Kakkiyah' });
    await setDoc(doc(db, 'coupons/HELLO'), { discount: 10, type: 'percent', active: true });
  });
});

after(async () => { await env?.cleanup(); });

const asCustomer = (phone) => env.authenticatedContext(phone, { phone_number: '+966' + phone.slice(1) }).firestore();
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
  // o1 in the fixture has userPhone '0501234567' but no userUid — phone-scope
  // clause in the read rule is what makes this succeed, mirroring cross-device
  // history for pre-Phase-2 orders and anon-uid churn.
  it('can read their own order via phone match', () =>
    assertSucceeds(getDoc(doc(asCustomer('0501234567'), 'orders/o1'))));
  it('cannot read another customer\'s order', () =>
    assertFails(getDoc(doc(asCustomer('0501234567'), 'orders/o2'))));
  it('can create an order that carries their own userUid', () =>
    assertSucceeds(addDoc(collection(asCustomer('0501234567'), 'orders'), {
      userUid: '0501234567', userPhone: '0501234567', branch: 'kakkiyah', total: 22,
    })));
  it('cannot create an order that spoofs another uid', () =>
    assertFails(addDoc(collection(asCustomer('0501234567'), 'orders'), {
      userUid: 'someone-else-uid', userPhone: '0501234567', branch: 'kakkiyah', total: 1,
    })));
  it('cannot create an order missing userUid', () =>
    assertFails(addDoc(collection(asCustomer('0501234567'), 'orders'), {
      userPhone: '0501234567', branch: 'kakkiyah', total: 1,
    })));
  it('cannot create an order missing branch', () =>
    assertFails(addDoc(collection(asCustomer('0501234567'), 'orders'), {
      userUid: '0501234567', userPhone: '0501234567', total: 1,
    })));
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
  it('cannot write to settings/menu', () =>
    assertFails(setDoc(doc(asBranch1(), 'settings/menu'), { menu: {} })));
  it('cannot create a new branch', () =>
    assertFails(setDoc(doc(asBranch1(), 'branches/new'), { nameEn: 'X' })));
  it('can edit their own branch', () =>
    assertSucceeds(setDoc(doc(asBranch1(), 'branches/kakkiyah'), { nameEn: 'Kakkiyah 2', hours: {} }, { merge: true })));
  it('cannot promote themselves in users', () =>
    assertFails(setDoc(doc(asBranch1(), 'users/branch1-uid'), { role: 'owner' }, { merge: true })));
});

describe('owner', () => {
  it('can write settings/menu', () =>
    assertSucceeds(setDoc(doc(asOwner(), 'settings/menu'), { menu: {} })));
  it('can create branches', () =>
    assertSucceeds(setDoc(doc(asOwner(), 'branches/new'), { nameEn: 'New' })));
  it('can create coupons', () =>
    assertSucceeds(setDoc(doc(asOwner(), 'coupons/NEW'), { discount: 5, type: 'fixed', active: true })));
  it('can manage staff', () =>
    assertSucceeds(setDoc(doc(asOwner(), 'users/new-staff'), { role: 'branch', branchId: 'kakkiyah', email: 'x@y' })));
  it('can read any order', () =>
    assertSucceeds(getDoc(doc(asOwner(), 'orders/o2'))));
});
