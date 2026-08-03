# Merchant Popup and Google Maps Links

## Goal

Make merchant details immediately available from either map pins or directory entries, and provide a best-effort path to the corresponding Google Maps place without leaving the directory.

## Interaction Design

- Clicking a merchant pin selects that merchant and opens a compact Leaflet popup.
- Clicking the merchant's primary area in the directory pans to the merchant, selects it, and opens the same popup.
- The popup displays merchant name, named location, full source address, and a `gmap ↗` link.
- Each directory card exposes its own `gmap ↗` link. Activating that link must not also select or pan to the merchant.
- Google Maps links open in a new tab with `noopener` and `noreferrer` protections.

## Google Maps Resolution

The link uses the documented Google Maps search URL:

`https://www.google.com/maps/search/?api=1&query=<merchant name, full address>`

Merchant name plus the complete address is preferred over coordinates because it gives Google Maps the best chance to resolve an exact business listing while retaining the address as a fallback search target.

## Implementation Shape

- Keep a marker lookup keyed by merchant ID whenever visible markers are rendered.
- After marker rendering, open the selected merchant's popup when its marker is present.
- Generate the Google Maps URL through a small pure utility shared by popup and list rendering.
- Restructure the directory card so the selection control and external link are siblings; do not nest a hyperlink inside a button.

## Error and Edge Handling

- If the selected merchant moves outside the current viewport or is filtered out, no popup is opened.
- Google Maps resolution is best-effort; the application does not claim that the returned Google result is an exact listing.
- Existing HTML escaping remains applied to all merchant content inserted into popup markup.

## Verification

- Unit-test URL generation, including reserved characters.
- Browser-test pin click and list selection to confirm the popup remains open after rerendering.
- Confirm popup and list links use the same URL and open a new tab.
- Check keyboard focus, selector layout, existing clustering, and browser console errors.
