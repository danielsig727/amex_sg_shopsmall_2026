# Place Search Chip Design

## Goal

Let visitors focus the directory on every merchant at a named place, such as a mall or street, from either a merchant card or the unified search results. Represent that exact place filter as a removable chip inside the existing search control.

## Interaction

- The header search becomes a tokenized control containing an optional active-place chip and the existing text input.
- Clicking a merchant card's place name activates that place without selecting the merchant card.
- Typing a place name adds a `Places in merchant directory` group at the top of the search results. A result shows the place name, location type, and merchant count, for example `Westgate · Mall · 123 merchants`.
- Local place suggestions search the full verified merchant directory, even when a place is outside the current map view.
- Selecting a local place result and clicking the same place name on a merchant card follow one activation path.
- Activating a place:
  - clears the typed query, invalidates any in-flight external place request, and clears pending external place-search results;
  - resets the category to `All`;
  - clears merchant selection and pending marker reveal state;
  - inserts a chip such as `Westgate ×` into the search control;
  - shows every verified merchant in the selected place group; and
  - fits the map to the coordinates of all merchants in that group.
- The map fit happens once on activation. Later typing, category changes, panning, zooming, and rerenders do not force the map back to the place.
- Panning or zooming does not remove the chip. While the chip is active, additional text searches only within that place.
- Removing the chip returns search to global scope, clears any scoped text query, and leaves the map at its current center and zoom.

## Search Results

Without an active place chip, the unified result panel uses this order:

1. `Places in merchant directory`: deduplicated local place groups matching the query across the full directory.
2. `Merchants in this view`: individual merchants matching the query within the current map bounds and active category.
3. `Places in Singapore`: external place suggestions from the existing Singapore-only Nominatim lookup.

With an active place chip:

- The text query matches merchants only within the selected place group.
- Local place and external Singapore place suggestions are suppressed. A visitor removes the chip before starting a different global place search.
- The merchant result group reflects the scoped merchant collection.

Local place matching starts for any non-empty query and is synchronous and case-insensitive. Suggestions are ordered deterministically by place name, location type, and stable location-cell key, and are capped to a small result set consistent with the existing search panel.

## State and Filtering

- Add an active-place state value containing the selected `locationCell` and its display `locationName`.
- Use `locationCell` as the exact grouping and filtering key. Use `locationName` only for display and accessible labels.
- Build place groups from verified merchants. Each group exposes its stable key, display name, location type, member count, member merchants, and coordinate bounds.
- Without an active place, the directory keeps its current filtering order: verified merchants, map bounds, category, text query, then sorting.
- With an active place, the directory starts with all verified merchants matching the exact `locationCell`, regardless of map bounds. It then applies category, scoped text query, and sorting.
- Category is reset on place activation but remains usable afterward to narrow the active place.
- The final directory collection continues to drive the merchant count, list cards, search merchant results, and marker layer so the list and map cannot diverge.

## Components

### Place-group utilities

Add pure utilities for:

- grouping verified merchants by `locationCell`;
- case-insensitive place-name matching;
- deterministic place-suggestion ordering and limits;
- exact active-place filtering; and
- deriving coordinate bounds for initial map fitting.

These utilities remain independent of Leaflet and the DOM so their behavior can be covered by Node tests.

### Search control

Restructure the existing search control into one visual field containing:

- an optional active-place chip with a dedicated remove button; and
- the existing text input, which retains focus and combobox behavior.

The chip and input may wrap on narrow screens without overflowing the search area. No separate place-filter row or directory-control chip is added.

### Merchant cards

Make the displayed place name a separate button from the card's primary merchant-selection button. Activating the place button must not pan to, select, or open the popup for that individual merchant. The rest of the card retains the existing merchant-selection behavior.

## Accessibility

- Preserve the search input's combobox relationship with the result list and its existing arrow-key, Enter, and Escape behavior.
- Render local place suggestions as keyboard-selectable options under a labelled result group.
- Give the chip remove action an accessible name such as `Remove Westgate place filter`.
- Give each card place action an accessible name such as `Show all merchants at Westgate`.
- Keep focus in the search input after selecting a local place suggestion or removing the chip.
- Continue announcing count and status changes through the existing live regions without moving focus.

## Errors and Empty States

- Local place suggestions and exact place filtering do not depend on the network.
- External place-search failure leaves local place suggestions, the active chip, and scoped merchant filtering usable.
- If scoped text or category filtering removes every merchant, name the active place in the empty state and suggest clearing the text, category, or place chip.
- If an active place key no longer exists after directory data is loaded, clear the stale active-place state and fall back to normal global browsing.

## Verification

Automated tests cover:

- grouping and deduplication by `locationCell`;
- merchant counts, display metadata, case-insensitive matching, deterministic ordering, and suggestion limits;
- exact place filtering that bypasses map bounds;
- category and text filtering within an active place;
- activation-state changes, including clearing query, category, merchant selection, and pending marker reveal;
- coordinate bounds across every member of a place group; and
- existing merchant search, sorting, selection, marker, and static-build behavior.

Browser checks verify:

- typing `Westgate` shows a local `Westgate` place result even when Westgate is outside the current map view;
- choosing the result inserts the chip, shows all Westgate merchants and markers, and fits the map once;
- clicking `Westgate` on a merchant card follows the same path without selecting that merchant;
- typing beside the chip narrows results within Westgate;
- category filters can narrow the active place after activation;
- manual pan and zoom preserve the active place without triggering another fit;
- removing the chip restores global search and retains the current map view;
- external place-search failure does not break local place behavior;
- keyboard navigation, accessible names, focus behavior, and narrow-screen wrapping work; and
- the full Node test suite, syntax checks, Pages artifact build, and `git diff --check` pass.

## Non-goals

- Persisting the active place across reloads or encoding it in the URL.
- Supporting multiple simultaneous place chips.
- Treating arbitrary query text as an exact place without selecting a local place result.
- Changing the merchant dataset or geocoding pipeline.
- Adding a new external geocoding provider or a DOM test framework.

## Alternatives Rejected

- Reusing ordinary text search for place filtering cannot guarantee exact membership because the same words may occur in merchant names or addresses.
- Keeping an invisible exact-match state behind plain input text makes it unclear whether a query is fuzzy text or a selected place.
- Displaying a chip while maintaining a separate place-mode pipeline would create competing search states and make clearing, keyboard behavior, and result ordering harder to reason about.
- Fitting map bounds without exact place state would include unrelated nearby merchants and would not reliably isolate a mall or street.
