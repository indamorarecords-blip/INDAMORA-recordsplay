import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowAttempt,
  derivePasswordHash,
  newCardNumber,
  newPin,
  newQrReference,
  normalizeCardNumber,
  verifySecret,
} from './security.js';
import { validateAmount, validateExpiry } from './cards.js';

test('giftcard identifiers have the expected formats and normalized lookup form', () => {
  const cardNumber = newCardNumber();
  assert.match(cardNumber, /^IND-[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/);
  assert.equal(normalizeCardNumber(cardNumber), cardNumber.replaceAll('-', ''));
  assert.match(newPin(), /^[0-9]{6}$/);
  assert.match(newQrReference(), /^[a-f0-9]{48}$/);
});

test('PIN hashes use a unique salt and verify without storing the PIN', async () => {
  const first = await derivePasswordHash('483920');
  const second = await derivePasswordHash('483920');

  assert.notDeepEqual(first.salt, second.salt);
  assert.notDeepEqual(first.hash, second.hash);
  assert.equal(verifySecret(first.hash, first.hash), true);
  assert.equal(verifySecret(first.hash, second.hash), false);
});

test('giftcard amount and expiration bounds are enforced', () => {
  for (const amount of [1_000, 2_000, 2_500, 5_000, 10_000, 100_000]) {
    assert.equal(validateAmount(amount), true);
  }
  for (const amount of [999, 100_001, 10_005.5, 1.5, Number.NaN]) {
    assert.equal(validateAmount(amount), false);
  }

  assert.equal(validateExpiry(null), null);
  assert.equal(validateExpiry(undefined), undefined);
  assert.equal(validateExpiry('not-a-date'), undefined);
  assert.equal(
    validateExpiry(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()) instanceof Date,
    true,
  );
  assert.equal(
    validateExpiry(new Date(Date.now() - 60_000).toISOString()),
    undefined,
  );
});

test('address rate limits reject excess attempts and release expired attempts', () => {
  const key = `giftcard-test-${newCardNumber()}`;
  assert.equal(allowAttempt(key, 2, 1_000), true);
  assert.equal(allowAttempt(key, 2, 1_001), true);
  assert.equal(allowAttempt(key, 2, 1_002), false);
  assert.equal(allowAttempt(key, 2, 901_001), true);
});
