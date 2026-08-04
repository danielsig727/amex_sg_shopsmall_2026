import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PAGES_FILES = Object.freeze([
  'index.html',
  'app.js',
  'styles.css',
  'merchant-utils.mjs',
  'data/merchants.json',
]);

export async function buildPagesArtifact(sourceRoot, outputRoot) {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  for (const relativePath of PAGES_FILES) {
    const destination = join(outputRoot, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(sourceRoot, relativePath), destination);
  }

  await writeFile(join(outputRoot, '.nojekyll'), '');
}

const scriptPath = fileURLToPath(import.meta.url);

if (process.argv[1] && scriptPath === resolve(process.argv[1])) {
  const repositoryRoot = dirname(dirname(scriptPath));
  await buildPagesArtifact(repositoryRoot, join(repositoryRoot, '.pages-dist'));
}
