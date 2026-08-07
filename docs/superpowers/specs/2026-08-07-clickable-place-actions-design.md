# Clickable Place Actions Design

## Goal

Make merchant place names visibly actionable in both the side-list cards and Leaflet map popups. A visitor should immediately understand that selecting a mall, street, or other named place filters the directory to every merchant at that exact place.

## Visual Treatment

- Render the place action as a compact, soft blue rounded chip in both surfaces.
- Show a small location marker, the display `locationName`, and a trailing chevron.
- Keep the chip label to the place name only. Do not repeat the merchant count on every card or popup; the directory count communicates the result after activation.
- Use the existing blue palette so the action is clear without competing with the merchant name or the `gmap` link.
- Provide consistent hover, active, and keyboard-focus states across the side list and popup.

## Interaction

- Clicking the place chip in a side-list card activates the existing exact-place search flow without selecting the individual merchant.
- Clicking the place chip in a map popup follows the same activation path.
- Activation continues to use the exact `locationCell` group, not display-text matching.
- Existing place activation behavior remains unchanged: clear competing search state, reset the category, filter to all verified merchants at the place, and fit the map to the group once.
- Merchant-card selection, marker-popup selection, and the external Google Maps link remain independent actions.

## Components and Data Flow

### Shared place-action presentation

Use one shared visual class for place actions so the side-list button and popup button cannot drift in spacing, color, typography, or focus treatment. Surface-specific layout rules may position the shared component without changing its core appearance.

### Side-list cards

Keep the existing `.merchant-location` button and `activateMerchantPlace()` path. Update its visible content and styling to the selected soft-chip treatment. Its accessible name remains explicit, for example `Show all merchants at Westgate`.

### Leaflet popups

Replace the popup's plain place-name paragraph with a real button using the same place-action treatment. The popup button carries the merchant's stable `locationCell`; after Leaflet opens the popup DOM, attach a normal event listener that resolves the corresponding verified place group and calls the existing activation function.

Do not use inline JavaScript handlers or display text as the lookup key. If a verified place group cannot be resolved, render the location as non-interactive text rather than exposing a broken control.

## Accessibility

- Use a native `button` for both place actions.
- Preserve a visible `:focus-visible` outline with sufficient contrast and spacing.
- Give popup and side-list controls the same explicit accessible name: `Show all merchants at <place>`.
- Ensure activating the place chip does not accidentally activate its containing merchant card, marker, or Google Maps link.
- Keep the place label readable when long names wrap or truncate on narrow screens; the accessible name retains the full place name.

## Error Handling

- Place activation remains local and does not depend on external place-search availability.
- A missing or stale place group must not throw. Fall back to a non-interactive place label in the popup or leave the side action inert only if its group is unavailable.
- Escaped merchant and place text remains required in popup markup.

## Verification

Automated checks cover:

- popup markup exposes a place button with the stable `locationCell` and escaped display text;
- popup place activation resolves the exact verified group and follows the existing place-search path;
- the missing-group fallback does not expose a broken button or throw;
- side-list place actions still activate independently of merchant selection;
- existing merchant selection, Google Maps links, exact-place filtering, one-time map fitting, and static Pages build behavior remain intact.

Browser checks cover:

- soft place chips appear consistently in the side list and map popup;
- mouse and keyboard activation work from both surfaces;
- hover, active, and focus-visible states are clear;
- clicking a popup place chip filters the exact place without triggering an unrelated merchant action;
- long place names and the chip layout remain usable at desktop, 820 px, and 460 px widths; and
- the full Node test suite, JavaScript syntax checks, Pages artifact build, and `git diff --check` pass.

## Non-goals

- Changing place-search grouping, ranking, or filtering behavior.
- Adding merchant counts to repeated place chips.
- Persisting place scope in the URL or across reloads.
- Changing merchant data, geocoding, or map clustering.
- Redesigning merchant cards, popups, or the Google Maps action beyond the place affordance.

## Alternatives Rejected

- An emphasized text link remains too similar to the nearby Google Maps link and does not provide enough visual separation.
- An outlined button is explicit but adds too much visual weight to every dense merchant card and popup.
- Adding merchant counts previews the result size but repeats the same value across every merchant at a place and makes the compact action harder to scan.
- Keeping the popup place name as plain text leaves the two merchant surfaces inconsistent and prevents exact-place activation from the map context.
