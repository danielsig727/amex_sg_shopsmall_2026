# GitHub Pages Deployment

## Goal

Prepare the merchant map for repeatable GitHub Pages deployment while publishing only the files required by the browser. Repository source data, geocoding artifacts, scripts, tests, and documentation must not be included in the public Pages artifact.

## Publishing Model

- Deploy with a GitHub Actions workflow triggered by pushes to `master` and by manual dispatch.
- Use GitHub's supported Pages artifact workflow rather than publishing the repository root or maintaining a generated `gh-pages` branch.
- Target the protected `github-pages` environment and expose the deployment URL from the Pages deployment action.
- Apply the minimum workflow permissions: read repository contents, write Pages deployments, and mint the Pages identity token.
- Use Pages concurrency so a newer deployment supersedes queued stale work without interrupting an active deployment.

## Artifact Contract

The deployment artifact contains only:

- `index.html`
- `app.js`
- `styles.css`
- `merchant-utils.mjs`
- `data/merchants.json`
- `.nojekyll`

The workflow assembles these files in a temporary staging directory before upload. Using an explicit allowlist prevents new repository files from becoming public accidentally.

## Validation and Deployment Flow

1. Check out the repository.
2. Set up the supported Node.js runtime used by repository checks.
3. Run the existing Node test suite and syntax checks.
4. Assemble the allowlisted static artifact.
5. Verify that every required artifact file exists.
6. Configure GitHub Pages and upload the artifact.
7. Deploy the validated artifact in a dependent deployment job.

Test or artifact-assembly failures block deployment. The deploy job runs only after validation and upload succeed.

## Repository Documentation

Update the README with:

- the expected GitHub Pages URL shape;
- the one-time repository setting: **Settings → Pages → Source → GitHub Actions**;
- automatic deployment behavior for `master`;
- the manual workflow-dispatch option;
- the runtime-only artifact boundary.

Preparing the repository does not include pushing commits or changing GitHub repository settings unless separately requested.

## Alternatives Rejected

- Publishing from the `master` repository root is simpler, but would expose CSV source files, geocoding caches and reports, scripts, tests, and documentation through the site artifact.
- Maintaining a `gh-pages` branch adds generated-branch synchronization and cleanup without improving this static application's deployment contract.

## Verification

- Validate workflow YAML structure and referenced action versions.
- Run the existing Node tests and JavaScript syntax checks locally.
- Reproduce artifact assembly locally and inspect its exact file list.
- Confirm repository status and diff integrity with `git diff --check`.
- GitHub-hosted deployment remains unverified until the workflow is pushed and Pages is enabled in repository settings.
