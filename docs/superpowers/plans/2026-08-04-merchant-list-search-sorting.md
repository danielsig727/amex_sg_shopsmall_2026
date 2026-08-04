# Merchant List Search and Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add current-view merchant search, deterministic A–Z ordering, and nearest-first ordering from a visible map-center origin.

**Architecture:** Keep merchant filtering and ordering as pure functions in `merchant-utils.mjs`, then let `app.js` compose map bounds, category, query, and sort mode into one collection used by both markers and cards. Manage the distance-origin marker as a separate non-interactive Leaflet layer so it never enters merchant clustering or selection state.

**Tech Stack:** Static HTML/CSS, browser ES modules, Leaflet 1.9.4, Leaflet.markercluster 1.5.3, Node.js built-in test runner.

## Global Constraints

- Merchant search matches name, named location or mall, and full address only within the current map view.
- Search filters both list items and merchant pins.
- `A–Z` is the default and uses Singapore-aware, case-insensitive deterministic ordering.
- `Nearest` uses straight-line distance from the current map center and must not recenter or zoom the map.
- The distance-origin marker appears only for `Nearest`, remains outside clustering, and is non-interactive.
- Search query and sort mode persist across map movement, zoom, and category changes.
- Existing popup-close, repeated list-click, clustering, and manual-zoom behavior must remain unchanged.
- Add no dependency and no new browser runtime file; the GitHub Pages allowlist remains unchanged.

---

## File Structure

- `merchant-utils.mjs`: pure search normalization, deterministic comparison, Haversine distance, formatting, and ordering utilities.
- `tests/merchant-utils.test.mjs`: behavior tests for every new pure utility and edge case.
- `index.html`: directory search, sort controls, and optional distance element in the merchant-card template.
- `styles.css`: responsive directory controls, selected sort state, distance label, and map-center origin marker.
- `app.js`: directory query/sort state, shared filtered collection, control events, distance labels, and Leaflet origin-marker lifecycle.

### Task 1: Pure Merchant Discovery Utilities

**Files:**
- Modify: `merchant-utils.mjs`
- Test: `tests/merchant-utils.test.mjs`

**Interfaces:**
- Produces: `merchantMatchesQuery(merchant, query) -> boolean`
- Produces: `compareMerchantsAlphabetically(left, right) -> number`
- Produces: `distanceMeters(origin, destination) -> number`, where both arguments expose numeric `latitude` and `longitude`
- Produces: `formatDistance(metres) -> string`
- Produces: `orderMerchants(merchants, { mode, origin }) -> Merchant[]`, returning a new array; `mode` is `'alphabetical'` or `'distance'`

- [ ] **Step 1: Write failing search and alphabetical-order tests**

Add these imports and tests to `tests/merchant-utils.test.mjs`:

```js
import {
  clearMerchantSelection,
  compareMerchantsAlphabetically,
  distanceMeters,
  formatDistance,
  googleMapsSearchUrl,
  merchantMatchesQuery,
  orderMerchants,
  requestMerchantSelection,
  revealClusteredMarker,
} from '../merchant-utils.mjs';

const merchants = [
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

test('merchantMatchesQuery matches name, location, and address case-insensitively', () => {
  assert.equal(merchantMatchesQuery(merchants[0], 'zulu'), true);
  assert.equal(merchantMatchesQuery(merchants[1], 'TANJONG pagar'), true);
  assert.equal(merchantMatchesQuery(merchants[2], 'victoria 188021'), true);
  assert.equal(merchantMatchesQuery(merchants[2], 'orchard'), false);
  assert.equal(merchantMatchesQuery(merchants[2], '   '), true);
});

test('compareMerchantsAlphabetically uses stable location, address, and id tie breakers', () => {
  assert.deepEqual(
    merchants.toSorted(compareMerchantsAlphabetically).map(({ id }) => id),
    ['alpha-bugis', 'alpha-tanjong', 'zulu-orchard'],
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/merchant-utils.test.mjs`

Expected: FAIL because `compareMerchantsAlphabetically` and `merchantMatchesQuery` are not exported.

- [ ] **Step 3: Implement query matching and alphabetical comparison**

Add to `merchant-utils.mjs`:

```js
const merchantCollator = new Intl.Collator('en-SG', {
  sensitivity: 'base',
  numeric: true,
});

function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('en-SG');
}

export function merchantMatchesQuery(merchant, query) {
  const terms = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;

  const searchableText = normalizeSearchText([
    merchant.name,
    merchant.locationName,
    merchant.address,
  ].join(' '));
  return terms.every((term) => searchableText.includes(term));
}

export function compareMerchantsAlphabetically(left, right) {
  return merchantCollator.compare(left.name, right.name)
    || merchantCollator.compare(left.locationName, right.locationName)
    || merchantCollator.compare(left.address, right.address)
    || merchantCollator.compare(left.id, right.id);
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/merchant-utils.test.mjs`

Expected: PASS for the existing tests and both new tests.

- [ ] **Step 5: Write failing distance and list-order tests**

Append to `tests/merchant-utils.test.mjs`:

```js
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
  const source = [...merchants];

  const ordered = orderMerchants(source, { mode: 'alphabetical' });

  assert.deepEqual(ordered.map(({ id }) => id), ['alpha-bugis', 'alpha-tanjong', 'zulu-orchard']);
  assert.deepEqual(source, merchants);
});

test('orderMerchants sorts by distance and breaks equal-distance ties alphabetically', () => {
  const origin = { latitude: 1.3006, longitude: 103.8399 };

  const ordered = orderMerchants(merchants, { mode: 'distance', origin });

  assert.deepEqual(ordered.map(({ id }) => id), ['zulu-orchard', 'alpha-bugis', 'alpha-tanjong']);
});
```

- [ ] **Step 6: Run the focused test and verify RED**

Run: `node --test tests/merchant-utils.test.mjs`

Expected: FAIL because `distanceMeters`, `formatDistance`, and `orderMerchants` are not exported.

- [ ] **Step 7: Implement distance calculation, formatting, and ordering**

Add to `merchant-utils.mjs`:

```js
const EARTH_RADIUS_METRES = 6_371_000;

function radians(degrees) {
  return degrees * Math.PI / 180;
}

export function distanceMeters(origin, destination) {
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const originLatitude = radians(origin.latitude);
  const destinationLatitude = radians(destination.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(haversine));
}

export function formatDistance(metres) {
  if (metres < 1_000) return `${Math.round(metres)} m`;
  return `${new Intl.NumberFormat('en-SG', { maximumFractionDigits: 1 }).format(metres / 1_000)} km`;
}

export function orderMerchants(merchantsToOrder, { mode = 'alphabetical', origin } = {}) {
  if (mode === 'distance' && origin) {
    return merchantsToOrder.toSorted((left, right) => (
      distanceMeters(origin, left) - distanceMeters(origin, right)
      || compareMerchantsAlphabetically(left, right)
    ));
  }
  return merchantsToOrder.toSorted(compareMerchantsAlphabetically);
}
```

- [ ] **Step 8: Run all tests and syntax checks**

Run: `node --test && node --check merchant-utils.mjs`

Expected: all tests PASS and syntax check exits 0.

- [ ] **Step 9: Commit the pure behavior**

```bash
git add merchant-utils.mjs tests/merchant-utils.test.mjs
git commit -m "Make merchant discovery ordering deterministic" -m "Constraint: search and distance ordering must be local, stable, and dependency-free.
Rejected: mutate the merchant array in place | shared rendering state requires predictable source ordering.
Confidence: high
Scope-risk: narrow
Directive: preserve alphabetical tie breakers when adding future sort modes.
Tested: node --test; node --check merchant-utils.mjs.
Not-tested: browser control integration remains in later tasks."
```

### Task 2: Current-View Merchant Search and Default A–Z Rendering

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Test: `tests/merchant-utils.test.mjs` from Task 1 provides search and A–Z behavior coverage

**Interfaces:**
- Consumes: `merchantMatchesQuery(merchant, query)` and `orderMerchants(merchants, { mode: 'alphabetical' })`
- Produces: `state.directoryQuery: string`
- Produces: `directoryMerchants() -> Merchant[]`, the single collection rendered by both pins and cards

- [ ] **Step 1: Add the directory search markup**

Insert between `#category-filters` and `#merchant-list` in `index.html`:

```html
<div class="directory-controls">
  <label class="directory-search" for="merchant-search-input">
    <span>Search merchants in this view</span>
    <input id="merchant-search-input" type="search" placeholder="Name, mall, or address" autocomplete="off" />
  </label>
</div>
```

- [ ] **Step 2: Style the fixed search control and responsive layout**

Add to `styles.css` next to the category-filter rules:

```css
.directory-controls { flex: none; padding: 12px 20px; border-bottom: 1px solid var(--line); background: var(--paper); }
.directory-search { display: grid; gap: 5px; color: #445a70; font-size: .7rem; font-weight: 750; }
.directory-search input { width: 100%; min-width: 0; padding: 9px 10px; border: 1px solid #cbd7e1; border-radius: 8px; color: var(--ink); background: white; outline: 0; }
.directory-search input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgb(20 117 185 / 16%); }
```

- [ ] **Step 3: Import utilities and add directory-query state**

Extend the `app.js` import with `merchantMatchesQuery` and `orderMerchants`, add `merchantSearchInput` to `elements`, and add `directoryQuery: ''` plus `sortMode: 'alphabetical'` to `state`.

Replace `visibleMerchants()` with:

```js
function directoryMerchants() {
  const bounds = map.getBounds();
  const matchingMerchants = state.merchants.filter((merchant) => (
    merchant.coordinateSource === 'onemap'
    && (state.activeCategory === 'All' || merchant.category === state.activeCategory)
    && bounds.contains([merchant.latitude, merchant.longitude])
    && merchantMatchesQuery(merchant, state.directoryQuery)
  ));
  return orderMerchants(matchingMerchants, { mode: 'alphabetical' });
}
```

Update every `visibleMerchants()` call to `directoryMerchants()`.

- [ ] **Step 4: Wire immediate search rendering and search-specific empty state**

Add after the search-form listener setup:

```js
elements.merchantSearchInput.addEventListener('input', () => {
  state.directoryQuery = elements.merchantSearchInput.value;
  state.selectedMerchant = null;
  state.pendingRevealMerchant = null;
  renderDirectory();
});
```

In `renderMerchantList`, use this empty-state copy when `state.directoryQuery.trim()` is non-empty:

```js
empty.textContent = state.directoryQuery.trim()
  ? `No merchants match “${state.directoryQuery.trim()}” in this map view. Try another search or clear it.`
  : 'No matching merchants are in this map view. Try zooming out or clearing a filter.';
```

Change the live status in `renderDirectory` to include the result count:

```js
setStatus(`${merchants.length.toLocaleString('en-SG')} shown · ${state.activeCategory === 'All' ? 'All categories' : state.activeCategory} · ${verifiedCount.toLocaleString('en-SG')} OneMap-verified total`);
```

- [ ] **Step 5: Run tests and JavaScript syntax checks**

Run: `node --test && node --check app.js && node --check merchant-utils.mjs`

Expected: all tests PASS and both syntax checks exit 0.

- [ ] **Step 6: Browser-test search and default ordering**

Start a localhost-only server with `python3 -m http.server 4175 --bind 127.0.0.1`, open the map through the Browser skill, and verify:

1. The first rendered merchant names are in ascending A–Z order.
2. Typing `Tanjong Pagar Plaza` filters cards to matching names/locations/addresses.
3. The map pin count changes with the filtered collection.
4. Clearing search restores the previous cards and pins.
5. Selecting a category while search is present applies both constraints.
6. The address search still navigates the map and does not populate the merchant search.

- [ ] **Step 7: Commit current-view search**

```bash
git add index.html styles.css app.js
git commit -m "Make current-view merchants directly searchable" -m "Constraint: merchant filtering must stay separate from address lookup and keep pins aligned with cards.
Rejected: list-only filtering | stale unmatched pins make the directory and map disagree.
Confidence: high
Scope-risk: moderate
Directive: keep directoryMerchants as the shared marker and list input.
Tested: node --test; JavaScript syntax checks; browser search, clear, category, and address-search flows.
Not-tested: distance controls are added in the next task."
```

### Task 3: Nearest Sorting, Distance Labels, and Map-Center Origin Marker

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Test: `tests/merchant-utils.test.mjs` from Task 1 provides distance and ordering coverage

**Interfaces:**
- Consumes: `distanceMeters(origin, merchant)`, `formatDistance(metres)`, and `orderMerchants(merchants, { mode, origin })`
- Consumes: `state.sortMode`, initially `'alphabetical'`
- Produces: `state.distanceOriginMarker: L.CircleMarker | null`
- Produces: `updateDistanceOriginMarker() -> void`

- [ ] **Step 1: Add sort controls and the optional card-distance element**

Inside `.directory-controls`, after the search label, add:

```html
<div class="sort-control" role="group" aria-label="Sort merchants">
  <button type="button" data-sort-mode="alphabetical" aria-pressed="true">A–Z</button>
  <button type="button" data-sort-mode="distance" aria-pressed="false">Nearest</button>
</div>
```

Inside `.merchant-select`, after `.merchant-address`, add:

```html
<span class="merchant-distance" hidden></span>
```

- [ ] **Step 2: Style the segmented sort control, distance label, and origin marker**

Extend `styles.css`:

```css
.directory-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 10px; }
.sort-control { display: inline-flex; padding: 3px; border: 1px solid #d5e0e8; border-radius: 8px; background: var(--wash); }
.sort-control button { border: 0; border-radius: 5px; padding: 7px 9px; background: transparent; color: #53687b; font-size: .72rem; font-weight: 750; }
.sort-control button[aria-pressed="true"] { background: white; color: var(--deep-blue); box-shadow: 0 1px 4px rgb(21 40 67 / 14%); }
.sort-control button:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.merchant-distance { color: var(--deep-blue); font-size: .72rem; font-weight: 750; }
.distance-origin-marker { stroke: var(--deep-blue); fill: white; fill-opacity: .9; stroke-width: 3; }

@media (max-width: 460px) {
  .directory-controls { grid-template-columns: 1fr; align-items: stretch; }
  .sort-control { justify-self: start; }
}
```

- [ ] **Step 3: Add sort controls and origin-marker state to `app.js`**

Import `distanceMeters` and `formatDistance`. Add `sortButtons: [...document.querySelectorAll('[data-sort-mode]')]` to `elements` and `distanceOriginMarker: null` to `state`.

Add:

```js
function mapCenterOrigin() {
  const center = map.getCenter();
  return { latitude: center.lat, longitude: center.lng };
}

function updateDistanceOriginMarker() {
  if (state.sortMode !== 'distance') {
    if (state.distanceOriginMarker) map.removeLayer(state.distanceOriginMarker);
    state.distanceOriginMarker = null;
    return;
  }

  if (!state.distanceOriginMarker) {
    state.distanceOriginMarker = L.circleMarker(map.getCenter(), {
      radius: 6,
      className: 'distance-origin-marker',
      interactive: false,
      bubblingMouseEvents: false,
    }).addTo(map);
  } else {
    state.distanceOriginMarker.setLatLng(map.getCenter());
  }
}
```

- [ ] **Step 4: Make `directoryMerchants` honor the active sort mode**

Change its return statement to:

```js
return orderMerchants(matchingMerchants, {
  mode: state.sortMode,
  origin: mapCenterOrigin(),
});
```

Call `updateDistanceOriginMarker()` near the start of `renderDirectory`, before rendering markers and cards.

- [ ] **Step 5: Render distance labels only in nearest mode**

In `renderMerchantList`, populate the dedicated element:

```js
const distance = card.querySelector('.merchant-distance');
if (state.sortMode === 'distance') {
  distance.hidden = false;
  distance.textContent = formatDistance(distanceMeters(mapCenterOrigin(), merchant));
}
```

- [ ] **Step 6: Wire the sort buttons without moving the map**

Add during initialization:

```js
elements.sortButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const nextMode = button.dataset.sortMode;
    if (state.sortMode === nextMode) return;
    state.sortMode = nextMode;
    elements.sortButtons.forEach((candidate) => {
      candidate.setAttribute('aria-pressed', String(candidate.dataset.sortMode === state.sortMode));
    });
    renderDirectory();
  });
});
```

Do not call `map.setView`, `panTo`, `setZoom`, or `fitBounds` from this handler.

- [ ] **Step 7: Run tests and syntax checks**

Run: `node --test && node --check app.js && node --check merchant-utils.mjs`

Expected: all tests PASS and syntax checks exit 0.

- [ ] **Step 8: Browser-test nearest ordering and marker lifecycle**

Using the running localhost-only server and Browser skill, verify:

1. `A–Z` is pressed initially and no `.distance-origin-marker` exists.
2. Record the map pane transform, click `Nearest`, and confirm the transform is unchanged.
3. Exactly one `.distance-origin-marker` appears outside `.marker-cluster` elements.
4. Cards show distance labels and their values are nondecreasing.
5. Pan or zoom once; after `moveend`, the origin marker returns to map center and the list reorders from the new center without bouncing.
6. Click `A–Z`; the origin marker and distance labels disappear and names return to A–Z order.
7. Search while `Nearest` is active; both cards and pins remain filtered and distance-ordered.

- [ ] **Step 9: Commit nearest ordering**

```bash
git add index.html styles.css app.js
git commit -m "Expose nearest merchants from the visible map center" -m "Constraint: distance sorting must not move the map or enter merchant clustering.
Rejected: fixed and draggable origins | they add state beyond the approved map-center contract.
Confidence: high
Scope-risk: moderate
Directive: keep the origin marker non-interactive and outside markerLayer.
Tested: node --test; JavaScript syntax checks; browser sort, marker, movement, search, and reset flows.
Not-tested: GPS accuracy because nearest sorting uses map center, not raw location readings."
```

### Task 4: Cache Busting, Regression Verification, and Pages Artifact

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Verify: `scripts/build-pages.mjs`
- Verify: `.pages-dist/` generated output, which remains ignored

**Interfaces:**
- Consumes: completed search and distance behavior from Tasks 1–3
- Produces: final cache-busted static runtime with no Pages allowlist change

- [ ] **Step 1: Bump browser asset versions**

In `app.js`, increment the `merchant-utils.mjs` query version from `v=3` to `v=4`.

In `index.html`, increment the stylesheet query version from `styles.css?v=4` to `styles.css?v=5` and the app query version from `app.js?v=8` to `app.js?v=9`.

- [ ] **Step 2: Run the complete automated verification**

Run:

```bash
node --test
node --check app.js
node --check merchant-utils.mjs
for file in scripts/*.mjs; do node --check "$file"; done
node scripts/build-pages.mjs
test -f .pages-dist/index.html
test -f .pages-dist/app.js
test -f .pages-dist/styles.css
test -f .pages-dist/merchant-utils.mjs
test -f .pages-dist/data/merchants.json
git diff --check
```

Expected: every command exits 0, all tests pass, and the generated Pages artifact contains the existing runtime allowlist.

- [ ] **Step 3: Browser-run the complete regression checklist**

Reload with the final asset versions and verify:

1. Initial merchant order is A–Z.
2. Search filters cards and pins and combines with category filtering.
3. `Nearest` does not move the map, shows one origin marker, and orders distance labels ascending.
4. Moving and zooming the map updates the origin and results once without bounce.
5. Selecting a collapsed merchant expands it and opens the correct popup.
6. Closing the popup and zooming does not reopen it.
7. Repeated list clicks do not shift the map.
8. Google Maps links still open a new tab.
9. At a narrow viewport, search and sort stack without horizontal overflow.

Finalize the Browser tab and stop the localhost server after the checks.

- [ ] **Step 4: Confirm the final repository boundary**

Run:

```bash
git status --short
git diff --stat HEAD
git diff --check
```

Expected: only the intended runtime, test, and documentation files differ; `.pages-dist/` remains ignored.

- [ ] **Step 5: Commit the release-ready cache versions**

```bash
git add index.html app.js
git commit -m "Publish refreshed merchant discovery assets" -m "Constraint: GitHub Pages may retain prior module and stylesheet responses.
Rejected: leave asset URLs unchanged | deployed clients could mix incompatible cached modules.
Confidence: high
Scope-risk: narrow
Directive: bump parent and imported module query versions together after runtime changes.
Tested: full Node suite; syntax checks; Pages artifact build; complete browser regression checklist.
Not-tested: GitHub-hosted deployment remains authoritative after push."
```

- [ ] **Step 6: Run post-commit verification**

Run: `node --test && node scripts/build-pages.mjs && git diff --check && git status --short --branch`

Expected: all tests PASS, artifact build exits 0, the worktree is clean, and `master` is ahead of `origin/master` by the implementation commits only.
