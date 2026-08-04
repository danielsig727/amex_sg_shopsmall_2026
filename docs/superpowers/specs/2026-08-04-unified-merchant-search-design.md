# Unified merchant search design

## Goal

Replace the separate address and in-view merchant search fields with one header search control that updates merchant matches as the user types and lets them choose a Singapore place result to move the map.

## Interaction

- The header field accepts merchant names, mall names, addresses, and neighbourhoods.
- On every input event, the directory and marker set update immediately using the existing local merchant matching logic. Empty input restores the normal current-view list.
- A compact results panel below the field has two labelled groups:
  - **Merchants in this view**: local matches, limited to a small keyboard-navigable result set. Choosing a merchant selects it, reveals its clustered marker, and opens its popup without unnecessarily moving the map.
  - **Places in Singapore**: debounced address suggestions from the existing Singapore-only Nominatim lookup. Choosing one moves the map to that result and updates the current-view merchant list.
- Enter chooses the currently highlighted suggestion; if no suggestion is highlighted, it chooses the first place result when available. Escape closes the panel.
- The old directory search field is removed. Category and A–Z/Nearest controls remain in the directory.

## Data and error handling

- Merchant filtering remains entirely local and synchronous, preserving the current category and visible-bounds constraints.
- Place lookups start only after a short debounce and a meaningful query length; an incrementing request token ignores stale responses.
- Network failures leave local merchant filtering intact and show a non-blocking message in the results panel. No address request is issued for an empty query.
- Address suggestions stay restricted to Singapore and are capped to a small number of entries.

## Accessibility

- The input is a combobox linked to the result list, with explicit labels for result groups.
- Arrow keys move the active result, Enter selects it, and Escape closes the panel.
- The active option and expanded state are exposed with ARIA attributes; mouse and keyboard selection take the same code path.

## Test coverage

- Unit tests cover query result grouping, local matching, selection priority, and stale-place-response rejection.
- Browser checks verify live typing filters both cards and pins, merchant selection reveals the popup, place selection moves the map, keyboard controls work, and a failed place lookup does not clear merchant matches.

## Non-goals

- This does not add a new geocoding provider, persist search history, or broaden merchant matching beyond the current in-view/category rules.
