// Phase 6 pricing engine — unit tests.
//
// Runs against the compiled JS in lib/ (npm run build first). Pure math,
// no Firestore. Node's built-in test runner.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  priceOrder, toMinor, fromMinor, distributeMinor, platformFeeMinor, VAT_RATE,
} from '../lib/pricing.js';

describe('toMinor / fromMinor', () => {
  it('handles integer SAR prices exactly', () => {
    assert.equal(toMinor(18), 1800);
    assert.equal(toMinor(0), 0);
    assert.equal(fromMinor(1800), 18);
  });
  it('handles 2-decimal SAR prices exactly', () => {
    assert.equal(toMinor(0.99), 99);
    assert.equal(toMinor(18.5), 1850);
    assert.equal(fromMinor(99), 0.99);
    assert.equal(fromMinor(1850), 18.5);
  });
  it('handles non-finite gracefully', () => {
    assert.equal(toMinor(NaN), 0);
    assert.equal(toMinor(Infinity), 0);
  });
  // Note: IEEE 754 means `toMinor(1.005) === 100`, not 101. Real menu prices
  // never hit that edge (admin stores 18, 6.5, 22 etc), so this is a
  // known + accepted limitation, not a bug worth guarding against.
});

describe('platformFeeMinor', () => {
  it('applies tiered rate — 2% below 100 SAR', () => {
    assert.equal(platformFeeMinor(toMinor(50)), toMinor(1));   // 2% of 50 = 1
  });
  it('3% at 100–249 SAR', () => {
    assert.equal(platformFeeMinor(toMinor(100)), toMinor(3));  // 3% of 100 = 3
  });
  it('4% at 250+', () => {
    assert.equal(platformFeeMinor(toMinor(300)), toMinor(12)); // 4% of 300 = 12
  });
});

describe('distributeMinor', () => {
  it('sums to total, no drift', () => {
    const out = distributeMinor(100, [1, 1, 1]);
    assert.equal(out.reduce((s, x) => s + x, 0), 100);
    assert.deepEqual(out.sort(), [33, 33, 34]);
  });
  it('respects weights', () => {
    const out = distributeMinor(100, [1, 3]);
    assert.equal(out.reduce((s, x) => s + x, 0), 100);
    // 25 / 75 with largest-remainder
    assert.deepEqual(out, [25, 75]);
  });
  it('returns zeros on empty weights', () => {
    assert.deepEqual(distributeMinor(100, []), []);
  });
  it('returns zeros when total = 0', () => {
    assert.deepEqual(distributeMinor(0, [1, 2, 3]), [0, 0, 0]);
  });
  it('handles a zero-weight line without dividing by zero', () => {
    const out = distributeMinor(10, [0, 1]);
    assert.deepEqual(out, [0, 10]);
  });
});

describe('priceOrder — baseline', () => {
  it('two identical lines, no discount, no menu markup', () => {
    const r = priceOrder([
      { id: 1, name: 'Broast', menuPrice: 20, appPrice: 18, qty: 2 },
      { id: 2, name: 'Fries',  menuPrice: 6,  appPrice: 6,  qty: 1 },
    ]);
    assert.equal(r.totals.subtotal, 42);
    assert.equal(r.totals.menuValue, 46);
    assert.equal(r.totals.appDiscount, 4);
    assert.equal(r.totals.pFee, 0.84);
    // VAT = 42.84 * 15/115 ≈ 5.59
    assert.equal(r.totals.vat, 5.59);
    assert.equal(r.totals.total, 42.84);
    assert.equal(r.totals.net, 42.84 - 5.59);
    // Line tax must sum to totals.vat exactly.
    const lineTaxSum = r.items.reduce((s, i) => s + i.lineTax, 0);
    assert.equal(Math.round(lineTaxSum * 100) / 100, r.totals.vat);
    // Line total sum must equal subtotal (no discount).
    const lineTotalSum = r.items.reduce((s, i) => s + i.lineTotal, 0);
    assert.equal(Math.round(lineTotalSum * 100) / 100, r.totals.subtotal);
  });
});

describe('priceOrder — discount', () => {
  it('percent discount distributed across lines', () => {
    const r = priceOrder([
      { id: 1, name: 'A', menuPrice: 10, appPrice: 10, qty: 3 },
      { id: 2, name: 'B', menuPrice: 7,  appPrice: 7,  qty: 1 },
    ], toMinor(3.70)); // 10% of 37 = 3.70
    assert.equal(r.totals.discount, 3.7);
    // Per-line discount sum equals total discount.
    const lineDiscSum = r.items.reduce((s, i) => s + i.lineDiscount, 0);
    assert.equal(Math.round(lineDiscSum * 100) / 100, 3.7);
    // Bigger line takes bigger share.
    assert.ok(r.items[0].lineDiscount > r.items[1].lineDiscount);
  });
  it('clamps discount at subtotal', () => {
    const r = priceOrder([
      { id: 1, name: 'A', menuPrice: 10, appPrice: 10, qty: 1 },
    ], toMinor(50)); // silly-large discount
    assert.equal(r.totals.discount, 10);
    assert.equal(r.totals.total, r.totals.pFee); // subtotal - discount = 0, plus fee
  });
});

describe('priceOrder — rounding', () => {
  it('3 lines that sum to exactly 10, VAT distributes with no drift', () => {
    const r = priceOrder([
      { id: 1, name: 'X', menuPrice: 3.33, appPrice: 3.33, qty: 1 },
      { id: 2, name: 'Y', menuPrice: 3.33, appPrice: 3.33, qty: 1 },
      { id: 3, name: 'Z', menuPrice: 3.34, appPrice: 3.34, qty: 1 },
    ]);
    assert.equal(r.totals.subtotal, 10);
    const lineTaxSum = r.items.reduce((s, i) => s + i.lineTax, 0);
    assert.equal(Math.round(lineTaxSum * 100) / 100, r.totals.vat);
  });
});

describe('priceOrder — empty', () => {
  it('returns zero totals for zero lines', () => {
    const r = priceOrder([]);
    assert.equal(r.items.length, 0);
    assert.equal(r.totals.total, 0);
    assert.equal(r.totals.vat, 0);
    assert.equal(r.totals.subtotal, 0);
  });
});

describe('VAT_RATE constant', () => {
  it('is 0.15', () => {
    assert.equal(VAT_RATE, 0.15);
  });
});
