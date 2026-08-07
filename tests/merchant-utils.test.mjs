import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeResultIndex,
  activatePlaceSearch,
  clearMerchantSelection,
  clearPlaceSearch,
  combinedSearchResults,
  compareMerchantsAlphabetically,
  distanceMeters,
  filterDirectoryMerchants,
  formatDistance,
  googleMapsSearchUrl,
  merchantMatchesQuery,
  merchantPlaceFor,
  merchantPlaceGroups,
  merchantPlaceSearchResults,
  merchantPopupHtml,
  merchantSearchResults,
  orderMerchants,
  placeSearchResults,
  placeCoordinateBounds,
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

const placeMerchants = [
  {
    id: 'westgate-1',
    name: 'Anjappar',
    locationCell: 'westgate',
    locationName: 'Westgate',
    locationType: 'In-Mall & Building',
    coordinateSource: 'onemap',
    latitude: 1.3341,
    longitude: 103.7427,
  },
  {
    id: 'westgate-2',
    name: 'Cafe One',
    locationCell: 'westgate',
    locationName: 'Westgate',
    locationType: 'In-Mall & Building',
    coordinateSource: 'user-confirmed',
    latitude: 1.3342,
    longitude: 103.7428,
  },
  {
    id: 'arab-street-1',
    name: 'Textiles',
    locationCell: 'arab street',
    locationName: 'Arab Street',
    locationType: 'Street',
    coordinateSource: 'onemap',
    latitude: 1.3020,
    longitude: 103.8590,
  },
  {
    id: 'fallback-place',
    name: 'Unresolved',
    locationCell: 'fallback place',
    locationName: 'Fallback Place',
    locationType: 'Street',
    coordinateSource: 'fallback',
    latitude: 1.35,
    longitude: 103.82,
  },
];

function placeSearchState() {
  return {
    activePlace: null,
    activeCategory: 'RESTAURANT',
    directoryQuery: 'cafe',
    placeResults: [{ label: 'old result' }],
    placeSearchError: 'old error',
    placeSearchPending: true,
    activeSearchResult: 2,
    searchRequestId: 7,
    searchResultsDismissed: false,
    selectedMerchant: 'merchant-1',
    pendingRevealMerchant: 'merchant-1',
  };
}

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

test('merchantPlaceGroups deduplicates verified merchants by locationCell', () => {
  const groups = merchantPlaceGroups(placeMerchants);

  assert.deepEqual(groups.map(({ locationCell, merchantCount }) => ({ locationCell, merchantCount })), [
    { locationCell: 'arab street', merchantCount: 1 },
    { locationCell: 'westgate', merchantCount: 2 },
  ]);
  assert.deepEqual(groups[1].merchants.map(({ id }) => id), ['westgate-1', 'westgate-2']);
  assert.deepEqual(groups[1].coordinateBounds, [
    [1.3341, 103.7427],
    [1.3342, 103.7428],
  ]);
});

test('merchantPlaceFor resolves only the exact locationCell group', () => {
  const places = merchantPlaceGroups(placeMerchants);

  assert.equal(
    merchantPlaceFor(places, { locationCell: 'westgate', locationName: 'Wrong display text' })?.locationName,
    'Westgate',
  );
  assert.equal(
    merchantPlaceFor(places, { locationCell: 'missing', locationName: 'Westgate' }),
    null,
  );
});

test('merchantPopupHtml renders an escaped exact-place action', () => {
  const merchant = {
    name: 'Cafe <One>',
    address: '3 Gateway Drive & Annex',
    locationCell: 'westgate"cell',
    locationName: 'Westgate & Mall',
  };
  const place = {
    locationCell: 'westgate"cell',
    locationName: 'Westgate & Mall',
  };

  const html = merchantPopupHtml(merchant, place);

  assert.match(html, /class="place-action merchant-popup-place"/);
  assert.match(html, /data-location-cell="westgate&quot;cell"/);
  assert.match(html, /aria-label="Show all merchants at Westgate &amp; Mall"/);
  assert.match(html, /Cafe &lt;One&gt;/);
  assert.match(html, /3 Gateway Drive &amp; Annex/);
  assert.doesNotMatch(html, /123 merchants/);
});

test('merchantPopupHtml falls back to non-interactive place text without a verified group', () => {
  const html = merchantPopupHtml({
    name: 'Unresolved Shop',
    address: 'Unknown address',
    locationCell: 'missing',
    locationName: 'Missing Place',
  });

  assert.match(html, /class="merchant-popup-location"/);
  assert.match(html, />Missing Place</);
  assert.doesNotMatch(html, /merchant-popup-place/);
  assert.doesNotMatch(html, /data-location-cell/);
});

test('merchantPlaceSearchResults matches names case-insensitively and caps stable results', () => {
  const groups = merchantPlaceGroups(placeMerchants);

  assert.deepEqual(
    merchantPlaceSearchResults(groups, 'WEST', 1).map(({ locationCell }) => locationCell),
    ['westgate'],
  );
  assert.deepEqual(merchantPlaceSearchResults(groups, '   '), []);
});

test('combinedSearchResults orders local places before merchants and external places', () => {
  const places = merchantPlaceGroups(placeMerchants);
  const results = combinedSearchResults({
    merchantPlaces: places,
    merchants: placeMerchants,
    externalPlaces: [{ label: 'Westgate Road, Singapore', latitude: 1.3, longitude: 103.7 }],
    query: 'west',
    activePlace: null,
  });

  assert.deepEqual(results.map(({ type }) => type), ['merchant-place', 'merchant', 'merchant', 'place']);
});

test('combinedSearchResults suppresses place suggestions while scoped', () => {
  const places = merchantPlaceGroups(placeMerchants);
  const results = combinedSearchResults({
    merchantPlaces: places,
    merchants: placeMerchants.slice(0, 2),
    externalPlaces: [{ label: 'Westgate Road, Singapore', latitude: 1.3, longitude: 103.7 }],
    query: 'cafe',
    activePlace: { locationCell: 'westgate' },
  });

  assert.deepEqual(results.map(({ type }) => type), ['merchant']);
});

test('filterDirectoryMerchants bypasses map bounds only for an exact active place', () => {
  const outsideViewport = () => false;

  assert.deepEqual(
    filterDirectoryMerchants(placeMerchants, {
      activeCategory: 'All',
      query: '',
      activeLocationCell: null,
      contains: outsideViewport,
    }),
    [],
  );
  assert.deepEqual(
    filterDirectoryMerchants(placeMerchants, {
      activeCategory: 'All',
      query: '',
      activeLocationCell: 'westgate',
      contains: outsideViewport,
    }).map(({ id }) => id),
    ['westgate-1', 'westgate-2'],
  );
});

test('filterDirectoryMerchants applies category and text within the active place', () => {
  const merchants = placeMerchants.map((merchant, index) => ({
    ...merchant,
    category: index === 0 ? 'RESTAURANT' : 'RETAIL',
    address: index === 0 ? '3 Gateway Drive' : 'Other address',
  }));

  assert.deepEqual(
    filterDirectoryMerchants(merchants, {
      activeCategory: 'RESTAURANT',
      query: 'anjappar',
      activeLocationCell: 'westgate',
      contains: () => false,
    }).map(({ id }) => id),
    ['westgate-1'],
  );
});

test('placeCoordinateBounds covers every finite place coordinate', () => {
  assert.deepEqual(placeCoordinateBounds(placeMerchants.slice(0, 2)), [
    [1.3341, 103.7427],
    [1.3342, 103.7428],
  ]);
  assert.equal(placeCoordinateBounds([]), null);
});

test('activatePlaceSearch resets competing filters and invalidates external search', () => {
  const state = placeSearchState();
  const westgate = merchantPlaceGroups(placeMerchants).find(({ locationCell }) => locationCell === 'westgate');

  activatePlaceSearch(state, westgate);

  assert.deepEqual(state.activePlace, {
    locationCell: 'westgate',
    locationName: 'Westgate',
    locationType: 'In-Mall & Building',
    merchantCount: 2,
  });
  assert.equal(state.activeCategory, 'All');
  assert.equal(state.directoryQuery, '');
  assert.deepEqual(state.placeResults, []);
  assert.equal(state.placeSearchPending, false);
  assert.equal(state.searchRequestId, 8);
  assert.equal(state.selectedMerchant, null);
  assert.equal(state.pendingRevealMerchant, null);
});

test('clearPlaceSearch removes place scope and scoped text without changing map state', () => {
  const state = placeSearchState();
  state.activePlace = { locationCell: 'westgate', locationName: 'Westgate' };

  clearPlaceSearch(state);

  assert.equal(state.activePlace, null);
  assert.equal(state.directoryQuery, '');
  assert.equal(state.selectedMerchant, null);
  assert.equal(state.pendingRevealMerchant, null);
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
