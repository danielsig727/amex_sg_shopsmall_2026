import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SINGAPORE_BOUNDS = { south: 1.255, north: 1.472, west: 103.605, east: 104.04 };

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
  const latitude = SINGAPORE_BOUNDS.south + ((seed & 0xffff) / 0xffff) * (SINGAPORE_BOUNDS.north - SINGAPORE_BOUNDS.south);
  const longitude = SINGAPORE_BOUNDS.west + (((seed >>> 16) & 0xffff) / 0xffff) * (SINGAPORE_BOUNDS.east - SINGAPORE_BOUNDS.west);
  return [Number(latitude.toFixed(6)), Number(longitude.toFixed(6))];
}

function spreadFromCell(latitude, longitude, position) {
  if (position === 0) return [latitude, longitude];
  const angle = position * 2.399963229728653;
  const distance = 0.00006 * Math.sqrt(position);
  const offsetLatitude = distance * Math.cos(angle);
  const offsetLongitude = (distance * Math.sin(angle)) / Math.cos(latitude * (Math.PI / 180));
  return [Number((latitude + offsetLatitude).toFixed(6)), Number((longitude + offsetLongitude).toFixed(6))];
}

export function buildMerchantDataset(csvText) {
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
          cellLatitude,
          cellLongitude,
        };
    })
    .filter((merchant) => merchant.name && merchant.address);

  const positionByCell = new Map();
  const merchants = merchantCells.map((merchant) => {
    const position = positionByCell.get(merchant.locationCell) ?? 0;
    positionByCell.set(merchant.locationCell, position + 1);
    const [latitude, longitude] = spreadFromCell(merchant.cellLatitude, merchant.cellLongitude, position);
    return { ...merchant, latitude, longitude };
  });

  return {
    generatedAt: 'static-location-cells-v2',
    merchants,
  };
}

async function main() {
  const source = await readFile(resolve(ROOT, 'amex_sg_shop_small_merchant_directory.csv'), 'utf8');
  const dataset = buildMerchantDataset(source);
  const destination = resolve(ROOT, 'data/merchants.json');
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(dataset)}\n`);
  console.log(`Generated ${dataset.merchants.length} merchant records at ${destination}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
