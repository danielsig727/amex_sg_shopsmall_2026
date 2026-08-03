import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildMerchantDataset } from './build-data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GEOCODES_PATH = resolve(ROOT, 'data/geocodes.json');
const REPORT_PATH = resolve(ROOT, 'data/geocode-report.json');
const SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search';
const token = process.env.AMEX_ONEMAP_TOKEN;
const maxTargets = Number(process.argv.find((argument) => argument.startsWith('--limit='))?.slice(8) ?? Infinity);

if (!token) throw new Error('Set AMEX_ONEMAP_TOKEN to run OneMap validation.');

const pause = (milliseconds) => new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));
const normalize = (value) => value.trim().toLowerCase().replace(/\s+/g, ' ');

async function readJson(path, fallback) {
  return readFile(path, 'utf8').then(JSON.parse).catch(() => fallback);
}

async function searchOnce(query) {
  const params = new URLSearchParams({ searchVal: query, returnGeom: 'Y', getAddrDetails: 'Y', pageNum: '1' });
  const response = await fetch(`${SEARCH_URL}?${params}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
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

function queryCandidates(query) {
  const withoutPostal = query.replace(/\s+SINGAPORE\s+\d{6}\s*$/i, '').trim();
  const withoutUnit = withoutPostal.replace(/\s+#[-A-Z0-9/]+\s*$/i, '').trim();
  return [...new Set([withoutUnit, withoutPostal, query].filter(Boolean))];
}

async function geocode(query) {
  const attemptedQueries = [];
  for (const candidate of queryCandidates(query)) {
    attemptedQueries.push(candidate);
    const match = await searchOnce(candidate);
    if (match) return { ...match, attemptedQueries };
  }
  return { query, attemptedQueries, unresolved: true };
}

const source = await readFile(resolve(ROOT, 'amex_sg_shop_small_merchant_directory.csv'), 'utf8');
const current = buildMerchantDataset(source);
const targets = new Map();
for (const merchant of current.merchants) {
  if (!targets.has(merchant.coordinateKey)) {
    targets.set(merchant.coordinateKey, merchant.locationType === 'Street' ? merchant.address : merchant.locationName);
  }
}

const cache = await readJson(GEOCODES_PATH, { targets: {} });
let processed = 0;
for (const [key, query] of targets) {
  if (cache.targets[key] && (!cache.targets[key].unresolved || cache.targets[key].attemptedQueries)) continue;
  if (processed >= maxTargets) break;
  cache.targets[key] = await geocode(query);
  processed += 1;
  process.stdout.write(`Validated ${Object.keys(cache.targets).length}/${targets.size}\r`);
  await mkdir(dirname(GEOCODES_PATH), { recursive: true });
  await writeFile(GEOCODES_PATH, `${JSON.stringify(cache)}\n`);
  await pause(220);
}

const records = Object.entries(cache.targets).map(([key, value]) => ({ key, ...value }));
const report = {
  total: targets.size,
  resolved: records.filter((record) => !record.unresolved).length,
  unresolved: records.filter((record) => record.unresolved),
};
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nProcessed ${processed}; resolved ${report.resolved}/${report.total}; unresolved: ${report.unresolved.length}`);
