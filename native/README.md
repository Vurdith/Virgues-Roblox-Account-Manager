# Native FPS launch helper

`nvidia-fps-helper.exe` uses NVIDIA's public NVAPI Driver Settings API to
temporarily set the Roblox profile frame-rate limiter while a new client
process starts. The account manager restores the exact previous profile value
immediately after that process appears.

It does not inject code, modify Roblox memory, patch Roblox files, or leave a
persistent driver override behind. Roblox's isolated XML setting remains the
fallback when NVAPI is unavailable.

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
in child-session mode and starts a small, same-user agent inside that Windows
session. The agent only launches an installed `RobloxPlayerBeta.exe`, enumerates
its own session's Roblox windows, and sends one allowlisted key press at a time.
This keeps the user's main desktop in a different Windows input session without
patching Windows, installing RDP Wrapper, injecting Roblox, or opening a custom
network service. Protected Session requires Windows Firewall to remain enabled;
Valdor never enables the Remote Desktop firewall group.
