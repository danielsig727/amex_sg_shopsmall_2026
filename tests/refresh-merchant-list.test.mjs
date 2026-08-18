import assert from 'node:assert/strict';
import test from 'node:test';

import { merchantDirectoryToCsv } from '../scripts/refresh-merchant-list.mjs';

test('merchantDirectoryToCsv retains Amex fields and escapes CSV values', () => {
  const csv = merchantDirectoryToCsv([{
    mallOrStreet: 'Street',
    mallOrStreetName: 'Arab Street',
    merchantCategory: 'RESTAURANT',
    merchantName: 'Cafe "Arabica"',
    address: '56 ARAB STREET #01-01 SINGAPORE 199753',
  }]);

  assert.equal(csv, [
    '"mall_or_street","mall_or_street_name","merchant_category","merchant_name","address"',
    '"Street","Arab Street","RESTAURANT","Cafe ""Arabica""","56 ARAB STREET #01-01 SINGAPORE 199753"',
    '',
  ].join('\n'));
});

test('merchantDirectoryToCsv rejects malformed source records', () => {
  assert.throws(
    () => merchantDirectoryToCsv([{ merchantName: 'Missing fields' }]),
    /missing mallOrStreet/,
  );
});
