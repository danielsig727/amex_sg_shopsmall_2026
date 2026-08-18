import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Unrecognised location labels use a deliberately conservative, land-centred
// envelope. A national bounding box would also cover Johor and open water.
const FALLBACK_BOUNDS = { south: 1.3, north: 1.405, west: 103.73, east: 103.93 };

const KNOWN_ANCHORS = {
  'westgate': [1.3343, 103.7421],
  'punggol waterway point': [1.4069, 103.9021],
  'imm building': [1.3346, 103.7461],
  'junction 8': [1.3507, 103.8484],
  'northpoint city': [1.4296, 103.8355],
  'lot one': [1.3855, 103.7442],
  'nex': [1.3507, 103.8722],
  'plaza singapura': [1.3004, 103.8456],
  'bugis junction': [1.2993, 103.8551],
  'tampines mall': [1.3525, 103.9452],
  'bedok mall': [1.3240, 103.9301],
  'parkway parade': [1.3012, 103.9055],
  'vivo city': [1.2645, 103.8222],
  'ion orchard': [1.3040, 103.8319],
  'jewel changi airport': [1.3602, 103.9893],
};

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    if (character === '"') {
      if (quoted && csvText[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && csvText[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalize(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function coordinateKey(locationType, locationCell, address) {
  return locationType === 'Street' ? `address:${normalize(address)}` : `location:${locationCell}`;
}

function hash(value) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function getAnchor(locationName, address) {
  const key = normalize(locationName || address);
  if (KNOWN_ANCHORS[key]) return KNOWN_ANCHORS[key];

  const seed = hash(key);
  const latitude = FALLBACK_BOUNDS.south + ((seed & 0xffff) / 0xffff) * (FALLBACK_BOUNDS.north - FALLBACK_BOUNDS.south);
  const longitude = FALLBACK_BOUNDS.west + (((seed >>> 16) & 0xffff) / 0xffff) * (FALLBACK_BOUNDS.east - FALLBACK_BOUNDS.west);
  return [Number(latitude.toFixed(6)), Number(longitude.toFixed(6))];
}

function spreadFromCell(latitude, longitude, position) {
  if (position === 0) return [latitude, longitude];
  const angle = position * 2.399963229728653;
  const distance = 0.00014 * Math.sqrt(position);
  const offsetLatitude = distance * Math.cos(angle);
  const offsetLongitude = (distance * Math.sin(angle)) / Math.cos(latitude * (Math.PI / 180));
  return [Number((latitude + offsetLatitude).toFixed(6)), Number((longitude + offsetLongitude).toFixed(6))];
}

export function buildMerchantDataset(csvText, geocodes = {}) {
  const [headers, ...rows] = parseCsv(csvText);
  const positions = Object.fromEntries(headers.map((header, index) => [header, index]));
  const field = (row, name) => row[positions[name]]?.trim() ?? '';

  const merchantCells = rows
    .map((row, index) => {
        const locationName = field(row, 'mall_or_street_name');
        const address = field(row, 'address');
        const locationCell = normalize(locationName || address);
        const [cellLatitude, cellLongitude] = getAnchor(locationName, address);
        return {
          id: `merchant-${index + 1}`,
          name: field(row, 'merchant_name'),
          category: field(row, 'merchant_category'),
          locationType: field(row, 'mall_or_street'),
          locationName,
          address,
          locationCell,
          coordinateKey: coordinateKey(field(row, 'mall_or_street'), locationCell, address),
          cellLatitude,
          cellLongitude,
        };
    })
    .filter((merchant) => merchant.name && merchant.address && !geocodes[merchant.coordinateKey]?.unresolved);

  const positionByCoordinate = new Map();
  const merchants = merchantCells.map((merchant) => {
    const cached = geocodes[merchant.coordinateKey];
    const validated = cached && !cached.unresolved && Number.isFinite(cached.latitude) && Number.isFinite(cached.longitude) ? cached : null;
    const cellLatitude = validated?.latitude ?? merchant.cellLatitude;
    const cellLongitude = validated?.longitude ?? merchant.cellLongitude;
    const displayCell = `${cellLatitude},${cellLongitude}`;
    const position = positionByCoordinate.get(displayCell) ?? 0;
    positionByCoordinate.set(displayCell, position + 1);
    const [latitude, longitude] = spreadFromCell(cellLatitude, cellLongitude, position);
    return {
      ...merchant,
      cellLatitude,
      cellLongitude,
      latitude,
      longitude,
      coordinateSource: validated?.source ?? (validated ? 'onemap' : 'fallback'),
    };
  });

  return {
    generatedAt: 'static-location-cells-v4',
    merchants,
  };
}

async function main() {
  const source = await readFile(resolve(ROOT, 'amex_sg_shop_small_merchant_directory.csv'), 'utf8');
  const geocodePath = resolve(ROOT, 'data/geocodes.json');
  const geocodes = await readFile(geocodePath, 'utf8').then(JSON.parse).then((data) => data.targets ?? {}).catch(() => ({}));
  const dataset = buildMerchantDataset(source, geocodes);
  const destination = resolve(ROOT, 'data/merchants.json');
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(dataset)}\n`);
  console.log(`Generated ${dataset.merchants.length} merchant records at ${destination}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
