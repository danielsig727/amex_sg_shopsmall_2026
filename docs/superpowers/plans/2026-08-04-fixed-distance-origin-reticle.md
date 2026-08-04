# Fixed Distance-Origin Reticle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the nearest-sort origin visibly fixed at the map viewport center while users drag and zoom.

**Architecture:** Replace the Leaflet geographic `L.circleMarker` with a sibling HTML reticle positioned over `#map`. `app.js` only toggles its visibility based on sort mode; the existing `mapCenterOrigin()` remains the source for sorting and distance labels.

**Tech Stack:** Vanilla HTML/CSS/ES modules, Leaflet, Node built-in test runner, static GitHub Pages build.

## Global Constraints

- The reticle is non-interactive and remains fixed during drag and zoom.
- It is visible only for `Nearest` and hidden for `A–Z`.
- Distance calculations continue to use `map.getCenter()`.
- Merchant pins, clusters, popups, and location markers are unchanged.

---

### Task 1: Add the viewport-fixed reticle

**Files:**
- Modify: `index.html:31-33`
- Modify: `styles.css:55-61`

**Interfaces:**
- Produces: `#distance-origin-reticle`, an HTML element within `.map-panel` and above `#map`.
- Produces: `.distance-origin-reticle`, an absolute, pointer-events-free center reticle.

- [ ] **Step 1: Add the hidden reticle beside the map element**

```html
<div id="map" aria-label="Interactive map of Amex small merchants in Singapore"></div>
<div id="distance-origin-reticle" class="distance-origin-reticle" aria-hidden="true" hidden></div>
```

- [ ] **Step 2: Add the fixed overlay styling**

```css
.distance-origin-reticle {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 600;
  width: 14px;
  height: 14px;
  border: 3px solid var(--deep-blue);
  border-radius: 50%;
  background: white;
  pointer-events: none;
  transform: translate(-50%, -50%);
}
```

- [ ] **Step 3: Verify the static structure**

Run: `node scripts/build-pages.mjs && rg -n "distance-origin-reticle|distance-origin-marker" index.html styles.css app.js`

Expected: the reticle markup and CSS exist; the old marker style remains only until Task 2 removes its Leaflet use.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "Render nearest origin at the viewport center"
```

### Task 2: Toggle the reticle without changing distance origin

**Files:**
- Modify: `app.js:20-100`

**Interfaces:**
- Consumes: `elements.distanceOriginReticle`, `state.sortMode`, and `mapCenterOrigin()`.
- Produces: `updateDistanceOriginReticle()`, which sets `hidden` to `state.sortMode !== 'distance'`.
- Removes: `state.distanceOriginMarker` and all `L.circleMarker` management for nearest sorting.

- [ ] **Step 1: Replace the Leaflet-marker state and element reference**

```js
const elements = {
  distanceOriginReticle: document.querySelector('#distance-origin-reticle'),
  // existing elements
};

const state = {
  // existing fields, excluding distanceOriginMarker
};
```

- [ ] **Step 2: Replace geographic-marker updates with a visibility toggle**

```js
function updateDistanceOriginReticle() {
  elements.distanceOriginReticle.hidden = state.sortMode !== 'distance';
}
```

Call this from `renderDirectory()` before `directoryMerchants()`. Keep `mapCenterOrigin()` unchanged in `directoryMerchants()` and `renderMerchantList()`.

- [ ] **Step 3: Run local verification**

Run: `node --test && node --check app.js && node scripts/build-pages.mjs && git diff --check`

Expected: all existing tests pass, the browser asset build succeeds, and no `L.circleMarker` is created for nearest sorting.

- [ ] **Step 4: Verify in the browser**

Select `Nearest`, drag the map, and confirm the reticle does not move relative to the viewport while distance labels update after the move. Select `A–Z` and confirm the reticle is hidden. Zoom once in each mode and confirm merchant pins and controls remain usable.

- [ ] **Step 5: Commit**

```bash
git add app.js index.html styles.css
git commit -m "Keep nearest origin fixed while the map moves"
```
