import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMerchantDataset } from '../scripts/build-data.mjs';
import { matchesLocation, validationQueries, validationQuery } from '../scripts/location-queries.mjs';

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

test('generated merchants retain the verified geocoder source', () => {
  const csv = [
    'mall_or_street,mall_or_street_name,merchant_category,merchant_name,address',
    'Street,Amoy Street,RESTAURANT,Test Merchant,116 AMOY STREET SINGAPORE 069936',
  ].join('\n');
  const geocodes = {
    'address:116 amoy street singapore 069936': {
      latitude: 1.282309,
      longitude: 103.8476348,
      source: 'openstreetmap',
    },
  };
  const [merchant] = buildMerchantDataset(csv, geocodes).merchants;

  assert.equal(merchant.coordinateSource, 'openstreetmap');
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

test('explicitly unresolved geocodes are omitted from the map', () => {
  const csv = [
    'mall_or_street,mall_or_street_name,merchant_category,merchant_name,address',
    'Street,Unknown Street,RETAIL,Test Merchant,1 UNKNOWN STREET SINGAPORE 000000',
  ].join('\n');
  const geocodes = { 'address:1 unknown street singapore 000000': { unresolved: true } };
  const { merchants } = buildMerchantDataset(csv, geocodes);

  assert.equal(merchants.length, 0);
});

test('street validation includes a missing street name and rejects an unrelated match', () => {
  const merchant = {
    locationType: 'Street',
    locationName: 'Tras Street',
    address: '33 #01-01 SINGAPORE 078973',
  };

  assert.equal(validationQuery(merchant), '33 Tras Street');
  assert.equal(matchesLocation({ matchedAddress: '768 WOODLANDS AVE 6 SINGAPORE 730768', matchedName: '33 CONVENIENCE MART' }, merchant.locationName), false);
  assert.equal(matchesLocation({ matchedAddress: '33 TRAS STREET SINGAPORE 078973', matchedName: 'TANJONG PAGAR CONSERVATION AREA' }, merchant.locationName), true);
  assert.equal(matchesLocation({ matchedAddress: '17 CHOA CHU KANG STREET 51 CHEE SENG TEMPLE SINGAPORE 689337', matchedName: 'CHEE SENG TEMPLE' }, 'Temple Street'), false);
  assert.equal(matchesLocation({ matchedAddress: '17 TEMPLE STREET SINGAPORE 058563', matchedName: 'KRETA AYER CONSERVATION AREA' }, 'Temple Street'), true);
  assert.equal(matchesLocation({ matchedAddress: '8 CROSS STREET MANULIFE TOWER SINGAPORE 048424' }, 'Telok Ayer - Cross Street'), true);
});

test('street validation strips malformed units and tries each building in a shared address', () => {
  assert.deepEqual(validationQueries({
    locationType: 'Street',
    locationName: 'Bukit Pasoh Road',
    address: '18/20 BUKIT PASOH ROAD #01-00 SINGAPORE 018981',
  }), [
    '18/20 BUKIT PASOH ROAD',
    '18 Bukit Pasoh Road',
    '20 Bukit Pasoh Road',
  ]);

  assert.deepEqual(validationQueries({
    locationType: 'Street',
    locationName: 'Teck Lim Road',
    address: '5 TECK LIM ROAD #01 & #02-01 & 01 SINGAPORE 079903',
  }), [
    '5 TECK LIM ROAD',
  ]);
});

test('validation prefers a precise mall address over an ambiguous venue name', () => {
  assert.deepEqual(validationQueries({
    locationType: 'In-Mall',
    locationName: 'I12 Katong',
    address: '112 EAST COAST ROAD #01-04 SINGAPORE 428802',
  }), [
    '112 EAST COAST ROAD',
    'I12 Katong',
  ]);

  assert.deepEqual(validationQueries({
    locationType: 'In-Mall & Building',
    locationName: 'Tampines Mrt Station',
    address: '20 TAMPINES CENTRAL 1 #01-20 SINGAPORE 529538',
  }), [
    '20 TAMPINES CENTRAL 1',
    'Tampines Mrt Station',
  ]);

  assert.deepEqual(validationQueries({
    locationType: 'Street',
    locationName: 'Punggol Settlement',
    address: '3 PUNGGOL POINT ROAD #01-01/02 SINGAPORE 828617',
  }), [
    '3 PUNGGOL POINT ROAD Punggol Settlement',
    '3 PUNGGOL POINT ROAD',
    '3 Punggol Settlement',
    'Punggol Settlement',
  ]);
});

test('validation extracts the correct street address before trailing shop notation', () => {
  assert.deepEqual(validationQueries({
    locationType: 'Street',
    locationName: 'Bugis Street',
    name: "FRAGRANCE 'N' BEAUTY WORLD",
    address: '5 NEW BUGIS STREET FSL-15/16-- SINGAPORE 188869',
  }), [
    '5 NEW BUGIS STREET FSL-15/16--',
    '5 NEW BUGIS STREET',
    '5 Bugis Street',
    "FRAGRANCE 'N' BEAUTY WORLD Bugis Street",
    "FRAGRANCE 'N' BEAUTY WORLD",
  ]);
});
