# Virgue's Roblox Account Manager — Feature Plan

> A living product, subscription, design, and engineering roadmap for turning Virgue's Roblox Account Manager into a trustworthy premium Windows workspace.

**Document status:** Product strategy and implementation plan<br>
**Current build status:** Session Guardian foundation implemented and verified in the desktop build; live process correlation, presence freshness, safe stop, and Activity Centre integration are shipped in the current installer.<br>
**Last updated:** 27 August 2026<br>
**Product:** Virgue's Roblox Account Manager<br>
**Target platform:** Windows x64<br>
**Subscription hypothesis:** Virgue Pro at £9.99 per month<br>
**Primary product promise:** Know which account is actually alive, launch the right account safely, recover your setup, and find the right server without guesswork.

---

## 1. Executive summary

Bulk launch profiles already exist and should be reserved for Virgue Pro. The Free plan remains useful with individual launches, while the paid tier can make multi-account routines meaningfully faster.

The subscription should be built around four outcomes:

1. **Reliability:** the app accurately knows which Roblox window belongs to which account, which experience and server it is in, whether it has crashed, and whether it has really closed.
2. **Security:** users can protect and restore their account workspace without exposing cookies, passwords, or session material to a cloud service.
3. **Intelligence:** the app helps users choose better servers, understand performance, and recover from failures.
4. **Convenience:** the same carefully configured workspace follows the user to a second computer and keeps them informed when something needs attention.

The strongest premium product is therefore not “more buttons.” It is a dependable control centre that removes uncertainty from a multi-account setup.

### Recommended initial paid bundle

Virgue Pro should initially contain:

- Session Guardian: accurate per-window status, Job ID, experience, uptime, process health, and cleanup.
- Encrypted Vault Sync: end-to-end encrypted backup and device migration.
- Smart Server Finder: saved filter presets, server scoring, history, and rejoin workflows.
- Activity Centre analytics: session history, launch success, disconnect reasons, and resource trends.
- Advanced performance profiles: per-account and per-game FPS and memory settings applied to the correct window.
- Useful alerts: crash, disconnect, stale client, login expiry, and backup health notifications.

The app should not charge for basic account safety, account deletion, exporting data, local encryption, or ordinary launching. Those are trust requirements.

### One feature to build first

Build **Session Guardian** first. It addresses the problems that have already appeared in the product:

- false “Running” states;
- stale Job IDs;
- the first account reporting correctly while later accounts do not;
- Roblox processes remaining after a window is closed;
- confusion about whether a launch is still in progress;
- per-window settings being applied globally.

If the app cannot tell the truth about its own sessions, advanced subscriptions will feel cosmetic.

---

## 2. How to use this document

This file is intentionally expansive. It is a source of product decisions, technical direction, acceptance criteria, and a backlog. It is not a promise that every idea should be built.

Every proposed feature should answer:

- What user problem does it solve?
- How often does the problem happen?
- Why is the current app insufficient?
- What is the smallest trustworthy version?
- What information is collected?
- What happens when the network, Roblox, or a native helper fails?
- Is the feature safe for accounts the user owns?
- Is the feature free, Pro, or Team?
- How will success be measured?

### Priority vocabulary

- **P0 — Trust foundation:** required before charging for the related capability.
- **P1 — Pro value:** strong subscription candidates after the foundation is reliable.
- **P2 — Expansion:** valuable once the core product has retention and support capacity.
- **P3 — Explore:** research, experiments, or long-term opportunities.

### Status vocabulary

- **Existing:** already present in the current Electron application.
- **Repair:** present in some form but not yet trustworthy or complete.
- **Planned:** approved direction, not implemented.
- **Explore:** requires research or customer validation first.
- **Do not build:** intentionally outside the product boundary.

---

## 3. Product definition

### 3.1 What Virgue is

Virgue's Roblox Account Manager is a local-first Windows desktop workspace for users who legitimately control multiple Roblox accounts and want to organize, launch, observe, and maintain them from one place.

It combines:

- account identity and secure sign-in flows;
- game collections and categories;
- authenticated Roblox launching;
- public server discovery and joining;
- live session observation;
- safe account utilities;
- performance controls;
- local integrations;
- a clean Neo-Brutalist interface.

### 3.2 What Virgue is not

Virgue is not:

- a botting platform;
- an unattended farming platform;
- a tool for evading Roblox enforcement or detection;
- a cookie marketplace;
- a password harvesting service;
- a way to access accounts the user does not own;
- a bypass for Roblox client, platform, or game restrictions;
- a replacement for Roblox's own account security controls.

Every automation feature must remain focused on legitimate lifecycle management: launching a client the user requested, observing it, cleaning up a process the app created, notifying the user, or applying a configuration the user selected.

### 3.3 North-star statement

> A Virgue user should be able to open the app and immediately trust the answer to three questions: which account is running, what is it doing, and what should I do next?

### 3.4 Product pillars

1. **Truthful state**
2. **Protected account data**
3. **Fast, understandable workflows**
4. **Useful performance information**
5. **Safe, reversible automation**
6. **Premium value that is visible every week**

---

## 4. Current application baseline

The supported product is the Electron application at the repository root.

### 4.1 Current technology stack

- Electron 43.4.1
- Windows x64 packaging
- React 19.2
- TypeScript 7.0.2
- Vite 7.3.6 through electron-vite
- Electron main process
- context-isolated, allow-listed preload bridge
- typed IPC contracts
- electron-builder with assisted per-user NSIS installer
- WebSocket-backed Roblox Control Bridge
- native Windows helpers for selected FPS and memory capabilities

### 4.2 Current architecture

~~~text
React renderer
    |
    | typed window.virgue API
    v
Secure preload bridge
    |
    | allow-listed IPC
    v
Electron main process
    |
    +-- AccountStore
    +-- RobloxClient
    +-- WatcherService
    +-- ControlServer
    +-- WebApiService
    +-- SecretStore
    +-- native Windows helpers
    |
    v
Local app data and Windows secure credential storage
~~~

### 4.3 Existing feature surface

The current app already includes, or is designed to include:

- account creation, removal, search, sorting, and custom fields;
- username, alias, display name, avatar, user ID, game, and category data;
- Roblox browser-based login;
- cookie import and bulk import flows;
- encrypted credential/session storage;
- authenticated Roblox player launching;
- account browser windows;
- profile links, copy actions, and clipboard confirmations;
- account utilities such as Robux, email, session logout, privacy, display name, password, friend, block, and group actions where the current Roblox flow supports them;
- Quick Login;
- game collections with thumbnails, descriptions, creators, visits, playing counts, and favorites;
- nested categories with user-selected icons;
- account movement and duplication between game collections;
- Place ID and Job ID launching;
- recent games;
- server pagination;
- server filtering by Job ID, region, players, and ping;
- public server joining;
- server Job ID copying;
- player finder;
- Universe Viewer;
- Outfit Viewer;
- presence refresh;
- Activity Centre;
- account-specific and general FPS settings;
- account-specific memory saving;
- launcher delay and asynchronous joining;
- Roblox watcher settings;
- a local Web API;
- a Roblox Control Bridge WebSocket service;
- import and export;
- themes and Neo-Brutalist UI;
- Windows installer packaging.

This baseline matters because a paid plan should deepen existing workflows instead of creating unrelated surface area.

### 4.4 Existing source locations

The first implementation pass should use and extend the existing boundaries:

- Main process account persistence: src/main/account-store.ts
- Roblox integration: src/main/roblox-client.ts
- Process/session watcher: src/main/watcher.ts
- Local control bridge: src/main/control-server.ts
- Web API: src/main/web-api.ts
- Secure credentials: src/main/secret-store.ts
- Main process startup and window lifecycle: src/main/index.ts
- Typed domain models: src/shared/types.ts
- IPC channel definitions: src/shared/ipc.ts
- Secure preload API: src/preload/index.ts
- Renderer application shell: src/renderer/src/App.tsx
- Renderer design system: src/renderer/src/styles.css
- Renderer icon system: src/renderer/src/components/Icons.tsx
- Native FPS helper: native/nvidia-fps-helper.cpp
- Native memory helper: native/process-memory-helper.cpp

---

## 5. Market and pricing context

Basic launcher functionality is unlikely to support a £10 monthly price on its own. Existing Roblox-adjacent tools already set expectations around customization, performance controls, server-region checking, and multiple instances. Bloxstrap explicitly presents those capabilities as quality-of-life features. [Bloxstrap feature positioning](https://bloxstrap.com/about/)

Existing account-management products condition users to expect local account organization, multi-instance launching, session material, server browsing, watcher-style behavior, and local encryption.

The implication is not that Virgue cannot charge. The implication is that Virgue needs a sharper promise:

> Virgue Pro is the dependable, secure operations layer for a multi-account Roblox workspace.

That promise is stronger than:

- “we have more toggles”;
- “we can launch more windows”;
- “we have an attractive theme”;
- “we copied a server list.”

### 5.1 Price hypothesis

Use the following as an experiment, not a permanent commitment:

- **Free:** core local account manager.
- **Pro monthly:** £9.99/month.
- **Pro annual:** £99/year, presented as two months included.
- **Trial:** 7 or 14 days, with no hidden account deletion or lockout after trial.
- **Team:** defer until there are real teams asking for shared configuration.

The paid plan should not be artificially limited by the number of accounts. A limit creates the feeling that the app is charging for the basic reason it exists. Charge for trust, history, synchronization, alerts, and intelligence.

### 5.2 What £9.99 must feel like

A subscriber should be able to say at least one of these:

- “It saves me from rebuilding my setup.”
- “I know immediately when an account dies.”
- “It prevents me from chasing stale or wrong server information.”
- “It has saved me hours of troubleshooting.”
- “It gives me a history I can actually use.”
- “It safely follows me to another computer.”

If the user cannot feel that value within their first week, conversion and retention will be weak.

---

## 6. Free, Pro, and future Team boundaries

### 6.1 Free tier

The free tier should include enough of the core product to build trust:

- local account creation and login;
- up to two unique Roblox account slots;
- local encrypted storage;
- account removal and data export;
- two game collection slots;
- game collections and categories;
- basic thumbnail and game information refresh;
- single-account launch;
- basic session view;
- basic server browsing;
- basic Job ID, region, player, and ping filters;
- ordinary server join;
- local Activity Centre;
- basic FPS and memory settings;
- basic import and export;
- normal support documentation.

The free tier can have shorter history retention or fewer saved presets, but it should not misrepresent the state of the account.

### 6.2 Pro tier

Pro should unlock:

- unlimited Roblox account and game collection slots;
- bulk launch profiles;
- Session Guardian and detailed session timeline;
- long-term activity and performance history;
- encrypted cross-device vault sync;
- backup versioning and device migration;
- saved server presets and server scoring;
- server favourites, avoid lists, and rejoin history;
- disconnect/crash/stale-client alerts;
- advanced resource-aware launch queues;
- per-game/per-account performance profiles;
- adaptive performance recommendations;
- backup health and account health checks;
- extended Activity Centre retention and exports;
- advanced local API permissions and audit logs;
- priority support and release notes.

### 6.3 Team tier, later

Only build a Team tier when real users request collaboration:

- shared game and category metadata;
- shared server presets;
- workspace roles;
- reviewable change history;
- device and member management;
- no raw credential sharing by default;
- optional owner-controlled encrypted secret sharing only after a serious security review.

### 6.4 Never paywall these

Do not paywall:

- account deletion;
- local export;
- local encryption;
- clear error messages;
- the ability to stop or clean up a process Virgue launched;
- basic login;
- warnings about risky settings;
- support for recovering an account workspace;
- disclosure of what the app is doing.

---

## 7. Feature scorecard

Scores are directional and should be revisited after interviews and beta data.

| Feature | User pain | Frequency | Differentiation | Trust impact | Build cost | Priority |
|---|---:|---:|---:|---:|---:|---|
| Session Guardian | 5 | 5 | 5 | 5 | 5 | P0 |
| Encrypted Vault Sync | 5 | 3 | 5 | 5 | 5 | P0 |
| Activity Centre history | 4 | 4 | 4 | 4 | 3 | P0 |
| Smart server presets | 4 | 4 | 4 | 3 | 4 | P0 |
| Per-window performance profiles | 4 | 4 | 4 | 4 | 4 | P0 |
| Crash/disconnect alerts | 4 | 4 | 4 | 4 | 3 | P1 |
| Account health checks | 4 | 3 | 4 | 5 | 4 | P1 |
| Remote dashboard | 3 | 3 | 5 | 3 | 5 | P1 |
| Safe lifecycle rules | 3 | 3 | 4 | 3 | 4 | P1 |
| Team workspaces | 3 | 2 | 4 | 3 | 5 | P2 |
| Themes and visual packs | 2 | 2 | 2 | 2 | 2 | P2 |
| Gameplay automation | Unclear | Unclear | Risky | Negative | 5 | Do not build |

---

## 8. P0 foundation: make every existing capability truthful

Before adding paid features, repair any existing setting or button that can claim to work without actually completing the underlying operation.

### 8.1 Settings audit

Create a settings registry with one record per visible setting:

- setting ID;
- user-facing name;
- description;
- current value;
- supported platforms;
- persistence path;
- main-process implementation;
- validation;
- failure states;
- restart requirements;
- whether it is Free or Pro;
- telemetry and privacy behavior;
- test coverage;
- owner;
- status: working, partial, unsupported, or removed.

Any setting that has no implementation, no meaningful outcome, or no safe explanation must be removed from the UI.

### 8.2 No mock success

The UI must not show:

- “saved” when persistence failed;
- “running” because a stale record exists;
- “in-game” because an old presence response was never expired;
- “region loaded” when the region value is a placeholder;
- “FPS applied” when the selected process was not changed;
- “account action completed” when Roblox rejected or never received the request.

Every asynchronous action needs:

- loading state;
- success state;
- failure state;
- retry option;
- clear scope: account, window, server, or app;
- activity entry when appropriate.

### 8.3 Shared event bus

Introduce a main-process event bus for authoritative changes:

- account updated;
- account login completed;
- account action started;
- account action completed;
- account action failed;
- launch requested;
- launch assigned to process;
- session state changed;
- session metrics updated;
- session ended;
- game refreshed;
- server query completed;
- backup started;
- backup completed;
- backup failed;
- settings changed;
- entitlement changed.

The renderer should receive typed event deltas or a typed refreshed snapshot. It should not infer durable state from the result of one button click.

### 8.4 Versioned storage migrations

Every persisted data shape should have:

- schema version;
- migration function;
- backup before migration;
- migration result validation;
- recovery if migration fails;
- a visible but non-alarming recovery message;
- tests using old fixtures.

Never silently discard unknown fields during a migration unless the field is explicitly deprecated.

### 8.5 Error taxonomy

Convert low-level errors into user-actionable categories:

- authentication expired;
- authentication rejected;
- Roblox endpoint unavailable;
- Roblox returned an invalid response;
- browser context unavailable;
- process not found;
- process permission denied;
- native helper unavailable;
- settings file locked;
- account already in use;
- multi-instance guard unavailable;
- subscription unavailable;
- storage unavailable;
- sync conflict;
- user cancelled.

Store technical diagnostics locally, but show a concise explanation first. Never expose cookies, passwords, bearer tokens, or full authorization headers in the UI or logs.

---

## 9. P0 feature: Session Guardian

### 9.1 Problem

The current product has experienced several symptoms of an unreliable session model:

- an account appears to be running after it has left the game;
- a closed Roblox client leaves processes behind;
- one account reports a Job ID and experience correctly while another does not;
- the same account can appear multiple times because it belongs to multiple game collections;
- a stale presence response is treated as current;
- settings such as per-account FPS can be applied to the wrong client.

These are not merely cosmetic bugs. They undermine every other feature.

### 9.2 User outcome

When a user opens the Activity Centre or Accounts tab, they should see one row per saved account and one detailed session record per live window. The app must distinguish:

- account identity;
- process identity;
- Roblox presence;
- the last known public server;
- whether the information is fresh;
- whether the app can verify it.

### 9.3 Session record

Introduce a first-class SessionRecord model containing at least:

- session ID;
- account ID;
- launch request ID;
- operating system process ID;
- process creation time;
- process executable path;
- process parent ID where available;
- window handle where available;
- client channel or build label where available;
- place ID;
- universe ID;
- experience name;
- Job ID;
- region;
- account presence type;
- process status;
- session start time;
- last process heartbeat;
- last presence check;
- last server data refresh;
- FPS sample;
- memory sample;
- CPU sample;
- exit code;
- close reason;
- stale reason;
- created timestamp;
- updated timestamp.

Do not store raw authentication material in a session record.

### 9.4 State model

Use separate dimensions rather than one overloaded status:

**Process state**

- not-started;
- launching;
- alive;
- unresponsive;
- closing;
- exited;
- unknown.

**Roblox presence state**

- not-checked;
- offline;
- online;
- in-game;
- in-studio;
- stale;
- unavailable.

**Overall display state**

- Ready;
- Launching;
- Running;
- In game;
- Online;
- Stale;
- Crashed;
- Closing;
- Offline;
- Needs attention.

The display state must be derived from timestamps and current observations. It must not be persisted as the only source of truth.

### 9.5 Process correlation

A launch request must create a unique local correlation record before starting Roblox:

1. Create a launch request ID.
2. Capture the selected account ID, target Place ID, Job ID, and settings profile.
3. Capture the expected authentication context without logging secrets.
4. Start the client.
5. Discover child processes created by the launch request.
6. Associate the correct process by creation time, process tree, executable path, window handle, and launch context.
7. Bind all future native helper operations to the captured process ID and creation time.
8. Keep the association until the process exits.

Never choose a client by:

- array position;
- account order;
- the first Roblox process returned by a system query;
- the most recently stored account;
- the game collection the account belongs to.

If a process cannot be correlated safely, show “Unidentified Roblox client” and ask the user to inspect it rather than assigning it to the wrong account.

### 9.6 Presence freshness

Presence data requires explicit freshness rules:

- show the exact “checked X seconds ago” time;
- expire the “in-game” label after a configurable number of failed or overdue checks;
- distinguish “process alive” from “Roblox says in-game”;
- never carry a Job ID into a new session unless the new session has independently reported it;
- clear the current Job ID after a session ends;
- retain the previous Job ID only in history, clearly labelled as historical;
- respect users whose Roblox privacy settings prevent public presence data;
- explain when Roblox did not provide current experience information.

Suggested default polling behavior:

- process liveness: every 1–2 seconds;
- lightweight metrics: every 3–5 seconds;
- presence refresh: every 15–30 seconds;
- full account refresh: on demand and when a session starts;
- stale threshold: based on missed checks, not a hard-coded permanent state.

The polling interval should be bounded and power-conscious.

### 9.7 Cleanup model

The cleanup service should:

- track only processes created or explicitly adopted by Virgue;
- distinguish Roblox Player, Roblox installer, Roblox Studio, browser, and unrelated processes;
- mark a session closing when its window disappears;
- wait for a small grace period;
- confirm process exit;
- close only the known process tree when the user has explicitly asked to stop it;
- clean launch-specific temporary settings after safe exit;
- rescan for orphaned managed processes at startup;
- never kill Roblox Studio or the Roblox installer by broad name matching;
- offer a clear “Close managed Roblox clients” action with a count and confirmation;
- record what was closed and why.

No cleanup feature should silently terminate unrelated Roblox work.

### 9.8 Session detail UI

The Activity Centre should show:

- account avatar and display name;
- account username;
- process state;
- presence state;
- experience name;
- Place ID;
- Job ID with copy button;
- region if known;
- session age;
- last checked time;
- FPS;
- memory;
- CPU;
- status freshness indicator;
- close, focus, refresh, and rejoin actions;
- the exact reason for a stale or unknown state.

Use one account row in the Accounts tab even if that account is assigned to several games. Use one session row per actual live window in Activity Centre.

### 9.9 Session events

Record a local event timeline:

- launch requested;
- launch URL opened;
- client process discovered;
- client process correlated;
- presence became online;
- presence became in-game;
- Job ID discovered;
- performance profile applied;
- client became unresponsive;
- client exited;
- cleanup completed;
- relaunch requested;
- relaunch skipped;
- user stopped client;
- Roblox data unavailable.

### 9.10 Session Guardian acceptance criteria

- The same account appears once in the Accounts tab regardless of game assignments.
- Three simultaneously running accounts produce three independently correlated session records.
- Closing one client does not alter the status or Job ID of another.
- A Job ID cannot be shown for a newly launched session until that session has been observed.
- A process that exits is marked exited within the target freshness window.
- A stale presence response is visibly stale and does not remain “In game” forever.
- Roblox Studio and Roblox Installer are not killed by managed-client cleanup.
- The user can copy the current Job ID and see a confirmation.
- The app survives a client crash and preserves the historical session with a crash reason.
- The app can be restarted and recover live managed clients without duplicating records.
- A test run with at least three clients verifies correct account-to-process mapping.

---

## 10. P0 feature: Encrypted Vault Sync and Recovery

### 10.1 Problem

Users who invest time in account metadata, games, categories, settings, and session configuration need a safe way to migrate or recover the workspace. A normal cloud database is dangerous if it stores Roblox session cookies or credentials in readable form.

### 10.2 User outcome

The user can set up a second approved device, restore their workspace after reinstalling Windows, and recover from accidental edits without handing plaintext account access to Virgue's servers.

### 10.3 Security position

The default design must be:

- local-first;
- end-to-end encrypted;
- zero-knowledge for the sync service;
- opt-in;
- clearly labelled;
- recoverable with a user-held recovery key;
- compatible with complete local export and deletion.

The server should see an encrypted blob, version metadata, device identifiers, and minimal operational information. It should not see:

- passwords;
- Roblox cookies;
- authentication tickets;
- browser session material;
- copied security tokens;
- raw account utility responses.

### 10.4 Key model

Recommended high-level model:

1. Generate a vault encryption key on the user's device.
2. Protect it locally with Windows secure storage and a user-chosen recovery secret.
3. Encrypt the vault before upload.
4. Use device key pairs for approving a second device.
5. Require explicit user approval for a new device.
6. Allow the user to revoke a device.
7. Offer a printable or downloadable recovery key with a strong warning.
8. Never send the recovery key to the server in plaintext.

The precise cryptographic implementation requires a security review. Do not invent cryptography. Use audited primitives and a small, well-maintained implementation.

### 10.5 Sync scope

Default sync should include:

- games;
- categories;
- account aliases and descriptions;
- launch profiles;
- server presets;
- settings;
- Activity Centre event metadata;
- app preferences;
- encrypted account credential bundles only when the user explicitly opts in.

Default sync should exclude:

- raw session cookies unless explicit opt-in is enabled;
- copied clipboard contents;
- passwords in activity text;
- browser history;
- external API secrets;
- full diagnostic logs.

### 10.6 Device approval

New-device flow:

1. User signs into their Virgue account in the desktop app.
2. The app displays a short-lived approval code or QR code.
3. The existing trusted device approves the new device.
4. The new device receives only encrypted vault material.
5. The user confirms which account and configuration groups to restore.
6. The app writes a local backup before merging.

If the user has no trusted device, recovery key restoration is the fallback.

### 10.7 Conflict resolution

Sync conflicts must be explicit:

- show device and timestamp;
- present a diff for account metadata, games, categories, and settings;
- offer keep local, keep remote, or merge;
- create a backup before either destructive choice;
- never silently overwrite credentials;
- keep a version history for Pro users.

### 10.8 Backup health

Expose:

- last successful backup;
- last successful restore test;
- vault version;
- devices with access;
- encryption status;
- unresolved conflicts;
- whether a recovery key has been confirmed;
- local backup location;
- ability to export a complete encrypted archive.

### 10.9 Vault acceptance criteria

- A sync server cannot decrypt a test vault.
- Credentials do not appear in logs, analytics, crash reports, or ordinary API responses.
- A user can revoke a device.
- A user can recover with the recovery key.
- A failed sync never deletes the only local copy.
- A conflict creates a local backup before resolution.
- Account deletion removes the local copy and sends a documented deletion request for cloud ciphertext and metadata.
- Offline use continues through a clearly documented grace period.

---

## 11. P0 feature: Smart Server Finder

### 11.1 Problem

A raw server list is useful but noisy. Users want to find the best available server for a specific account and game without repeatedly scanning the same rows.

### 11.2 Free experience

Keep the existing core features free:

- Place ID;
- Job ID search;
- region filter;
- player count filter;
- ping filter;
- sorting;
- pagination;
- refresh;
- join;
- copy Job ID.

### 11.3 Pro experience

Add:

- saved filter presets;
- named preferences such as “quiet EU,” “low ping,” or “nearly empty”;
- weighted server scoring;
- favourite servers;
- avoid servers;
- server history;
- last-seen region and ping;
- automatic expiry for old server data;
- “best match” ranking;
- quick rejoin of a previously used server;
- optional alert when a match appears;
- separate preferences per game collection;
- selected-account visibility in every join action.

### 11.4 Filter model

The server filter model should support:

- minimum and maximum players;
- minimum and maximum ping;
- region allow-list;
- region deny-list;
- public, reserved, or VIP server type;
- Job ID exact or partial search;
- server age if available;
- server freshness;
- server capacity ratio;
- exclude previously visited server IDs;
- include only favourite server IDs;
- sort by ping;
- sort by player count;
- sort by newest;
- sort by score.

### 11.5 Region handling

Region is valuable only when it is accurate:

- source and timestamp must be available internally;
- unknown must remain unknown;
- never display a guessed region as fact;
- cache region lookups with an expiry;
- show when region data is unavailable;
- refresh region data as part of the normal server refresh;
- do not retain a “resolve regions” button if the product promises automatic resolution.

### 11.6 Joining

Every Join button must make the target unambiguous:

- selected account avatar and display name;
- experience name and Place ID;
- server Job ID;
- region;
- player count;
- ping;
- confirmation or one-click mode set by the user;
- result: launched, queued, failed, or cancelled.

When no account is selected, disable Join and explain how to select one.

### 11.7 Server cache

Use a bounded local cache:

- cache key: Place ID plus query profile;
- server record expiry;
- last observed ping;
- last observed player count;
- last join result;
- failure count;
- source;
- region confidence;
- user favourite/avoid status.

Do not treat cached data as live. Show its age.

### 11.8 Server intelligence acceptance criteria

- A Job ID search returns an exact match when present.
- Region filters do not match unknown regions unless the user explicitly enables unknown.
- Sort order is stable and testable.
- A saved preset can be applied in one action.
- Join always uses the selected account and never silently switches to another.
- A failed join explains whether the problem was authentication, server availability, or process launch.
- A previously used server is displayed as history, not as a live server, after expiry.
- Duplicate server rows are removed by server ID.

---

## 12. P0 feature: Activity Centre and analytics

### 12.1 Problem

The app performs many actions, but users need a reliable place to understand what happened:

- Did the account action succeed?
- Did the launch create a real process?
- When did the client disconnect?
- Which account has the most failures?
- Did a performance profile apply?
- Was a server join successful?

### 12.2 Activity Centre views

The Activity Centre should have four layers:

1. **Live sessions:** current windows and freshness.
2. **Timeline:** chronological app and account events.
3. **History:** searchable sessions and launches.
4. **Insights:** trends and summaries.

### 12.3 Event model

Each event should include:

- event ID;
- event type;
- timestamp;
- account ID if applicable;
- session ID if applicable;
- game ID and Place ID if applicable;
- severity;
- user-facing title;
- safe detail;
- technical diagnostic reference;
- source;
- resolution state;
- retention class.

### 12.4 Useful insights

For each account:

- launches this week;
- successful launches;
- failed launches;
- total live time;
- average session duration;
- disconnect count;
- most recent game;
- most recent server;
- average FPS;
- peak memory;
- last successful authentication;
- last backup.

For each game:

- launches;
- unique accounts;
- average session length;
- server join success;
- average ping;
- common disconnect reason.

### 12.5 Privacy

Analytics must be local by default. Cloud sync should be opt-in and encrypted. Product analytics should measure app health without sending account names, usernames, Job IDs, cookies, or raw activity text.

### 12.6 Retention

Suggested retention:

- Free: recent local history;
- Pro: longer local history and encrypted sync;
- user-controlled purge at any time;
- one-click export;
- event-level deletion;
- automatic cleanup for high-volume metrics.

### 12.7 Activity Centre acceptance criteria

- Every utility action creates a success or failure event.
- The event shows the selected account, not whichever account was previously open.
- Session history remains after the window closes.
- “In game” is not recorded without a timestamp and source.
- Users can filter by account, game, action, status, and date.
- Users can export their history.
- Sensitive fields are redacted before display or sync.

---

## 13. P0 feature: reliable per-account and per-window performance profiles

### 13.1 Problem

The user may set one account to 30 FPS and another to 240 FPS, but both clients can end up at the same value if the setting is applied globally or the wrong process is targeted.

### 13.2 Product promise

“This performance setting belongs to this account and this live window. It does not affect another Roblox client.”

### 13.3 FPS rules

- minimum allowed FPS: 15;
- recommended range: 15–240;
- allow a custom value only after validation;
- show whether the setting is requested, applied, observed, or unavailable;
- show helper capability and fallback behavior;
- do not claim true FPS if the app only controls a cap;
- distinguish configured cap from measured frame rate.

### 13.4 Applying settings

The flow must be process-specific:

1. Resolve the effective profile:
   - account override;
   - game override;
   - account plus game override;
   - utility default.
2. Start the client with a launch request ID.
3. Correlate the actual process.
4. Apply the profile to the exact process ID and creation time.
5. Verify the native helper result.
6. Read back the effective state where possible.
7. Store an application event.
8. If verification is impossible, show “requested” rather than “applied.”

Never rely on a shared global Roblox settings file if multiple clients can use it simultaneously. If a file must be patched, use a safe per-launch strategy and restore it without corrupting another launch.

### 13.5 Memory saver

“Memory saver” must be defined honestly. Possible actions may include:

- monitoring memory;
- applying a supported process priority;
- trimming working sets only when safe;
- reducing background update frequency;
- closing low-priority clients after a user-selected threshold;
- warning before a process is terminated.

Do not label a feature “compression” if it merely changes priority or trims memory. Document the exact behavior.

### 13.6 Performance UI

Show:

- configured profile name;
- target FPS;
- observed FPS;
- memory;
- CPU;
- GPU if available;
- native helper status;
- last applied time;
- target process ID;
- why a setting could not be applied.

### 13.7 Performance acceptance criteria

- Two clients with different FPS overrides receive different target configurations.
- Closing and reopening one client does not modify the other.
- The app can identify a helper failure.
- Values below 15 are rejected.
- Values from 15 through 240 are accepted and persisted.
- An account-specific setting overrides the utility default only when explicitly enabled.
- A game-specific setting has a documented precedence rule.
- The app does not claim a setting applied when the target process was not identified.
- The native helper cannot accidentally target Roblox Studio or a different user's client.

---

## 14. P1 feature: alerts and notifications

### 14.1 Valuable alerts

Allow users to subscribe to:

- client crashed;
- client closed unexpectedly;
- presence became stale;
- account login expired;
- Job ID changed;
- server join failed;
- server match found;
- memory exceeded threshold;
- FPS dropped below threshold;
- backup failed;
- sync conflict;
- device added or revoked;
- app update available.

### 14.2 Channels

Start with:

- in-app Activity Centre;
- Windows notifications.

Then explore:

- Discord webhook;
- email;
- mobile push through the future remote dashboard.

### 14.3 Safe notification content

Notifications should default to:

- alias or local account label;
- game name;
- event type;
- time;
- action required.

Never put cookies, passwords, authentication tickets, or full account details into a notification.

### 14.4 Alert controls

- per-account enablement;
- per-game enablement;
- quiet hours;
- debounce repeated failures;
- test notification;
- notification history;
- disable all alerts;
- privacy preview before enabling an external destination.

### 14.5 Acceptance criteria

- An alert is generated only after a real event.
- Repeated polling failures do not create a notification storm.
- A user can trace an alert back to an Activity Centre event.
- External integrations are disabled until explicitly configured.
- Webhook secrets are stored securely and never shown after saving.

---

## 15. P1 feature: account health and security centre

### 15.1 Purpose

Give users a clear place to assess whether an account is usable, backed up, and configured correctly without pretending to know private Roblox information that the API did not provide.

### 15.2 Health checks

Potential checks:

- authenticated session still valid;
- username and display name match the saved identity;
- avatar fetch succeeds;
- account utility permission works;
- presence visibility is readable;
- last login refresh;
- local credential bundle exists;
- backup is current;
- account appears in more than one collection;
- account has an invalid game or category reference;
- account has an unresolved action failure;
- account has a stale Job ID;
- account has a custom FPS profile that cannot be applied.

### 15.3 Health statuses

- Healthy;
- Needs refresh;
- Needs attention;
- Protected;
- Unknown;
- Unsupported.

Do not show a reassuring green state if the check was not actually performed.

### 15.4 Privacy settings

Offer:

- presence visibility guidance;
- local-only account metadata;
- clipboard clearing;
- auto-lock timeout;
- external API permission review;
- connected device review;
- session revocation where supported;
- export and delete.

The app may guide the user to Roblox settings, but it must not claim to modify a setting it cannot safely modify.

### 15.5 Acceptance criteria

- Every health badge has a source and last-checked time.
- Unsupported checks are labelled unsupported.
- Failed checks include a remediation path.
- Health refresh does not leak secrets into logs.
- The user can run one account or all-account checks with a visible progress state.

---

## 16. P1 feature: secure remote dashboard

### 16.1 User value

Users may want to check whether sessions are alive without sitting at the desktop. A remote dashboard could become a major differentiator, but it is also a significant security surface.

### 16.2 Phased approach

**Phase A — paired local dashboard**

- open a browser on the same machine;
- use a one-time pairing code;
- read-only live sessions;
- no credential access;
- no raw account utility actions.

**Phase B — secure remote read-only dashboard**

- device pairing;
- end-to-end encrypted session metadata;
- revocable device;
- two-factor authentication;
- explicit online indicator;
- audit log;
- no direct public port exposure by default.

**Phase C — limited remote controls**

- stop a managed client;
- request a refresh;
- trigger a safe relaunch;
- apply a saved performance profile.

Remote controls require re-authentication and a visible audit event.

### 16.3 Security requirements

- no exposed unauthenticated local API;
- no default external binding;
- short-lived access tokens;
- scoped permissions;
- rate limiting;
- device revocation;
- origin and CSRF protection;
- TLS for remote traffic;
- no cookies or password endpoints in the remote dashboard;
- no “get cookie” permission in any remote preset;
- audit every state-changing action.

### 16.4 Acceptance criteria

- A new device cannot connect without explicit approval.
- Revoking a device works immediately or within a documented maximum delay.
- The default installation exposes no public listener.
- Read-only dashboard data contains no raw secrets.
- Every remote control shows who requested it and when.

---

## 17. P1 feature: safe lifecycle automation

### 17.1 What users want

Users want the app to handle repetitive lifecycle work:

- if a client crashes, notify me;
- if a selected client closes, optionally relaunch it once;
- stagger launches when memory is high;
- stop a client after a schedule;
- apply a profile on launch;
- refresh a session before it becomes stale;
- remind me when a login needs attention.

### 17.2 Safe rule model

A rule should have:

- rule ID;
- enabled state;
- trigger;
- scope;
- condition;
- action;
- cooldown;
- maximum attempts;
- quiet hours;
- last run;
- next eligible run;
- audit record.

### 17.3 Allowed lifecycle actions

- notify;
- refresh metadata;
- retry a failed launch;
- relaunch a crashed client with a user-selected maximum;
- close a managed process;
- queue a launch until memory is available;
- apply a performance profile;
- export a diagnostic bundle;
- pause a rule.

### 17.4 Disallowed actions

Do not add:

- simulated mouse or keyboard gameplay;
- unattended farming;
- CAPTCHA solving;
- anti-detection behavior;
- stealth process hiding;
- bypasses for Roblox limits;
- automatic account rotation designed to evade enforcement;
- actions that impersonate human play.

### 17.5 Guardrails

- default off;
- visible rule status;
- maximum relaunch count;
- maximum concurrent clients;
- memory and CPU budget;
- user confirmation for destructive actions;
- dry-run preview;
- kill switch;
- activity log;
- automatic pause after repeated failures.

---

## 18. P1 feature: game intelligence and collections

### 18.1 Game refresh

When a user opens the Games tab:

- refresh game metadata if it is stale;
- show thumbnail;
- show title, creator, playing count, visits, and description;
- show last updated time;
- preserve cached data if the network is unavailable;
- show “cached” rather than pretending the data is current.

If the Games tab remains open, refresh at a bounded interval such as 30 seconds only when the window is visible and the user has not disabled live updates.

### 18.2 Game identity

Deduplicate games by the correct canonical identity:

- Place ID for launch identity;
- Universe ID for experience identity when available;
- normalized name only as a fallback;
- never duplicate recent entries because of different labels.

### 18.3 Favourites

- show a yellow filled star for favourited games;
- show an outlined star for unfavourited games;
- keep state visible in cards, sidebar, and detail panel;
- update instantly after a successful persistence response;
- recover the previous state if the write fails.

### 18.4 Collection management

Support:

- rename game collection;
- change Place ID with validation;
- refresh info;
- edit description;
- choose accent;
- create, rename, reorder, and delete categories;
- choose a category icon from the icon pack;
- move or duplicate an entire category to another game;
- move or duplicate individual accounts;
- show the destination before committing;
- show account count in every transfer action;
- create a backup before bulk destructive movement.

### 18.5 Bulk move/duplicate flow

1. User selects source game and category.
2. User clicks Move or Duplicate section.
3. App displays account count and source.
4. User selects destination game and category.
5. User chooses Move or Duplicate.
6. App previews affected accounts.
7. App explains what will happen to launch history, server target, FPS profile, and category assignment.
8. User confirms.
9. Main process performs the transaction.
10. App reports successes and failures individually.
11. Activity Centre records the operation.

### 18.6 Category icon pack

Initial icon pack:

- archive;
- box;
- chest;
- coins;
- flame;
- folder;
- gem;
- gift;
- map;
- shield;
- spark;
- star;
- swords;
- target;
- users;
- wrench.

Future icon pack principles:

- one coherent stroke weight;
- readable at 14–24px;
- accessible tooltip and text label;
- no arbitrary coloured squares;
- selected state that does not rely on colour alone;
- keyboard navigable picker.

---

## 19. P1 feature: account actions that users can trust

### 19.1 Account action contract

Every account action must have:

- selected account ID;
- action name;
- input validation;
- authentication context;
- request ID;
- start time;
- progress state;
- result;
- safe error;
- retry behavior;
- Activity Centre event;
- no stale modal data.

### 19.2 Correct selected-account binding

When opening the profile tools modal:

- pass the account ID, not the account object copied from an old render;
- reset transient result state when the account ID changes;
- abort in-flight actions for the previous account;
- ignore late responses from an old account;
- show the new avatar, username, display name, place, Job ID, and settings immediately;
- never allow a previous account's result to appear under a new account.

### 19.3 Browser context

Account actions that depend on a browser session must:

- create or reuse a browser context tied to the selected account;
- validate that the context is alive;
- obtain the required browser tracking context correctly;
- recover from missing or invalid BrowserTrackerID;
- show a direct “Open browser and retry” path;
- avoid sending an empty tracking ID;
- distinguish an HTTP 400, 401, 403, 404, 415, rate limit, and network failure;
- never silently fall back to another account's browser.

### 19.4 Supported-action matrix

Create a visible internal matrix:

| Action | Requires browser | Requires authenticated API | Destructive | Retryable | Status |
|---|---:|---:|---:|---:|---|
| Refresh account | Sometimes | Yes | No | Yes | Repair |
| Check Robux balance | Yes | Yes | No | Yes | Repair |
| Read email | Yes | Yes | No | Yes | Repair |
| Logout sessions | Yes | Yes | Yes | Yes | Repair |
| Set follow privacy | Yes | Yes | No | Yes | Repair |
| Change password | Yes | Yes | Yes | Limited | Repair |
| Change email | Yes | Yes | Yes | Limited | Repair |
| Set display name | Yes | Yes | No | Yes | Repair |
| Send friend request | Yes | Yes | No | Yes | Repair |
| Toggle block | Yes | Yes | Yes | Yes | Repair |
| Join group | Yes | Yes | No | Yes | Repair |

The UI should hide or label unsupported actions rather than presenting a control that fails every time.

### 19.5 Destructive action handling

For logout, password, email, block, delete, or other destructive actions:

- show scope;
- explain reversibility;
- ask for confirmation;
- require the action to be associated with the selected account;
- provide a retry only if safe;
- add an Activity Centre entry;
- show the server response in plain language.

---

## 20. P1 feature: import, export, and migration

### 20.1 Safe export

Provide two export types:

1. **Metadata export**
   - games;
   - categories;
   - aliases;
   - settings;
   - launch profiles;
   - server presets;
   - activity summary.

2. **Encrypted vault export**
   - encrypted credentials only when explicitly selected;
   - password or recovery-key protection;
   - warning that the file grants account access;
   - checksum;
   - version;
   - creation time.

Never include raw secrets in a normal JSON export.

### 20.2 Import safety

- show a preview;
- show new, changed, conflicting, and skipped records;
- validate Place IDs and categories;
- never overwrite live credentials without confirmation;
- create a pre-import backup;
- allow dry-run;
- display failure per row;
- record import summary.

### 20.3 Migration

Support:

- current Virgue schema;
- legacy flat groups;
- duplicate game identities;
- duplicate accounts;
- missing categories;
- invalid account references;
- older FPS values;
- removed settings.

Every migration should be reversible through the pre-migration backup.

---

## 21. P1 feature: performance and resource centre

### 21.1 User value

Multi-client setups are limited by the user's computer. Users need to understand whether the problem is Roblox, the network, the selected settings, or system resource pressure.

### 21.2 Metrics

Per session:

- process CPU;
- process working set;
- private bytes where available;
- system memory;
- GPU usage where available;
- GPU memory where available;
- FPS cap;
- measured FPS if available;
- frame-time sample if available;
- ping;
- process responsiveness;
- temperature only if a trusted source is available.

### 21.3 Resource budgets

Let users set:

- maximum concurrent launches;
- maximum total client memory;
- pause launches above system-memory threshold;
- pause launches above CPU threshold;
- maximum clients per account;
- low-memory notification threshold;
- cleanup grace period;
- alert cooldown.

### 21.4 Recommendations

Recommendations should be explainable:

- “Launching another client may exceed your 8 GB available memory.”
- “This client has used more memory than the selected threshold for 5 minutes.”
- “The 30 FPS cap was requested but the helper did not confirm it.”
- “Presence is unavailable; process liveness is still confirmed.”

Do not use opaque “AI optimization” labels. If a recommendation is rule-based, say so.

---

## 22. P1 feature: local API and integration centre

### 22.1 Current direction

The current application has a local Web API and Roblox Control Bridge. The premium opportunity is to make those integrations safe, observable, and easier to use.

### 22.2 API permissions

Split permissions into scopes:

- read account metadata;
- read live session metadata;
- read Activity Centre;
- launch account;
- stop managed session;
- update game configuration;
- update performance profile;
- run safe health check;
- send control command;
- access credential material — disabled by default and not available to remote integrations.

### 22.3 API security

- disabled by default;
- bind localhost by default;
- explicit external-connections warning;
- generated token;
- token rotation;
- token revocation;
- rate limiting;
- request audit log;
- no secrets in responses;
- no browser cookies through the API;
- clear port collision errors.

### 22.4 Integration templates

Offer safe templates:

- Discord presence showing current game and session count;
- a read-only status page;
- a local stream-deck-style launch controller;
- a diagnostics exporter;
- a safe server preset launcher.

Any integration that can launch or stop accounts must show its scope and require pairing.

---

## 23. P2 feature: team workspaces

### 23.1 Intended customers

- small development teams testing their own experiences;
- households with shared machines;
- trusted operators managing shared game metadata;
- support teams maintaining a controlled environment.

### 23.2 Shared objects

Start with non-secret data:

- games;
- categories;
- category icons;
- server presets;
- launch profiles;
- performance profiles;
- documentation;
- Activity Centre summaries.

### 23.3 Roles

- Owner;
- Admin;
- Operator;
- Viewer.

### 23.4 Permission examples

| Capability | Owner | Admin | Operator | Viewer |
|---|---:|---:|---:|---:|
| Manage billing | Yes | No | No | No |
| Manage members | Yes | Yes | No | No |
| Edit game metadata | Yes | Yes | Yes | No |
| Launch an approved profile | Yes | Yes | Yes | No |
| Stop a managed session | Yes | Yes | Yes | No |
| View session metadata | Yes | Yes | Yes | Yes |
| View credentials | Never by default | Never by default | Never by default | Never |

### 23.5 Team safety

Do not add raw cookie sharing as a normal workflow. If a future enterprise customer genuinely needs encrypted credential delegation, treat it as a separate security product with legal, technical, and support review.

---

## 24. P2 feature: remote notifications and mobile companion

### 24.1 Opportunity

A mobile companion can make the subscription tangible without attempting to recreate the entire desktop app.

### 24.2 First version

Read-only:

- live session list;
- account status;
- current game;
- Job ID;
- region;
- uptime;
- last alert;
- last backup;
- device status.

### 24.3 Later controls

- stop a managed window;
- retry one launch;
- pause rules;
- acknowledge alerts;
- request a health check.

No credential display, cookie export, or unrestricted browser actions.

---

## 25. P2 feature: customer-facing support and diagnostics

### 25.1 Diagnostic bundle

Provide a redacted bundle containing:

- app version;
- Windows version;
- architecture;
- helper availability;
- settings summary with sensitive values removed;
- recent error categories;
- session lifecycle events;
- process correlation diagnostics;
- API response status codes;
- no usernames unless the user explicitly selects them;
- no cookies, passwords, tokens, or raw headers.

### 25.2 Support workflow

- copy diagnostic ID;
- open help centre;
- attach diagnostic bundle;
- search known issue messages;
- show service status;
- check for app update;
- report a problem.

### 25.3 Paid support

Priority support can be included in Pro, but support is not a substitute for reliable software. The product must first reduce the number of support requests through clear state and diagnostics.

---

## 26. UI and UX roadmap

The visual direction is clean Neo-Brutalism: strong outlines, deliberate offset shadows, expressive typography, flat colour blocks, and clear hierarchy. The style should feel designed, not decorative.

### 26.1 Design principles

- Every panel has one clear purpose.
- Every modal opens centred in the app window.
- Every modal is sized to its content up to the available viewport.
- Use internal sections before adding a scrollbar.
- Never allow a small control to collide with an input.
- Buttons use readable text and consistent widths.
- Icons sit by themselves when the design calls for an icon, without arbitrary square containers.
- Colour indicates meaning, but text and shape carry the meaning too.
- Empty states explain the next action.
- Error states explain recovery.
- Settings have aligned labels, controls, and tooltip affordances.

### 26.2 Navigation

Top-level tabs:

- Accounts;
- Games;
- Servers;
- Activity Centre;
- Settings.

Utilities should be a selected-account action surface, not a hidden bottom navigation destination.

### 26.3 Accounts page

Account grid requirements:

- equal card width and height;
- responsive grid;
- one card per unique account;
- game/category assignment displayed as metadata;
- session state with freshness;
- avatar shown without an arbitrary container;
- stable action affordances;
- selected state visible;
- no secure-session summary label if it adds noise;
- quick launch action;
- three-dot profile tools action;
- keyboard focus state.

### 26.4 Selected profile panel

Use a stable vertical hierarchy:

1. identity;
2. session state;
3. primary actions;
4. profile details;
5. Place ID and Job ID;
6. account tools;
7. performance override;
8. destructive action.

The panel must never allow:

- avatar overlap with username;
- action buttons colliding with Place ID;
- remove profile controls floating away from their label;
- old account data surviving a selection change;
- a modal result from account A appearing under account B.

### 26.5 Games page

- no random red squares;
- thumbnail and title aligned in a single identity block;
- yellow filled favourite star;
- account count and category count as secondary metadata;
- clear Add Account action;
- clear gated Bulk launch action;
- game refresh status;
- category icon and count;
- edit and delete actions grouped together;
- no duplicate recent games.

### 26.6 Servers page

Suggested layout:

1. Place ID block;
2. Filter block;
3. Saved presets;
4. Live data status;
5. Server table;
6. Pagination and refresh footer.

Filter controls should be grouped:

- Search;
- Region;
- Players;
- Ping;
- Sort;
- Server type;
- Preset actions.

The Join button should have enough width for its label, strong contrast, a clear selected-account context, and a result state.

### 26.7 Activity Centre

Use the full available width for live sessions. Avoid a narrow sidebar that forces critical data below the fold.

Each row should show:

- account;
- live status;
- experience;
- Job ID;
- region;
- last checked;
- uptime;
- performance;
- action.

### 26.8 Settings

Settings should use aligned cards with:

- section label;
- one-line explanation;
- tooltip icon;
- control at the same right edge;
- consistent vertical rhythm;
- inline dependent settings;
- clear restart requirement;
- saved state;
- error state.

Remove any setting that is merely a mock switch or duplicates an automatic Roblox behavior.

### 26.9 Tooltip system

Every toggle, select, input, and advanced action should have a tooltip or help text containing:

- what it does;
- when it applies;
- whether it requires restart;
- what happens if it fails;
- privacy implications;
- whether it is Free or Pro.

Tooltip requirements:

- keyboard accessible;
- mouse hover accessible;
- not clipped by a modal;
- no important information only available on hover;
- short title plus concise detail;
- consistent visual design;
- no “AI-powered” wording unless there is a real user-visible model.

### 26.10 Motion

Use motion sparingly:

- launch progress;
- status transitions;
- toast entry and exit;
- modal open;
- refresh indicator.

Respect reduced-motion preferences. Never animate a critical status so aggressively that users cannot read it.

### 26.11 Accessibility

- keyboard navigation;
- visible focus;
- minimum contrast;
- accessible names for icons;
- tooltips not required for core understanding;
- minimum click target size;
- no colour-only status;
- screen-reader labels for account cards;
- error summaries at the top of long forms.

---

## 27. Subscription and entitlement architecture

### 27.1 Billing principle

The renderer must not be trusted with subscription authority. Entitlements should be verified by the main process using a signed response or a secure provider flow.

### 27.2 Entitlement states

- Free;
- Trial;
- Pro active;
- Pro grace period;
- Pro expired;
- Payment action required;
- Offline verification pending;
- Account deletion pending.

### 27.3 Offline behavior

Virgue is a desktop app and must remain useful if the user briefly loses internet:

- continue local account management;
- continue local launching;
- continue local session tracking;
- allow a documented entitlement grace period;
- pause cloud sync if entitlement cannot be verified;
- never delete local data because a billing request failed.

### 27.4 Checkout

Evaluate:

- a provider-hosted web checkout;
- Microsoft Store distribution;
- a hybrid installer plus web account;
- regional VAT handling;
- refunds;
- cancellation;
- chargeback;
- family and business invoices.

Do not store payment card data in the desktop app.

### 27.5 Entitlement enforcement

Premium checks should be capability-based:

- canSyncVault;
- canUseSavedServerPresets;
- canViewExtendedHistory;
- canUseAlerts;
- canUseRemoteDashboard;
- canUseAdvancedPerformanceProfiles;
- canUseTeamWorkspace.

Avoid scattering direct “isPro” checks through the renderer.

### 27.6 Trial design

A trial should:

- start after a clear user action;
- show days remaining;
- show what will happen after expiry;
- keep local data;
- allow export;
- not silently downgrade settings;
- offer cancellation instructions;
- not require raw Roblox credentials to create a Virgue account.

---

## 28. Technical architecture roadmap

### 28.1 Main process authority

The main process owns:

- account storage;
- secrets;
- process discovery;
- session correlation;
- native helper invocation;
- network requests;
- sync;
- billing verification;
- integrations;
- event persistence.

The renderer owns:

- presentation;
- local transient form state;
- optimistic visual feedback that can be rolled back;
- accessible interaction;
- view filters.

The renderer must never:

- read files directly;
- access Node.js;
- call raw ipcRenderer;
- handle cookies;
- decide which process belongs to an account;
- write billing entitlements.

### 28.2 Typed IPC expansion

Add typed contracts for:

- session list;
- session detail;
- session event stream;
- session stop;
- session focus;
- session refresh;
- session diagnostics;
- performance application result;
- performance observation;
- vault status;
- vault backup;
- vault restore;
- device approval;
- device revoke;
- server preset CRUD;
- server score;
- activity query;
- activity export;
- alert rule CRUD;
- entitlement state;
- feature availability;
- diagnostic bundle generation.

Every new channel must be:

- named in the shared channel table;
- validated in the main process;
- exposed through the preload allow-list;
- typed in the renderer;
- covered by a failure test;
- reviewed for secret exposure.

### 28.3 Event versus snapshot

Use:

- snapshots for initial load and recovery;
- events for live changes;
- sequence numbers for event ordering;
- a resync path when the renderer detects a gap;
- account/session IDs as stable keys.

Never use array index as an identity.

### 28.4 Process lifecycle service

Create a dedicated service rather than growing watcher.ts indefinitely:

- LaunchCoordinator;
- ProcessRegistry;
- SessionCorrelator;
- PresencePoller;
- MetricsSampler;
- CleanupManager;
- LifecyclePolicyEngine.

They can share a typed domain model but should not share uncontrolled mutable objects.

### 28.5 Background work

All polling and sync loops need:

- cancellation;
- backoff;
- jitter;
- maximum concurrency;
- rate-limit handling;
- app-close shutdown;
- offline detection;
- last-run timestamp;
- error categorization.

### 28.6 Data consistency

Use transactions for:

- account transfer;
- category deletion;
- bulk duplicate;
- game removal;
- account removal;
- vault restore;
- subscription downgrade migrations.

Create a backup before destructive bulk operations.

---

## 29. Security architecture

### 29.1 Secret handling

- use Windows secure storage for local credentials;
- keep cookies separate from profile metadata;
- avoid passwords in memory longer than necessary;
- clear temporary buffers where practical;
- do not put secrets in React state;
- do not put secrets in URLs;
- do not put secrets in IPC error messages;
- do not put secrets in crash dumps;
- redact logs by field name and pattern;
- clear clipboard after an optional short timeout for sensitive copy actions.

### 29.2 Browser windows

- isolate each account context;
- use a clearly visible account label;
- do not reuse the wrong account's session;
- close or lock contexts when the user signs out;
- validate external URLs;
- warn before navigating to an untrusted domain;
- do not inject arbitrary JavaScript unless the user explicitly uses a clearly labelled advanced feature;
- show the selected account in the browser window title.

### 29.3 External links

- allow-list Roblox domains where possible;
- use shell.openExternal only for validated URLs;
- never interpolate unvalidated user input into a privileged command;
- prevent navigation from changing the app's own origin unexpectedly.

### 29.4 Local API

- off by default;
- localhost by default;
- random token;
- no account credential endpoints;
- explicit external binding warning;
- token rotation;
- audit log.

### 29.5 Update and packaging security

- sign production builds where practical;
- publish hashes;
- keep native helper licenses;
- verify downloaded updates;
- protect update channels;
- provide release notes;
- do not ask users to disable antivirus blindly;
- document why a native helper exists.

### 29.6 Security review gates

Before Pro launch:

- secrets review;
- IPC review;
- external URL review;
- local API review;
- native helper review;
- sync cryptography review;
- billing review;
- data deletion review;
- support bundle redaction test;
- malicious local process test;
- dependency audit.

---

## 30. Testing and quality plan

### 30.1 Unit tests

Cover:

- account deduplication;
- game deduplication;
- category transfers;
- move versus duplicate semantics;
- schema migrations;
- FPS validation;
- profile precedence;
- session state derivation;
- stale presence expiry;
- event redaction;
- server sorting;
- server filters;
- entitlement transitions;
- sync conflict resolution;
- alert debounce.

### 30.2 Integration tests

Cover:

- preload allow-list;
- typed IPC request and error flow;
- account modal selection changes;
- account utility context;
- launch correlation;
- process cleanup;
- native helper targeting;
- Activity Centre event persistence;
- import/export;
- backup and restore;
- local API permissions.

### 30.3 Process matrix

Test combinations:

- one client;
- two clients;
- three clients;
- client plus Roblox Studio;
- client plus Roblox Installer;
- client started from Virgue;
- client started outside Virgue;
- client crash;
- client closes normally;
- client freezes;
- user signs out;
- network unavailable;
- presence unavailable;
- Job ID unavailable;
- slow computer;
- low memory;
- multi-instance guard unavailable;
- another app owns the settings file.

### 30.4 UI tests

Verify:

- modal centres at every supported window size;
- modal content fits before scrolling where possible;
- no account panel collision;
- equal account cards;
- selected account changes all dependent data;
- server Join button text is readable;
- icon alignment;
- tooltip placement;
- keyboard navigation;
- reduced motion;
- empty and error states.

### 30.5 Packaging tests

- clean install;
- upgrade install;
- uninstall;
- per-user data preservation;
- data migration;
- native helper extraction;
- Windows Defender/SmartScreen review;
- launch from desktop shortcut;
- launch after reboot;
- app close while Roblox is running;
- app restart with Roblox running;
- installer hash publication.

### 30.6 Release gates

Do not ship a Pro feature if:

- it has a mock success path;
- it cannot be disabled safely;
- it leaks secrets;
- it has no offline or failure behavior;
- it creates unbounded polling;
- it cannot be tested with two accounts;
- it does not have a migration plan;
- the UI shows state the main process cannot verify.

---

## 31. Product metrics

### 31.1 Activation

Measure locally or with opt-in product analytics:

- app installed;
- first launch;
- first game added;
- first account login;
- first successful launch;
- first session correctly correlated;
- first server join;
- first backup;
- first saved server preset;
- first alert configured.

### 31.2 Reliability targets

Initial internal targets:

- 99%+ correct account-to-process mapping in the supported test matrix;
- no duplicate account rows from multi-game assignment;
- closed managed process reflected in the UI within the target freshness window;
- no stale “In game” state after the configured expiry;
- zero known plaintext secrets in logs or cloud payloads;
- zero accidental termination of Roblox Studio or Installer in cleanup tests;
- failed actions show actionable error categories;
- a renderer refresh never changes the selected account unexpectedly.

These are engineering targets to validate, not marketing promises before measurement.

### 31.3 Subscription metrics

- trial start rate;
- activation within trial;
- conversion;
- monthly retention;
- annual-plan adoption;
- cancellation reason;
- support tickets per subscriber;
- backup usage;
- Session Guardian usage;
- alert usage;
- saved server preset usage;
- Pro feature failure rate.

### 31.4 Value signals

Strong signs of recurring value:

- user returns to Activity Centre;
- user restores or syncs a device;
- user configures alerts;
- user uses a server preset repeatedly;
- user reviews a failure history;
- user changes performance profiles by account;
- user keeps a backup healthy.

Weak signs:

- user only opens the app to click Launch;
- user never enables history, sync, alerts, or presets;
- user disables all background observation;
- user cannot explain what Pro saved them.

---

## 32. Roadmap phases

### Phase 0 — Trust audit

**Goal:** make the current product honest and safe.

Deliver:

- settings registry;
- remove mock settings;
- typed error taxonomy;
- account selection race fix;
- storage versioning;
- event bus;
- secret redaction;
- current process cleanup audit;
- current FPS behavior audit;
- modal and alignment fixes;
- reliable test fixtures.

Exit criteria:

- every visible control has a real outcome;
- unsupported actions are labelled;
- no known stale modal data bug;
- no known broad process-kill path.

### Phase 1 — Session Guardian

**Goal:** make live state trustworthy.

Deliver:

- SessionRecord;
- process registry;
- launch correlation;
- independent presence freshness;
- per-window metrics;
- cleanup manager;
- Activity Centre live view;
- session history;
- session diagnostics.

Exit criteria:

- three-account test passes;
- crash and normal close pass;
- app restart recovery passes;
- false-running state is bounded and explained.

### Phase 2 — Pro foundation

**Goal:** create paid value users can understand.

Deliver:

- Pro entitlement service;
- trial flow;
- Windows notifications;
- extended Activity Centre history;
- saved server presets;
- advanced performance profiles;
- backup health;
- documentation and support bundle.

Exit criteria:

- Pro features work offline according to the documented grace period;
- cancellation preserves local data;
- trial expiry is clear;
- all paid features have a free fallback where appropriate.

### Phase 3 — Encrypted Vault Sync

**Goal:** make migration and recovery safe.

Deliver:

- end-to-end encrypted vault;
- device approval;
- recovery key;
- version history;
- conflict resolution;
- deletion flow;
- sync diagnostics.

Exit criteria:

- external security review complete;
- server cannot decrypt test vault;
- restore and revoke scenarios pass;
- no secret appears in support bundle.

### Phase 4 — Smart Server Finder

**Goal:** turn server browsing into a repeatable advantage.

Deliver:

- filter profiles;
- favourites and avoid lists;
- scoring;
- history;
- exact rejoin;
- match alerts;
- cache freshness.

Exit criteria:

- server filters and sort are deterministic;
- Job ID joining always uses the selected account;
- unknown region is never presented as fact;
- stale cache is visibly labelled.

### Phase 5 — Safe lifecycle automation

**Goal:** remove repetitive monitoring work without gameplay automation.

Deliver:

- rule model;
- crash notification;
- bounded relaunch;
- resource-aware launch queue;
- schedule;
- kill switch;
- audit history.

Exit criteria:

- rules are off by default;
- every run is auditable;
- repeated failures pause the rule;
- no input simulation or unattended gameplay functionality exists.

### Phase 6 — Remote and Team

**Goal:** expand the product after the local experience retains users.

Deliver:

- paired read-only dashboard;
- secure remote alerts;
- scoped remote controls;
- shared metadata workspaces;
- roles;
- member audit log.

Exit criteria:

- threat model reviewed;
- device revocation tested;
- default install exposes no public service;
- raw credentials remain private.

---

## 33. Detailed implementation backlog

The following backlog is intentionally granular. Each item should become an issue only after the relevant product decision is accepted.

### Foundations

- FOUND-001: Add persisted schema version to the primary data file.
- FOUND-002: Create migration runner with pre-migration backup.
- FOUND-003: Add migration fixtures for legacy flat categories.
- FOUND-004: Add migration fixture for duplicate game records.
- FOUND-005: Add migration fixture for old FPS settings.
- FOUND-006: Create visible settings registry.
- FOUND-007: Mark every setting as working, partial, unsupported, or removed.
- FOUND-008: Remove controls with no implementation.
- FOUND-009: Add typed domain error categories.
- FOUND-010: Redact secrets in main-process errors.
- FOUND-011: Redact secrets in Activity Centre events.
- FOUND-012: Create event bus in the main process.
- FOUND-013: Add renderer event subscription through preload.
- FOUND-014: Add sequence numbers to event messages.
- FOUND-015: Add snapshot resync when an event gap is detected.
- FOUND-016: Create transaction helper for bulk data operations.
- FOUND-017: Add backup before destructive bulk changes.
- FOUND-018: Add feature availability response to typed IPC.
- FOUND-019: Add app diagnostic ID.
- FOUND-020: Add release-channel metadata.

### Account identity

- ACCOUNT-001: Deduplicate account cards by stable account ID.
- ACCOUNT-002: Add account identity resolver for username and display name.
- ACCOUNT-003: Store last successful identity refresh separately from last presence.
- ACCOUNT-004: Add account selection request ID to renderer state.
- ACCOUNT-005: Abort stale account modal requests.
- ACCOUNT-006: Ignore late responses for a previous account selection.
- ACCOUNT-007: Reset account action result when account ID changes.
- ACCOUNT-008: Add selected-account context to every action confirmation.
- ACCOUNT-009: Add account health badge source and timestamp.
- ACCOUNT-010: Add account-level diagnostic history.

### Process and session tracking

- SESSION-001: Define SessionRecord shared type.
- SESSION-002: Define SessionProcessState shared type.
- SESSION-003: Define SessionPresenceState shared type.
- SESSION-004: Define SessionEvent shared type.
- SESSION-005: Create ProcessRegistry.
- SESSION-006: Capture process creation time.
- SESSION-007: Capture launch request ID before client launch.
- SESSION-008: Capture process tree after launch.
- SESSION-009: Correlate child process by creation time and path.
- SESSION-010: Record window handle when available.
- SESSION-011: Reject ambiguous process correlation.
- SESSION-012: Show unidentified client state.
- SESSION-013: Poll process liveness independently of presence.
- SESSION-014: Add presence freshness timestamp.
- SESSION-015: Add missed-check counter.
- SESSION-016: Expire stale presence.
- SESSION-017: Clear Job ID after session exit.
- SESSION-018: Persist session history on exit.
- SESSION-019: Recover live processes on app restart.
- SESSION-020: Detect crash exit.
- SESSION-021: Detect unresponsive process.
- SESSION-022: Add session close reason.
- SESSION-023: Add session cleanup grace period.
- SESSION-024: Add managed-process registry.
- SESSION-025: Exclude Roblox Studio from cleanup.
- SESSION-026: Exclude Roblox Installer from cleanup.
- SESSION-027: Add explicit managed-client close confirmation.
- SESSION-028: Add cleanup result event.
- SESSION-029: Add session focus action.
- SESSION-030: Add session refresh action.
- SESSION-031: Add session stop action.
- SESSION-032: Add session rejoin action.
- SESSION-033: Add session Job ID copy action.
- SESSION-034: Add per-window session detail view.
- SESSION-035: Add multi-client process mapping test.
- SESSION-036: Add restart recovery test.

### Presence and Roblox data

- PRESENCE-001: Add presence source field.
- PRESENCE-002: Add presence requested timestamp.
- PRESENCE-003: Add presence response timestamp.
- PRESENCE-004: Distinguish no permission from network failure.
- PRESENCE-005: Distinguish offline from unknown.
- PRESENCE-006: Clear previous location after expiry.
- PRESENCE-007: Show account privacy limitation.
- PRESENCE-008: Add user-triggered refresh.
- PRESENCE-009: Add bounded automatic refresh.
- PRESENCE-010: Add rate-limit backoff.
- PRESENCE-011: Add account visibility guidance.
- PRESENCE-012: Add presence test fixtures.

### Performance

- PERF-001: Validate FPS minimum at 15.
- PERF-002: Validate FPS maximum according to helper capability.
- PERF-003: Store configured cap separately from observed FPS.
- PERF-004: Add performance profile precedence resolver.
- PERF-005: Capture target process ID before native helper call.
- PERF-006: Capture target process creation time before native helper call.
- PERF-007: Return native helper result with diagnostic details.
- PERF-008: Verify FPS application where supported.
- PERF-009: Show requested versus applied state.
- PERF-010: Prevent helper from targeting Studio.
- PERF-011: Prevent helper from targeting Installer.
- PERF-012: Add account-specific FPS profile.
- PERF-013: Add game-specific FPS profile.
- PERF-014: Add account-plus-game FPS profile.
- PERF-015: Add memory saver definition and status.
- PERF-016: Add memory sample to SessionRecord.
- PERF-017: Add CPU sample to SessionRecord.
- PERF-018: Add resource budget settings.
- PERF-019: Add resource-aware launch queue.
- PERF-020: Add helper unavailable fallback.
- PERF-021: Add two-client different-FPS integration test.
- PERF-022: Add process exit cleanup for temporary settings.

### Activity Centre

- ACTIVITY-001: Define event retention classes.
- ACTIVITY-002: Add event query IPC.
- ACTIVITY-003: Add account filter.
- ACTIVITY-004: Add game filter.
- ACTIVITY-005: Add action filter.
- ACTIVITY-006: Add date filter.
- ACTIVITY-007: Add severity filter.
- ACTIVITY-008: Add live session table.
- ACTIVITY-009: Add session history table.
- ACTIVITY-010: Add launch success summary.
- ACTIVITY-011: Add disconnect summary.
- ACTIVITY-012: Add resource trend view.
- ACTIVITY-013: Add Job ID copy confirmation.
- ACTIVITY-014: Add safe diagnostic export.
- ACTIVITY-015: Add local history retention settings.
- ACTIVITY-016: Add Pro extended history entitlement.

### Servers

- SERVER-001: Define ServerFilterProfile type.
- SERVER-002: Add exact Job ID search.
- SERVER-003: Add partial Job ID search.
- SERVER-004: Add region allow-list.
- SERVER-005: Add region deny-list.
- SERVER-006: Add minimum player filter.
- SERVER-007: Add maximum player filter.
- SERVER-008: Add minimum ping filter.
- SERVER-009: Add maximum ping filter.
- SERVER-010: Add server type filter.
- SERVER-011: Add stable sort by ping.
- SERVER-012: Add stable sort by players.
- SERVER-013: Add stable sort by newest.
- SERVER-014: Add server freshness.
- SERVER-015: Add region confidence.
- SERVER-016: Add server cache expiry.
- SERVER-017: Add favourite server state.
- SERVER-018: Add avoid server state.
- SERVER-019: Add server history.
- SERVER-020: Add saved server presets.
- SERVER-021: Add server score explanation.
- SERVER-022: Add selected-account display beside Join.
- SERVER-023: Disable Join with no selected account.
- SERVER-024: Add Join progress state.
- SERVER-025: Add Join failure taxonomy.
- SERVER-026: Add Join result event.
- SERVER-027: Add rejoin last known server.
- SERVER-028: Deduplicate server rows by ID.
- SERVER-029: Add server list pagination tests.
- SERVER-030: Add filter combination tests.

### Games and categories

- GAME-001: Canonicalize game identity by Place ID.
- GAME-002: Merge duplicate recent games.
- GAME-003: Add thumbnail refresh timestamp.
- GAME-004: Add stale game-info indicator.
- GAME-005: Refresh visible game metadata.
- GAME-006: Bound the 30-second refresh loop.
- GAME-007: Stop refresh when tab is hidden.
- GAME-008: Add yellow favourite star.
- GAME-009: Add filled versus outlined favourite state.
- GAME-010: Persist favourite state with rollback on failure.
- GAME-011: Rename game collection.
- GAME-012: Validate Place ID changes.
- GAME-013: Rename category.
- GAME-014: Reorder categories.
- GAME-015: Change category icon.
- GAME-016: Add icon picker keyboard support.
- GAME-017: Add category icon tooltip labels.
- GAME-018: Add bulk category transfer preview.
- GAME-019: Add move versus duplicate confirmation.
- GAME-020: Add transaction backup before bulk transfer.
- GAME-021: Add per-account transfer result.
- GAME-022: Add duplicate account prevention.
- GAME-023: Improve game empty state.
- GAME-024: Remove decorative placeholder squares.

### Account utilities

- UTILITY-001: Define action capability matrix.
- UTILITY-002: Add browser context ID tracking.
- UTILITY-003: Recover missing BrowserTrackerID.
- UTILITY-004: Display account context in browser window title.
- UTILITY-005: Add action request ID.
- UTILITY-006: Add action progress state.
- UTILITY-007: Add action retry policy.
- UTILITY-008: Add safe response parser.
- UTILITY-009: Handle 400 response.
- UTILITY-010: Handle 401 response.
- UTILITY-011: Handle 403 response.
- UTILITY-012: Handle 404 response.
- UTILITY-013: Handle 415 response.
- UTILITY-014: Handle rate limiting.
- UTILITY-015: Add check Robux result.
- UTILITY-016: Add account email result.
- UTILITY-017: Add logout sessions result.
- UTILITY-018: Add follow privacy result.
- UTILITY-019: Add display-name result.
- UTILITY-020: Add friend-request result.
- UTILITY-021: Add block result.
- UTILITY-022: Add group join result.
- UTILITY-023: Add utility Activity Centre entries.
- UTILITY-024: Add destructive-action confirmations.

### Vault and sync

- VAULT-001: Define encrypted vault envelope.
- VAULT-002: Define key hierarchy with security review.
- VAULT-003: Add vault status IPC.
- VAULT-004: Add local vault backup.
- VAULT-005: Add encrypted export.
- VAULT-006: Add recovery-key creation.
- VAULT-007: Add recovery-key confirmation.
- VAULT-008: Add device identity.
- VAULT-009: Add device approval.
- VAULT-010: Add device revocation.
- VAULT-011: Add encrypted upload.
- VAULT-012: Add encrypted download.
- VAULT-013: Add version list.
- VAULT-014: Add conflict preview.
- VAULT-015: Add keep-local resolution.
- VAULT-016: Add keep-remote resolution.
- VAULT-017: Add safe merge resolution.
- VAULT-018: Add sync failure recovery.
- VAULT-019: Add offline grace behavior.
- VAULT-020: Add cloud deletion request.
- VAULT-021: Add server-decryptability test.
- VAULT-022: Add secret redaction test.

### Alerts

- ALERT-001: Define AlertRule type.
- ALERT-002: Add Windows notifications.
- ALERT-003: Add crash alert.
- ALERT-004: Add disconnect alert.
- ALERT-005: Add stale-client alert.
- ALERT-006: Add login-expiry alert.
- ALERT-007: Add Job ID changed alert.
- ALERT-008: Add memory alert.
- ALERT-009: Add FPS alert.
- ALERT-010: Add backup-failure alert.
- ALERT-011: Add sync-conflict alert.
- ALERT-012: Add quiet hours.
- ALERT-013: Add debounce and cooldown.
- ALERT-014: Add notification test.
- ALERT-015: Add Discord webhook opt-in.
- ALERT-016: Secure webhook secret storage.

### Billing and Pro

- BILL-001: Select payment provider.
- BILL-002: Define Virgue account identity separate from Roblox identity.
- BILL-003: Define entitlement response.
- BILL-004: Add signed entitlement validation.
- BILL-005: Add trial state.
- BILL-006: Add Pro active state.
- BILL-007: Add grace period state.
- BILL-008: Add expired state.
- BILL-009: Add offline entitlement cache.
- BILL-010: Add subscription management link.
- BILL-011: Add cancellation messaging.
- BILL-012: Preserve local data after expiry.
- BILL-013: Add capability-based feature gates.
- BILL-014: Add upgrade prompts only at relevant moments.
- BILL-015: Add pricing experiment instrumentation.
- BILL-016: Add refund and support workflow.

### Remote and integrations

- REMOTE-001: Add local read-only dashboard.
- REMOTE-002: Add one-time pairing code.
- REMOTE-003: Add device revocation.
- REMOTE-004: Add read-only session scopes.
- REMOTE-005: Add stop-session scope.
- REMOTE-006: Add relaunch-session scope.
- REMOTE-007: Add remote audit log.
- REMOTE-008: Disable public binding by default.
- REMOTE-009: Add API token rotation.
- REMOTE-010: Add API rate limiting.
- REMOTE-011: Remove raw credential endpoint from remote scope.

### UI quality

- UI-001: Add centered modal positioning utility.
- UI-002: Add modal viewport sizing utility.
- UI-003: Add account-card equal-height grid.
- UI-004: Add responsive grid breakpoints.
- UI-005: Add selected account race tests.
- UI-006: Add server filter group layout.
- UI-007: Add readable Join button width.
- UI-008: Add copied confirmation pattern.
- UI-009: Add tooltip component.
- UI-010: Add tooltip keyboard behavior.
- UI-011: Add consistent icon sizing.
- UI-012: Remove arbitrary decorative squares.
- UI-013: Add yellow favourite-star tokens.
- UI-014: Add settings row alignment tokens.
- UI-015: Add error-banner remediation action.
- UI-016: Add accessible status labels.
- UI-017: Add reduced-motion support.
- UI-018: Add empty-state components.
- UI-019: Add loading-state components.
- UI-020: Add destructive confirmation component.

### QA and release

- QA-001: Add typecheck gate.
- QA-002: Add build gate.
- QA-003: Add package gate.
- QA-004: Add migration smoke test.
- QA-005: Add clean-install test.
- QA-006: Add upgrade-install test.
- QA-007: Add uninstall data-preservation test.
- QA-008: Add three-client process test.
- QA-009: Add Roblox Studio exclusion test.
- QA-010: Add Roblox Installer exclusion test.
- QA-011: Add helper permission-denied test.
- QA-012: Add API offline test.
- QA-013: Add cloud sync failure test.
- QA-014: Add secret redaction test.
- QA-015: Add installer hash publication.
- QA-016: Add release notes template.
- QA-017: Add support diagnostic bundle test.

---

## 34. Example user journeys

### 34.1 New user

1. Install Virgue.
2. See a short explanation of local-first storage.
3. Add a game by Place ID.
4. Add an account through the Roblox browser login flow.
5. See the username, display name, and avatar auto-filled.
6. Launch the account.
7. See a real launching state.
8. See the correct process, experience, and Job ID once available.
9. Close Roblox.
10. See the session become exited and cleanup complete.

### 34.2 Existing user with several accounts

1. Open Accounts.
2. See one card per unique account.
3. Select an account.
4. Open profile tools.
5. Change that account's FPS override to 30.
6. Launch it.
7. See the exact target process and applied result.
8. Select another account.
9. Set its override to 240.
10. Launch it.
11. Verify two independent session records and two independent performance states.

### 34.3 Server search

1. Select an account.
2. Open Servers.
3. Choose a saved “low ping EU” preset.
4. See Place ID and filters clearly separated.
5. Search or filter.
6. Review region, players, ping, freshness, and Job ID.
7. Click Join.
8. See selected account and target server in the progress state.
9. See the new session in Activity Centre.

### 34.4 Client crash

1. A managed Roblox client exits unexpectedly.
2. Process watcher detects exit.
3. Session is marked crashed.
4. Account card stops saying Running.
5. Activity Centre records the exit code and reason.
6. Windows notification appears if enabled.
7. A bounded relaunch rule may retry once if the user configured it.
8. Repeated failures pause the rule and notify the user.

### 34.5 New device restore

1. User installs Virgue on a new PC.
2. User chooses Restore encrypted vault.
3. Existing device approves the new device.
4. Encrypted data is downloaded.
5. User confirms the account groups to restore.
6. Local credentials remain protected.
7. User runs a health check.
8. User launches one account as a verification step.

### 34.6 Bulk category duplication

1. User opens a game collection.
2. User opens the category menu.
3. User chooses Duplicate section.
4. App shows the source, destination, and number of accounts.
5. User chooses another game and category.
6. App explains that account assignments will be copied and the source remains.
7. User confirms.
8. App reports each account result.
9. Activity Centre records the operation.

---

## 35. Product positioning and marketing language

### 35.1 Recommended positioning

**Short version:**

> Virgue is the secure Roblox account workspace that keeps every client, server, and setting accounted for.

**Pro version:**

> Virgue Pro adds Session Guardian, encrypted vault recovery, smart server presets, alerts, and long-term performance history so multi-account setups stay reliable instead of becoming a guessing game.

### 35.2 Feature names

Use names that describe outcomes:

- Session Guardian;
- Secure Vault;
- Smart Servers;
- Activity Centre;
- Performance Profiles;
- Account Health;
- Safe Rules;
- Device Hub.

Avoid vague names:

- AI Boost;
- Ultimate Mode;
- Secret Engine;
- Stealth;
- Anti-Detection;
- Magic Optimizer;
- Pro Toggle Pack.

### 35.3 Claims to avoid

Do not claim:

- “undetectable”;
- “ban proof”;
- “bypasses Roblox limits”;
- “guaranteed FPS”;
- “always knows your game”;
- “works around every authentication error”;
- “safe for any automation.”

Use qualified, testable claims:

- “tracks managed Windows clients”;
- “shows last verified presence time”;
- “encrypts vault contents before sync”;
- “applies supported performance profiles to a correlated process”;
- “notifies you when a managed client becomes stale.”

---

## 36. Research and validation plan

Do not build the entire plan before validating willingness to pay.

### 36.1 Interviews

Interview:

- users with 3–10 legitimate accounts;
- game developers testing across accounts;
- users who regularly switch devices;
- users who already use account managers;
- users who have experienced stale sessions or failed launches.

Ask:

- What is the most expensive failure in time?
- What causes you to reopen the app?
- What would you trust a cloud service to store?
- What would you never upload?
- Which alerts would you act on?
- How often do you need to find a particular server?
- Would £9.99 save you enough time each month?
- What would make you cancel?

### 36.2 Landing-page experiments

Test three messages:

1. “Never lose track of a Roblox client again.”
2. “Your encrypted multi-account Roblox workspace.”
3. “Find the right server and recover from every launch failure.”

Measure:

- email sign-up;
- waitlist completion;
- feature selection;
- trial start;
- pricing-page conversion.

### 36.3 Paid beta

Use a small paid beta with:

- clear refund path;
- visible limitations;
- support channel;
- bug-report form;
- no hidden cloud credential collection;
- weekly release notes.

The beta should validate:

- whether Session Guardian is accurate enough;
- whether users trust encrypted sync;
- whether alerts reduce anxiety;
- whether saved server presets are used repeatedly;
- whether £9.99 feels reasonable.

### 36.4 Cancellation survey

Required reasons:

- too expensive;
- not reliable enough;
- missing feature;
- no longer use multiple accounts;
- privacy concern;
- setup too complicated;
- Roblox changed behavior;
- performance cost;
- billing problem.

Turn every category into a roadmap signal rather than guessing.

---

## 37. Risk register

| Risk | Severity | Likelihood | Mitigation |
|---|---:|---:|---|
| Roblox changes authentication flow | High | High | Isolate Roblox client integration, add diagnostics, keep browser fallback |
| Presence is unavailable due to privacy | High | High | Separate process state from presence, show Unknown/Stale honestly |
| Multi-instance behavior changes | High | Medium | Guard feature, explicit failure, avoid installer relaunch loops |
| Native helper targets wrong process | High | Medium | Process ID plus creation-time binding, verification, kill switch |
| Sync leaks session material | Critical | Medium | End-to-end encryption, security review, no plaintext server payload |
| Antivirus flags native helpers | High | Medium | Sign builds, publish hashes, document helpers, minimize privileges |
| Users are unwilling to pay £9.99 | High | Medium | Validate with paid beta before full remote/team investment |
| Basic features are paywalled too aggressively | High | Medium | Keep local core and safety free |
| Cloud costs exceed revenue | Medium | Medium | Encrypt and compress, retention controls, usage budgets |
| Alert spam causes churn | Medium | High | Debounce, quiet hours, clear rule preview |
| Remote dashboard becomes a security hole | Critical | Medium | Start read-only, pair devices, no public listener by default |
| Account utilities return unstable errors | High | High | Capability matrix, browser context recovery, honest unsupported state |
| Stale cached server data causes bad joins | Medium | High | Expiry, timestamps, live refresh before join |
| User data is lost during migration | Critical | Low | Backup before migration, fixtures, rollback |
| Product drifts into unsafe automation | High | Medium | Explicit non-goals, review gates, no input simulation |
| Support becomes unsustainable | High | Medium | Diagnostic bundles, error taxonomy, release notes, limited matrix |

---

## 38. Things intentionally not to build

These are deliberate product boundaries:

- anti-detection or stealth modes;
- bypasses for Roblox's client limits;
- CAPTCHA solving;
- simulated gameplay input;
- unattended farming;
- account rotation intended to avoid enforcement;
- hidden process injection;
- kernel drivers;
- password collection outside an explicit Roblox login flow;
- plaintext cloud storage of cookies;
- remote raw-cookie access;
- bulk messaging or spam;
- unbounded launch loops;
- automatic killing of all processes by executable name;
- fake “AI” copy that does not describe a real capability;
- a setting that only changes a label;
- subscription locks that prevent users exporting or deleting their data.

---

## 39. Definition of done for every feature

A feature is not done when a button exists. It is done when:

- the user problem is documented;
- the feature has a clear owner;
- the feature has a Free/Pro/Team decision;
- the domain type is defined;
- the main-process implementation is authoritative;
- the preload bridge is allow-listed;
- the renderer has loading, success, failure, and empty states;
- the data shape has a migration plan;
- secrets are not exposed;
- failure behavior is documented;
- destructive operations are reversible or confirmed;
- the feature has unit tests;
- the feature has an integration test;
- the feature has a UI test where layout matters;
- the feature works after app restart;
- the feature works offline where promised;
- the feature creates a useful activity event;
- the tooltip/help text is written;
- the support diagnostic behavior is defined;
- the release notes describe the change;
- the feature has been tested with more than one account;
- the feature does not rely on array position or stale renderer state.

---

## 40. Release checklist

### Product

- Does the release solve a named user problem?
- Is the value understandable within the first session?
- Is the Free/Pro boundary clear?
- Are no mock controls visible?
- Are safety boundaries documented?

### Reliability

- Do two and three-account launches map correctly?
- Do sessions end correctly?
- Are stale states bounded?
- Are Job IDs current or clearly historical?
- Does cleanup avoid Studio and Installer?
- Do native helpers target the right process?

### Security

- Are secrets absent from logs?
- Is local storage protected?
- Are cloud payloads encrypted before upload?
- Are remote APIs off by default?
- Can devices be revoked?
- Can users export and delete data?

### UX

- Are modals centred?
- Are cards equal height?
- Are buttons readable?
- Are tooltips accessible?
- Are empty and error states useful?
- Are selected-account actions bound to the current account?

### Packaging

- Does typecheck pass?
- Does the production build pass?
- Does electron-builder create the installer?
- Does a clean machine install work?
- Do native helpers extract correctly?
- Are hashes and release notes published?

---

## 41. Suggested next ten implementation actions

1. Add the settings registry and remove any remaining mock controls.
2. Define SessionRecord, process states, presence states, and session events.
3. Implement account-to-process correlation using launch request IDs and process creation time.
4. Split process liveness from Roblox presence freshness.
5. Repair cleanup so only managed clients can be closed.
6. Add three-client integration tests.
7. Bind native FPS operations to the exact correlated process.
8. Add Activity Centre live sessions and session history.
9. Add Windows crash/disconnect notifications.
10. Validate Session Guardian with a small group of real users before implementing cloud sync.

---

## 42. Recommended product sequence

The order matters:

~~~text
Truthful session state
        |
        v
Reliable cleanup and per-window settings
        |
        v
Activity history and notifications
        |
        v
Encrypted vault recovery
        |
        v
Smart server presets and rejoin
        |
        v
Safe lifecycle rules
        |
        v
Remote dashboard
        |
        v
Team workspaces
~~~

Do not lead with Team workspaces or a remote dashboard while the core app can still show a closed account as Running. Reliability is the foundation for every premium promise.

---

## 43. Final product recommendation

The subscription should be positioned as a reliability and protection layer:

> **Virgue Pro keeps your multi-account Roblox workspace observable, recoverable, and predictable.**

The first paid release should be intentionally focused:

- Session Guardian;
- truthful Activity Centre;
- crash and disconnect alerts;
- encrypted backup;
- per-window performance profiles;
- saved Smart Server presets.

That is enough to justify a serious test of £9.99/month if it works exceptionally well. More features should follow evidence of recurring use, not the desire to make the settings page longer.

The success condition is not that Virgue has the largest feature list. It is that users trust it with the messy parts of a multi-account setup and would genuinely miss it if it disappeared.
