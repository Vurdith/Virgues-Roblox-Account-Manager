import { randomUUID } from 'node:crypto'
import type {
  BackgroundInputCommandInput,
  BackgroundInputCommandResult,
  BackgroundInputSnapshot,
  BackgroundInputSchedule,
  BackgroundInputScheduleInput,
  BackgroundInputTargetResult,
  WindowInputKey,
} from '../shared/types'
import { AccountStore } from './account-store'
import { ProtectedSessionService, type ProtectedWindow } from './protected-session'

const MINIMUM_INPUT_DURATION_MS = 40
const MAXIMUM_INPUT_DURATION_MS = 1500
const MAXIMUM_TARGETS = 8
const MAXIMUM_QUEUED_COMMANDS = 12
const MINIMUM_SCHEDULE_INTERVAL_MS = 1000
const MAXIMUM_SCHEDULE_INTERVAL_MS = 24 * 60 * 60 * 1000
const MAXIMUM_ACTIVE_SCHEDULES = 16
const MAXIMUM_RETAINED_SCHEDULES = 32

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

interface ScheduleRuntime {
  schedule: BackgroundInputSchedule
  timer: NodeJS.Timeout | null
}

export class BackgroundInputService {
  private queue: Promise<void> = Promise.resolve()
  private queuedCommands = 0
  private schedules = new Map<string, ScheduleRuntime>()

  constructor(private readonly store: AccountStore, private readonly protectedSession: ProtectedSessionService) {}

  async getSnapshot(): Promise<BackgroundInputSnapshot> {
    this.assertPlanAccess()
    const protectedAccountId = this.store.getSnapshot().settings.backgroundInputMainAccountId
    const status = await this.protectedSession.getStatus()
    if (status.phase !== 'ready') {
      this.stopActiveSchedules(status.message || 'Protected Session is not active.')
      return { protectedAccountId, sessions: [], schedules: this.listSchedules(), checkedAt: new Date().toISOString() }
    }

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
      schedules: this.listSchedules(),
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

  async startSchedule(input: BackgroundInputScheduleInput): Promise<BackgroundInputSchedule> {
    this.assertPlanAccess()
    if (!BACKGROUND_INPUT_KEYS.includes(input.key)) throw new Error('That key is not available for protected controls.')
    this.validateDuration(input.durationMs)
    this.validateInterval(input.intervalMs)
    const sessionIds = this.normalizeSessionIds(input.sessionIds)
    this.assertTargetCount(sessionIds)
    await this.assertTargetsReady(sessionIds)
    if (!this.store.getSnapshot().settings.backgroundInputMainAccountId) throw new Error('Choose which Roblox account is your main before scheduling protected controls.')
    const activeCount = [...this.schedules.values()].filter(({ schedule }) => schedule.state === 'active' || schedule.state === 'paused').length
    if (activeCount >= MAXIMUM_ACTIVE_SCHEDULES) throw new Error(`You can run no more than ${MAXIMUM_ACTIVE_SCHEDULES} protected input schedules at once.`)

    const now = Date.now()
    const schedule: BackgroundInputSchedule = {
      id: randomUUID(),
      sessionIds,
      key: input.key,
      durationMs: input.durationMs,
      intervalMs: input.intervalMs,
      state: 'active',
      startedAt: new Date(now).toISOString(),
      nextRunAt: new Date(now + input.intervalMs).toISOString(),
      lastRunAt: null,
      lastRunMessage: 'Waiting for the first scheduled input.',
      error: null,
    }
    const runtime: ScheduleRuntime = { schedule, timer: null }
    this.schedules.set(schedule.id, runtime)
    this.armSchedule(runtime, input.intervalMs)
    this.pruneSchedules()
    return this.cloneSchedule(schedule)
  }

  async pauseSchedule(id: string): Promise<BackgroundInputSchedule> {
    const runtime = this.requireSchedule(id)
    if (runtime.schedule.state === 'stopped') throw new Error('That schedule has already been stopped.')
    if (runtime.schedule.state === 'error') throw new Error('That schedule stopped after an error. Start a new schedule after checking the alt client.')
    if (runtime.schedule.state === 'paused') return this.cloneSchedule(runtime.schedule)
    this.clearScheduleTimer(runtime)
    runtime.schedule.state = 'paused'
    runtime.schedule.nextRunAt = null
    runtime.schedule.lastRunMessage = 'Paused for manual control.'
    return this.cloneSchedule(runtime.schedule)
  }

  async resumeSchedule(id: string): Promise<BackgroundInputSchedule> {
    this.assertPlanAccess()
    const runtime = this.requireSchedule(id)
    if (runtime.schedule.state !== 'paused') {
      if (runtime.schedule.state === 'active') return this.cloneSchedule(runtime.schedule)
      throw new Error('Only a paused schedule can be resumed.')
    }
    await this.assertTargetsReady(runtime.schedule.sessionIds)
    const nextRunAt = Date.now() + runtime.schedule.intervalMs
    runtime.schedule.state = 'active'
    runtime.schedule.error = null
    runtime.schedule.lastRunMessage = 'Resumed. Waiting for the next scheduled input.'
    runtime.schedule.nextRunAt = new Date(nextRunAt).toISOString()
    this.armSchedule(runtime, runtime.schedule.intervalMs)
    return this.cloneSchedule(runtime.schedule)
  }

  async stopSchedule(id: string): Promise<BackgroundInputSchedule> {
    const runtime = this.requireSchedule(id)
    this.clearScheduleTimer(runtime)
    runtime.schedule.state = 'stopped'
    runtime.schedule.nextRunAt = null
    runtime.schedule.lastRunMessage = 'Stopped by you.'
    this.pruneSchedules()
    return this.cloneSchedule(runtime.schedule)
  }

  stopAll(reason = 'Protected Session stopped.') : void {
    this.stopActiveSchedules(reason)
  }

  dispose(): void {
    for (const runtime of this.schedules.values()) this.clearScheduleTimer(runtime)
    this.schedules.clear()
  }

  private async execute(input: BackgroundInputCommandInput): Promise<BackgroundInputCommandResult> {
    this.assertPlanAccess()
    if (process.platform !== 'win32') throw new Error('Protected controls are available only on Windows.')
    if (!BACKGROUND_INPUT_KEYS.includes(input.key)) throw new Error('That key is not available for protected controls.')
    this.validateDuration(input.durationMs)

    const sessionIds = this.normalizeSessionIds(input.sessionIds)
    this.assertTargetCount(sessionIds)
    if (!this.store.getSnapshot().settings.backgroundInputMainAccountId) throw new Error('Choose which Roblox account is your main before sending protected controls.')

    const targets = await this.resolveTargets(sessionIds)

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

  private async runSchedule(id: string): Promise<void> {
    const runtime = this.schedules.get(id)
    if (!runtime || runtime.schedule.state !== 'active') return
    runtime.timer = null
    runtime.schedule.nextRunAt = null

    try {
      const result = await this.send({
        sessionIds: runtime.schedule.sessionIds,
        key: runtime.schedule.key,
        durationMs: runtime.schedule.durationMs,
      })
      const current = this.schedules.get(id)
      if (!current || current.schedule.state !== 'active') return
      const posted = result.results.filter((item) => item.status === 'posted').length
      const failed = result.results.length - posted
      current.schedule.lastRunAt = result.issuedAt
      current.schedule.lastRunMessage = failed > 0
        ? `${posted} sent, ${failed} failed. The schedule will continue.`
        : `Sent to ${posted} ${posted === 1 ? 'alt' : 'alts'}.`
      if (posted === 0) {
        this.failSchedule(current, 'Every selected alt rejected the scheduled input.')
        return
      }
      current.schedule.error = failed > 0 ? 'One or more selected alts rejected the last input.' : null
      current.schedule.nextRunAt = new Date(Date.now() + current.schedule.intervalMs).toISOString()
      this.armSchedule(current, current.schedule.intervalMs)
    } catch (error) {
      const current = this.schedules.get(id)
      if (!current || current.schedule.state !== 'active') return
      this.failSchedule(current, error instanceof Error ? error.message : 'The scheduled input failed.')
    }
  }

  private async assertTargetsReady(sessionIds: string[]): Promise<void> {
    await this.resolveTargets(sessionIds)
  }

  private async resolveTargets(sessionIds: string[]): Promise<ProtectedWindow[]> {
    const windows = await this.protectedSession.getWindows()
    const byId = new Map(windows.map((window) => [windowId(window), window]))
    return sessionIds.map((sessionId) => {
      const window = byId.get(sessionId)
      if (!window) throw new Error('One of the selected alt sessions is no longer active.')
      return window
    })
  }

  private validateDuration(durationMs: number): void {
    if (!Number.isInteger(durationMs) || durationMs < MINIMUM_INPUT_DURATION_MS || durationMs > MAXIMUM_INPUT_DURATION_MS) {
      throw new Error(`Input duration must be between ${MINIMUM_INPUT_DURATION_MS} and ${MAXIMUM_INPUT_DURATION_MS} milliseconds.`)
    }
  }

  private validateInterval(intervalMs: number): void {
    if (!Number.isInteger(intervalMs) || intervalMs < MINIMUM_SCHEDULE_INTERVAL_MS || intervalMs > MAXIMUM_SCHEDULE_INTERVAL_MS) {
      throw new Error(`Schedule intervals must be between ${MINIMUM_SCHEDULE_INTERVAL_MS / 1000} seconds and ${MAXIMUM_SCHEDULE_INTERVAL_MS / 3600000} hours.`)
    }
  }

  private normalizeSessionIds(sessionIds: string[]): string[] {
    const normalized = [...new Set(sessionIds.map((sessionId) => sessionId.trim()).filter(Boolean))]
    if (normalized.length === 0) throw new Error('Select at least one alt client.')
    return normalized
  }

  private assertTargetCount(sessionIds: string[]): void {
    if (sessionIds.length > MAXIMUM_TARGETS) throw new Error(`Select no more than ${MAXIMUM_TARGETS} alt clients at once.`)
  }

  private armSchedule(runtime: ScheduleRuntime, delayMs: number): void {
    this.clearScheduleTimer(runtime)
    runtime.timer = setTimeout(() => { void this.runSchedule(runtime.schedule.id) }, delayMs)
  }

  private clearScheduleTimer(runtime: ScheduleRuntime): void {
    if (!runtime.timer) return
    clearTimeout(runtime.timer)
    runtime.timer = null
  }

  private failSchedule(runtime: ScheduleRuntime, message: string): void {
    this.clearScheduleTimer(runtime)
    runtime.schedule.state = 'error'
    runtime.schedule.nextRunAt = null
    runtime.schedule.error = message
    runtime.schedule.lastRunMessage = 'Stopped after an error.'
  }

  private stopActiveSchedules(reason: string): void {
    for (const runtime of this.schedules.values()) {
      if (runtime.schedule.state !== 'active' && runtime.schedule.state !== 'paused') continue
      this.clearScheduleTimer(runtime)
      runtime.schedule.state = 'error'
      runtime.schedule.nextRunAt = null
      runtime.schedule.error = reason
      runtime.schedule.lastRunMessage = 'Stopped because the protected session is unavailable.'
    }
  }

  private requireSchedule(id: string): ScheduleRuntime {
    const runtime = this.schedules.get(id)
    if (!runtime) throw new Error('That protected input schedule no longer exists.')
    return runtime
  }

  private cloneSchedule(schedule: BackgroundInputSchedule): BackgroundInputSchedule {
    return { ...schedule, sessionIds: [...schedule.sessionIds] }
  }

  private listSchedules(): BackgroundInputSchedule[] {
    return [...this.schedules.values()]
      .map(({ schedule }) => this.cloneSchedule(schedule))
      .sort((left, right) => {
        const leftActive = left.state === 'active' || left.state === 'paused'
        const rightActive = right.state === 'active' || right.state === 'paused'
        return Number(rightActive) - Number(leftActive) || Date.parse(right.startedAt) - Date.parse(left.startedAt)
      })
  }

  private pruneSchedules(): void {
    if (this.schedules.size <= MAXIMUM_RETAINED_SCHEDULES) return
    const removable = [...this.schedules.values()]
      .filter(({ schedule }) => schedule.state === 'stopped' || schedule.state === 'error')
      .sort((left, right) => Date.parse(left.schedule.startedAt) - Date.parse(right.schedule.startedAt))
    while (this.schedules.size > MAXIMUM_RETAINED_SCHEDULES && removable.length > 0) {
      const runtime = removable.shift()
      if (runtime) this.schedules.delete(runtime.schedule.id)
    }
  }

  private assertPlanAccess(): void {
    if (!this.store.getSnapshot().entitlements.isolatedWorkerInput) {
      throw new Error('Protected Session controls are available with Valdor Pro.')
    }
  }
}
