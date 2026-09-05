# Valdor release and repository verification runbook

Status: completed 2026-09-05. The repository, release workflow, and hosting
configuration use the Valdor brand.

## Current release surfaces

- Repository: `Vurdith/Valdor`
- Repository URL: `https://github.com/Vurdith/Valdor`
- Website: `https://valdor-roblox-account-manager.vercel.app`
- Default branch: `master`
- Product title: `Valdor — Roblox Account Manager`
- Installer prefix: `Valdor-Roblox-Account-Manager-Setup`

The repository rename preserved its history, issues, releases, and redirect.
The local application updater points directly at `Vurdith/Valdor`.

## Release contract

The release workflow validates the packaging contract supplied by `package.json`:

- GitHub provider, owner `Vurdith`, repository `Valdor`, release type `release`;
- the versioned NSIS installer, `latest.yml`, and its blockmap are present; and
- the Actions summary prints the installer and updater metadata URLs.

Before publishing a release, run the normal local gates from a clean worktree:

```powershell
npm ci
npm run typecheck
npm run build
npm run package
git diff --check
```

Inspect `release/` and record the SHA-256 hashes for the installer, blockmap,
and `latest.yml`. Treat packaging output as disposable evidence unless a
separate release approval authorizes publication.

## Hosting and updater checks

After a release, verify that:

- the release page resolves under `Vurdith/Valdor`;
- the installer, metadata, and blockmap download successfully;
- `latest.yml` names the matching Valdor installer;
- a previous installed build discovers the release; and
- website, support, legal, API, and desktop surfaces use the same release URL.

Keep the repository redirect available for existing bookmarks and older
installer links. Do not create a second repository to replace the current one.

## Validation record

Record the release commit, package version, deployment URL, asset hashes, and
updater compatibility result in the release ticket. Keep temporary integration
worktrees and review evidence until the release is accepted; cleanup is a
separate approved action.
