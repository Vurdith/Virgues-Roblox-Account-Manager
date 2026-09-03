import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import type {
  BackgroundInputCommandInput,
  BackgroundInputCommandResult,
  BackgroundInputSnapshot,
  BackgroundInputTargetResult,
  SessionRecord,
  WindowInputKey,
} from '../shared/types'
import { AccountStore } from './account-store'
import { SessionGuardian } from './session-guardian'

const execFileAsync = promisify(execFile)
const MINIMUM_INPUT_DURATION_MS = 40
const MAXIMUM_INPUT_DURATION_MS = 1500
const HELPER_TIMEOUT_MS = 5000
const MAXIMUM_TARGETS = 8
const MAXIMUM_QUEUED_COMMANDS = 12

export const BACKGROUND_INPUT_KEYS: readonly WindowInputKey[] = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'Space',
  'ShiftLeft',
  'KeyE',
  'KeyQ',
  'KeyR',
  'KeyF',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
  'Digit0',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]

interface HelperOutput {
  ok?: boolean
  transport?: string
  foregroundUnchanged?: boolean
}

function helperError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? '').trim()
    if (stderr) return stderr
  }
  return error instanceof Error ? error.message : 'Windows could not post the background input.'
}

function isReadySession(session: SessionRecord): boolean {
  return session.managed && session.processState === 'alive' && session.processId !== null && session.windowHandle !== null
}

export class BackgroundInputService {
  private queue: Promise<void> = Promise.resolve()
  private queuedCommands = 0

  constructor(private readonly store: AccountStore, private readonly sessions: SessionGuardian) {}

  async getSnapshot(): Promise<BackgroundInputSnapshot> {
    this.assertPlanAccess()
    const snapshot = await this.sessions.refresh()
    const storeSnapshot = this.store.getSnapshot()
    const protectedAccountId = storeSnapshot.settings.backgroundInputMainAccountId
    const accounts = new Map(storeSnapshot.accounts.map((account) => [account.id, account]))
    return {
      protectedAccountId,
      sessions: snapshot.active.map((session) => {
        const account = accounts.get(session.accountId)
        const protectedSession = Boolean(protectedAccountId && session.accountId === protectedAccountId)
        return {
          id: session.id,
          accountId: session.accountId,
          accountLabel: account?.alias || account?.username || 'Unknown account',
          experienceName: session.experienceName || 'Roblox',
          windowTitle: session.windowTitle,
          state: protectedSession ? 'protected' as const : isReadySession(session) ? 'ready' as const : 'waiting' as const,
        }
      }),
      checkedAt: new Date().toISOString(),
    }
  }

  send(input: BackgroundInputCommandInput): Promise<BackgroundInputCommandResult> {
    if (this.queuedCommands >= MAXIMUM_QUEUED_COMMANDS) {
      throw new Error('The background-control queue is full. Wait for the current inputs to finish.')
    }
    this.queuedCommands += 1
    const task = this.queue.then(() => this.execute(input), () => this.execute(input))
    this.queue = task.then(
      () => { this.queuedCommands -= 1 },
      () => { this.queuedCommands -= 1 },
    )
    return task
  }

  private async execute(input: BackgroundInputCommandInput): Promise<BackgroundInputCommandResult> {
    this.assertPlanAccess()
    if (process.platform !== 'win32') throw new Error('Background controls are available only on Windows.')
    if (!BACKGROUND_INPUT_KEYS.includes(input.key)) throw new Error('That key is not available for background controls.')
    if (!Number.isInteger(input.durationMs) || input.durationMs < MINIMUM_INPUT_DURATION_MS || input.durationMs > MAXIMUM_INPUT_DURATION_MS) {
      throw new Error(`Input duration must be between ${MINIMUM_INPUT_DURATION_MS} and ${MAXIMUM_INPUT_DURATION_MS} milliseconds.`)
    }

    const sessionIds = [...new Set(input.sessionIds.map((sessionId) => sessionId.trim()).filter(Boolean))]
    if (sessionIds.length === 0) throw new Error('Select at least one alt client.')
    if (sessionIds.length > MAXIMUM_TARGETS) throw new Error(`Select no more than ${MAXIMUM_TARGETS} alt clients at once.`)

    const protectedAccountId = this.store.getSnapshot().settings.backgroundInputMainAccountId
    if (!protectedAccountId) throw new Error('Choose which Roblox account is your main before sending background controls.')

    const snapshot = await this.sessions.refresh()
    const byId = new Map(snapshot.active.map((session) => [session.id, session]))
    const targets = sessionIds.map((sessionId) => {
      const session = byId.get(sessionId)
      if (!session) throw new Error('One of the selected Roblox sessions is no longer active.')
      if (session.accountId === protectedAccountId) throw new Error('Virgue blocked an input directed at your protected main account.')
      if (!isReadySession(session)) throw new Error('One of the selected sessions does not have a verified, ready Roblox window.')
      return session
    })

    const results = await Promise.all(targets.map((session) => this.executeTarget(session, input.key, input.durationMs)))
    return { key: input.key, durationMs: input.durationMs, issuedAt: new Date().toISOString(), results }
  }

  private async executeTarget(session: SessionRecord, key: WindowInputKey, durationMs: number): Promise<BackgroundInputTargetResult> {
    const account = this.store.getSnapshot().accounts.find((candidate) => candidate.id === session.accountId)
    const accountLabel = account?.alias || account?.username || 'Unknown account'
    const helperPath = app.isPackaged
      ? join(process.resourcesPath, 'native', 'window-input-helper.exe')
      : join(process.cwd(), 'native', 'bin', 'window-input-helper.exe')

    try {
      const result = await execFileAsync(helperPath, [
        'background-send',
        String(session.processId),
        String(session.windowHandle),
        key,
        String(durationMs),
      ], { windowsHide: true, timeout: HELPER_TIMEOUT_MS, maxBuffer: 64 * 1024 })
      let helper: HelperOutput = {}
      try { helper = JSON.parse(result.stdout.trim()) as HelperOutput } catch { /* The exit code remains authoritative. */ }
      const foregroundSafe = helper.foregroundUnchanged !== false
      return {
        sessionId: session.id,
        accountId: session.accountId,
        accountLabel,
        status: 'posted',
        message: foregroundSafe
          ? 'Windows accepted the background key message without Virgue changing focus.'
          : 'Windows accepted the key message, but the foreground window changed independently.',
      }
    } catch (error) {
      return {
        sessionId: session.id,
        accountId: session.accountId,
        accountLabel,
        status: 'failed',
        message: helperError(error),
      }
    }
  }

  private assertPlanAccess(): void {
    if (!this.store.getSnapshot().entitlements.isolatedWorkerInput) {
      throw new Error('Background controls are available with Virgue Pro.')
    }
  }
}
