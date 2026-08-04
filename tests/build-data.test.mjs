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

test('merchants sharing a location cell receive stable distinct map positions', () => {
  const csv = [
    'mall_or_street,mall_or_street_name,merchant_category,merchant_name,address',
    'In-Mall,Westgate,RESTAURANT,Cafe One,3 Gateway Drive Singapore 608532',
    'In-Mall,Westgate,RETAIL,Shop Two,3 Gateway Drive Singapore 608532',
  ].join('\n');
  const { merchants } = buildMerchantDataset(csv);

  assert.equal(merchants[0].locationCell, merchants[1].locationCell);
  assert.notDeepEqual(
    [merchants[0].latitude, merchants[0].longitude],
    [merchants[1].latitude, merchants[1].longitude],
  );
  assert.deepEqual(
    [merchants[0].cellLatitude, merchants[0].cellLongitude],
    [merchants[1].cellLatitude, merchants[1].cellLongitude],
  );
});

test('unrecognised locations stay in the conservative Singapore fallback envelope', () => {
  const csv = [
    'mall_or_street,mall_or_street_name,merchant_category,merchant_name,address',
    'Street,Unrecognised Test Place,SERVICES,Test Merchant,1 Example Street Singapore 000001',
  ].join('\n');
  const [merchant] = buildMerchantDataset(csv).merchants;

  assert.ok(merchant.latitude >= 1.3 && merchant.latitude <= 1.405);
  assert.ok(merchant.longitude >= 103.73 && merchant.longitude <= 103.93);
});

test('validated OneMap coordinates override fallback coordinates', () => {
  const csv = [
    'mall_or_street,mall_or_street_name,merchant_category,merchant_name,address',
    'Street,Arab Street,RESTAURANT,Test Merchant,64 ARAB STREET SINGAPORE 199761',
  ].join('\n');
  const geocodes = { 'address:64 arab street singapore 199761': { latitude: 1.301664, longitude: 103.858846 } };
  const [merchant] = buildMerchantDataset(csv, geocodes).merchants;

  assert.equal(merchant.coordinateSource, 'onemap');
  assert.deepEqual([merchant.latitude, merchant.longitude], [1.301664, 103.858846]);
});

test('different units resolved to one building coordinate receive distinct map positions', () => {
  const csv = [
    'mall_or_street,mall_or_street_name,merchant_category,merchant_name,address',
    'Street,Eng Hoon Street,RESTAURANT,LITTLE ELEPHANT PTE. LTD.,57 ENG HOON STREET #01-72 SINGAPORE 082001',
    'Street,Eng Hoon Street,RETAIL,GRAYE - TIONG BAHRU,57 ENG HOON STREET #01-86 SINGAPORE 089137',
  ].join('\n');
  const geocodes = {
    'address:57 eng hoon street #01-72 singapore 082001': { latitude: 1.28480586062688, longitude: 103.833476049892 },
    'address:57 eng hoon street #01-86 singapore 089137': { latitude: 1.28480586062688, longitude: 103.833476049892 },
  };
  const { merchants } = buildMerchantDataset(csv, geocodes);

  assert.notEqual(merchants[0].coordinateKey, merchants[1].coordinateKey);
  assert.notDeepEqual(
    [merchants[0].latitude, merchants[0].longitude],
    [merchants[1].latitude, merchants[1].longitude],
  );
});

test('unresolved geocodes remain explicitly unverified', () => {
  const csv = [
    'mall_or_street,mall_or_street_name,merchant_category,merchant_name,address',
    'Street,Unknown Street,RETAIL,Test Merchant,1 UNKNOWN STREET SINGAPORE 000000',
  ].join('\n');
  const geocodes = { 'address:1 unknown street singapore 000000': { unresolved: true } };
  const [merchant] = buildMerchantDataset(csv, geocodes).merchants;

  assert.equal(merchant.coordinateSource, 'fallback');
});
