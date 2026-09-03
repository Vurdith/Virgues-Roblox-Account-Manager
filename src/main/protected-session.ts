import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import { app } from 'electron'
import type { ProtectedSessionSetupResult, ProtectedSessionStatus, WindowInputKey } from '../shared/types'
import { AccountStore } from './account-store'

const execFileAsync = promisify(execFile)
const START_TIMEOUT_MS = 90_000
const REQUEST_TIMEOUT_MS = 8_000

interface NativeProtectedSessionStatus {
  supported: boolean
  configured: boolean
  childSessionsEnabled: boolean
  rdpListenerEnabled: boolean
  firewallEnabled: boolean
  currentSessionId: number
}

export interface ProtectedWindow {
  processId: number
  windowHandle: string
  windowTitle: string
  accountId?: string
}

interface ProtectedLaunchResult {
  processId: number
  accountId: string
  launchRequestId: string
}

interface ProtectedInputResult {
  processId: number
  key: WindowInputKey
  durationMs: number
  restoredPreviousWindow: boolean
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface LaunchIdentity {
  accountId: string
  launchRequestId: string
}

function decodeProtocolValue(value: string | undefined): string {
  if (!value) return ''
  return Buffer.from(value, 'base64').toString('utf8')
}

function encodeProtocolValue(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

function windowsCommandLineArgument(value: string): string {
  if (value && !/[\s"]/u.test(value)) return value
  let result = '"'
  let backslashes = 0
  for (const character of value) {
    if (character === '\\') {
      backslashes += 1
      continue
    }
    if (character === '"') {
      result += '\\'.repeat(backslashes * 2 + 1) + '"'
      backslashes = 0
      continue
    }
    result += '\\'.repeat(backslashes) + character
    backslashes = 0
  }
  return result + '\\'.repeat(backslashes * 2) + '"'
}

function powershellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export class ProtectedSessionService {
  private host: ChildProcessWithoutNullStreams | null = null
  private phase: ProtectedSessionStatus['phase'] = 'setup-required'
  private childSessionId: number | null = null
  private message = 'Protected Session needs one-time Windows setup.'
  private pending = new Map<string, PendingRequest>()
  private launchedProcesses = new Map<number, LaunchIdentity>()
  private startPromise: Promise<ProtectedSessionStatus> | null = null
  private resolveStart: ((status: ProtectedSessionStatus) => void) | null = null
  private rejectStart: ((error: Error) => void) | null = null
  private startTimer: NodeJS.Timeout | null = null
  private intentionalStop = false

  constructor(private readonly store: AccountStore) {}

  shouldRouteLaunch(accountId: string): boolean {
    const settings = this.store.getSnapshot().settings
    return settings.protectedSessionEnabled && settings.backgroundInputMainAccountId !== accountId
  }

  async getStatus(): Promise<ProtectedSessionStatus> {
    let native: NativeProtectedSessionStatus
    try {
      native = await this.readNativeStatus()
    } catch (error) {
      return {
        supported: false,
        configured: false,
        firewallEnabled: false,
        phase: 'unavailable',
        childSessionId: null,
        message: error instanceof Error ? error.message : 'Protected Session is unavailable on this installation.',
      }
    }

    if (!native.supported) {
      return { supported: false, configured: false, firewallEnabled: native.firewallEnabled, phase: 'unavailable', childSessionId: null, message: 'This Windows build does not expose Microsoft child sessions.' }
    }
    if (!native.firewallEnabled) {
      return { supported: true, configured: native.configured, firewallEnabled: false, phase: 'unavailable', childSessionId: null, message: 'Turn on Windows Firewall before using Protected Session.' }
    }
    if (!native.configured) {
      return { supported: true, configured: false, firewallEnabled: true, phase: 'setup-required', childSessionId: null, message: 'Protected Session needs one-time Windows setup.' }
    }
    return {
      supported: true,
      configured: true,
      firewallEnabled: true,
      phase: this.phase === 'setup-required' ? 'stopped' : this.phase,
      childSessionId: this.childSessionId,
      message: this.phase === 'setup-required' ? 'Protected Session is ready to start.' : this.message,
    }
  }

  async setup(): Promise<ProtectedSessionSetupResult> {
    this.assertPlanAccess()
    if (process.platform !== 'win32') throw new Error('Protected Session is available only on Windows.')
    const helperPath = this.getHelperPath()
    const resultPath = join(app.getPath('temp'), `virgue-protected-session-setup-${randomUUID()}.json`)
    const script = [
      `$process = Start-Process -FilePath ${powershellLiteral(helperPath)} -ArgumentList @('--setup', ${powershellLiteral(resultPath)}) -Verb RunAs -WindowStyle Hidden -Wait -PassThru`,
      'exit $process.ExitCode',
    ].join('; ')
    const encoded = Buffer.from(script, 'utf16le').toString('base64')

    try {
      await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
        windowsHide: true,
        timeout: 120_000,
        maxBuffer: 64 * 1024,
      })
    } catch {
      // The elevated helper writes the authoritative result, including when
      // Windows accepted UAC but a configuration check failed.
    }

    let setupResult: { ok: boolean; message: string }
    try {
      setupResult = JSON.parse(await readFile(resultPath, 'utf8')) as { ok: boolean; message: string }
    } catch {
      throw new Error('Windows setup was cancelled or did not complete.')
    } finally {
      await rm(resultPath, { force: true }).catch(() => undefined)
    }

    if (!setupResult.ok) throw new Error(setupResult.message || 'Protected Session setup failed.')
    await this.store.updateSettings({ protectedSessionEnabled: true })
    this.phase = 'stopped'
    this.message = setupResult.message
    const status = await this.start()
    return { ok: true, message: setupResult.message, status }
  }

  async start(): Promise<ProtectedSessionStatus> {
    this.assertPlanAccess()
    if (this.host && this.phase === 'ready') return this.getStatus()
    if (this.startPromise) return this.startPromise

    const native = await this.readNativeStatus()
    if (!native.supported) throw new Error('This Windows build does not expose Microsoft child sessions.')
    if (!native.firewallEnabled) throw new Error('Turn on Windows Firewall before starting Protected Session.')
    if (!native.configured) throw new Error('Complete the one-time Protected Session setup first.')

    await this.stopHost(false)
    await this.store.updateSettings({ protectedSessionEnabled: true })
    this.phase = 'starting'
    this.message = 'Opening a separate Windows session for your alt clients…'
    this.intentionalStop = false
    const pipeName = `virgue-protected-${randomUUID().replaceAll('-', '')}`
    const token = randomBytes(32).toString('hex')
    const parentSessionId = native.currentSessionId
    const child = spawn(this.getHelperPath(), [
      '--host', '--pipe', pipeName, '--token', token, '--parent-session', String(parentSessionId),
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    this.host = child

    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line) => this.handleHostLine(line))
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4096) })
    child.once('error', (error) => this.failHost(error))
    child.once('exit', (code) => {
      if (this.host === child) this.host = null
      lines.close()
      if (!this.intentionalStop && this.phase !== 'ready') {
        this.failHost(new Error(stderr.trim() || `Protected Session closed before it was ready (code ${code ?? 'unknown'}).`))
      } else if (!this.intentionalStop && this.phase === 'ready') {
        this.phase = 'error'
        this.childSessionId = null
        this.message = stderr.trim() || 'The protected Windows session closed unexpectedly.'
        this.rejectPending(new Error(this.message))
      }
    })

    this.startPromise = new Promise<ProtectedSessionStatus>((resolve, reject) => {
      this.resolveStart = resolve
      this.rejectStart = reject
      this.startTimer = setTimeout(() => {
        this.failHost(new Error('Protected Session did not finish signing in. Complete any Windows account prompt and try again.'))
        void this.stopHost(false)
      }, START_TIMEOUT_MS)
    })
    return this.startPromise
  }

  async stop(): Promise<ProtectedSessionStatus> {
    await this.store.updateSettings({ protectedSessionEnabled: false })
    await this.stopHost(true)
    return this.getStatus()
  }

  async getWindows(): Promise<ProtectedWindow[]> {
    this.assertReady()
    const windows = await this.request<ProtectedWindow[]>('LIST', [])
    return windows.map((window) => ({ ...window, accountId: window.accountId || this.launchedProcesses.get(window.processId)?.accountId }))
  }

  async sendInput(processId: number, windowHandle: string, key: WindowInputKey, durationMs: number): Promise<ProtectedInputResult> {
    this.assertPlanAccess()
    this.assertReady()
    return this.request<ProtectedInputResult>('INPUT', [String(processId), windowHandle, key, String(durationMs)])
  }

  async launch(executable: string, args: string[], accountId: string, launchRequestId: string): Promise<number> {
    this.assertPlanAccess()
    if (!this.shouldRouteLaunch(accountId)) throw new Error('That account is not assigned to Protected Session.')
    this.assertReady()
    const commandLine = args.map(windowsCommandLineArgument).join(' ')
    const result = await this.request<ProtectedLaunchResult>('LAUNCH', [
      encodeProtocolValue(executable),
      encodeProtocolValue(commandLine),
      encodeProtocolValue(accountId),
      encodeProtocolValue(launchRequestId),
    ], 20_000)
    this.launchedProcesses.set(result.processId, { accountId, launchRequestId })
    return result.processId
  }

  async dispose(): Promise<void> {
    await this.stopHost(false)
  }

  private async request<T>(command: string, fields: string[], timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    const host = this.host
    if (!host || !host.stdin.writable || this.phase !== 'ready') throw new Error('Protected Session is not ready.')
    const requestId = randomUUID()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('Protected Session did not respond in time.'))
      }, timeoutMs)
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, timer })
      host.stdin.write([command, requestId, ...fields].join('\t') + '\n', 'utf8', (error) => {
        if (!error) return
        clearTimeout(timer)
        this.pending.delete(requestId)
        reject(error)
      })
    })
  }

  private handleHostLine(line: string): void {
    const parts = line.split('\t')
    if (parts[0] === 'EVENT') {
      if (parts[1] === 'CONNECTED') {
        this.childSessionId = Number(parts[2]) || null
        this.message = 'Windows session connected. Starting the Virgue alt agent…'
      } else if (parts[1] === 'AGENT_READY') {
        this.childSessionId = Number(parts[2]) || this.childSessionId
        this.phase = 'ready'
        this.message = 'Protected Session is ready. Alt launches and inputs stay off your main desktop.'
        this.completeStart()
      } else if (parts[1] === 'HOST_ERROR' || parts[1] === 'AGENT_ERROR' || parts[1] === 'AGENT_REJECTED') {
        this.failHost(new Error(decodeProtocolValue(parts[2]) || 'Protected Session could not start.'))
      } else if (parts[1] === 'DISCONNECTED' && !this.intentionalStop) {
        this.failHost(new Error('The protected Windows session disconnected.'))
      }
      return
    }

    if (parts[0] !== 'RESULT' || !parts[1]) return
    const pending = this.pending.get(parts[1])
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(parts[1])
    const value = decodeProtocolValue(parts[3])
    if (parts[2] === 'ERROR') {
      pending.reject(new Error(value || 'Protected Session rejected the request.'))
      return
    }
    try {
      pending.resolve(JSON.parse(value) as unknown)
    } catch {
      pending.reject(new Error('Protected Session returned an invalid response.'))
    }
  }

  private completeStart(): void {
    if (this.startTimer) clearTimeout(this.startTimer)
    this.startTimer = null
    const resolve = this.resolveStart
    this.resolveStart = null
    this.rejectStart = null
    this.startPromise = null
    if (resolve) void this.getStatus().then(resolve)
  }

  private failHost(error: Error): void {
    if (this.phase === 'error' && !this.rejectStart) return
    this.phase = 'error'
    this.childSessionId = null
    this.message = error.message
    if (this.startTimer) clearTimeout(this.startTimer)
    this.startTimer = null
    const reject = this.rejectStart
    this.resolveStart = null
    this.rejectStart = null
    this.startPromise = null
    if (reject) reject(error)
    this.rejectPending(error)
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private async stopHost(markStopped: boolean): Promise<void> {
    const host = this.host
    this.intentionalStop = true
    if (this.startTimer) clearTimeout(this.startTimer)
    this.startTimer = null
    const reject = this.rejectStart
    this.resolveStart = null
    this.rejectStart = null
    this.startPromise = null
    if (reject) reject(new Error('Protected Session was stopped.'))
    this.rejectPending(new Error('Protected Session was stopped.'))
    this.childSessionId = null
    this.launchedProcesses.clear()
    if (host) {
      const exited = new Promise<void>((resolve) => host.once('exit', () => resolve()))
      if (host.stdin.writable) host.stdin.end('STOP\n')
      await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 4000))])
      if (this.host === host && !host.killed) host.kill()
      if (this.host === host) this.host = null
    }
    if (markStopped) {
      this.phase = 'stopped'
      this.message = 'Protected Session is stopped. Your main desktop is unchanged.'
    }
  }

  private async readNativeStatus(): Promise<NativeProtectedSessionStatus> {
    if (process.platform !== 'win32') return { supported: false, configured: false, childSessionsEnabled: false, rdpListenerEnabled: false, firewallEnabled: false, currentSessionId: 0 }
    try {
      const { stdout } = await execFileAsync(this.getHelperPath(), ['--status'], { windowsHide: true, timeout: 5000, maxBuffer: 64 * 1024 })
      return JSON.parse(stdout.trim()) as NativeProtectedSessionStatus
    } catch (error) {
      throw new Error(error instanceof Error ? `Protected Session helper is unavailable: ${error.message}` : 'Protected Session helper is unavailable.')
    }
  }

  private getHelperPath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'native', 'protected-session-helper.exe')
      : join(process.cwd(), 'native', 'bin', 'protected-session-helper.exe')
  }

  private assertReady(): void {
    if (this.phase !== 'ready' || !this.host) throw new Error(this.phase === 'starting' ? 'Protected Session is still starting.' : 'Start Protected Session before launching or controlling alt clients.')
  }

  private assertPlanAccess(): void {
    if (!this.store.getSnapshot().entitlements.isolatedWorkerInput) throw new Error('Protected Session controls are available with Virgue Pro.')
  }
}
