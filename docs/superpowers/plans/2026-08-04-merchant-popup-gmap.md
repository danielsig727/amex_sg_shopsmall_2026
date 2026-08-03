# Merchant Popup and Google Maps Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open persistent merchant detail popups from map pins and directory selections, with matching Google Maps search links in both surfaces.

**Architecture:** A pure `googleMapsSearchUrl(merchant)` utility owns external-link generation. The map renderer keeps a marker lookup keyed by merchant ID so the selected merchant's newly rendered marker can reopen its popup after any state-driven rerender. Directory cards separate the selection button from the external hyperlink to preserve valid, accessible HTML.

**Tech Stack:** Static HTML, CSS, JavaScript ES modules, Leaflet 1.9.4, Node.js built-in test runner.

## Global Constraints

- Remain deployable as a static page with no Google Places API dependency.
- Google Maps navigation is best-effort and opens in a new tab.
- Use merchant name plus full source address in the Google Maps search query.
- Escape all merchant content interpolated into popup HTML.
- Keep list selection and external navigation as separate semantic controls.

---

### Task 1: Google Maps Search URL

**Files:**
- Create: `merchant-utils.mjs`
- Create: `tests/merchant-utils.test.mjs`
- Modify: `index.html:12,56`

**Interfaces:**
- Consumes: merchant objects with `name: string` and `address: string`.
- Produces: `googleMapsSearchUrl(merchant): string`, imported by `app.js` in Task 2.

- [ ] **Step 1: Write the failing URL-generation test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { googleMapsSearchUrl } from '../merchant-utils.mjs';

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
```

- [ ] **Step 2: Run the test and verify the missing module fails**

Run: `node --test tests/merchant-utils.test.mjs`

Expected: FAIL because `merchant-utils.mjs` does not exist.

- [ ] **Step 3: Implement the pure URL generator**

```js
export function googleMapsSearchUrl(merchant) {
  const query = `${merchant.name}, ${merchant.address}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
```

- [ ] **Step 4: Convert the application entry point to an ES module**

In `index.html`, change the local stylesheet cache key to `styles.css?v=3`, then replace:

```html
<script src="app.js"></script>
```

with:

```html
<script type="module" src="app.js?v=3"></script>
```

- [ ] **Step 5: Run the utility and existing tests**

Run: `node --test tests/merchant-utils.test.mjs tests/build-data.test.mjs`

Expected: 6 tests pass.

- [ ] **Step 6: Commit the utility boundary**

```bash
git add merchant-utils.mjs tests/merchant-utils.test.mjs index.html
git commit -m "Create a shared Google Maps merchant search contract"
```

### Task 2: Shared Popup Interaction and Semantic List Links

**Files:**
- Modify: `app.js:1-115`
- Modify: `index.html:42-49`
- Modify: `styles.css:58-67`

**Interfaces:**
- Consumes: `googleMapsSearchUrl(merchant): string` from `merchant-utils.mjs`.
- Produces: a marker lookup at `state.markersByMerchantId`, persistent selected-merchant popups, and sibling `.merchant-select` / `.gmap-link` controls in each `.merchant-card`.

- [ ] **Step 1: Run a failing browser interaction check against current behavior**

At `http://localhost:4173/`, select one visible merchant card and assert all of the following in the browser:

```js
({
  popupCount: document.querySelectorAll('.leaflet-popup').length,
  listGmapCount: document.querySelectorAll('.merchant-card .gmap-link').length,
  popupGmapCount: document.querySelectorAll('.leaflet-popup .gmap-link').length,
})
```

Expected before implementation: `popupCount === 0`, `listGmapCount === 0`, and `popupGmapCount === 0`.

- [ ] **Step 2: Import the URL utility and retain marker identities**

Add to the top of `app.js`:

```js
import { googleMapsSearchUrl } from './merchant-utils.mjs';
```

Extend state with:

```js
markersByMerchantId: new Map(),
```

At the start of `renderMarkers`, clear the lookup after clearing the layer. After creating each marker, store it:

```js
state.markersByMerchantId.set(merchant.id, marker);
```

After all markers have been added, ask the cluster layer to reveal the selected marker and reopen its popup. This covers directory selections whose marker is inside a cluster:

```js
const selectedMarker = state.markersByMerchantId.get(state.selectedMerchant);
if (selectedMarker) {
  state.markerLayer.zoomToShowLayer(selectedMarker, () => selectedMarker.openPopup());
}
```

- [ ] **Step 3: Add place details and the Google Maps link to popup markup**

Replace the popup body with:

```js
const gmapUrl = googleMapsSearchUrl(merchant);
marker.bindPopup(`
  <div class="merchant-popup">
    <h2>${escapeHtml(merchant.name)}</h2>
    <p>${escapeHtml(merchant.locationName)}</p>
    <p>${escapeHtml(merchant.address)}</p>
    <a class="gmap-link" href="${gmapUrl}" target="_blank" rel="noopener noreferrer">gmap ↗</a>
  </div>
`);
```

- [ ] **Step 4: Separate list selection from external navigation**

Change the template in `index.html` to:

```html
<article class="merchant-card">
  <button class="merchant-select" type="button">
    <span class="merchant-category"></span>
    <strong class="merchant-name"></strong>
    <span class="merchant-location"></span>
    <span class="merchant-address"></span>
  </button>
  <a class="gmap-link" target="_blank" rel="noopener noreferrer">gmap ↗</a>
</article>
```

In `renderMerchantList`, bind selection to `.merchant-select`, then populate the sibling link:

```js
const selectButton = card.querySelector('.merchant-select');
const gmapLink = card.querySelector('.gmap-link');
selectButton.addEventListener('click', () => selectMerchant(merchant.id, true));
gmapLink.href = googleMapsSearchUrl(merchant);
gmapLink.setAttribute('aria-label', `Open ${merchant.name} in Google Maps`);
```

- [ ] **Step 5: Style the semantic card controls without changing card density**

Replace the current `.merchant-card` interaction rules with:

```css
.merchant-card { position: relative; border-bottom: 1px solid var(--line); background: white; }
.merchant-select { width: 100%; display: grid; gap: 3px; padding: 15px 68px 15px 11px; text-align: left; border: 0; background: transparent; color: var(--ink); }
.merchant-card:hover, .merchant-card.is-selected { background: #f1f8fc; box-shadow: inset 3px 0 var(--blue); }
.merchant-select:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
.merchant-card > .gmap-link { position: absolute; top: 15px; right: 11px; }
.gmap-link { color: var(--deep-blue); font-size: .72rem; font-weight: 750; text-decoration: underline; text-underline-offset: 2px; }
```

- [ ] **Step 6: Verify both interaction paths in the browser**

Reload `http://localhost:4173/`, then:

1. Click one individual map pin at a zoom level where it is not clustered.
2. Assert one `.leaflet-popup` is visible and contains merchant name, address, and one `.gmap-link`.
3. Close or change selection, click a directory `.merchant-select`, and assert the popup is visible after the map rerenders.
4. Assert the list and popup link `href` values match, both have `target="_blank"`, and both have `rel="noopener noreferrer"`.
5. Assert browser console errors are empty.

- [ ] **Step 7: Run the full static verification suite**

Run:

```bash
node --test tests/merchant-utils.test.mjs tests/build-data.test.mjs
node --input-type=module --check < app.js
node --check merchant-utils.mjs
git diff --check
```

Expected: 6 tests pass, syntax checks exit successfully, and no whitespace errors are reported.

- [ ] **Step 8: Commit the completed interaction**

```bash
git add app.js index.html styles.css merchant-utils.mjs tests/merchant-utils.test.mjs
git commit -m "Open merchant details consistently from map and list"
```
