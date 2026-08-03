# Amex Singapore Small Merchant Map

A static prototype for browsing the supplied Amex small-merchant directory on a map. It uses location cells: merchants at the same mall or named location share a map anchor, which keeps the map readable while preserving the full merchant list.

## Run locally

Generate the browser data from the source CSV:

```sh
node scripts/build-data.mjs
```

Serve the repository root (opening `index.html` directly prevents the browser from fetching the JSON data):

```sh
python3 -m http.server 4173
```

Then visit [http://localhost:4173](http://localhost:4173).

## Deploy

Publish the repository root to any static host, such as GitHub Pages, Netlify, Cloudflare Pages, or an S3 static website. No server, build step, or API key is required at deployment time.

Map tiles come from OpenStreetMap. The address field uses the public Nominatim geocoder at runtime; it may be unavailable because of network conditions or service limits. Browser location uses the visitor's permission-controlled geolocation API. Both failures leave map browsing and the current-view list available.

## Data accuracy

The source CSV is retained unchanged in `amex_sg_shop_small_merchant_directory.csv`. The prototype assigns reusable approximate coordinates to locations. They are intended for directory exploration, not unit-level navigation or precise merchant verification.
