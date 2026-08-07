# Place Search Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add exact mall/street discovery to unified search and represent the selected directory place as a removable chip that scopes merchants and fits the map.

**Architecture:** Keep grouping, matching, state transitions, directory filtering, and coordinate bounds as pure utilities in `merchant-utils.mjs`. `app.js` owns DOM and Leaflet integration: it renders local place suggestions before merchants and external places, activates one exact `locationCell`, fits the map once, and keeps the existing final merchant collection as the sole source for cards and markers.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Leaflet 1.9.4, Leaflet MarkerCluster 1.5.3, Node.js built-in test runner, static GitHub Pages artifact.

## Global Constraints

- Use `locationCell` as the exact grouping/filter key and `locationName` only as display text.
- Local place suggestions search all verified merchants, independent of map bounds and network access.
- Support one active place chip only; do not add URL persistence, a new geocoder, a dependency, or a DOM test framework.
- Activating a place clears query/category/merchant selection, invalidates external search, and fits all group members once.
- An active place bypasses map bounds; later text/category filters narrow that place without another automatic map fit.
- Removing the chip clears scoped text and keeps the current map center and zoom.
- The final filtered merchant collection must continue to drive count, cards, search merchant results, and markers.
- Preserve exact copy: `Places in merchant directory`, `Merchants in this view`, and `Places in Singapore`.
- Every commit follows the repository Lore commit protocol and stages only the files named by its task.

---

## File Structure

- Modify `merchant-utils.mjs`: pure local-place grouping/search, directory scoping, state transitions, and coordinate bounds.
- Modify `tests/merchant-utils.test.mjs`: Node tests for every pure behavior added to `merchant-utils.mjs`.
- Modify `app.js`: active-place state, result composition, activation/clearing, one-time Leaflet fitting, rendering, and event handling.
- Modify `index.html`: tokenized search wrapper, active chip elements, and independently clickable merchant place button.
- Modify `styles.css`: chip/search layout, card overlay action layout, focus states, and narrow-screen wrapping.

No runtime file is created, so `scripts/build-pages.mjs` and its Pages allowlist remain unchanged.

---

### Task 1: Local Place Grouping and Suggestions

**Files:**
- Modify: `merchant-utils.mjs:25-64`
- Modify: `tests/merchant-utils.test.mjs:4-17,19-44,125-157`

**Interfaces:**
- Consumes: merchant objects with `id`, `locationCell`, `locationName`, `locationType`, `coordinateSource`, `latitude`, and `longitude`.
- Produces: `placeCoordinateBounds(merchants): [[number, number], [number, number]] | null` in Leaflet south-west/north-east order.
- Produces: `merchantPlaceGroups(merchants): MerchantPlace[]`, where `MerchantPlace` is `{ locationCell, locationName, locationType, merchantCount, merchants, coordinateBounds }`.
- Produces: `merchantPlaceSearchResults(places, query, limit = 6): MerchantPlace[]`.
- Ordering contract: case-insensitive Singapore collation by `locationName`, then `locationType`, then `locationCell`.

- [ ] **Step 1: Add representative place fixtures and failing grouping/search tests**

Extend the imports and add fixtures/tests with this exact behavioral shape:

```js
import {
  // existing imports
  merchantPlaceGroups,
  merchantPlaceSearchResults,
} from '../merchant-utils.mjs';

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

test('merchantPlaceSearchResults matches names case-insensitively and caps stable results', () => {
  const groups = merchantPlaceGroups(placeMerchants);

  assert.deepEqual(
    merchantPlaceSearchResults(groups, 'WEST', 1).map(({ locationCell }) => locationCell),
    ['westgate'],
  );
  assert.deepEqual(merchantPlaceSearchResults(groups, '   '), []);
});
```

- [ ] **Step 2: Run the focused tests and verify the new imports fail**

Run:

```bash
node --test tests/merchant-utils.test.mjs
```

Expected: FAIL because `merchantPlaceGroups` and `merchantPlaceSearchResults` are not exported.

- [ ] **Step 3: Implement verified grouping, deterministic ordering, and matching**

Add this implementation next to the existing search utilities:

```js
const placeCollator = new Intl.Collator('en-SG', {
  sensitivity: 'base',
  numeric: true,
});

function compareMerchantPlaces(left, right) {
  return placeCollator.compare(left.locationName, right.locationName)
    || placeCollator.compare(left.locationType, right.locationType)
    || placeCollator.compare(left.locationCell, right.locationCell);
}

export function placeCoordinateBounds(merchants) {
  const coordinates = merchants
    .map(({ latitude, longitude }) => [Number(latitude), Number(longitude)])
    .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude));
  if (!coordinates.length) return null;

  const latitudes = coordinates.map(([latitude]) => latitude);
  const longitudes = coordinates.map(([, longitude]) => longitude);
  return [
    [Math.min(...latitudes), Math.min(...longitudes)],
    [Math.max(...latitudes), Math.max(...longitudes)],
  ];
}

export function merchantPlaceGroups(merchants) {
  const groups = new Map();
  merchants.forEach((merchant) => {
    if (
      merchant.coordinateSource === 'fallback'
      || !merchant.locationCell
      || !merchant.locationName
    ) return;

    const group = groups.get(merchant.locationCell) ?? {
      locationCell: merchant.locationCell,
      locationName: merchant.locationName,
      locationType: merchant.locationType,
      merchantCount: 0,
      merchants: [],
    };
    group.merchantCount += 1;
    group.merchants.push(merchant);
    groups.set(merchant.locationCell, group);
  });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      coordinateBounds: placeCoordinateBounds(group.merchants),
    }))
    .sort(compareMerchantPlaces);
}

export function merchantPlaceSearchResults(places, query, limit = 6) {
  const normalizedQuery = normalizeSearchText(query).trim();
  if (!normalizedQuery) return [];
  return places
    .filter(({ locationName }) => normalizeSearchText(locationName).includes(normalizedQuery))
    .toSorted(compareMerchantPlaces)
    .slice(0, limit);
}
```

- [ ] **Step 4: Run focused tests and the full utility suite**

Run:

```bash
node --test tests/merchant-utils.test.mjs
node --test
```

Expected: all tests PASS; existing external `placeSearchResults()` behavior remains unchanged.

- [ ] **Step 5: Commit the place discovery primitives**

```bash
git add merchant-utils.mjs tests/merchant-utils.test.mjs
git commit -m "Make directory places discoverable as exact groups" -m "Constraint: Local place discovery must use verified merchants and stable locationCell membership.
Rejected: Deriving groups from visible map merchants | Places outside the viewport must remain searchable.
Confidence: high
Scope-risk: narrow
Directive: Keep external geocoder results separate from merchant-directory place groups.
Tested: node --test tests/merchant-utils.test.mjs; node --test.
Not-tested: Browser result rendering."
```

---

### Task 2: Exact Place Scope, State Transitions, and Bounds

**Files:**
- Modify: `merchant-utils.mjs:39-102`
- Modify: `tests/merchant-utils.test.mjs:125-197`

**Interfaces:**
- Consumes: `MerchantPlace` from Task 1 and the existing mutable application-state object.
- Produces: `filterDirectoryMerchants(merchants, options): Merchant[]`, with `options = { activeCategory, query, activeLocationCell, contains }`.
- Produces: `activatePlaceSearch(state, place): void` and `clearPlaceSearch(state): void`.
- Consumes: `placeCoordinateBounds(merchants)` and `MerchantPlace.coordinateBounds` from Task 1.
- `contains(merchant)` is supplied by `app.js`; it is ignored while `activeLocationCell` is set.

- [ ] **Step 1: Write failing tests for viewport bypass and scoped filters**

Add imports and tests:

```js
import {
  // existing imports
  filterDirectoryMerchants,
  placeCoordinateBounds,
} from '../merchant-utils.mjs';

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
```

- [ ] **Step 2: Run the focused tests and verify missing exports fail**

Run:

```bash
node --test tests/merchant-utils.test.mjs
```

Expected: FAIL because `filterDirectoryMerchants` is not exported.

- [ ] **Step 3: Implement pure directory filtering**

```js
export function filterDirectoryMerchants(merchants, {
  activeCategory = 'All',
  query = '',
  activeLocationCell = null,
  contains = () => true,
} = {}) {
  return merchants.filter((merchant) => (
    merchant.coordinateSource !== 'fallback'
    && (activeLocationCell
      ? merchant.locationCell === activeLocationCell
      : contains(merchant))
    && (activeCategory === 'All' || merchant.category === activeCategory)
    && merchantMatchesQuery(merchant, query)
  ));
}

```

- [ ] **Step 4: Write failing activation and clearing state tests**

```js
import {
  // existing imports
  activatePlaceSearch,
  clearPlaceSearch,
} from '../merchant-utils.mjs';

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
```

- [ ] **Step 5: Run the tests and verify state helpers are missing**

Run:

```bash
node --test tests/merchant-utils.test.mjs
```

Expected: FAIL because `activatePlaceSearch` and `clearPlaceSearch` are not exported.

- [ ] **Step 6: Implement exact state transitions**

```js
export function activatePlaceSearch(state, place) {
  state.activePlace = {
    locationCell: place.locationCell,
    locationName: place.locationName,
    locationType: place.locationType,
    merchantCount: place.merchantCount,
  };
  state.activeCategory = 'All';
  state.directoryQuery = '';
  state.placeResults = [];
  state.placeSearchError = '';
  state.placeSearchPending = false;
  state.activeSearchResult = -1;
  state.searchRequestId += 1;
  state.searchResultsDismissed = true;
  state.selectedMerchant = null;
  state.pendingRevealMerchant = null;
}

export function clearPlaceSearch(state) {
  state.activePlace = null;
  state.directoryQuery = '';
  state.activeSearchResult = -1;
  state.searchResultsDismissed = true;
  state.selectedMerchant = null;
  state.pendingRevealMerchant = null;
}
```

- [ ] **Step 7: Run focused and full tests**

Run:

```bash
node --test tests/merchant-utils.test.mjs
node --test
```

Expected: all tests PASS.

- [ ] **Step 8: Commit the exact place-scope contract**

```bash
git add merchant-utils.mjs tests/merchant-utils.test.mjs
git commit -m "Keep exact place scope independent of map movement" -m "Constraint: Active place membership must bypass viewport bounds while later category and text filters still compose.
Rejected: Encoding active place as ordinary query text | It cannot preserve exact membership or explicit clearing.
Confidence: high
Scope-risk: moderate
Directive: Leaflet fitting belongs in app.js; these utilities must stay DOM and Leaflet independent.
Tested: node --test tests/merchant-utils.test.mjs; node --test.
Not-tested: Browser focus and map fitting."
```

---

### Task 3: Unified Result Ordering and Tokenized Search UI

**Files:**
- Modify: `merchant-utils.mjs:51-69`
- Modify: `tests/merchant-utils.test.mjs:133-157`
- Modify: `app.js:1-74,198-382,419-425`
- Modify: `index.html:20-25,68`
- Modify: `styles.css:34-50,95-109`

**Interfaces:**
- Consumes: `MerchantPlace[]`, scoped `Merchant[]`, existing external place objects, query text, and `activePlace`.
- Produces: `combinedSearchResults({ merchantPlaces, merchants, externalPlaces, query, activePlace }): SearchResult[]`.
- `SearchResult` variants are `{ type: 'merchant-place', place }`, `{ type: 'merchant', merchant }`, and `{ type: 'place', place }`, in that exact order.
- App-level `activateMerchantPlace(place)` and `removeActivePlace()` are the only DOM/Leaflet entry points for changing place scope.

- [ ] **Step 1: Write failing result-order and active-scope tests**

```js
import {
  // existing imports
  combinedSearchResults,
} from '../merchant-utils.mjs';

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
```

- [ ] **Step 2: Run the focused test and verify the new result composer is missing**

Run:

```bash
node --test tests/merchant-utils.test.mjs
```

Expected: FAIL because `combinedSearchResults` is not exported.

- [ ] **Step 3: Implement the pure result composer**

```js
export function combinedSearchResults({
  merchantPlaces,
  merchants,
  externalPlaces,
  query,
  activePlace,
}) {
  const localPlaces = activePlace
    ? []
    : merchantPlaceSearchResults(merchantPlaces, query)
      .map((place) => ({ type: 'merchant-place', place }));
  const matchingMerchants = merchantSearchResults(merchants, query)
    .map((merchant) => ({ type: 'merchant', merchant }));
  const mapPlaces = activePlace
    ? []
    : externalPlaces.map((place) => ({ type: 'place', place }));
  return [...localPlaces, ...matchingMerchants, ...mapPlaces];
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
node --test tests/merchant-utils.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Restructure the search markup into a tokenized field**

Replace the direct search input with this wrapper and bump runtime asset versions:

```html
<form id="search-form" class="search-form" role="search">
  <label class="visually-hidden" for="search-input">Search merchants, places, or a Singapore address</label>
  <div class="search-field">
    <span id="active-place-chip" class="search-place-chip" hidden>
      <span id="active-place-label"></span>
      <button id="clear-place-button" type="button" aria-label="Remove place filter">×</button>
    </span>
    <input id="search-input" type="search" placeholder="Search merchants, malls, streets, or addresses" autocomplete="off" role="combobox" aria-controls="search-results" aria-expanded="false" aria-autocomplete="list" />
  </div>
  <button type="submit">Find</button>
  <div id="search-results" class="search-results" role="listbox" hidden></div>
</form>
```

Set `styles.css?v=10`, `app.js?v=17`, and the `merchant-utils.mjs` import in `app.js` to `?v=6` so GitHub Pages clients do not retain the old runtime.

- [ ] **Step 6: Add state, element references, pure filtering, and chip rendering**

Replace the `app.js` utility imports with the exact integrated surface:

```js
import {
  activeResultIndex,
  activatePlaceSearch,
  clearMerchantSelection,
  clearPlaceSearch,
  combinedSearchResults,
  distanceMeters,
  filterDirectoryMerchants,
  formatDistance,
  googleMapsSearchUrl,
  merchantPlaceGroups,
  orderMerchants,
  placeSearchResults,
  requestMerchantSelection,
  revealClusteredMarker,
} from './merchant-utils.mjs?v=6';
```

Add `activePlace: null` and `merchantPlaces: []` to state. Add these element references:

```js
activePlaceChip: document.querySelector('#active-place-chip'),
activePlaceLabel: document.querySelector('#active-place-label'),
clearPlaceButton: document.querySelector('#clear-place-button'),
```

Replace `directoryMerchants()` with:

```js
function directoryMerchants() {
  const bounds = map.getBounds();
  const matchingMerchants = filterDirectoryMerchants(state.merchants, {
    activeCategory: state.activeCategory,
    query: state.directoryQuery,
    activeLocationCell: state.activePlace?.locationCell ?? null,
    contains: (merchant) => bounds.contains([merchant.latitude, merchant.longitude]),
  });
  return orderMerchants(matchingMerchants, {
    mode: state.sortMode,
    origin: mapCenterOrigin(),
  });
}

function renderActivePlace() {
  const active = state.activePlace;
  elements.activePlaceChip.hidden = !active;
  elements.activePlaceLabel.textContent = active?.locationName ?? '';
  elements.clearPlaceButton.setAttribute(
    'aria-label',
    active ? `Remove ${active.locationName} place filter` : 'Remove place filter',
  );
}
```

Call `renderActivePlace()` from `renderDirectory()`. In `initializeDirectory()`, build groups and clear stale place state before the first render:

```js
state.merchants = dataset.merchants;
state.merchantPlaces = merchantPlaceGroups(state.merchants);
if (
  state.activePlace
  && !state.merchantPlaces.some(({ locationCell }) => locationCell === state.activePlace.locationCell)
) {
  clearPlaceSearch(state);
}
renderDirectory();
```

- [ ] **Step 7: Render and choose three explicit result variants**

Replace `flatSearchResults()` with:

```js
function flatSearchResults() {
  return combinedSearchResults({
    merchantPlaces: state.merchantPlaces,
    merchants: directoryMerchants(),
    externalPlaces: state.placeResults,
    query: state.directoryQuery,
    activePlace: state.activePlace,
  });
}
```

In `renderSearchResults()`, split results by all three types and render groups in this order:

```js
const merchantPlaceResults = results.filter(({ type }) => type === 'merchant-place');
const merchantResults = results.filter(({ type }) => type === 'merchant');
const placeResults = results.filter(({ type }) => type === 'place');

appendSearchResultGroup(fragment, 'directory-places', 'Places in merchant directory', merchantPlaceResults, makeOption);
appendSearchResultGroup(fragment, 'merchants', 'Merchants in this view', merchantResults, makeOption);
appendSearchResultGroup(fragment, 'singapore-places', 'Places in Singapore', placeResults, makeOption);
```

Update the group renderer signature so each result section is explicitly labelled:

```js
function appendSearchResultGroup(fragment, groupId, heading, results, renderOption) {
  if (!results.length) return;
  const group = document.createElement('section');
  group.className = 'search-result-group';
  const title = document.createElement('h2');
  title.id = `search-result-${groupId}-heading`;
  title.className = 'search-result-heading';
  title.textContent = heading;
  group.setAttribute('aria-labelledby', title.id);
  group.append(title);
  results.forEach((result) => group.append(renderOption(result)));
  fragment.append(group);
}
```

Add the local-place rendering and selection branches explicitly:

```js
if (result.type === 'merchant-place') {
  primary.textContent = result.place.locationName;
  secondary.textContent = `${result.place.locationType} · ${result.place.merchantCount.toLocaleString('en-SG')} merchants`;
} else if (result.type === 'merchant') {
  primary.textContent = result.merchant.name;
  secondary.textContent = `${result.merchant.locationName} · ${result.merchant.address}`;
} else {
  primary.textContent = result.place.label.split(',').slice(0, 2).join(',');
  secondary.textContent = result.place.label;
}

function chooseSearchResult(result) {
  state.searchResultsDismissed = true;
  if (result.type === 'merchant-place') {
    activateMerchantPlace(result.place);
  } else if (result.type === 'merchant') {
    selectMerchant(result.merchant.id);
  } else {
    elements.searchInput.value = '';
    state.directoryQuery = '';
    state.placeResults = [];
    map.setView([result.place.latitude, result.place.longitude], 15);
    setStatus(`Showing merchants near ${result.place.label.split(',').slice(0, 2).join(',')}.`);
    renderDirectory();
  }
  closeSearchResults();
}
```

Update form submission so an unhighlighted exact local place wins before an external map place:

```js
const firstLocalPlace = results.find(({ type }) => type === 'merchant-place');
if (firstLocalPlace) return chooseSearchResult(firstLocalPlace);
const firstMapPlace = results.find(({ type }) => type === 'place');
if (firstMapPlace) return chooseSearchResult(firstMapPlace);
```

Change the no-results copy to `No matching merchants or places found.` so it covers all three groups without implying the local directory lookup failed with Nominatim.

- [ ] **Step 8: Implement one-time activation, clearing, and scoped network behavior**

```js
function activateMerchantPlace(place) {
  clearTimeout(placeSearchTimer);
  activatePlaceSearch(state, place);
  elements.searchInput.value = '';
  if (place.coordinateBounds) {
    map.fitBounds(place.coordinateBounds, { padding: [36, 36], maxZoom: 16 });
  }
  renderDirectory();
  closeSearchResults();
  elements.searchInput.focus();
}

function removeActivePlace() {
  clearPlaceSearch(state);
  elements.searchInput.value = '';
  renderDirectory();
  closeSearchResults();
  elements.searchInput.focus();
}

elements.clearPlaceButton.addEventListener('click', removeActivePlace);
```

Replace the search-input handler with the scoped network behavior:

```js
elements.searchInput.addEventListener('input', () => {
  state.searchResultsDismissed = false;
  state.directoryQuery = elements.searchInput.value;
  state.selectedMerchant = null;
  state.pendingRevealMerchant = null;

  if (state.activePlace) {
    clearTimeout(placeSearchTimer);
    state.searchRequestId += 1;
    state.placeResults = [];
    state.placeSearchError = '';
    state.placeSearchPending = false;
    renderDirectory();
  } else {
    renderDirectory();
    requestPlaceSuggestions(elements.searchInput.value);
  }
});
```

- [ ] **Step 9: Add tokenized-field and chip styles**

Keep `.search-form` as the positioned outer flex row and add:

```css
.search-field { min-width: 0; flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 5px; padding: 4px 6px; }
.search-field input { min-width: 120px; flex: 1; padding: 5px 6px; border: 0; outline: 0; color: var(--ink); }
.search-place-chip { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 5px 7px 5px 9px; border-radius: 99px; background: #e8f3fb; color: var(--deep-blue); font-size: .76rem; font-weight: 750; }
.search-place-chip[hidden] { display: none; }
.search-place-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search-place-chip button { width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; line-height: 1; }
.search-place-chip button:hover { background: rgb(7 90 155 / 12%); }
.search-place-chip button:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }

@media (max-width: 460px) {
  .search-field { flex-basis: 100%; }
  .search-place-chip { max-width: 100%; }
}
```

Update selectors that currently target `.search-form input` and `.search-form > button` so the submit button keeps its blue treatment while the nested chip button does not inherit it.

- [ ] **Step 10: Run utility tests and syntax checks**

Run:

```bash
node --test tests/merchant-utils.test.mjs
node --check merchant-utils.mjs
node --check app.js
```

Expected: all checks PASS.

- [ ] **Step 11: Commit the unified place-search control**

```bash
git add merchant-utils.mjs tests/merchant-utils.test.mjs app.js index.html styles.css
git commit -m "Expose exact directory places through unified search" -m "Constraint: Local place results must precede merchant and external suggestions and remain fully usable without network access.
Rejected: A separate directory filter control | The selected place belongs in the existing unified search interaction.
Confidence: high
Scope-risk: moderate
Directive: Keep active-place changes behind activateMerchantPlace and removeActivePlace.
Tested: node --test tests/merchant-utils.test.mjs; node --check merchant-utils.mjs; node --check app.js.
Not-tested: Card place activation and full browser QA."
```

---

### Task 4: Independent Merchant Place Action and Scoped Feedback

**Files:**
- Modify: `app.js:146-207`
- Modify: `index.html:36-40,53-64`
- Modify: `styles.css:71-83`

**Interfaces:**
- Consumes: `activateMerchantPlace(place)` from Task 3 and `state.merchantPlaces` from Task 1.
- Produces: one independently focusable `.merchant-location` button per card.
- Preserves: `.merchant-select` as the full-card primary action and `.gmap-link` as a separate external action.

- [ ] **Step 1: Make the directory scope label addressable**

Give the existing directory panel and eyebrow stable IDs:

```html
<aside id="directory-panel" class="directory-panel" aria-label="Merchants in current map view">
  <div class="directory-intro">
    <p id="directory-scope-label" class="eyebrow">In this map view</p>
```

Add `directoryPanel` and `directoryScopeLabel` to the `elements` object in `app.js` so active-place rendering can update visible and accessible scope copy together.

- [ ] **Step 2: Restructure the merchant template without nesting interactive elements**

Replace the template with this sibling-action structure:

```html
<template id="merchant-template">
  <article class="merchant-card">
    <button class="merchant-select" type="button">
      <span class="visually-hidden merchant-select-label"></span>
    </button>
    <span class="merchant-category"></span>
    <strong class="merchant-name"></strong>
    <button class="merchant-location" type="button"></button>
    <span class="merchant-address"></span>
    <span class="merchant-distance" hidden></span>
    <a class="gmap-link" target="_blank" rel="noopener noreferrer">gmap ↗</a>
  </article>
</template>
```

The empty full-card button is an absolute overlay with a visually hidden label. Text content sits above it with `pointer-events: none`; `.merchant-location` and `.gmap-link` sit above the overlay with normal pointer events. This retains one card-wide merchant action without nesting the place button.

- [ ] **Step 3: Wire exact card place activation**

In `renderMerchantList()`:

```js
const selectButton = card.querySelector('.merchant-select');
const selectLabel = card.querySelector('.merchant-select-label');
const locationButton = card.querySelector('.merchant-location');
const place = state.merchantPlaces.find(({ locationCell }) => (
  locationCell === merchant.locationCell
));

selectLabel.textContent = `Show ${merchant.name} on the map`;
locationButton.textContent = merchant.locationName;
locationButton.setAttribute('aria-label', `Show all merchants at ${merchant.locationName}`);
selectButton.addEventListener('click', () => selectMerchant(merchant.id, true));
locationButton.addEventListener('click', () => {
  if (place) activateMerchantPlace(place);
});
```

Do not attach the place handler to the article or merchant-selection button. Keep the Google Maps link listener-free and independent.

- [ ] **Step 4: Add the overlay layout and explicit focus treatment**

Replace the existing card/select/location rules with:

```css
.merchant-card { position: relative; display: grid; gap: 3px; padding: 15px 68px 15px 11px; border-bottom: 1px solid var(--line); background: white; }
.merchant-select { position: absolute; inset: 0; z-index: 0; border: 0; background: transparent; }
.merchant-card > :not(.merchant-select) { position: relative; z-index: 1; pointer-events: none; }
.merchant-card > .merchant-location, .merchant-card > .gmap-link { z-index: 2; pointer-events: auto; }
.merchant-card:hover, .merchant-card.is-selected { background: #f1f8fc; box-shadow: inset 3px 0 var(--blue); }
.merchant-select:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
.merchant-card > .gmap-link { position: absolute; top: 15px; right: 11px; }
.merchant-location { justify-self: start; padding: 0; border: 0; background: transparent; color: #445a70; font-size: .79rem; font-weight: 700; text-align: left; text-decoration: underline; text-decoration-color: transparent; text-underline-offset: 2px; }
.merchant-location:hover { color: var(--deep-blue); text-decoration-color: currentColor; }
.merchant-location:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
```

- [ ] **Step 5: Make count/status and empty states name the active place**

In `renderDirectory()`, update the directory label and construct status text from both active place and category:

```js
const categoryLabel = state.activeCategory === 'All' ? 'All categories' : state.activeCategory;
const scopeLabel = state.activePlace
  ? `${state.activePlace.locationName} · ${categoryLabel}`
  : categoryLabel;
elements.directoryScopeLabel.textContent = state.activePlace
  ? `At ${state.activePlace.locationName}`
  : 'In this map view';
elements.directoryPanel.setAttribute(
  'aria-label',
  state.activePlace
    ? `Merchants at ${state.activePlace.locationName}`
    : 'Merchants in current map view',
);
setStatus(`${merchants.length.toLocaleString('en-SG')} shown · ${scopeLabel} · ${verifiedCount.toLocaleString('en-SG')} resolved total`);
```

In `renderMerchantList()`, choose scoped empty copy first:

```js
if (state.activePlace) {
  empty.textContent = `No merchants match the current search or category at ${state.activePlace.locationName}. Clear the text, category, or place filter.`;
} else if (state.directoryQuery.trim()) {
  empty.textContent = `No merchants match “${state.directoryQuery.trim()}” in this map view. Try another search or clear it.`;
} else {
  empty.textContent = 'No matching merchants are in this map view. Try zooming out or clearing a filter.';
}
```

- [ ] **Step 6: Run the complete automated validation**

Run:

```bash
node --test
node --check app.js
node --check merchant-utils.mjs
for file in scripts/*.mjs; do node --check "$file"; done
node scripts/build-pages.mjs
git diff --check
```

Expected: all tests and syntax checks PASS, `.pages-dist` builds successfully, and `git diff --check` reports no errors.

- [ ] **Step 7: Commit the independent card action and feedback**

```bash
git add app.js index.html styles.css
git commit -m "Make merchant places independently selectable" -m "Constraint: Clicking a place must activate exact place search without selecting or panning to the individual merchant.
Rejected: Nesting a place button inside the card button | Nested interactive controls are invalid and inaccessible.
Confidence: high
Scope-risk: moderate
Directive: Preserve the full-card merchant action as an overlay beneath place and Google Maps actions.
Tested: node --test; JavaScript syntax checks; Pages artifact build; git diff --check.
Not-tested: Interactive browser behavior and responsive rendering."
```

---

### Task 5: Browser QA and Final Verification

**Files:**
- Verify: `app.js`
- Verify: `index.html`
- Verify: `styles.css`
- Verify: `merchant-utils.mjs`
- Verify: `tests/merchant-utils.test.mjs`
- Verify: `.pages-dist/` generated artifact (do not stage)

**Interfaces:**
- Consumes: the complete feature from Tasks 1-4.
- Produces: verification evidence only; any defect found returns to the owning task and receives a focused fix plus a new Lore commit.

- [ ] **Step 1: Start the static site from the repository root**

Run:

```bash
python3 -m http.server 4173
```

Expected: the server listens on `http://127.0.0.1:4173/` without modifying tracked files.

- [ ] **Step 2: Verify global local-place discovery**

In a desktop browser:

1. Move the map so Westgate is outside the viewport.
2. Type `Westgate`.
3. Confirm the first group is `Places in merchant directory`.
4. Confirm its option reads `Westgate` with `In-Mall & Building · 123 merchants` using the current dataset count.
5. Confirm merchant matches follow under `Merchants in this view` and external results remain under `Places in Singapore`.
6. Use ArrowDown and Enter to select Westgate; repeat once using pointer activation.

Expected: both keyboard and pointer selection add the same chip and no network response is required for the local option.

- [ ] **Step 3: Verify exact activation and map behavior**

After selecting Westgate:

1. Confirm the prior query is empty and category is `All categories`.
2. Confirm the chip reads `Westgate` and exposes `Remove Westgate place filter`.
3. Confirm all Westgate cards and markers are present and unrelated merchants are absent.
4. Confirm the map fits all Westgate markers once.
5. Pan and zoom away; confirm the chip and complete Westgate result set persist without another automatic fit.
6. Type a merchant name beside the chip; confirm cards and markers narrow within Westgate only.
7. Select a category; confirm it composes with the scoped text and place.

Expected: list, count, search merchant results, and markers always represent the same final collection.

- [ ] **Step 4: Verify card-place and clearing behavior**

1. Clear scoped text/category, then click a `Westgate` place button in a card.
2. Confirm it activates the same chip path without selecting the merchant or opening its popup.
3. Confirm clicking the remaining card area still selects, pans, reveals the clustered marker, and opens its popup.
4. Confirm `gmap ↗` remains independent.
5. Pan to a chosen view, remove the chip, and confirm global browsing returns without changing center or zoom.

Expected: the three card actions—merchant, place, and Google Maps—remain independent and keyboard focus is visible for each.

- [ ] **Step 5: Verify failure, empty, and responsive states**

1. Block or disconnect Nominatim and type a global query.
2. Confirm local place and merchant results remain usable while the external failure is non-blocking.
3. Activate Westgate, then choose a category/text combination with zero matches.
4. Confirm the empty message names Westgate and suggests clearing text, category, or place.
5. Test widths around 820 px and 460 px; confirm chip/input wrapping does not overflow or cover the Find button/results panel.
6. Confirm focus returns to the input after activating or removing a chip and ARIA expanded/active-descendant state remains accurate.

Expected: no clipped controls, nested focus targets, stale external results, or inaccessible removal action.

- [ ] **Step 6: Re-run final repository validation**

Stop the server, then run:

```bash
node --test
node --check app.js
node --check merchant-utils.mjs
for file in scripts/*.mjs; do node --check "$file"; done
node scripts/build-pages.mjs
find .pages-dist -type f | sort
git diff --check
git status --short
```

Expected:

- all Node tests and syntax checks PASS;
- the Pages build succeeds;
- `.pages-dist` contains only `.nojekyll`, `app.js`, `data/merchants.json`, `index.html`, `merchant-utils.mjs`, and `styles.css`;
- `git diff --check` is clean; and
- `git status --short` has no uncommitted source changes. `.pages-dist` remains ignored/untracked according to the existing repository policy.
