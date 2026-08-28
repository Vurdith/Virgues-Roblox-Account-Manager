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
