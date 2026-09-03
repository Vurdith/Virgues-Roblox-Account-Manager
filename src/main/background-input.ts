import type {
  BackgroundInputCommandInput,
  BackgroundInputCommandResult,
  BackgroundInputSnapshot,
  BackgroundInputTargetResult,
  WindowInputKey,
} from '../shared/types'
import { AccountStore } from './account-store'
import { ProtectedSessionService, type ProtectedWindow } from './protected-session'

const MINIMUM_INPUT_DURATION_MS = 40
const MAXIMUM_INPUT_DURATION_MS = 1500
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

function windowId(window: ProtectedWindow): string {
  return `protected:${window.processId}:${window.windowHandle}`
}

export class BackgroundInputService {
  private queue: Promise<void> = Promise.resolve()
  private queuedCommands = 0

  constructor(private readonly store: AccountStore, private readonly protectedSession: ProtectedSessionService) {}

  async getSnapshot(): Promise<BackgroundInputSnapshot> {
    this.assertPlanAccess()
    const protectedAccountId = this.store.getSnapshot().settings.backgroundInputMainAccountId
    const status = await this.protectedSession.getStatus()
    if (status.phase !== 'ready') return { protectedAccountId, sessions: [], checkedAt: new Date().toISOString() }

    const windows = await this.protectedSession.getWindows()
    const accounts = new Map(this.store.getSnapshot().accounts.map((account) => [account.id, account]))
    return {
      protectedAccountId,
      sessions: windows.map((window) => {
        const account = window.accountId ? accounts.get(window.accountId) : undefined
        return {
          id: windowId(window),
          accountId: window.accountId || `protected-process-${window.processId}`,
          accountLabel: account?.alias || account?.username || `Alt Roblox · PID ${window.processId}`,
          experienceName: 'Protected Session',
          windowTitle: window.windowTitle || 'Roblox',
          state: 'ready' as const,
        }
      }),
      checkedAt: new Date().toISOString(),
    }
  }

  send(input: BackgroundInputCommandInput): Promise<BackgroundInputCommandResult> {
    if (this.queuedCommands >= MAXIMUM_QUEUED_COMMANDS) {
      throw new Error('The protected-control queue is full. Wait for the current inputs to finish.')
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
    if (process.platform !== 'win32') throw new Error('Protected controls are available only on Windows.')
    if (!BACKGROUND_INPUT_KEYS.includes(input.key)) throw new Error('That key is not available for protected controls.')
    if (!Number.isInteger(input.durationMs) || input.durationMs < MINIMUM_INPUT_DURATION_MS || input.durationMs > MAXIMUM_INPUT_DURATION_MS) {
      throw new Error(`Input duration must be between ${MINIMUM_INPUT_DURATION_MS} and ${MAXIMUM_INPUT_DURATION_MS} milliseconds.`)
    }

    const sessionIds = [...new Set(input.sessionIds.map((sessionId) => sessionId.trim()).filter(Boolean))]
    if (sessionIds.length === 0) throw new Error('Select at least one alt client.')
    if (sessionIds.length > MAXIMUM_TARGETS) throw new Error(`Select no more than ${MAXIMUM_TARGETS} alt clients at once.`)
    if (!this.store.getSnapshot().settings.backgroundInputMainAccountId) throw new Error('Choose which Roblox account is your main before sending protected controls.')

    const windows = await this.protectedSession.getWindows()
    const byId = new Map(windows.map((window) => [windowId(window), window]))
    const targets = sessionIds.map((sessionId) => {
      const window = byId.get(sessionId)
      if (!window) throw new Error('One of the selected alt sessions is no longer active.')
      return window
    })

    const results: BackgroundInputTargetResult[] = []
    for (const target of targets) results.push(await this.executeTarget(target, input.key, input.durationMs))
    return { key: input.key, durationMs: input.durationMs, issuedAt: new Date().toISOString(), results }
  }

  private async executeTarget(window: ProtectedWindow, key: WindowInputKey, durationMs: number): Promise<BackgroundInputTargetResult> {
    const account = window.accountId ? this.store.getSnapshot().accounts.find((candidate) => candidate.id === window.accountId) : undefined
    const accountLabel = account?.alias || account?.username || `Alt Roblox · PID ${window.processId}`
    const sessionId = windowId(window)
    try {
      await this.protectedSession.sendInput(window.processId, window.windowHandle, key, durationMs)
      return {
        sessionId,
        accountId: window.accountId || `protected-process-${window.processId}`,
        accountLabel,
        status: 'posted',
        message: 'The key was sent through the alt-only Windows session. Your main desktop was not focused.',
      }
    } catch (error) {
      return {
        sessionId,
        accountId: window.accountId || `protected-process-${window.processId}`,
        accountLabel,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Protected Session could not send the input.',
      }
    }
  }

  private assertPlanAccess(): void {
    if (!this.store.getSnapshot().entitlements.isolatedWorkerInput) {
      throw new Error('Protected Session controls are available with Virgue Pro.')
    }
  }
}
