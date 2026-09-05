import { execFile } from 'node:child_process'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import type {
  IsolatedWorkerCommandResult,
  IsolatedWorkerInputKey,
  IsolatedWorkerSnapshot,
  IsolatedWorkerSession,
} from '../shared/types'
import { AccountStore } from './account-store'
import { SessionGuardian } from './session-guardian'

const execFileAsync = promisify(execFile)
const MINIMUM_INPUT_DURATION_MS = 40
const MAXIMUM_INPUT_DURATION_MS = 1500
const HELPER_TIMEOUT_MS = 5000
const MAXIMUM_QUEUED_COMMANDS = 16

export const ISOLATED_WORKER_KEYS: readonly IsolatedWorkerInputKey[] = [
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

interface LocalWorkerCommand {
  sessionId: string
  key: IsolatedWorkerInputKey
  durationMs: number
}

interface HelperOutput {
  ok?: boolean
  restoredPreviousWindow?: boolean
}

function helperError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? '').trim()
    if (stderr) return stderr
  }
  return error instanceof Error ? error.message : 'The isolated worker could not send input.'
}

export class InputWorkerService {
  private queue: Promise<void> = Promise.resolve()
  private queuedCommands = 0

  constructor(private readonly store: AccountStore, private readonly sessions: SessionGuardian) {}

  async getSnapshot(): Promise<IsolatedWorkerSnapshot> {
    this.assertPlanAccess()
    const snapshot = await this.sessions.refresh()
    const accounts = new Map(this.store.getSnapshot().accounts.map((account) => [account.id, account]))
    const sessions: IsolatedWorkerSession[] = snapshot.active.map((session) => {
      const account = accounts.get(session.accountId)
      return {
        id: session.id,
        accountId: session.accountId,
        accountLabel: account?.alias || account?.username || 'Unknown account',
        experienceName: session.experienceName || 'Roblox',
        windowTitle: session.windowTitle,
        status: session.status,
        ready: session.managed && session.processState === 'alive' && session.processId !== null && session.windowHandle !== null,
      }
    })
    return { workerName: process.env.COMPUTERNAME?.trim() || hostname(), sessions, checkedAt: new Date().toISOString() }
  }

  send(input: LocalWorkerCommand): Promise<IsolatedWorkerCommandResult> {
    if (this.queuedCommands >= MAXIMUM_QUEUED_COMMANDS) throw new Error('The isolated worker input queue is full. Wait for the current actions to finish.')
    this.queuedCommands += 1
    const task = this.queue.then(() => this.execute(input), () => this.execute(input))
    this.queue = task.then(
      () => { this.queuedCommands -= 1 },
      () => { this.queuedCommands -= 1 },
    )
    return task
  }

  private async execute(input: LocalWorkerCommand): Promise<IsolatedWorkerCommandResult> {
    this.assertPlanAccess()
    if (process.platform !== 'win32') throw new Error('Isolated worker input is only available on Windows.')
    if (!ISOLATED_WORKER_KEYS.includes(input.key)) throw new Error('That key is not available for isolated worker input.')
    if (!Number.isInteger(input.durationMs) || input.durationMs < MINIMUM_INPUT_DURATION_MS || input.durationMs > MAXIMUM_INPUT_DURATION_MS) {
      throw new Error(`Input duration must be between ${MINIMUM_INPUT_DURATION_MS} and ${MAXIMUM_INPUT_DURATION_MS} milliseconds.`)
    }

    const snapshot = await this.sessions.refresh()
    const session = snapshot.active.find((candidate) => candidate.id === input.sessionId)
    if (!session) throw new Error('That worker session is no longer active.')
    if (!session.managed || session.processState !== 'alive' || !session.processId || !session.windowHandle) {
      throw new Error('The selected session does not have a verified, ready Roblox window.')
    }

    const helperPath = app.isPackaged
      ? join(process.resourcesPath, 'native', 'window-input-helper.exe')
      : join(process.cwd(), 'native', 'bin', 'window-input-helper.exe')

    let stdout = ''
    try {
      const result = await execFileAsync(helperPath, [
        'send',
        String(session.processId),
        String(session.windowHandle),
        input.key,
        String(input.durationMs),
      ], { windowsHide: true, timeout: HELPER_TIMEOUT_MS, maxBuffer: 64 * 1024 })
      stdout = result.stdout.trim()
    } catch (error) {
      throw new Error(helperError(error))
    }

    let helper: HelperOutput = {}
    try { helper = JSON.parse(stdout) as HelperOutput } catch { /* The exit code remains authoritative. */ }
    const account = this.store.getSnapshot().accounts.find((candidate) => candidate.id === session.accountId)
    return {
      sessionId: session.id,
      accountId: session.accountId,
      accountLabel: account?.alias || account?.username || 'Unknown account',
      key: input.key,
      durationMs: input.durationMs,
      sentAt: new Date().toISOString(),
      restoredPreviousWindow: helper.restoredPreviousWindow === true,
    }
  }

  private assertPlanAccess(): void {
    if (!this.store.getSnapshot().entitlements.isolatedWorkerInput) {
      throw new Error('Isolated worker controls are available with Valdor Pro.')
    }
  }
}
