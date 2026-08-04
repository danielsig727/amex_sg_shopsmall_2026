import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildMerchantDataset } from './build-data.mjs';
import { matchesLocation, validationQueries } from './location-queries.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GEOCODES_PATH = resolve(ROOT, 'data/geocodes.json');
const REPORT_PATH = resolve(ROOT, 'data/geocode-report.json');
const OVERRIDES_PATH = resolve(ROOT, 'data/location-overrides.json');
const SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search';
const VALIDATION_VERSION = 6;
const token = process.env.AMEX_ONEMAP_TOKEN;
const maxTargets = Number(process.argv.find((argument) => argument.startsWith('--limit='))?.slice(8) ?? Infinity);

const pause = (milliseconds) => new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
const normalize = (value) => value.trim().toLowerCase().replace(/\s+/g, ' ');

async function readJson(path, fallback) {
  return readFile(path, 'utf8').then(JSON.parse).catch(() => fallback);
}

async function searchOnce(query) {
  const params = new URLSearchParams({ searchVal: query, returnGeom: 'Y', getAddrDetails: 'Y', pageNum: '1' });
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${SEARCH_URL}?${params}`, { headers });
  if (response.status === 429) {
    await pause(2000);
    return searchOnce(query);
  }
  if (!response.ok) throw new Error(`OneMap query failed (${response.status}) for ${query}`);
  const payload = await response.json();
  const match = payload.results?.[0];
  return match ? {
    latitude: Number(match.LATITUDE),
    longitude: Number(match.LONGITUDE),
    matchedAddress: match.ADDRESS,
    matchedName: match.SEARCHVAL,
    query,
  } : null;
}

async function geocode(queries, merchant) {
  const attemptedQueries = [];
  for (const candidate of queries) {
    attemptedQueries.push(candidate);
    const match = await searchOnce(candidate);
    if (match && (merchant.locationType !== 'Street' || matchesLocation(match, merchant.locationName))) {
      return { ...match, attemptedQueries, validationVersion: VALIDATION_VERSION };
    }
  }
  return { query: queries[0], attemptedQueries, validationVersion: VALIDATION_VERSION, unresolved: true };
}

const source = await readFile(resolve(ROOT, 'amex_sg_shop_small_merchant_directory.csv'), 'utf8');
const current = buildMerchantDataset(source);
const targets = new Map();
for (const merchant of current.merchants) {
  if (!targets.has(merchant.coordinateKey)) {
    targets.set(merchant.coordinateKey, merchant);
  }
}

const cache = await readJson(GEOCODES_PATH, { targets: {} });
const overrides = await readJson(OVERRIDES_PATH, { targets: {} });
let processed = 0;
for (const [key, merchant] of targets) {
  if (overrides.targets[key]) {
    cache.targets[key] = { ...overrides.targets[key], validationVersion: VALIDATION_VERSION, override: true };
    continue;
  }
  const cached = cache.targets[key];
  const cacheMatchesMerchantLocation = merchant.locationType !== 'Street' || matchesLocation(cached ?? {}, merchant.locationName);
  const currentQueries = validationQueries(merchant);
  const usedRemovedVenueFallback = cached?.validationVersion === 3 && !currentQueries.includes(cached.query);
  if (cached && cacheMatchesMerchantLocation && !usedRemovedVenueFallback && (!cached.unresolved || cached.validationVersion === VALIDATION_VERSION)) continue;
  if (processed >= maxTargets) break;
  cache.targets[key] = await geocode(currentQueries, merchant);
  processed += 1;
  process.stdout.write(`Validated ${Object.keys(cache.targets).length}/${targets.size}\r`);
  await mkdir(dirname(GEOCODES_PATH), { recursive: true });
  await writeFile(GEOCODES_PATH, `${JSON.stringify(cache)}\n`);
  await pause(220);
}

await mkdir(dirname(GEOCODES_PATH), { recursive: true });
await writeFile(GEOCODES_PATH, `${JSON.stringify(cache)}\n`);

const records = Object.entries(cache.targets).map(([key, value]) => ({ key, ...value }));
const report = {
  total: targets.size,
  resolved: records.filter((record) => !record.unresolved).length,
  unresolved: records.filter((record) => record.unresolved),
};
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nProcessed ${processed}; resolved ${report.resolved}/${report.total}; unresolved: ${report.unresolved.length}`);
