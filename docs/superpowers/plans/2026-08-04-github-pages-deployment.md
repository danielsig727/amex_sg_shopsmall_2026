# GitHub Pages Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a tested, runtime-only merchant-map artifact to GitHub Pages whenever `master` changes.

**Architecture:** A small Node module owns the explicit Pages artifact allowlist and assembles `.pages-dist`; a unit test locks that public-file boundary. A GitHub Actions workflow validates the application, builds the artifact, uploads it with GitHub's Pages actions, and deploys it through the `github-pages` environment.

**Tech Stack:** Node.js 24, Node test runner, GitHub Actions, GitHub Pages

## Global Constraints

- Publish only `index.html`, `app.js`, `styles.css`, `merchant-utils.mjs`, `data/merchants.json`, and `.nojekyll`.
- Do not publish repository source data, geocoding artifacts, scripts, tests, or documentation.
- Deploy from `master` and support manual workflow dispatch.
- Use `actions/checkout@v6`, `actions/setup-node@v6`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v4`, and `actions/deploy-pages@v4`.
- Grant only `contents: read`, `pages: write`, and `id-token: write` workflow permissions.
- Do not add third-party runtime dependencies.
- Do not push commits or mutate GitHub repository settings as part of local repository preparation.

---

### Task 1: Lock the public artifact boundary

**Files:**
- Create: `tests/build-pages.test.mjs`
- Create: `scripts/build-pages.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `PAGES_FILES: readonly string[]`, the exact public artifact allowlist.
- Produces: `buildPagesArtifact(sourceRoot: string, outputRoot: string): Promise<void>`, which recreates the output directory, copies the allowlisted runtime files, and creates an empty `.nojekyll` file.
- Produces: `.pages-dist/`, the ignored local Pages artifact consumed by Task 2.

- [ ] **Step 1: Write a failing artifact-boundary test**

Create `tests/build-pages.test.mjs` with a temporary source tree containing the five runtime source files plus a private `data/geocodes.json`. Import `buildPagesArtifact`, build into a temporary output directory, recursively list output paths, and assert this exact result:

```js
[
  '.nojekyll',
  'app.js',
  'data/merchants.json',
  'index.html',
  'merchant-utils.mjs',
  'styles.css',
]
```

Also assert that `data/geocodes.json` is absent and that copied file contents match their source fixtures.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/build-pages.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/build-pages.mjs`.

- [ ] **Step 3: Implement the artifact builder**

Create `scripts/build-pages.mjs` using only `node:fs/promises`, `node:path`, and `node:url`:

```js
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
```

When executed directly, resolve the repository root relative to the script and call `buildPagesArtifact(repositoryRoot, join(repositoryRoot, '.pages-dist'))`. Let missing inputs terminate with a non-zero exit.

- [ ] **Step 4: Ignore and verify the generated artifact**

Append `.pages-dist/` to `.gitignore`, then run:

```sh
node --test tests/build-pages.test.mjs
node scripts/build-pages.mjs
find .pages-dist -type f | sort
```

Expected: the test passes and `find` reports exactly the six allowlisted artifact paths.

- [ ] **Step 5: Commit the artifact contract**

Stage `scripts/build-pages.mjs`, `tests/build-pages.test.mjs`, and `.gitignore`. Commit with a Lore-protocol message recording the runtime-only constraint and the artifact test.

---

### Task 2: Deploy the validated artifact with GitHub Actions

**Files:**
- Create: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: `node scripts/build-pages.mjs`, producing `.pages-dist/`.
- Produces: the GitHub Pages deployment URL through `steps.deployment.outputs.page_url`.

- [ ] **Step 1: Add the Pages workflow**

Create `.github/workflows/deploy-pages.yml` with:

- triggers for pushes to `master` and `workflow_dispatch`;
- permissions `contents: read`, `pages: write`, and `id-token: write`;
- `pages` concurrency with `cancel-in-progress: false`;
- a `build` job on `ubuntu-latest` that checks out with `actions/checkout@v6`, sets up Node 24 with `actions/setup-node@v6`, runs `node --test tests/*.test.mjs`, runs syntax checks for `app.js`, `merchant-utils.mjs`, and `scripts/*.mjs`, invokes `node scripts/build-pages.mjs`, configures Pages with `actions/configure-pages@v5`, and uploads `.pages-dist` with `actions/upload-pages-artifact@v4`;
- a dependent `deploy` job targeting the `github-pages` environment and using `actions/deploy-pages@v4` with step ID `deployment`.

- [ ] **Step 2: Validate the workflow contract locally**

Run a focused Node command that reads `.github/workflows/deploy-pages.yml` and asserts the file contains every required action reference, the `master` trigger, `.pages-dist`, `github-pages`, and the three exact permission keys.

Expected: command exits 0.

Run: `git diff --check`

Expected: exit 0.

- [ ] **Step 3: Commit the deployment workflow**

Stage `.github/workflows/deploy-pages.yml`. Commit with a Lore-protocol message that records GitHub Pages as the target, the allowlisted artifact as the constraint, and local-vs-hosted validation boundaries.

---

### Task 3: Document activation and prove the complete preparation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `.github/workflows/deploy-pages.yml` and its `master`/manual triggers.
- Documents: the one-time GitHub Pages source setting and the runtime-only publication boundary.

- [ ] **Step 1: Replace the generic deployment paragraph**

Document that pushes to `master` deploy automatically after checks pass, and that **Actions → Deploy to GitHub Pages → Run workflow** triggers a manual deployment. State that the artifact publishes only the merchant-map runtime and excludes CSVs, geocoding caches/reports, scripts, tests, and docs.

- [ ] **Step 2: Document one-time GitHub activation**

Add these repository-owner steps:

1. Push `master` to GitHub.
2. Open **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. Open the workflow's deployment URL; for this repository the expected project-site URL is `https://danielsig727.github.io/amex_sg_shopsmall_2026/` unless a custom domain is configured.

State that the repository workflow prepares deployments but does not change the GitHub setting itself.

- [ ] **Step 3: Run the full local verification**

Run:

```sh
node --test tests/*.test.mjs
node --check app.js
node --check merchant-utils.mjs
for file in scripts/*.mjs; do node --check "$file"; done
node scripts/build-pages.mjs
find .pages-dist -type f | sort
git diff --check
git status --short
```

Expected: all tests and syntax checks pass; the artifact contains exactly six files; diff check succeeds; status lists only the intended README change before the final commit.

- [ ] **Step 4: Commit the deployment documentation**

Stage `README.md`. Commit with a Lore-protocol message describing the activation contract and noting that hosted deployment is not tested until `master` is pushed and Pages is enabled.

- [ ] **Step 5: Review final repository state**

Run `git log --oneline -5`, `git status --short`, and repeat the full verification from Step 3.

Expected: the implementation commits are on `master`, the worktree is clean, all local checks pass, and the only remaining external action is enabling GitHub Actions as the Pages source after pushing.
