# Amex Singapore Small Merchant Map

A static prototype for browsing the supplied Amex small-merchant directory on a map. Merchant coordinates are resolved ahead of time with OneMap; merchants at the same mall or address share a small location cell so overlapping pins can separate as the map is zoomed.

## Run locally

Generate the browser data from the source CSV:

```sh
node scripts/build-data.mjs
```

To refresh the coordinate cache, obtain a OneMap API token and run:

```sh
AMEX_ONEMAP_TOKEN='your-token' node scripts/validate-locations.mjs
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

The source CSV is retained unchanged in `amex_sg_shop_small_merchant_directory.csv`. All unique locations have been checked against OneMap and the results are cached in `data/geocodes.json`. Only merchants with a successful OneMap match are rendered; unresolved source addresses are excluded rather than assigned approximate pins. See `data/geocode-report.json` for the validation summary.
