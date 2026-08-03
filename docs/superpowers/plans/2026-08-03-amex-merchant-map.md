# Amex Singapore Merchant Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable static directory that maps the supplied Amex Singapore merchants and keeps an interactive list in sync with the map viewport.

**Architecture:** A Node data script parses the source CSV into `data/merchants.json`, assigning deterministic shared Singapore anchors per mall/street/address. A dependency-free browser app loads that JSON, renders Leaflet markers and a filtered merchant list, and uses public geocoding only for a visitor-entered address.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node.js standard library, Leaflet 1.9 CDN, OpenStreetMap tiles, Nominatim address search.

## Global Constraints

- The CSV is the source of truth and remains unmodified.
- The result must deploy to a conventional static host without a build server.
- Merchant locations use reusable approximate anchors, not unit-level geocoding claims.
- Map browsing must continue when browser geolocation or address geocoding is unavailable.
- Do not add an API key or package dependency.

---

### Task 1: Generate the static merchant dataset

**Files:**
- Create: `scripts/build-data.mjs`
- Create: `data/merchants.json`
- Create: `tests/build-data.test.mjs`

**Interfaces:**
- Consumes: `amex_sg_shop_small_merchant_directory.csv` with `mall_or_street`, `mall_or_street_name`, `merchant_category`, `merchant_name`, and `address` columns.
- Produces: JSON object `{ generatedAt: string, merchants: Merchant[] }`, where `Merchant` is `{ id: string, name: string, category: string, locationName: string, address: string, latitude: number, longitude: number }`.

- [ ] **Step 1: Write the failing dataset test**

```js
import assert from 'node:assert/strict';
import { buildMerchantDataset } from '../scripts/build-data.mjs';

const result = buildMerchantDataset('mall_or_street,mall_or_street_name,merchant_category,merchant_name,address\\nIn-Mall,Westgate,RESTAURANT,Cafe,3 Gateway Drive Singapore 608532\\n');
assert.equal(result.merchants.length, 1);
assert.match(result.merchants[0].id, /^merchant-/);
assert.ok(result.merchants[0].latitude >= 1.2 && result.merchants[0].latitude <= 1.5);
assert.ok(result.merchants[0].longitude >= 103.6 && result.merchants[0].longitude <= 104.1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/build-data.test.mjs`

Expected: FAIL because `scripts/build-data.mjs` does not exist.

- [ ] **Step 3: Write the generator**

```js
export function buildMerchantDataset(csvText) {
  // Parse quoted CSV rows, normalize anchor keys, then return merchant records.
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  // Read the source CSV and write data/merchants.json.
}
```

Use a fixed anchor catalogue for well-known malls plus deterministic micro-offsets inside Singapore bounds for unmatched anchors. The offset must be based only on the normalized anchor key so reruns are stable.

- [ ] **Step 4: Run data tests and generate the browser dataset**

Run: `node --test tests/build-data.test.mjs && node scripts/build-data.mjs`

Expected: PASS and `data/merchants.json` contains all CSV merchant rows.

- [ ] **Step 5: Commit the data pipeline**

```bash
git add scripts/build-data.mjs tests/build-data.test.mjs data/merchants.json
git commit -m "Make merchant locations available to a static map"
```

### Task 2: Create the responsive static map shell

**Files:**
- Create: `index.html`
- Create: `styles.css`

**Interfaces:**
- Consumes: Leaflet CSS and JS from the official CDN plus DOM IDs `map`, `merchant-list`, `search-form`, `search-input`, `locate-button`, `status`, and `merchant-count`.
- Produces: an accessible responsive shell that `app.js` can populate.

- [ ] **Step 1: Write the initial page structure**

```html
<main class="app-shell">
  <section class="map-panel"><div id="map" aria-label="Merchant map"></div></section>
  <aside class="directory-panel"><div id="merchant-list"></div></aside>
</main>
```

Include a header with the search form, location button, status region (`aria-live="polite"`), map legend, category filter container, and visible merchant count.

- [ ] **Step 2: Add the responsive visual system**

```css
.app-shell { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(20rem, .8fr); }
@media (max-width: 760px) { .app-shell { grid-template-columns: 1fr; } }
```

Give the map a minimum desktop height, accessible focus styles, compact filter chips, marker/list selection states, and a list that scrolls only on desktop.

- [ ] **Step 3: Inspect the page structure**

Run: `rg -n 'map|merchant-list|search-form|locate-button|aria-live' index.html`

Expected: every required integration point is present exactly once.

- [ ] **Step 4: Commit the shell**

```bash
git add index.html styles.css
git commit -m "Give the merchant directory a responsive static shell"
```

### Task 3: Implement synchronized map, list, search, and location controls

**Files:**
- Create: `app.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `data/merchants.json` and all DOM IDs defined in Task 2.
- Produces: `initializeDirectory()` that loads merchants, draws Leaflet markers, filters by `map.getBounds()` and active category, and updates the status/count/list.

- [ ] **Step 1: Add the map/list implementation**

```js
async function initializeDirectory() {
  const response = await fetch('./data/merchants.json');
  const { merchants } = await response.json();
  const map = L.map('map').setView([1.3521, 103.8198], 11);
  // Render markers and synchronize on `moveend`.
}
```

Implement `visibleMerchants()` with `map.getBounds().contains([merchant.latitude, merchant.longitude])`, `renderMerchantList(items)`, `renderMarkers(items)`, and `setStatus(message, isError = false)`. Card and marker clicks must pan to the merchant location and apply the shared `.is-selected` state.

- [ ] **Step 2: Add address search and browser location flows**

```js
async function searchAddress(query) {
  const url = \`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=\${encodeURIComponent(query + ', Singapore')}\`;
  const [result] = await (await fetch(url, { headers: { Accept: 'application/json' } })).json();
  if (!result) throw new Error('No Singapore address was found.');
  map.setView([Number(result.lat), Number(result.lon)], 15);
}
```

Use `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: false`, `timeout: 10000`, and a friendly denial/error status. On data or network failure, retain the page shell and show the problem in the live status region.

- [ ] **Step 3: Perform a browser smoke test**

Run: `python3 -m http.server 4173` and open `http://localhost:4173`.

Expected: Singapore map tiles render, merchant count appears, moving the map changes the list, and list cards pan the map. Confirm a known address search returns a location or the inline unavailable state.

- [ ] **Step 4: Commit interaction behavior**

```bash
git add app.js index.html
git commit -m "Connect merchant data to map and viewport directory"
```

### Task 4: Document static use and release verification

**Files:**
- Create: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the generated-data command from Task 1 and static files from Tasks 2-3.
- Produces: concise instructions for regeneration, local preview, and deployment.

- [ ] **Step 1: Document the concrete workflow**

```md
node scripts/build-data.mjs
python3 -m http.server 4173
```

State that any static host should publish the repository root, the data is approximate location-cell placement, and address search/geolocation depend on browser/network permission.

- [ ] **Step 2: Add ignore rules**

```gitignore
.DS_Store
node_modules/
```

- [ ] **Step 3: Run release checks**

Run: `node --test tests/build-data.test.mjs && node scripts/build-data.mjs && git diff --check && git status --short`

Expected: data test passes, regenerated JSON is deterministic, and `git diff --check` reports no whitespace errors.

- [ ] **Step 4: Commit documentation and final checks**

```bash
git add README.md .gitignore data/merchants.json
git commit -m "Document the deployable merchant-map prototype"
```

## Coverage self-review

- Map zooming and overview: Task 3 initializes Leaflet and renders viewport-driven markers.
- Current-view merchant list and category filters: Task 2 provides controls; Task 3 applies bounds and category filtering.
- Address and current-location views: Task 3 supplies both flows and explicit failure states.
- Static deployment and source-data lifecycle: Tasks 1 and 4 provide generated JSON and reproducible instructions.
- No API key and approximate anchors: enforced in Global Constraints and Task 1.

