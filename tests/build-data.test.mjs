import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMerchantDataset } from '../scripts/build-data.mjs';

test('buildMerchantDataset creates a stable Singapore map record', () => {
  const dataset = buildMerchantDataset([
    'mall_or_street,mall_or_street_name,merchant_category,merchant_name,address',
    'In-Mall,Westgate,RESTAURANT,Cafe,3 Gateway Drive Singapore 608532',
  ].join('\n'));

  assert.equal(dataset.merchants.length, 1);
  assert.match(dataset.merchants[0].id, /^merchant-/);
  assert.equal(dataset.merchants[0].locationName, 'Westgate');
  assert.ok(dataset.merchants[0].latitude >= 1.2 && dataset.merchants[0].latitude <= 1.5);
  assert.ok(dataset.merchants[0].longitude >= 103.6 && dataset.merchants[0].longitude <= 104.1);
});

test('merchants sharing a location use one map anchor', () => {
  const csv = [
    'mall_or_street,mall_or_street_name,merchant_category,merchant_name,address',
    'In-Mall,Westgate,RESTAURANT,Cafe One,3 Gateway Drive Singapore 608532',
    'In-Mall,Westgate,RETAIL,Shop Two,3 Gateway Drive Singapore 608532',
  ].join('\n');
  const { merchants } = buildMerchantDataset(csv);

  assert.deepEqual(
    merchants.map(({ latitude, longitude }) => [latitude, longitude]),
    [[merchants[0].latitude, merchants[0].longitude], [merchants[0].latitude, merchants[0].longitude]],
  );
});
