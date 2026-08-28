import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { WatcherSettings } from '../shared/types'
import { AccountStore } from './account-store'

const execFileAsync = promisify(execFile)

export class WatcherService {
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly store: AccountStore) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      if (this.store.getWatcher().enabled) void this.check()
    }, 30000)
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async update(input: Partial<WatcherSettings>): Promise<WatcherSettings> {
    return this.store.updateWatcher(input)
  }

  async check(): Promise<{ checked: number; closed: number; message: string }> {
    const settings = this.store.getWatcher()
    if (!settings.enabled) return { checked: 0, closed: 0, message: 'Watcher is disabled.' }
    if (process.platform !== 'win32') return { checked: 0, closed: 0, message: 'Roblox process watching is only available on Windows.' }

    try {
      let online = true
      if (settings.closeIfNoConnection) {
        try {
          const connection = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Test-Connection -ComputerName www.roblox.com -Count 1 -Quiet'], { windowsHide: true, maxBuffer: 1024 * 1024 })
          online = connection.stdout.trim().toLowerCase() === 'true'
        } catch { online = false }
      }
      const result = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='RobloxPlayerBeta.exe'\" | ForEach-Object { $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($p) { [pscustomobject]@{ Id = $_.ProcessId; WorkingSet64 = $p.WorkingSet64; MainWindowTitle = $p.MainWindowTitle; CommandLine = $_.CommandLine } } } | ConvertTo-Json -Compress"], { windowsHide: true, maxBuffer: 1024 * 1024 })
      const raw = result.stdout.trim()
      if (!raw) return { checked: 0, closed: 0, message: 'No Roblox processes are running.' }
      const parsed: unknown = JSON.parse(raw)
      const processes = Array.isArray(parsed) ? parsed : [parsed]
      let closed = 0
      for (const value of processes) {
        if (typeof value !== 'object' || value === null) continue
        const processInfo = value as { Id?: number; WorkingSet64?: number; MainWindowTitle?: string; CommandLine?: string }
        if (!processInfo.CommandLine || (!processInfo.CommandLine.includes('-t ') && !processInfo.CommandLine.includes('-j '))) continue
        const memoryMb = (processInfo.WorkingSet64 ?? 0) / 1024 / 1024
        const shouldClose = (settings.closeIfNoConnection && !online) || (settings.closeIfMemoryLow && memoryMb > 0 && memoryMb < settings.memoryLowMb) || (settings.closeIfWindowTitle && processInfo.MainWindowTitle !== settings.expectedWindowTitle)
        if (shouldClose && processInfo.Id) {
          await execFileAsync('taskkill.exe', ['/PID', String(processInfo.Id), '/T', '/F'], { windowsHide: true })
          closed += 1
        }
      }
      return { checked: processes.length, closed, message: closed > 0 ? `Watcher closed ${closed} Roblox process${closed === 1 ? '' : 'es'}.` : `Watcher checked ${processes.length} Roblox process${processes.length === 1 ? '' : 'es'}.` }
    } catch (error) {
      return { checked: 0, closed: 0, message: error instanceof Error ? `Watcher check failed: ${error.message}` : 'Watcher check failed.' }
    }
  }
}
