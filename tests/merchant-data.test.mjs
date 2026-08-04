import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const MAX_ZOOM = 19;
const PIN_SIZE_PX = 34;

function projectToPixel(latitude, longitude) {
  const scale = 256 * (2 ** MAX_ZOOM);
  const latitudeRadians = latitude * (Math.PI / 180);
  const sinLatitude = Math.sin(latitudeRadians);
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale,
  };
}

test('generated merchants have unique display coordinates', async () => {
  const dataset = JSON.parse(await readFile(new URL('../data/merchants.json', import.meta.url), 'utf8'));
  const merchantsByCoordinate = new Map();

  for (const merchant of dataset.merchants) {
    const coordinate = `${merchant.latitude},${merchant.longitude}`;
    const merchants = merchantsByCoordinate.get(coordinate) ?? [];
    merchants.push(merchant.name);
    merchantsByCoordinate.set(coordinate, merchants);
  }

  const overlaps = [...merchantsByCoordinate]
    .filter(([, merchants]) => merchants.length > 1)
    .map(([coordinate, merchants]) => ({ coordinate, merchants }));

  assert.deepEqual(overlaps, []);
});

test('merchant pin rectangles sharing an anchor do not overlap at maximum zoom', async () => {
  const dataset = JSON.parse(await readFile(new URL('../data/merchants.json', import.meta.url), 'utf8'));
  const merchantsByAnchor = new Map();

  for (const merchant of dataset.merchants) {
    const anchor = `${merchant.cellLatitude},${merchant.cellLongitude}`;
    const merchants = merchantsByAnchor.get(anchor) ?? [];
    merchants.push(merchant);
    merchantsByAnchor.set(anchor, merchants);
  }

  const overlaps = [];
  for (const merchants of merchantsByAnchor.values()) {
    for (let leftIndex = 0; leftIndex < merchants.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < merchants.length; rightIndex += 1) {
        const left = projectToPixel(merchants[leftIndex].latitude, merchants[leftIndex].longitude);
        const right = projectToPixel(merchants[rightIndex].latitude, merchants[rightIndex].longitude);
        const horizontalDistance = Math.abs(right.x - left.x);
        const verticalDistance = Math.abs(right.y - left.y);
        if (horizontalDistance < PIN_SIZE_PX && verticalDistance < PIN_SIZE_PX) {
          overlaps.push({
            merchants: [merchants[leftIndex].name, merchants[rightIndex].name],
            horizontalDistance: Number(horizontalDistance.toFixed(1)),
            verticalDistance: Number(verticalDistance.toFixed(1)),
          });
        }
      }
    }
  }

  assert.deepEqual(overlaps, []);
});
