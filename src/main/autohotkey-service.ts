import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, shell } from 'electron'
import type { AutoHotkeyScript, AutoHotkeyScriptInput, AutoHotkeySnapshot } from '../shared/types'
import { ProtectedSessionService } from './protected-session'

const DOWNLOAD_URL = 'https://www.autohotkey.com/download/'
const MAX_SCRIPT_BYTES = 128 * 1024

interface StoredScripts { scripts: Omit<AutoHotkeyScript, 'running'>[] }

export class AutoHotkeyService {
  private readonly directory = join(app.getPath('userData'), 'AutoHotkey Scripts')
  private readonly indexPath = join(this.directory, 'scripts.json')

  constructor(private readonly protectedSession: ProtectedSessionService) {}

  async getSnapshot(): Promise<AutoHotkeySnapshot> {
    const scripts = await this.readScripts()
    try {
      const status = await this.protectedSession.getAutoHotkeyStatus()
      const running = new Set(status.runningScriptIds)
      return { installed: status.installed, version: status.version, sessionReady: true, scripts: scripts.map((script) => ({ ...script, running: running.has(script.id) })) }
    } catch {
      return { installed: await this.isInstalledLocally(), version: '', sessionReady: false, scripts: scripts.map((script) => ({ ...script, running: false })) }
    }
  }

  async save(input: AutoHotkeyScriptInput): Promise<AutoHotkeySnapshot> {
    const name = input.name.trim()
    const content = input.content.replaceAll('\r\n', '\n').trimEnd() + '\n'
    if (!name || name.length > 60) throw new Error('Give the script a name between 1 and 60 characters.')
    if (!content.trim()) throw new Error('The AutoHotkey script is empty.')
    if (Buffer.byteLength(content, 'utf8') > MAX_SCRIPT_BYTES) throw new Error('AutoHotkey scripts are limited to 128 KB.')
    const scripts = await this.readScripts()
    const now = new Date().toISOString()
    const existing = input.id ? scripts.find((script) => script.id === input.id) : undefined
    if (input.id && !existing) throw new Error('That AutoHotkey script no longer exists.')
    if (scripts.some((script) => script.id !== input.id && script.name.toLowerCase() === name.toLowerCase())) throw new Error('A script with that name already exists.')
    if (existing) {
      existing.name = name
      existing.content = content
      existing.updatedAt = now
    } else {
      scripts.push({ id: randomUUID(), name, content, createdAt: now, updatedAt: now })
    }
    await this.writeScripts(scripts)
    return this.getSnapshot()
  }

  async remove(id: string): Promise<AutoHotkeySnapshot> {
    const scripts = await this.readScripts()
    const script = scripts.find((candidate) => candidate.id === id)
    if (!script) throw new Error('That AutoHotkey script no longer exists.')
    await this.protectedSession.stopAutoHotkey(id).catch(() => undefined)
    await this.writeScripts(scripts.filter((candidate) => candidate.id !== id))
    return this.getSnapshot()
  }

  async run(id: string): Promise<AutoHotkeySnapshot> {
    const script = (await this.readScripts()).find((candidate) => candidate.id === id)
    if (!script) throw new Error('That AutoHotkey script no longer exists.')
    const status = await this.protectedSession.getAutoHotkeyStatus()
    if (!status.installed) throw new Error('AutoHotkey v2 is not installed. Use Download AutoHotkey, install v2, then refresh.')
    await this.protectedSession.runAutoHotkey(script.id, script.content)
    return this.getSnapshot()
  }

  async stop(id: string): Promise<AutoHotkeySnapshot> {
    await this.protectedSession.stopAutoHotkey(id)
    return this.getSnapshot()
  }

  async openDownload(): Promise<void> {
    await shell.openExternal(DOWNLOAD_URL)
  }

  private async readScripts(): Promise<StoredScripts['scripts']> {
    try {
      const parsed = JSON.parse(await readFile(this.indexPath, 'utf8')) as Partial<StoredScripts>
      if (!Array.isArray(parsed.scripts)) return []
      return parsed.scripts.filter((script) => script && typeof script.id === 'string' && typeof script.name === 'string' && typeof script.content === 'string')
    } catch { return [] }
  }

  private async writeScripts(scripts: StoredScripts['scripts']): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temporary = this.indexPath + '.tmp'
    await writeFile(temporary, JSON.stringify({ scripts }, null, 2), 'utf8')
    await rename(temporary, this.indexPath)
  }

  private async isInstalledLocally(): Promise<boolean> {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
    const localPrograms = join(process.env.LOCALAPPDATA || '', 'Programs')
    const candidates = [
      join(programFiles, 'AutoHotkey', 'v2', 'AutoHotkey64.exe'),
      join(programFiles, 'AutoHotkey', 'AutoHotkey.exe'),
      join(localPrograms, 'AutoHotkey', 'v2', 'AutoHotkey64.exe'),
      join(localPrograms, 'AutoHotkey', 'AutoHotkey.exe'),
    ]
    for (const candidate of candidates) {
      try { await access(candidate); return true } catch { /* Keep looking. */ }
    }
    return false
  }
}
