# Virgue's Roblox Account Manager

Virgue's Roblox Account Manager is a Windows x64 Electron desktop workspace for organizing Roblox profiles, game collections, nested categories, secure sessions, and live Roblox tools. The interface uses a clean Neo-Brutalist visual system with an abstract Virgue V app icon.

## Stack

- Electron 43.4.1, Windows x64
- React 19.2, TypeScript 7.0.2, Vite 7.3.6 through electron-vite
- Typed IPC through a context-isolated preload bridge
- electron-builder 26 with an assisted per-user NSIS installer
- `ws`-backed Roblox Control Bridge

## Run and package

```powershell
npm install
npm run dev
npm run typecheck
npm run build
npm run package
```

The installer is written to `release/Virgues-Roblox-Account-Manager-Setup-1.0.1.exe`.

## Releases and updates

Installed Windows builds check the public GitHub Releases feed for a newer
semantic version after startup. When one is available, the app asks before it
downloads anything and asks again before restarting to install it.

To publish the next version, update the package version, commit it, and push a
matching tag. The release workflow builds the Windows installer and publishes
the updater metadata and installer asset:

```powershell
npm version patch --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release v$(node -p "require('./package.json').version")"
git tag "v$(node -p "require('./package.json').version")"
git push origin master --follow-tags
```

The current release channel is unsigned until a public-trust Authenticode
certificate or Microsoft Artifact Signing is configured. Do not tell users to
disable Windows security controls to install a build.

## Architecture

```text
React renderer
  -> window.virgue typed API
Secure preload (allow-listed IPC)
  -> Electron main process
AccountStore + RobloxClient + SessionGuardian + ControlServer + WebApiService + WatcherService
  -> local app data and Windows secure credential storage
```

The renderer has no Node.js or raw `ipcRenderer` access. Profile metadata is persisted locally in the Electron user-data directory. Cookies are encrypted with Electron `safeStorage` in a separate credential store; imported passwords are used for sign-in and are not retained as a manager setting.

## Feature surface

- Profile creation, removal, searching, status sorting, last-used/session sorting, game assignment, nested categories, migration from legacy flat groups, local JSON import/export, bulk launch with async/sequenced delay, clipboard actions, and custom account fields.
- Roblox cookie import, username/password bulk import, encrypted credentials, verification, isolated account browser windows, custom Roblox URL/JavaScript sessions, Robux/email/session utilities from the selected-profile actions menu, follow privacy, password/email/display-name updates, friend requests, block management, group joining, Quick Login, authenticated `roblox-player` launching, and VIP-server links.
- Place ID, Job ID, recent games, paginated server browsing, Job ID/region/player/ping filters, region lookup, server joins, game search, favorites, player finder, Universe Viewer, Outfit Viewer, per-account presence refresh, and general or account-specific FPS/ClientAppSettings patching.
- Themes, Windows startup, a held Roblox multi-instance mutex with a manual close-all recovery action, launch delay, async joining, stale-cookie refresh, Roblox watcher, network/low-memory/window-title protection, a permissioned local Web API, and a WebSocket Roblox Control Bridge with command delivery and auto-relaunch.
- Session Guardian: launch-correlated Roblox process records, exact PID/path checks, process and presence state separation, stale Job ID expiry, safe managed-session stopping, persisted session history, and live Activity Centre events.

The supported build target is the Electron app at the repository root.

## Source inspection and license

The source is publicly available for security and privacy inspection under the
[Virgue Source-Available Inspection License](LICENSE). This is not an
open-source license. Repository access does not grant permission to use the
app as an end user, remove subscription or licensing controls, modify it for
distribution, package it, sell it, or publish a competing version.

The license permits temporary local copies, static analysis, and build/test
steps only when reasonably necessary to inspect the source. Third-party
dependencies and native components remain subject to their own licenses and
notices.
