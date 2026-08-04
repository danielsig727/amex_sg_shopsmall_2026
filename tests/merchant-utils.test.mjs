import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeResultIndex,
  clearMerchantSelection,
  compareMerchantsAlphabetically,
  distanceMeters,
  formatDistance,
  googleMapsSearchUrl,
  merchantMatchesQuery,
  merchantSearchResults,
  orderMerchants,
  placeSearchResults,
  requestMerchantSelection,
  revealClusteredMarker,
} from '../merchant-utils.mjs';

const discoveryMerchants = [
  {
    id: 'zulu-orchard',
    name: 'Zulu Cafe',
    locationName: 'Orchard Central',
    address: '181 ORCHARD ROAD SINGAPORE 238896',
    latitude: 1.3006,
    longitude: 103.8399,
  },
  {
    id: 'alpha-tanjong',
    name: 'alpha bakery',
    locationName: 'Tanjong Pagar Plaza',
    address: '1 TANJONG PAGAR PLAZA SINGAPORE 082001',
    latitude: 1.2765,
    longitude: 103.8420,
  },
  {
    id: 'alpha-bugis',
    name: 'Alpha Bakery',
    locationName: 'Bugis Junction',
    address: '200 VICTORIA STREET SINGAPORE 188021',
    latitude: 1.2996,
    longitude: 103.8554,
  },
];

test('googleMapsSearchUrl searches by merchant name and full address', () => {
  const url = googleMapsSearchUrl({
    name: 'Joe & Dough',
    address: '1 TANJONG PAGAR PLAZA #01-01 SINGAPORE 082001',
  });

  assert.equal(
    url,
    'https://www.google.com/maps/search/?api=1&query=Joe%20%26%20Dough%2C%201%20TANJONG%20PAGAR%20PLAZA%20%2301-01%20SINGAPORE%20082001',
  );
});

test('revealClusteredMarker makes a clustered marker visible before opening its popup', () => {
  const marker = {
    visible: false,
    popupOpen: false,
    openPopup() {
      assert.equal(this.visible, true);
      this.popupOpen = true;
    },
  };
  const markerLayer = {
    zoomToShowLayer(layer, onVisible) {
      layer.visible = true;
      onVisible();
    },
  };

  revealClusteredMarker(markerLayer, marker);

  assert.equal(marker.visible, true);
  assert.equal(marker.popupOpen, true);
});

test('requestMerchantSelection ignores repeated clicks while that popup is open', () => {
  const selection = {
    selectedMerchant: 'graye',
    pendingRevealMerchant: null,
  };

  const changed = requestMerchantSelection(selection, 'graye', true);

  assert.equal(changed, false);
  assert.deepEqual(selection, {
    selectedMerchant: 'graye',
    pendingRevealMerchant: null,
  });
});

test('requestMerchantSelection records a new explicit reveal', () => {
  const selection = {
    selectedMerchant: 'graye',
    pendingRevealMerchant: null,
  };

  const changed = requestMerchantSelection(selection, 'little-elephant', false);

  assert.equal(changed, true);
  assert.deepEqual(selection, {
    selectedMerchant: 'little-elephant',
    pendingRevealMerchant: 'little-elephant',
  });
});

test('clearMerchantSelection clears a closed popup without scheduling another reveal', () => {
  const selection = {
    selectedMerchant: 'graye',
    pendingRevealMerchant: null,
  };

  const changed = clearMerchantSelection(selection, 'graye');

  assert.equal(changed, true);
  assert.deepEqual(selection, {
    selectedMerchant: null,
    pendingRevealMerchant: null,
  });
});

test('merchantMatchesQuery matches name, location, and address case-insensitively', () => {
  assert.equal(merchantMatchesQuery(discoveryMerchants[0], 'zulu'), true);
  assert.equal(merchantMatchesQuery(discoveryMerchants[1], 'TANJONG pagar'), true);
  assert.equal(merchantMatchesQuery(discoveryMerchants[2], 'victoria 188021'), true);
  assert.equal(merchantMatchesQuery(discoveryMerchants[2], 'orchard'), false);
  assert.equal(merchantMatchesQuery(discoveryMerchants[2], '   '), true);
});

test('merchantSearchResults preserves supplied directory order and caps matches', () => {
  const results = merchantSearchResults(discoveryMerchants, 'a', 2);

  assert.deepEqual(results.map(({ id }) => id), ['zulu-orchard', 'alpha-tanjong']);
});

test('placeSearchResults removes malformed coordinates and caps suggestions', () => {
  const results = placeSearchResults([
    { display_name: 'Arab Street, Singapore', lat: '1.302', lon: '103.859' },
    { display_name: 'Malformed Place', lat: 'x', lon: '103.8' },
    { display_name: '', lat: '1.3', lon: '103.8' },
  ]);

  assert.deepEqual(results, [{
    label: 'Arab Street, Singapore',
    latitude: 1.302,
    longitude: 103.859,
  }]);
});

test('activeResultIndex wraps keyboard navigation and handles no results', () => {
  assert.equal(activeResultIndex(-1, 3, 1), 0);
  assert.equal(activeResultIndex(0, 3, -1), 2);
  assert.equal(activeResultIndex(0, 0, 1), -1);
});

test('compareMerchantsAlphabetically uses stable location, address, and id tie breakers', () => {
  assert.deepEqual(
    discoveryMerchants.toSorted(compareMerchantsAlphabetically).map(({ id }) => id),
    ['alpha-bugis', 'alpha-tanjong', 'zulu-orchard'],
  );
});

test('distanceMeters calculates straight-line distance without mutating inputs', () => {
  const origin = { latitude: 0, longitude: 0 };
  const destination = { latitude: 0, longitude: 1 };

  const result = distanceMeters(origin, destination);

  assert.ok(result > 111_000 && result < 111_300);
  assert.deepEqual(origin, { latitude: 0, longitude: 0 });
  assert.deepEqual(destination, { latitude: 0, longitude: 1 });
});

test('formatDistance uses metres below one kilometre and kilometres otherwise', () => {
  assert.equal(formatDistance(123.4), '123 m');
  assert.equal(formatDistance(1_499), '1.5 km');
});

test('orderMerchants defaults to A–Z without mutating the source array', () => {
  const source = [...discoveryMerchants];

  const ordered = orderMerchants(source, { mode: 'alphabetical' });

  assert.deepEqual(ordered.map(({ id }) => id), ['alpha-bugis', 'alpha-tanjong', 'zulu-orchard']);
  assert.deepEqual(source, discoveryMerchants);
});

test('orderMerchants sorts by distance and breaks equal-distance ties alphabetically', () => {
  const origin = { latitude: 1.3006, longitude: 103.8399 };

  const ordered = orderMerchants(discoveryMerchants, { mode: 'distance', origin });

  assert.deepEqual(ordered.map(({ id }) => id), ['zulu-orchard', 'alpha-bugis', 'alpha-tanjong']);
});
