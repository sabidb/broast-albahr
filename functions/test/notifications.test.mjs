// Phase 9 notification templates — unit tests.
// Pure template rendering. dispatchNotification hits Firestore + FCM and is
// covered by the emulator suite, not here.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { render, TEMPLATES } from '../lib/notifications.js';

describe('render', () => {
  it('renders order.preparing with the order number substituted', () => {
    const t = render('order.preparing', { orderNo: '100042' });
    assert.match(t.body, /#100042/);
    assert.match(t.bodyAr, /#100042/);
    assert.equal(t.kind, 'order');
    assert.ok(t.title && t.titleAr);
  });
  it('renders reward.issued with label + code', () => {
    const t = render('reward.issued', { label: 'SR 5 off', code: 'ABCDEFGHJKMN' });
    assert.match(t.body, /SR 5 off/);
    assert.match(t.body, /ABCDEFGHJKMN/);
    assert.equal(t.kind, 'reward');
  });
  it('renders points.earned with balance', () => {
    const t = render('points.earned', { orderNo: '100042', points: '20', balance: '155' });
    assert.match(t.body, /\+20/);
    assert.match(t.body, /Balance: 155/);
    assert.equal(t.kind, 'points');
  });
  it('handles missing ctx keys without crashing', () => {
    const t = render('order.cancelled', { orderNo: '100042' });
    // reason is optional; the body should still render
    assert.ok(t.body.length > 0);
    assert.ok(t.bodyAr.length > 0);
  });
  it('throws for an unknown template name', () => {
    assert.throws(() => render('does.not.exist', {}));
  });
});

describe('TEMPLATES', () => {
  it('has all 15 template names', () => {
    const expected = [
      'order.accepted', 'order.preparing', 'order.cooking', 'order.almost_ready',
      'order.ready', 'order.completed', 'order.cancelled', 'order.refunded',
      'reward.issued', 'reward.expiring', 'reward.redeemed',
      'points.earned', 'points.redeemed',
      'streak.milestone', 'campaign.available',
    ];
    for (const n of expected) {
      assert.ok(TEMPLATES[n], `missing template: ${n}`);
    }
  });
  it('every template renders with an empty ctx (no throws)', () => {
    for (const [name, fn] of Object.entries(TEMPLATES)) {
      const t = fn({});
      assert.ok(t.title, `no title for ${name}`);
      assert.ok(t.body, `no body for ${name}`);
      assert.ok(t.titleAr, `no titleAr for ${name}`);
      assert.ok(t.bodyAr, `no bodyAr for ${name}`);
    }
  });
});
