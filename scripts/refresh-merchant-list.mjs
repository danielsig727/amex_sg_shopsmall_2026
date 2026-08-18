import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = resolve(ROOT, 'amex_sg_shop_small_merchant_directory.csv');

// This is the JSON asset loaded by Amex's merchant-directory page. Keeping the
// source URL explicit makes a refresh reproducible without scraping its UI.
export const MERCHANT_DATA_URL = 'https://www.americanexpress.com/content/dam/amex/en-sg/benefits/shop-small/merchant-directory/scripts/merchants-data.json';
export const CSV_FIELDS = [
  ['mall_or_street', 'mallOrStreet'],
  ['mall_or_street_name', 'mallOrStreetName'],
  ['merchant_category', 'merchantCategory'],
  ['merchant_name', 'merchantName'],
  ['address', 'address'],
];

function escapeCsv(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export function merchantDirectoryToCsv(records) {
  if (!Array.isArray(records)) throw new TypeError('Expected the Amex merchant data to be an array');

  const headers = CSV_FIELDS.map(([header]) => escapeCsv(header)).join(',');
  const rows = records.map((record, index) => {
    if (!record || typeof record !== 'object') throw new TypeError(`Merchant ${index + 1} is not an object`);
    const missingField = CSV_FIELDS.find(([, field]) => !(field in record));
    if (missingField) throw new TypeError(`Merchant ${index + 1} is missing ${missingField[1]}`);
    return CSV_FIELDS.map(([, field]) => escapeCsv(record[field])).join(',');
  });

  return `${headers}\n${rows.join('\n')}\n`;
}

export async function fetchMerchantDirectory(fetchImpl = fetch) {
  const response = await fetchImpl(MERCHANT_DATA_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Amex merchant list fetch failed: ${response.status} ${response.statusText}`);
  return response.json();
}

async function main() {
  const records = await fetchMerchantDirectory();
  await writeFile(OUTPUT_PATH, merchantDirectoryToCsv(records));
  console.log(`Refreshed ${records.length} merchant records at ${OUTPUT_PATH}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
