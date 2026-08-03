# Amex Singapore Small Merchant Map

## Goal

Deliver a static, interactive directory for the supplied Singapore Amex small-merchant CSV. Visitors can browse merchants on a zoomable map, see only merchants inside the current viewport, search for an address, or center the map on their current location.

## Approach

The build produces a compact browser-ready merchant dataset from the CSV. It assigns every merchant to a reusable location cell: normally a mall/street/address anchor with a latitude and longitude. This is geohash-like in purpose: shared locations collapse naturally at lower zoom and expand as a visitor zooms in. The original CSV remains the editable source.

The static page uses Leaflet with OpenStreetMap tiles. Marker clustering prevents dense mall locations from overwhelming the map. A map-bounds update filters the list pane and its merchant count. Category filters are client-side and combine with the current bounds.

## Experience

- The opening viewport covers Singapore and announces the directory count.
- A location-search field geocodes an entered address and centers the map on it.
- A “Use my location” action requests browser geolocation; denial leaves the map usable and explains the next step.
- Markers represent individual locations or clusters. Selecting a marker opens a merchant summary and highlights matching list entries.
- The side list shows merchant name, category, location name, and address for merchants in the map viewport. Selecting a card pans to its location.
- The layout is responsive: a desktop split pane becomes a map followed by the list on small screens.

## Files and deployment

- `index.html`, `styles.css`, and `app.js` form the no-build static application.
- `data/merchants.json` is the generated browser dataset.
- `scripts/build-data.mjs` reads the CSV and emits the dataset. It deduplicates location anchors before coordinate assignment.
- `README.md` documents local preview, data regeneration, and static-host deployment.

The prototype will include representative Singapore location coordinates so it works without a network geocoding batch. Address search uses a public geocoding endpoint at run time; the page remains fully functional for map and list browsing if that endpoint is unavailable.

## Failure handling and verification

- Geolocation and search failures show inline feedback rather than blocking browsing.
- Loading the data shows a useful fallback error if the static JSON is unavailable.
- The generated dataset is checked for a valid merchant shape and bounded Singapore coordinates.
- A local static-server smoke test confirms the page and data load.

## Explicit prototype limits

Exact rooftop geocoding for every merchant is outside this prototype. Locations are deliberately shared anchors, not claims of exact unit-level placement. OpenStreetMap tiles and the public geocoder are third-party services with their own availability and usage policies.
