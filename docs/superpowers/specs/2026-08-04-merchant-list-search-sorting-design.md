# Merchant List Search and Sorting

## Goal

Make merchants in the current map view easier to scan and compare by adding list search, alphabetical ordering, and optional distance ordering from an explicit map-center origin.

## Directory Controls

- Add a compact control block above the merchant list and below the category filters.
- Provide a search field labelled `Search merchants in this view`.
- Provide an accessible two-option sort control with `A–Z` and `Nearest` choices.
- Use `A–Z` as the default.
- Keep the controls visible while the merchant list scrolls and preserve their values while the user moves or zooms the map or changes category.
- On narrow screens, stack the search field and sort control without changing their behavior.

The existing header search remains dedicated to finding a Singapore address or neighbourhood. The new directory search only filters merchants already eligible for the current map view.

## Filtering and Ordering

The directory pipeline is:

1. Keep only OneMap-verified merchants inside the current map bounds.
2. Apply the active category filter.
3. Apply case-insensitive text search across merchant name, named location or mall, and full address.
4. Sort the resulting merchants.

Alphabetical ordering compares merchant names with Singapore-aware, case-insensitive collation. Ties use named location, address, and stable merchant ID so rerenders do not reorder equal names unpredictably.

Distance ordering uses straight-line distance from the current map center to each merchant coordinate. Ties fall back to the same alphabetical order. Distance is calculated locally; it does not claim walking or driving distance.

The filtered and sorted collection drives both the list and marker layer, so visible pins remain consistent with the directory. The count reflects the resulting merchant set. If search removes every merchant, show a search-specific empty state that suggests clearing or changing the query.

## Distance Origin

- `Nearest` uses the current Leaflet map center as its base location.
- Show a small, non-interactive center marker only while `Nearest` is active.
- Keep that marker outside the merchant cluster layer so it cannot be grouped with merchants or selected as a place.
- Update its position and recompute ordering after each completed map movement.
- Show a compact distance value on each merchant card while `Nearest` is active, using metres below 1 km and kilometres otherwise.
- Switching back to `A–Z` removes the center marker and distance labels.

The marker represents the sorting origin, not a verified user location. Address lookup and geolocation may move the map center, but they do not create a separate persistent distance origin.

## Interaction Boundaries

- Merchant search must not invoke the address-geocoding endpoint.
- Search input updates the list and pins immediately; the directory size is small enough that debouncing is unnecessary.
- Existing category filters combine with text search rather than clearing it.
- Selecting list items, expanding clusters, opening or closing merchant popups, and manually zooming retain their existing behavior.
- Changing sort order must not recenter or zoom the map.
- The distance-origin marker must not open a popup or intercept merchant selection.

## Implementation Shape

- Add pure utilities for normalizing and matching merchant search text, deterministic alphabetical comparison, Haversine distance, and list ordering.
- Store the directory query and sort mode alongside the existing category and selection state.
- Keep the center-origin marker as a separate Leaflet layer managed when sort mode changes or the map finishes moving.
- Render distance text into a dedicated optional element in the existing merchant card template.
- Keep the GitHub Pages runtime allowlist unchanged because no new browser runtime file is required.

## Accessibility and Responsive Behavior

- Give the search field a visible label or equivalent accessible name.
- Implement the sort control as real buttons with pressed state, keyboard focus, and clear selected styling.
- Announce count changes through the existing status and live-region behavior without moving keyboard focus.
- Ensure the center marker is decorative and excluded from keyboard navigation.

## Verification

- Unit-test search matching across merchant name, location, and address, including case differences and whitespace.
- Unit-test deterministic A–Z ordering and alphabetical tie breakers.
- Unit-test distance calculation, distance formatting, and nearest-first ordering with alphabetical ties.
- Browser-test that search filters both cards and pins, clearing search restores them, and category filtering composes with search.
- Browser-test that A–Z is the initial order and `Nearest` reorders cards without changing the map center.
- Browser-test that the origin marker appears only in `Nearest`, follows completed map movement, and does not cluster.
- Recheck popup close, repeated list clicks, clustering, manual zoom, responsive layout, and static Pages artifact creation.

## Alternatives Rejected

- A single sort dropdown uses less space but makes distance sorting less discoverable than a two-option control.
- Placing merchant search on the map would compete with the existing address search and confuse merchant filtering with map navigation.
- A fixed or draggable distance origin adds extra state and controls that are unnecessary when the current map center already communicates the browsing context.
