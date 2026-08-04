# Fixed distance-origin reticle design

## Goal

Show the nearest-sort origin as a screen-fixed reticle at the visual center of the map, rather than as a geographic marker that moves while the map is dragged.

## Interaction

- The reticle is a non-interactive element layered above the Leaflet map pane and visually remains at the center during drag and zoom gestures.
- It is visible only while the directory sort mode is `Nearest` and is hidden in `A–Z` mode.
- Distance ordering and distance labels continue to use `map.getCenter()`; their geographic origin changes naturally as the user moves the map.

## Boundaries and verification

- Remove the Leaflet `L.circleMarker` used solely for this indicator; do not change merchant pins, clusters, popup selection, or location markers.
- Use HTML/CSS visibility state instead of map overlays so drag animation cannot reposition the reticle.
- Verify toggling modes, dragging, zooming, and existing nearest ordering in the browser; retain the existing utility test suite.
