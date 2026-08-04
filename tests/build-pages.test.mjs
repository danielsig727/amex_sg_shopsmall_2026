import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';

import { buildPagesArtifact } from '../scripts/build-pages.mjs';

const fixtureFiles = new Map([
  ['index.html', '<!doctype html>'],
  ['app.js', 'console.log("map");'],
  ['styles.css', 'body { color: navy; }'],
  ['merchant-utils.mjs', 'export const merchant = true;'],
  ['data/merchants.json', '{"merchants":[]}'],
  ['data/geocodes.json', '{"private":true}'],
]);

async function writeFixture(root, relativePath, contents) {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

async function listFiles(root, directory = root) {
  const paths = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await listFiles(root, entryPath));
    } else {
      paths.push(relative(root, entryPath));
    }
  }

  return paths.sort();
}

test('buildPagesArtifact publishes only the browser runtime allowlist', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'amex-pages-'));
  const sourceRoot = join(temporaryRoot, 'source');
  const outputRoot = join(temporaryRoot, 'output');

  try {
    for (const [relativePath, contents] of fixtureFiles) {
      await writeFixture(sourceRoot, relativePath, contents);
    }

    await buildPagesArtifact(sourceRoot, outputRoot);

    assert.deepEqual(await listFiles(outputRoot), [
      '.nojekyll',
      'app.js',
      'data/merchants.json',
      'index.html',
      'merchant-utils.mjs',
      'styles.css',
    ]);
    assert.equal(
      await readFile(join(outputRoot, 'data/merchants.json'), 'utf8'),
      fixtureFiles.get('data/merchants.json'),
    );
    await assert.rejects(readFile(join(outputRoot, 'data/geocodes.json')));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
