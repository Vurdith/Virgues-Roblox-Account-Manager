# Native helpers

Per-launch Roblox frame-rate settings are supplied through an isolated
`GlobalBasicSettings_13.xml` file. On NVIDIA systems,
`nvidia-fps-helper.exe` also uses the public NVAPI Driver Settings API to
temporarily set and restore the Roblox profile frame-rate limiter during
startup. Valdor does not inject code or modify Roblox memory.

`process-memory-helper.exe` is used by the per-account Memory Saver option.
It sets the launched Roblox process to Windows' low memory priority and trims
its current working set once. This is an operating-system hint, not Roblox
memory compression, and the process can allocate pages again as needed.

`window-input-helper.exe` is the bounded executor for Roblox window controls.
It accepts one allowlisted key action at a time and verifies that the supplied
window belongs to `RobloxPlayerBeta.exe`. `background-send` posts a key-down and
key-up pair directly to a non-minimized background window without activating it;
it refuses the current foreground Roblox window. Windows accepting that message
does not guarantee that an experience consumes it. The older `send` command is
retained for deliberately isolated workers: it focuses the worker window, uses
the normal system input stream, and restores the previous worker window. Both
paths enforce a 1.5 second limit. Neither injects code, modifies Roblox, records
input, runs scripts, or repeats actions on its own.

`protected-session-helper.exe` hosts Microsoft's Remote Desktop ActiveX control
in child-session mode. One-time setup also installs the small, per-machine
`ValdorProtectedSession` Windows service. The service uses the signed-in user's
Windows token to start the agent inside the exact child session that the host
reports; it does not run Roblox or receive the user's password. The agent only
launches an installed `RobloxPlayerBeta.exe`, enumerates its own session's Roblox
windows, and sends one allowlisted key press at a time. The host now leaves the
RDP surface visible in a resizable `Valdor — Alt desktop` window so the user can
inspect or manually interact with the child session when needed; app-driven
input still goes directly to the agent in that session. This keeps the user's
main desktop in a different Windows input session without patching Windows,
installing RDP Wrapper, injecting Roblox, or opening a custom network service.

Protected Session setup also backs up and sets Windows' documented
`DWMFRAMEINTERVAL` value to `4`, limiting the RDP-delivered alt-desktop stream
to approximately 16 FPS (the closest supported step to 15 FPS). This reduces
remote composition and transport work; it does not replace the separate Roblox
rendering cap. Teardown restores the original registry value.
The viewer requests `AllowRelativeMouseMode` on Windows 11 24H2 and later,
and reads the value back. Older clients use the legacy relative-mode setting.
`--check-mouse` checks local ActiveX capability without connecting a session;
it does not prove that a game consumes relative input. Test right-drag camera
movement after reconnecting, both windowed and maximized.
Protected Session requires Windows Firewall to remain enabled; Valdor never
enables the Remote Desktop firewall group.

AutoHotkey v2 integration is opt-in. Valdor stores scripts in its user-data
folder and sends a selected script to the protected-session agent only when the
user clicks Run. The agent resolves an installed AutoHotkey v2 interpreter,
runs the script inside the child session, reports active script IDs, and stops
those processes when the session ends. Valdor links to AutoHotkey's official
download page when v2 is missing; it does not bundle or silently install it.
