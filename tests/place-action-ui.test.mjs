import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function runtimeSource(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('card and popup place actions share accessible browser wiring', async () => {
  const [app, index, styles] = await Promise.all([
    runtimeSource('app.js'),
    runtimeSource('index.html'),
    runtimeSource('styles.css'),
  ]);

  assert.match(index, /class="merchant-location place-action"/);
  assert.match(index, /class="place-action-label merchant-location-label"/);
  assert.match(app, /merchantPopupHtml\(merchant, place\)/);
  assert.match(
    app,
    /querySelector\('\.merchant-popup-place'\)[\s\S]+button\.addEventListener\('click', \(\) => activateMerchantPlace\(place\)\)/,
  );
  assert.match(styles, /\.place-action\s*\{/);
  assert.match(styles, /\.place-action:focus-visible\s*\{/);
  assert.match(index, /styles\.css\?v=12/);
  assert.match(index, /app\.js\?v=19/);
  assert.match(app, /merchant-utils\.mjs\?v=7/);
});
