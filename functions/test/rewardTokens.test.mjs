// Phase 11 reward-token code + QR — unit tests.
// Pure crypto only. No Firestore.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateCode, qrPayloadFor, parseQrPayload } from '../lib/rewardTokens.js';

// Emulator flag → deterministic signing key so the two tests below reproduce.
process.env.FUNCTIONS_EMULATOR = 'true';

describe('generateCode', () => {
  it('returns a 12-char code from the confusable-free alphabet', () => {
    const c = generateCode();
    assert.equal(c.length, 12);
    assert.match(c, /^[A-Z0-9]+$/);
    // Confusable-free: no 0/O/1/I/L
    assert.doesNotMatch(c, /[01OIL]/);
  });
  it('yields near-zero collisions in a burst of 10k', () => {
    const seen = new Set();
    let dupes = 0;
    for (let i = 0; i < 10000; i++) {
      const c = generateCode();
      if (seen.has(c)) dupes++;
      seen.add(c);
    }
    // 31^12 ≈ 8e17 codes; birthday-collision prob at N=10k is ~10^-11.
    // Any collision at all means the RNG or the alphabet is broken.
    assert.equal(dupes, 0);
    assert.equal(seen.size, 10000);
  });
  it('never contains the string "undefined" (alphabet-index guard)', () => {
    for (let i = 0; i < 1000; i++) {
      const c = generateCode();
      assert.ok(!c.includes('undefined'), `bad code: ${c}`);
      assert.equal(c.length, 12);
      assert.match(c, /^[A-Z0-9]+$/);
    }
  });
});

describe('qrPayloadFor / parseQrPayload roundtrip', () => {
  it('round-trips a valid code', () => {
    const code = generateCode();
    const payload = qrPayloadFor(code);
    assert.equal(parseQrPayload(payload), code);
  });
  it('rejects a payload with a tampered code', () => {
    const code = generateCode();
    const payload = qrPayloadFor(code);
    // Flip the first char of the code portion.
    const flipped = (code[0] === 'A' ? 'B' : 'A') + code.slice(1) + payload.slice(payload.lastIndexOf('.'));
    assert.equal(parseQrPayload(flipped), null);
  });
  it('rejects a payload with a tampered mac', () => {
    const code = generateCode();
    const payload = qrPayloadFor(code);
    const badMac = payload.slice(0, payload.lastIndexOf('.') + 1) + '0000000000000000';
    assert.equal(parseQrPayload(badMac), null);
  });
  it('rejects a payload without a dot separator', () => {
    assert.equal(parseQrPayload('ABCDEFGHJKMN'), null);
    assert.equal(parseQrPayload(''), null);
    assert.equal(parseQrPayload(null), null);
  });
  it('rejects a payload with the wrong code length', () => {
    // Correct-format-but-wrong-length code
    const short = 'ABCDEFGHJKM';   // 11 chars
    const withMac = short + '.' + '0123456789abcdef';
    assert.equal(parseQrPayload(withMac), null);
  });
});

describe('qrPayloadFor / parseQrPayload — the QR never carries the discount', () => {
  it('payload for two different codes differs entirely in the mac', () => {
    const a = qrPayloadFor('ABCDEFGHJKMN');
    const b = qrPayloadFor('BCDEFGHJKMNP');
    const aMac = a.slice(a.lastIndexOf('.') + 1);
    const bMac = b.slice(b.lastIndexOf('.') + 1);
    assert.notEqual(aMac, bMac);
  });
});
