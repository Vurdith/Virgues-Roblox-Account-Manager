# Valdor release and repository rename runbook

Status: prepared 2026-09-05. This document is a release-owner runbook; it does
not perform the rename or any other live mutation.

## Target and current state

- Visible brand: `Valdor`
- Descriptor: `Roblox Account Manager`
- Full title where needed: `Valdor — Roblox Account Manager`
- Technical slug: `valdor`
- Current repository: `Vurdith/Virgues-Roblox-Account-Manager`
  - `https://github.com/Vurdith/Virgues-Roblox-Account-Manager`
- Proposed repository: `Vurdith/Valdor`
  - `https://github.com/Vurdith/Valdor`
- The proposed URL returned 404 in a read-only availability check for this run,
  while the current repository was reachable. Recheck the destination while
  signed in with the intended owner before changing anything; a 404 can also
  reflect permissions or a change since this run.

The destination is a proposed GitHub repository name, not a second project to
create while retaining the old repository. If the rename is approved, rename
the current repository in GitHub so its history, issues, releases, and
redirects remain attached to the same repository.

The release workflow at `.github/workflows/release.yml` now records the target
repository and validates the packaging contract supplied by `package.json`:

- GitHub provider, owner `Vurdith`, repository `Valdor`, release type `release`;
- installer prefix `Valdor-Roblox-Account-Manager-Setup`;
- `latest.yml`, the versioned NSIS installer, and its blockmap must be present;
- the Actions summary prints the versioned release, installer, updater
  metadata, and blockmap URLs.

The desktop worker owns `package.json` and `package-lock.json`; this runbook
does not replace those files. Before the first post-rename tag, confirm that
the integrated package configuration passes the workflow's contract check.

## Pre-rename gates

Complete these checks on the integrated release candidate, from a clean clone
or worktree. Do not run the publishing script during this phase.

1. Confirm the intended repository owner has administrator access and that
   `https://github.com/Vurdith/Valdor` is available for the rename. Do not
   create a replacement repository under the old name.
2. Confirm the local branch contains the intended rebrand changes and no
   unrelated dirty files. Preserve any Protected Session work in the owning
   checkout.
3. Inspect the package builder settings and verify the workflow contract:

   ```powershell
   $package = Get-Content package.json -Raw | ConvertFrom-Json
   "$($package.build.publish.owner)/$($package.build.publish.repo)"
   $package.build.artifactName
   ```

   Expected values are `Vurdith/Valdor` and
   `Valdor-Roblox-Account-Manager-Setup-${version}.${ext}`.
4. Run the normal local gates:

   ```powershell
   npm ci
   npm run typecheck
   npm run build
   npm run package
   git diff --check
   ```

   `npm run package` is a local build only. Treat its output as disposable
   local evidence; do not upload, publish, sign, or deploy it from this gate.
5. Inspect the generated `release/` directory and record SHA-256 hashes for
   the versioned installer, its `.blockmap`, and `latest.yml`. Confirm that
   `latest.yml` names the same versioned Valdor installer and that the release
   bundle contains no unexpected executable.
6. Run a static link scan over active surfaces. The compatibility runbook
   itself intentionally contains the old repository URL so that the redirect
   expectation is not lost; review that occurrence separately. The launch
   video is excluded by policy and must not be changed:

   ```powershell
   rg -n -i --glob '!launch-video/**' --glob '!docs/release-repository-rename.md' `
     'Virgue|Virgues|virgue|Vurdith/Virgues-Roblox-Account-Manager' .
   ```

   Any match outside the compatibility runbook and the launch-video exception
   needs an owner and a decision before release.

## Live GitHub rename sequence

Perform this section only after the pre-rename gates pass and the owner has
approved the maintenance window.

1. In the current repository, open **Settings → General**, change the
   repository name to `Valdor`, and confirm the rename. Do not delete the
   current repository and do not create a new repository at its old name.
2. Confirm the new repository page, its default branch, Actions, Issues, tags,
   releases, and repository visibility. Confirm the old repository page
   redirects to the new page.
3. GitHub documents redirects for repository web traffic and for `git clone`,
   `git fetch`, and `git push` against the old location. Treat those redirects
   as a compatibility bridge, not as the permanent application configuration.
   GitHub also warns that calls to an Action hosted by a renamed repository do
   not redirect; review every `uses: OWNER/REPOSITORY/...` reference before
   relying on the workflow.
4. Update each local clone after the server-side rename. Run this only in the
   clone being updated, never in a worker worktree as part of this runbook:

   ```powershell
   git remote -v
   git remote set-url origin https://github.com/Vurdith/Valdor.git
   git remote -v
   git remote get-url origin
   ```

   The current worker intentionally leaves its remote unchanged.
5. Open the Actions workflow on the renamed repository and confirm the
   `Vurdith/Valdor` release contract is visible. Keep the first post-rename
   release on a deliberate, reviewed semantic-version tag.

## Release and updater URLs

For version `<version>` and tag `v<version>`, the intended post-rename URLs
are:

| Surface | URL |
| --- | --- |
| Repository | `https://github.com/Vurdith/Valdor` |
| Releases | `https://github.com/Vurdith/Valdor/releases` |
| Latest release page | `https://github.com/Vurdith/Valdor/releases/latest` |
| Versioned release | `https://github.com/Vurdith/Valdor/releases/tag/v<version>` |
| Installer | `https://github.com/Vurdith/Valdor/releases/download/v<version>/Valdor-Roblox-Account-Manager-Setup-<version>.exe` |
| Updater metadata | `https://github.com/Vurdith/Valdor/releases/download/v<version>/latest.yml` |
| Blockmap | `https://github.com/Vurdith/Valdor/releases/download/v<version>/Valdor-Roblox-Account-Manager-Setup-<version>.exe.blockmap` |

The current artifact name is versioned, so a stable
`releases/latest/download/<asset-name>` installer link is only valid if a
future packaging decision provides an asset with a fixed name. Use the exact
versioned asset URL emitted by the workflow until then. GitHub's release-link
guidance documents the `/releases/latest` and `/releases/latest/download/`
forms.

Validate all of the following after the first release in the renamed
repository:

- the release page resolves under `Vurdith/Valdor`;
- the installer, `latest.yml`, and blockmap each download successfully;
- the SHA-256 hash recorded before publishing matches the downloaded installer;
- `latest.yml` points at the Valdor installer and contains the expected
  version;
- an installed previous build can discover the new release through the
  updater without being given a stale repository owner or name;
- website, support, legal, API, and desktop surfaces that are owned by other
  workers no longer advertise the old release URL.

Do not assume that a redirected old URL is sufficient for updater behavior:
the updater's configured GitHub owner/repository and every published release
asset should use the destination repository directly. Keep the old URL
reachable long enough to test existing bookmarks and old installer links, and
do not reuse the old repository name, which would invalidate GitHub's redirect
mapping.

## Validation record and explicit non-actions

Record the following in the release ticket for the actual rename window:

- pre-rename commit SHA and package version;
- destination availability check and GitHub rename timestamp;
- post-rename repository, release, installer, metadata, and blockmap checks;
- SHA-256 hashes for the published installer and downloaded verification copy;
- result of the old URL redirect and updater compatibility checks;
- names of any remaining intentional historical references.

This rebrand worker performed no external mutation. In particular, it did not
publish a release, push a branch, create or rename a GitHub repository, change
a Git remote, create a tag, deploy to Vercel, mutate Stripe or Neon, or sign an
artifact. The only intended release-surface changes in this worker are the
workflow and this runbook.

The `launch-video/` directory and every source/rendered asset below it are an
intentional exception to the rebrand. They were not modified or regenerated,
and the final old-brand scan must exclude `launch-video/**` while reporting
that exclusion.

## References

- [Renaming a repository — GitHub Docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)
- [Linking to releases — GitHub Docs](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)
- [Managing remote repositories — GitHub Docs](https://docs.github.com/en/get-started/git-basics/managing-remote-repositories)
