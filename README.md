# Valdor — Roblox Account Manager

Valdor — Roblox Account Manager is a Windows x64 Electron desktop workspace for organizing Roblox profiles, game collections, nested categories, secure sessions, and live Roblox tools. The interface uses a clean Neo-Brutalist visual system with an abstract Valdor V app icon.

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

The installer is written to `release/Valdor-Roblox-Account-Manager-Setup-1.0.5.exe` for the current release.

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
  -> window.valdor typed API
Secure preload (allow-listed IPC)
  -> Electron main process
AccountStore + RobloxClient + SessionGuardian + BackgroundInputService + InputWorkerService + WebApiService + WatcherService
  -> local app data and Windows secure credential storage
```

The renderer has no Node.js or raw `ipcRenderer` access. Profile metadata is persisted locally in the Electron user-data directory. On first launch after the rebrand, Valdor migrates existing Virgue user-data files and Roblox account partitions into the new directory without deleting the legacy copy. Cookies are encrypted with Electron `safeStorage` in a separate credential store; imported passwords are used for sign-in and are not retained as a manager setting.

## Feature surface

- Profile creation, removal, searching, status sorting, last-used/session sorting, game assignment, nested categories, migration from legacy flat groups, local JSON import/export, bulk launch with async/sequenced delay, clipboard actions, and custom account fields.
- Roblox cookie import, username/password bulk import, encrypted credentials, verification, isolated account browser windows, custom Roblox URL/JavaScript sessions, Robux/email/session utilities from the selected-profile actions menu, follow privacy, password/email/display-name updates, friend requests, block management, group joining, Quick Login, authenticated `roblox-player` launching, and VIP-server links.
- Place ID, Job ID, recent games, paginated server browsing, Job ID/region/player/ping filters, region lookup, server joins, game search, favorites, player finder, Universe Viewer, Outfit Viewer, per-account presence refresh, and general or account-specific FPS/ClientAppSettings patching.
- Themes, Windows startup, a held Roblox multi-instance mutex with a manual close-all recovery action, launch delay, async joining, stale-cookie refresh, Roblox watcher, network/low-memory/window-title protection, a permissioned local Web API, and a WebSocket Roblox Control Bridge with command delivery and auto-relaunch.
- Session Guardian: launch-correlated Roblox process records, exact PID/path checks, process and presence state separation, stale Job ID expiry, safe managed-session stopping, persisted session history, and live Activity Centre events.
- Valdor Pro background controls: zero-configuration, focus-safe key messages for selected local alt windows, with persistent main-account protection, foreground-window rejection, an allowlisted key set, and a hard 1.5-second action limit.
- Optional isolated-worker controls: password-authenticated controller-to-worker input for managed Roblox windows on another Windows installation, with target re-verification and no recording or unattended loops.

## Local background controls

Open **Control**, mark the Roblox account you are actively playing as the main,
and select up to eight ready alt clients. Valdor posts one bounded key-down and
key-up message to each selected window without activating it. The native helper
revalidates the PID, executable path, and window ownership for every command. It
also refuses whichever Roblox window is currently in the foreground, while the
persisted main-account selection prevents accidental targeting when Valdor has
focus.

Background messages are deliberately reported as **posted**, not as successful
gameplay. Windows accepting a message does not guarantee that a Roblox client or
experience consumes it. Valdor never falls back to stealing focus, injecting
code, modifying the client, or emulating a system-wide input device.

## Isolated worker controls

Windows directs keyboard input to the foreground window on each interactive
desktop. Valdor therefore keeps alt-client focus changes off the main PC:

1. Install Valdor on a Windows VM or secondary PC, sign in to Valdor Pro, and
   launch the alt accounts from that worker installation.
2. On the worker, open **Settings → Privacy & security**. Save a strong Web API
   password of at least 12 characters, enable **Require password**, **Allow external API clients**,
   **Enable isolated worker input**, and then start the Web API.
3. Keep the worker on a trusted private network. Allow its selected TCP port in
   Windows Firewall for private networks only; do not port-forward it or expose
   it to the public internet.
4. On the main PC, open **Control**, enter the worker address (for example,
   `http://192.168.1.40:7963`) and password, then connect. Select up to eight
   ready alt sessions and click an allowlisted key.

Every click is a separate, bounded action. The native helper validates that the
recorded window still belongs to `RobloxPlayerBeta.exe`, focuses it inside the
worker, sends one key-down/key-up pair, and releases it automatically. The
worker desktop must remain signed in, unlocked, and interactive; a disconnected
Remote Desktop session may not accept foreground input.

Controller requests use a timestamped HMAC-SHA256 signature and a one-use nonce.
The shared password is encrypted at rest and is never sent across the network;
captured requests expire after 60 seconds and cannot be replayed.

This feature intentionally has no macros, schedules, input recording, stealth,
client injection, or unattended mode. Only use it where the experience creator
and Roblox rules permit the behavior. Roblox's third-party app policy can
restrict automated in-experience actions:
https://en.help.roblox.com/hc/en-us/articles/37924211313044-Creator-Third-Party-App-Policy

The supported build target is the Electron app at the repository root.

## Source inspection and license

The source is publicly available for security and privacy inspection under the
[Valdor Source-Available Inspection License](LICENSE). This is not an
open-source license. Repository access does not grant permission to use the
app as an end user, remove subscription or licensing controls, modify it for
distribution, package it, sell it, or publish a competing version.

The license permits temporary local copies, static analysis, and build/test
steps only when reasonably necessary to inspect the source. Third-party
dependencies and native components remain subject to their own licenses and
notices.
