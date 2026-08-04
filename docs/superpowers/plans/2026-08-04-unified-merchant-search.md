# Unified Merchant Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two search fields with one accessible live search that filters current-view merchants while offering Singapore place suggestions.

**Architecture:** Keep local merchant matching and address lookup separate behind small result-model helpers. `app.js` owns debouncing, request generations, rendering, and selection; the existing map-selection path remains the only way a merchant result reveals a clustered pin and popup.

**Tech Stack:** Vanilla ES modules, Leaflet and Leaflet.markercluster, browser Fetch API, Node built-in test runner, static GitHub Pages build.

## Global Constraints

- Merchant filtering is local, synchronous, category-aware, and restricted to current map bounds.
- Place lookups use the existing Singapore-only Nominatim endpoint, are debounced and bounded, and never run for an empty query.
- A stale place response cannot overwrite results for a later input value.
- Do not add dependencies or expand the geocoding provider scope.
- The input is an accessible combobox; mouse and keyboard selection share one path.
- Category and A–Z/Nearest controls remain in the directory.

---

### Task 1: Define a deterministic result model

**Files:**
- Modify: `merchant-utils.mjs`
- Modify: `tests/merchant-utils.test.mjs`

**Interfaces:**
- Consumes: `merchantMatchesQuery(merchant, query)` and directory-ordered merchant objects.
- Produces: `merchantSearchResults(merchants, query, limit = 6)`.
- Produces: `placeSearchResults(places, limit = 4)` returning `{ label, latitude, longitude }`.
- Produces: `activeResultIndex(currentIndex, resultCount, direction)`.

- [ ] **Step 1: Write failing tests**

```js
test('merchantSearchResults preserves supplied directory order and caps matches', () => {
  assert.deepEqual(merchantSearchResults([merchant('2', 'Beta'), merchant('1', 'Alpha')], 'a', 1).map(({ id }) => id), ['2']);
});

test('placeSearchResults removes malformed coordinates and caps suggestions', () => {
  assert.deepEqual(placeSearchResults([{ display_name: 'Arab Street, Singapore', lat: '1.302', lon: '103.859' }, { display_name: 'bad', lat: 'x', lon: '103.8' }]), [{ label: 'Arab Street, Singapore', latitude: 1.302, longitude: 103.859 }]);
});

test('activeResultIndex wraps keys and handles no results', () => {
  assert.equal(activeResultIndex(-1, 3, 1), 0);
  assert.equal(activeResultIndex(0, 3, -1), 2);
  assert.equal(activeResultIndex(0, 0, 1), -1);
});
```

- [ ] **Step 2: Run the focused test file**

Run: `node --test tests/merchant-utils.test.mjs`

Expected: FAIL because the new helper exports do not yet exist.

- [ ] **Step 3: Implement minimal helpers**

```js
export function merchantSearchResults(merchants, query, limit = 6) {
  return merchants.filter((merchant) => merchantMatchesQuery(merchant, query)).slice(0, limit);
}

export function placeSearchResults(places, limit = 4) {
  return places.map((place) => ({ label: place.display_name, latitude: Number(place.lat), longitude: Number(place.lon) }))
    .filter((place) => place.label && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)).slice(0, limit);
}

export function activeResultIndex(currentIndex, resultCount, direction) {
  return resultCount ? (currentIndex + direction + resultCount) % resultCount : -1;
}
```

- [ ] **Step 4: Run all unit tests**

Run: `node --test`

Expected: PASS, including coordinate, selection, directory-search, and sorting tests.

- [ ] **Step 5: Commit**

```bash
git add merchant-utils.mjs tests/merchant-utils.test.mjs
git commit -m "Keep unified search result state deterministic"
```

### Task 2: Replace the two-field layout with one combobox

**Files:**
- Modify: `index.html:20-24`
- Modify: `index.html:42-45`
- Modify: `styles.css`

**Interfaces:**
- Consumes: retained `#search-input`.
- Produces: `#search-results` with `role="listbox"` and `#search-input` combobox ARIA attributes.
- Produces: options carrying `data-result-type="merchant|place"` and `data-result-index`.

- [ ] **Step 1: Add combobox markup and remove the directory search input**

```html
<form id="search-form" class="search-form" role="search">
  <label class="visually-hidden" for="search-input">Search merchants or a Singapore address</label>
  <input id="search-input" type="search" placeholder="Search merchants, addresses, or neighbourhoods" autocomplete="off" role="combobox" aria-controls="search-results" aria-expanded="false" aria-autocomplete="list" />
  <button type="submit">Search</button>
  <div id="search-results" class="search-results" role="listbox" hidden></div>
</form>
```

- [ ] **Step 2: Add result-panel styles**

```css
.search-results { position: absolute; inset: calc(100% + .4rem) 0 auto; z-index: 20; }
.search-result-group + .search-result-group { border-top: 1px solid var(--border); }
.search-result-option[aria-selected="true"] { background: var(--blue-50); }
```

Keep the existing responsive header layout and use `hidden` for an empty result panel.

- [ ] **Step 3: Check static references**

Run: `node scripts/build-pages.mjs && rg -n "merchant-search-input|search-results|aria-controls" index.html app.js styles.css`

Expected: the old directory input is absent and the listbox relationship is present.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "Give merchant discovery one search surface"
```

### Task 3: Wire live filtering and Singapore suggestions

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: the Task 1 helpers, current `directoryMerchants()`, `selectMerchant(id, shouldPan)`, and `renderDirectory()`.
- Produces: `state.directoryQuery`, `state.placeResults`, `state.activeSearchResult`, `state.searchRequestId`, `renderSearchResults()`, and `chooseSearchResult(result)`.

- [ ] **Step 1: Make the retained input update local results immediately**

```js
elements.searchInput.addEventListener('input', () => {
  state.directoryQuery = elements.searchInput.value;
  state.selectedMerchant = null;
  state.pendingRevealMerchant = null;
  renderDirectory();
  requestPlaceSuggestions(elements.searchInput.value);
});
```

Remove `merchantSearchInput` and its listener. Preserve existing list and marker filtering through `state.directoryQuery`.

- [ ] **Step 2: Add debounced stale-safe place lookup**

```js
let placeSearchTimer;
function requestPlaceSuggestions(query) {
  clearTimeout(placeSearchTimer);
  const requestId = ++state.searchRequestId;
  if (query.trim().length < 3) return updatePlaceResults(requestId, []);
  placeSearchTimer = setTimeout(async () => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&countrycodes=sg&q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Place search is unavailable.');
      updatePlaceResults(requestId, placeSearchResults(await response.json()));
    } catch (error) { updatePlaceResults(requestId, [], error.message); }
  }, 250);
}
```

`updatePlaceResults` returns without rendering when its ID is not `state.searchRequestId`.

- [ ] **Step 3: Render grouped suggestions and one selection path**

```js
function chooseSearchResult(result) {
  if (result.type === 'merchant') selectMerchant(result.merchant.id, false);
  else {
    map.setView([result.place.latitude, result.place.longitude], 15);
    setStatus(`Showing merchants near ${result.place.label.split(',').slice(0, 2).join(',')}.`);
    renderDirectory();
  }
  closeSearchResults();
}
```

Render bounded merchant options first and labelled place options second. Merchant options must call `selectMerchant`, preserving its cluster-aware popup behavior.

- [ ] **Step 4: Add keyboard and submit precedence**

```js
elements.searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    state.activeSearchResult = activeResultIndex(state.activeSearchResult, flatSearchResults().length, event.key === 'ArrowDown' ? 1 : -1);
    renderSearchResults();
  }
  if (event.key === 'Escape') closeSearchResults();
  if (event.key === 'Enter' && state.activeSearchResult >= 0) {
    event.preventDefault();
    chooseSearchResult(flatSearchResults()[state.activeSearchResult]);
  }
});
```

Form submission selects the active result, otherwise the first place suggestion, otherwise leaves local live results visible with a helpful status message.

- [ ] **Step 5: Run local checks**

Run: `node --test && node --check app.js && node --check merchant-utils.mjs && node scripts/build-pages.mjs && git diff --check`

Expected: PASS with only allowlisted static build outputs.

- [ ] **Step 6: Commit**

```bash
git add app.js merchant-utils.mjs tests/merchant-utils.test.mjs index.html styles.css
git commit -m "Unify live merchant and place discovery"
```

### Task 4: Browser regression verification

**Files:**
- No production-file changes expected.

**Interfaces:**
- Consumes: the localhost static page and public interactions from Tasks 1–3.
- Produces: recorded validation for live filtering, result selection, keyboard use, and lookup failure.

- [ ] **Step 1: Start the static server**

Run: `npm run dev`

Expected: the static page is available at the configured localhost URL.

- [ ] **Step 2: Verify live filtering**

Type `Tanjong Pagar` in the single header field. Confirm cards and pins narrow before submission; clear the field and confirm normal current-view results return.

- [ ] **Step 3: Verify merchant selection**

Choose a result inside a collapsed cluster. Confirm its pin becomes visible, its speech bubble opens, and repeating the selection does not recenter the map or re-open a closed popup.

- [ ] **Step 4: Verify place and keyboard selection**

Type `Arab Street`, press ArrowDown and Enter on a Singapore place result, and confirm the map moves and directory updates. Press Escape on a later query and confirm only the panel closes.

- [ ] **Step 5: Verify a failed place lookup**

Use browser request interception or offline mode after typing a merchant query. Confirm merchant filtering remains usable and the panel displays a non-blocking place-search message.

- [ ] **Step 6: Record final checks**

Run: `node --test && node scripts/build-pages.mjs && git status --short --branch`

Expected: tests and build pass; only intentional changes are present.
