# Clickable Place Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make exact-place actions visibly clickable and behaviorally consistent in merchant side-list cards and Leaflet popups.

**Architecture:** Keep exact-place identity and activation in the existing `locationCell`-based flow. Add small pure helpers for resolving a merchant's verified place group and generating escaped popup markup, then let `app.js` attach the existing activation path to both surfaces. One shared CSS component supplies the approved soft blue place chip while surface-specific classes only control positioning.

**Tech Stack:** Static HTML/CSS, browser JavaScript modules, Leaflet 1.9.4, Leaflet.markercluster 1.5.3, Node.js built-in test runner.

## Global Constraints

- Render a soft blue rounded chip with a small location marker, the place name only, and a trailing chevron.
- Use `locationCell` as the exact lookup and activation key; use `locationName` only for visible and accessible text.
- Clicking a place action must not trigger merchant selection or the Google Maps action.
- Reuse the existing `activateMerchantPlace(place)` flow and its one-time map fit; do not create a second place-filter path.
- Use native buttons, explicit `Show all merchants at <place>` accessible names, and visible `:focus-visible` styling.
- Missing verified place groups must not throw or expose broken interactive controls.
- Escape all merchant and place values inserted into popup HTML.
- Do not change merchant data, geocoding, clustering, place-search ranking, URL persistence, or external search providers.
- Add no runtime dependencies or DOM test framework.
- Increment browser cache-busting versions for every changed runtime asset.

---

## File Structure

- `merchant-utils.mjs`: own exact merchant-to-place resolution and escaped popup HTML generation as pure, Node-testable helpers.
- `tests/merchant-utils.test.mjs`: lock exact-key resolution, interactive popup markup, escaping, and non-interactive fallback behavior.
- `tests/place-action-ui.test.mjs`: lock the dependency-free browser wiring, shared component selectors, focus treatment, and cache-busting entrypoints.
- `app.js`: consume the helpers, bind popup place-button events, and populate the side-list place action without changing place activation state transitions.
- `index.html`: provide the shared place-action structure in the merchant-card template and bump runtime asset versions.
- `styles.css`: define the shared soft-chip component plus narrow surface-specific layout rules.
- `docs/superpowers/specs/2026-08-07-clickable-place-actions-design.md`: approved behavior and visual source of truth; no implementation edits expected.

### Task 1: Testable Place Resolution and Popup Markup

**Files:**
- Modify: `merchant-utils.mjs:1-22`
- Modify: `tests/merchant-utils.test.mjs:1-100`
- Test: `tests/merchant-utils.test.mjs`

**Interfaces:**
- Consumes: merchant records with `name`, `address`, `locationCell`, and `locationName`; verified place groups from `merchantPlaceGroups()`.
- Produces: `merchantPlaceFor(merchantPlaces, merchant) -> MerchantPlace | null` and `merchantPopupHtml(merchant, place = null) -> string`.

- [ ] **Step 1: Write failing tests for exact group resolution**

Add `merchantPlaceFor` to the import list and add this test after the existing place-group tests:

```js
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
```

- [ ] **Step 2: Run the focused test and verify the missing export fails**

Run:

```bash
node --test --test-name-pattern='merchantPlaceFor' tests/merchant-utils.test.mjs
```

Expected: FAIL because `merchantPlaceFor` is not exported.

- [ ] **Step 3: Implement exact group resolution**

Add this pure helper next to `merchantPlaceGroups`:

```js
export function merchantPlaceFor(merchantPlaces, merchant) {
  return merchantPlaces.find(({ locationCell }) => (
    locationCell === merchant.locationCell
  )) ?? null;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
node --test --test-name-pattern='merchantPlaceFor' tests/merchant-utils.test.mjs
```

Expected: PASS with the exact-key and missing-group assertions satisfied.

- [ ] **Step 5: Write failing tests for popup place markup and escaping**

Add `merchantPopupHtml` to the import list. Add tests covering an interactive verified group and a missing-group fallback:

```js
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
```

- [ ] **Step 6: Run the popup tests and verify the missing export fails**

Run:

```bash
node --test --test-name-pattern='merchantPopupHtml' tests/merchant-utils.test.mjs
```

Expected: FAIL because `merchantPopupHtml` is not exported.

- [ ] **Step 7: Implement escaped popup HTML generation**

Add a private escaping helper near `googleMapsSearchUrl`, then export `merchantPopupHtml`:

```js
function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>'"]/g,
    (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    })[character],
  );
}

export function merchantPopupHtml(merchant, place = null) {
  const placeMarkup = place
    ? `<button class="place-action merchant-popup-place" type="button" data-location-cell="${escapeHtml(place.locationCell)}" aria-label="Show all merchants at ${escapeHtml(place.locationName)}">
        <span class="place-action-marker" aria-hidden="true">●</span>
        <span class="place-action-label">${escapeHtml(place.locationName)}</span>
        <span class="place-action-chevron" aria-hidden="true">›</span>
      </button>`
    : `<p class="merchant-popup-location">${escapeHtml(merchant.locationName)}</p>`;
  const gmapUrl = googleMapsSearchUrl(merchant);

  return `<div class="merchant-popup">
    <h2>${escapeHtml(merchant.name)}</h2>
    ${placeMarkup}
    <p>${escapeHtml(merchant.address)}</p>
    <a class="gmap-link" href="${escapeHtml(gmapUrl)}" target="_blank" rel="noopener noreferrer">gmap ↗</a>
  </div>`;
}
```

- [ ] **Step 8: Run utility tests and syntax checks**

Run:

```bash
node --test tests/merchant-utils.test.mjs
node --check merchant-utils.mjs
```

Expected: all merchant utility tests PASS and the module parses successfully.

- [ ] **Step 9: Commit the pure helper slice**

```bash
git add merchant-utils.mjs tests/merchant-utils.test.mjs
git commit -m "Make popup place actions safe to render"
```

Use the repository Lore trailers, including the focused test and syntax evidence.

### Task 2: Shared Place Chip in Cards and Popups

**Files:**
- Modify: `app.js:1-18,124-209,258-260`
- Modify: `index.html:12,59-70,75`
- Modify: `styles.css:79-98,110-123`
- Create: `tests/place-action-ui.test.mjs`
- Test: `tests/place-action-ui.test.mjs`

**Interfaces:**
- Consumes: `merchantPlaceFor(merchantPlaces, merchant)` and `merchantPopupHtml(merchant, place)` from Task 1, plus the existing `activateMerchantPlace(place)` in `app.js`.
- Produces: side-list and popup buttons with `.place-action`; popup activation delegates to `activateMerchantPlace(place)`; missing groups expose no broken button.

- [ ] **Step 1: Write a failing browser-wiring contract test**

Create `tests/place-action-ui.test.mjs` without adding a DOM dependency:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function runtimeSource(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('card and popup place actions share accessible browser wiring', async () => {
  const [app, index, styles] = await Promise.all([
    runtimeSource('app.js'),
    runtimeSource('index.html'),
    runtimeSource('styles.css'),
  ]);

  assert.match(index, /class="merchant-location place-action"/);
  assert.match(index, /class="place-action-label merchant-location-label"/);
  assert.match(app, /merchantPopupHtml\(merchant, place\)/);
  assert.match(
    app,
    /querySelector\('\.merchant-popup-place'\)[\s\S]+button\.addEventListener\('click', \(\) => activateMerchantPlace\(place\)\)/,
  );
  assert.match(styles, /\.place-action\s*\{/);
  assert.match(styles, /\.place-action:focus-visible\s*\{/);
  assert.match(index, /styles\.css\?v=12/);
  assert.match(index, /app\.js\?v=19/);
  assert.match(app, /merchant-utils\.mjs\?v=7/);
});
```

- [ ] **Step 2: Run the browser-wiring test and verify it fails**

Run:

```bash
node --test tests/place-action-ui.test.mjs
```

Expected: FAIL because the shared template markup, popup binding, styles, and new asset versions are not present.

- [ ] **Step 3: Add the shared card action structure**

Replace the empty merchant-location button in `index.html` with:

```html
<button class="merchant-location place-action" type="button">
  <span class="place-action-marker" aria-hidden="true">●</span>
  <span class="place-action-label merchant-location-label"></span>
  <span class="place-action-chevron" aria-hidden="true">›</span>
</button>
```

Do not add a merchant count.

- [ ] **Step 4: Import the Task 1 helpers and remove duplicated popup escaping**

Add `merchantPlaceFor` and `merchantPopupHtml` to the import from `merchant-utils.mjs`. Remove `escapeHtml()` from `app.js` after replacing its only caller in `renderMarkers`.

Expected import fragment:

```js
import {
  // existing imports
  merchantPlaceFor,
  merchantPopupHtml,
  // existing imports
} from './merchant-utils.mjs?v=7';
```

- [ ] **Step 5: Render popup actions from the verified exact group**

At the start of each `renderMarkers()` iteration, resolve the group and bind the pure popup markup:

```js
const place = merchantPlaceFor(state.merchantPlaces, merchant);
marker.bindPopup(merchantPopupHtml(merchant, place));
```

Delete the old inline popup template and its local `gmapUrl` variable.

- [ ] **Step 6: Attach one popup action listener per rendered popup button**

Create one module-level `WeakSet` before `renderMarkers`:

```js
const boundPopupPlaceButtons = new WeakSet();
```

Inside the marker loop, add:

```js
marker.on('popupopen', ({ popup }) => {
  const button = popup.getElement()?.querySelector('.merchant-popup-place');
  if (!button || !place || boundPopupPlaceButtons.has(button)) return;

  boundPopupPlaceButtons.add(button);
  button.addEventListener('click', () => activateMerchantPlace(place));
});
```

This keeps the listener out of HTML, prevents duplicate listeners across reopen events, and safely does nothing when no verified group exists.

- [ ] **Step 7: Populate and guard the side-list place action**

Replace the inline `.find()` with the shared exact lookup:

```js
const place = merchantPlaceFor(state.merchantPlaces, merchant);
```

Populate only the text span and hide the button if the group is unavailable:

```js
const locationLabel = locationButton.querySelector('.merchant-location-label');
locationButton.hidden = !place;
if (place) {
  locationLabel.textContent = place.locationName;
  locationButton.setAttribute('aria-label', `Show all merchants at ${place.locationName}`);
  locationButton.addEventListener('click', () => activateMerchantPlace(place));
}
```

Do not attach a place handler to the merchant-card overlay or `gmap` link.

- [ ] **Step 8: Implement the shared soft-chip styles**

Replace the old underline-only `.merchant-location` rules with a shared component and narrow positioning rules:

```css
.place-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 5px 8px;
  border: 0;
  border-radius: 99px;
  background: #e8f3fb;
  color: var(--deep-blue);
  font-size: .75rem;
  font-weight: 750;
  line-height: 1.2;
  text-align: left;
}
.place-action:hover { background: #d9ecf7; }
.place-action:active { background: #cce5f4; }
.place-action:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.place-action-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.place-action-marker, .place-action-chevron { flex: none; }
.merchant-location { justify-self: start; }
.merchant-popup-place { margin: 2px 0 5px; }
.merchant-popup-location { margin: 4px 0; }
```

Keep `.merchant-card > .merchant-location` in the existing pointer-event exception so the card overlay cannot intercept the action.

- [ ] **Step 9: Increment changed browser asset versions**

Update `index.html` to load:

```html
<link rel="stylesheet" href="styles.css?v=12" />
<script type="module" src="app.js?v=19"></script>
```

Update `app.js` to import:

```js
} from './merchant-utils.mjs?v=7';
```

- [ ] **Step 10: Run the focused browser-wiring test and full automated checks**

Run:

```bash
node --test tests/place-action-ui.test.mjs
node --test
node --check app.js
node --check merchant-utils.mjs
for file in scripts/*.mjs; do node --check "$file" || exit 1; done
node scripts/build-pages.mjs
find .pages-dist -type f | sort
git diff --check
```

Expected: all tests and syntax checks PASS; the Pages artifact contains exactly `.nojekyll`, `app.js`, `data/merchants.json`, `index.html`, `merchant-utils.mjs`, and `styles.css`; no whitespace errors.

- [ ] **Step 11: Commit the integrated visual behavior**

```bash
git add app.js index.html styles.css tests/place-action-ui.test.mjs
git commit -m "Make merchant places visibly actionable"
```

Use the repository Lore trailers, naming the preserved exact-place activation path and automated evidence.

### Task 3: Browser Interaction and Responsive Verification

**Files:**
- Verify: `app.js`
- Verify: `index.html`
- Verify: `styles.css`
- Verify: `merchant-utils.mjs`
- Verify: `tests/merchant-utils.test.mjs`

**Interfaces:**
- Consumes: the completed shared place action from Tasks 1 and 2.
- Produces: browser evidence that card and popup actions are visually consistent, accessible, independent, and connected to the same exact-place behavior.

- [ ] **Step 1: Build the deployable artifact and serve it locally**

Run:

```bash
node scripts/build-pages.mjs
python3 -m http.server 4173 --directory .pages-dist
```

Expected: the built map loads at `http://127.0.0.1:4173/` without missing application assets.

- [ ] **Step 2: Verify side-list action behavior with mouse and keyboard**

In the browser:

1. Find a merchant at Westgate.
2. Confirm the side-list place action is a soft blue chip containing only `● Westgate ›`.
3. Click the chip and verify all Westgate merchants are shown, the active search chip appears, and the map fits once.
4. Clear the active place, return to a Westgate card, Tab to the place action, and press Enter.
5. Verify the same exact-place behavior occurs and focus styling is clearly visible.
6. Verify neither activation selects the individual merchant nor opens the `gmap` link.

- [ ] **Step 3: Verify popup action behavior and independent controls**

In the browser:

1. Select a merchant marker to open its popup.
2. Confirm the popup place action matches the side-list soft chip and contains no merchant count.
3. Click the popup place chip and verify it activates the exact same place scope and one-time fit.
4. Reopen a popup and activate its place chip again to detect duplicate-listener effects; one activation and one render should occur.
5. Open the Google Maps link separately and verify it still targets the merchant/address.
6. Verify merchant-card and marker selection still open the intended merchant popup independently.

- [ ] **Step 4: Verify accessibility and responsive presentation**

Use browser inspection without editing committed merchant data:

1. Inspect both interactive controls for native `button` semantics and `Show all merchants at <place>` accessible names.
2. Check hover, active, and `:focus-visible` states.
3. Check desktop, 820 px, and 460 px viewport widths.
4. Confirm long place names stay inside the card/popup without horizontal overflow and retain their full accessible name.
5. Keep the automated missing-group fallback test green; do not alter production merchant data to manufacture a browser fixture.

- [ ] **Step 5: Run final repository verification**

Run:

```bash
node --test
node --check app.js
node --check merchant-utils.mjs
for file in scripts/*.mjs; do node --check "$file" || exit 1; done
node scripts/build-pages.mjs
find .pages-dist -type f | sort
git diff --check
git status --short
```

Expected: all tests and syntax checks PASS; the exact six-file Pages allowlist is present; no whitespace errors; only intended tracked files are changed.

- [ ] **Step 6: Commit any browser-QA correction, otherwise record verification only**

If browser QA required a source correction, first rerun the focused failing scenario and final checks, then commit only the correction:

```bash
git add app.js index.html styles.css merchant-utils.mjs tests/merchant-utils.test.mjs tests/place-action-ui.test.mjs
git commit -m "Polish place action interaction evidence"
```

If no source correction was required, do not create an empty commit; record the exact browser and command evidence in the execution report.

---

## Completion Criteria

- Side-list and popup place names use the approved soft blue chip with marker, place name only, and chevron.
- Both surfaces resolve and activate the exact `locationCell` group through `activateMerchantPlace(place)`.
- Popup markup escapes all dynamic text and uses no inline JavaScript.
- Missing groups fall back safely without broken controls.
- Merchant selection and Google Maps actions remain independent.
- Mouse, keyboard, focus-visible, long-name, and responsive checks pass.
- Full Node tests, syntax checks, Pages build, six-file artifact allowlist, and `git diff --check` pass.
