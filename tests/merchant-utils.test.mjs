import assert from 'node:assert/strict';
import test from 'node:test';

import { googleMapsSearchUrl } from '../merchant-utils.mjs';

test('googleMapsSearchUrl searches by merchant name and full address', () => {
  const url = googleMapsSearchUrl({
    name: 'Joe & Dough',
    address: '1 TANJONG PAGAR PLAZA #01-01 SINGAPORE 082001',
  });

  assert.equal(
    url,
    'https://www.google.com/maps/search/?api=1&query=Joe%20%26%20Dough%2C%201%20TANJONG%20PAGAR%20PLAZA%20%2301-01%20SINGAPORE%20082001',
  );
});
