import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type {
  Account,
  Presence,
  RecoveryJob,
  RecoveryJobStatus,
  SessionEvent,
  SessionEventSeverity,
  SessionEventType,
  SessionLaunchInput,
  SessionPresenceState,
  SessionProcessState,
  SessionRecord,
  SessionSnapshot,
  SessionStatus,
} from '../shared/types'
import { AccountStore } from './account-store'

const execFileAsync = promisify(execFile)
const SESSION_FILE_NAME = 'session-history.json'
const SESSION_HISTORY_LIMIT = 100
const SESSION_EVENT_LIMIT = 200
const PROCESS_MISSING_LIMIT = 2
const PROCESS_LAUNCH_GRACE_MS = 20_000
const PROCESS_WINDOW_GRACE_MS = 30_000
const PRESENCE_MISS_LIMIT = 2
const UNRESPONSIVE_CHECK_LIMIT = 4
const RECOVERY_JOB_LIMIT = 50

interface RobloxProcessInfo {
  id: number
  parentId: number
  creationTime: string | null
  mainWindowHandle: number
  mainWindowTitle: string
  commandLine: string
  processPath: string
  workingSetMb: number
}

interface PersistedSessionData {
  sessions?: unknown
  events?: unknown
  recoveryJobs?: unknown
}

type SessionListener = (event: SessionEvent) => void

const PROCESS_STATES: readonly SessionProcessState[] = ['launching', 'alive', 'unresponsive', 'closing', 'exited', 'crashed', 'unknown']
const PRESENCE_STATES: readonly SessionPresenceState[] = ['not-checked', 'offline', 'online', 'in-game', 'in-studio', 'stale', 'unavailable']
const SESSION_STATUSES: readonly SessionStatus[] = ['launching', 'running', 'unresponsive', 'closing', 'exited', 'crashed', 'unknown']
const EVENT_SEVERITIES: readonly SessionEventSeverity[] = ['info', 'success', 'warning', 'error']
const EVENT_TYPES: readonly SessionEventType[] = ['launch-requested', 'process-attached', 'presence-updated', 'session-stale', 'session-ended', 'session-crashed', 'session-stop-requested', 'session-refresh-failed', 'recovery-scheduled', 'recovery-started', 'recovery-failed', 'recovery-exhausted', 'recovery-cancelled']
const RECOVERY_STATUSES: readonly RecoveryJobStatus[] = ['scheduled', 'launching', 'exhausted', 'cancelled']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function nullableNumber(value: unknown): number | null {
  const parsed = numberValue(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function nullableDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) return null
  return value
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && values.includes(value as T) ? value as T : fallback
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeSession(value: unknown): SessionRecord | null {
  if (!isRecord(value) || !stringValue(value.id)) return null
  const startedAt = nullableDate(value.startedAt) ?? new Date().toISOString()
  const endedAt = nullableDate(value.endedAt)
  const persistedProcessState = enumValue(value.processState, PROCESS_STATES, 'unknown')
  const processState = endedAt ? persistedProcessState : 'unknown'
  const persistedStatus = enumValue(value.status, SESSION_STATUSES, persistedProcessState === 'alive' ? 'running' : persistedProcessState === 'exited' ? 'exited' : 'unknown')
  const status = endedAt ? persistedStatus : 'unknown'
  return {
    id: stringValue(value.id),
    accountId: stringValue(value.accountId),
    launchRequestId: stringValue(value.launchRequestId, randomUUID()),
    processId: nullableNumber(value.processId),
    processParentId: nullableNumber(value.processParentId),
    processCreatedAt: nullableDate(value.processCreatedAt),
    processPath: stringValue(value.processPath),
    windowHandle: nullableNumber(value.windowHandle),
    windowTitle: stringValue(value.windowTitle),
    placeId: stringValue(value.placeId),
    universeId: stringValue(value.universeId) || null,
    experienceName: stringValue(value.experienceName, 'Roblox'),
    targetJobId: stringValue(value.targetJobId),
    jobId: endedAt ? stringValue(value.jobId) : '',
    region: stringValue(value.region, 'Unknown'),
    processState,
    presenceState: endedAt ? enumValue(value.presenceState, PRESENCE_STATES, 'not-checked') : 'not-checked',
    status,
    startedAt,
    lastProcessCheckAt: endedAt ? nullableDate(value.lastProcessCheckAt) : null,
    lastPresenceCheckAt: endedAt ? nullableDate(value.lastPresenceCheckAt) : null,
    lastDataSource: endedAt ? enumValue(value.lastDataSource, ['launch', 'process', 'presence', 'unknown'] as const, 'unknown') : 'unknown',
    fps: nullableNumber(value.fps),
    memoryMb: nullableNumber(value.memoryMb),
    cpuPercent: nullableNumber(value.cpuPercent),
    endedAt,
    closeReason: endedAt ? stringValue(value.closeReason) || null : null,
    error: endedAt ? stringValue(value.error) || null : null,
    managed: value.managed !== false,
    recoveryJobId: stringValue(value.recoveryJobId) || null,
  }
}

function normalizeRecoveryJob(value: unknown): RecoveryJob | null {
  if (!isRecord(value) || !stringValue(value.id) || !stringValue(value.accountId)) return null
  const maxAttempts = Math.min(5, Math.max(1, Math.round(numberValue(value.maxAttempts, 3))))
  const attempt = Math.min(maxAttempts, Math.max(0, Math.round(numberValue(value.attempt, 0))))
  const status = enumValue(value.status, RECOVERY_STATUSES, 'scheduled')
  return {
    id: stringValue(value.id),
    accountId: stringValue(value.accountId),
    sourceSessionId: stringValue(value.sourceSessionId),
    attempt,
    maxAttempts,
    placeId: stringValue(value.placeId),
    jobId: stringValue(value.jobId),
    scheduledAt: nullableDate(value.scheduledAt) ?? new Date().toISOString(),
    lastAttemptAt: nullableDate(value.lastAttemptAt),
    lastError: stringValue(value.lastError) || null,
    status,
  }
}

function normalizeEvent(value: unknown): SessionEvent | null {
  if (!isRecord(value) || !stringValue(value.id) || !stringValue(value.title)) return null
  return {
    id: stringValue(value.id),
    type: enumValue(value.type, EVENT_TYPES, 'session-refresh-failed'),
    sessionId: stringValue(value.sessionId) || null,
    accountId: stringValue(value.accountId) || null,
    createdAt: nullableDate(value.createdAt) ?? new Date().toISOString(),
    severity: enumValue(value.severity, EVENT_SEVERITIES, 'info'),
    title: stringValue(value.title),
    detail: stringValue(value.detail),
  }
}

function dateMs(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isLikelyManagedLaunch(processInfo: RobloxProcessInfo): boolean {
  return /(?:^|\s)-t(?:\s|$)/i.test(processInfo.commandLine) && /(?:^|\s)-j(?:\s|$)/i.test(processInfo.commandLine)
}

function statusForProcessState(state: SessionProcessState): SessionStatus {
  if (state === 'alive') return 'running'
  if (state === 'crashed') return 'crashed'
  if (state === 'exited') return 'exited'
  if (state === 'closing') return 'closing'
  if (state === 'unresponsive') return 'unresponsive'
  if (state === 'launching') return 'launching'
  return 'unknown'
}

export class SessionGuardian {
  private readonly sessionFilePath: string
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly recoveryJobs = new Map<string, RecoveryJob>()
  private events: SessionEvent[] = []
  private readonly listeners = new Set<SessionListener>()
  private readonly missingProcessChecks = new Map<string, number>()
  private readonly unresponsiveChecks = new Map<string, number>()
  private readonly presenceMisses = new Map<string, number>()
  private readonly recoveryInFlight = new Set<string>()
  private readonly staleRecoveryInFlight = new Set<string>()
  private persistQueue: Promise<void> = Promise.resolve()
  private presenceResolver: ((userId: string) => Promise<Presence | null>) | null = null
  private recoveryLauncher: ((job: RecoveryJob) => Promise<unknown>) | null = null
  private timer: NodeJS.Timeout | null = null
  private tickInFlight = false
  private presenceInFlight = false
  private lastPresenceRefresh = 0
  private lastGlobalFailureAt = 0
  private initialized = false
  private readonly requestedStops = new Set<string>()

  constructor(private readonly store: AccountStore, userDataPath: string) {
    this.sessionFilePath = join(userDataPath, SESSION_FILE_NAME)
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.sessionFilePath), { recursive: true })
    try {
      const contents = await readFile(this.sessionFilePath, 'utf8')
      const parsed: unknown = JSON.parse(contents)
      if (isRecord(parsed)) {
        const data = parsed as PersistedSessionData
        const sessions = Array.isArray(data.sessions) ? data.sessions.map(normalizeSession).filter((value): value is SessionRecord => value !== null) : []
        const events = Array.isArray(data.events) ? data.events.map(normalizeEvent).filter((value): value is SessionEvent => value !== null) : []
        const recoveryJobs = Array.isArray(data.recoveryJobs) ? data.recoveryJobs.map(normalizeRecoveryJob).filter((value): value is RecoveryJob => value !== null) : []
        sessions.forEach((session) => this.sessions.set(session.id, session))
        this.events = events.slice(0, SESSION_EVENT_LIMIT)
        recoveryJobs.slice(0, RECOVERY_JOB_LIMIT).forEach((job) => {
          if (job.status === 'launching') {
            job.status = 'scheduled'
            job.scheduledAt = new Date().toISOString()
            job.lastError = 'Virgue restarted before the recovery launch completed.'
          }
          if (job.attempt >= job.maxAttempts && job.status === 'scheduled') job.status = 'exhausted'
          this.recoveryJobs.set(job.id, job)
        })
      }
    } catch {
      // A missing or damaged history file should not prevent the app from opening.
      this.sessions.clear()
      this.recoveryJobs.clear()
      this.events = []
    }
    this.initialized = true
    const trackedAccountIds = new Set([...this.sessions.values()].filter((session) => !session.endedAt).map((session) => session.accountId))
    for (const account of this.store.getAccounts()) {
      if (account.status !== 'running' || trackedAccountIds.has(account.id)) continue
      try {
        await this.store.setAccountRuntime(account.id, { status: account.presence?.type === 'offline' ? 'offline' : account.hasCredentials ? 'ready' : 'idle', jobId: '' })
      } catch {
        // An account can be removed while an older workspace is being repaired.
      }
    }
    await this.persist()
  }

  setPresenceResolver(resolver: (userId: string) => Promise<Presence | null>): void {
    this.presenceResolver = resolver
  }

  setRecoveryLauncher(launcher: (job: RecoveryJob) => Promise<unknown>): void {
    this.recoveryLauncher = launcher
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => { void this.tick() }, 2500)
    this.timer.unref()
    void this.tick()
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.presenceInFlight = false
    this.persist()
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): SessionSnapshot {
    const all = [...this.sessions.values()]
      .sort((left, right) => dateMs(right.startedAt) - dateMs(left.startedAt))
    return {
      active: all.filter((session) => !session.endedAt).map(clone),
      history: all.filter((session) => Boolean(session.endedAt)).slice(0, SESSION_HISTORY_LIMIT).map(clone),
      events: this.events.slice(0, SESSION_EVENT_LIMIT).map(clone),
      recoveryJobs: [...this.recoveryJobs.values()]
        .sort((left, right) => dateMs(left.scheduledAt) - dateMs(right.scheduledAt))
        .slice(0, RECOVERY_JOB_LIMIT)
        .map(clone),
      checkedAt: new Date().toISOString(),
    }
  }

  hasActiveSessionForAccount(accountId: string): boolean {
    return [...this.sessions.values()].some((session) => session.accountId === accountId && !session.endedAt)
  }

  async refresh(): Promise<SessionSnapshot> {
    await this.tick()
    return this.getSnapshot()
  }

  async registerLaunch(input: SessionLaunchInput): Promise<SessionRecord> {
    const account = this.store.getAccount(input.accountId)
    const startedAt = nullableDate(input.startedAt) ?? new Date().toISOString()
    const requestedRecoveryJobId = input.recoveryJobId?.trim() ?? ''
    const recoveryJob = requestedRecoveryJobId ? this.recoveryJobs.get(requestedRecoveryJobId) : undefined
    const recoveryJobId = recoveryJob?.accountId === account.id ? recoveryJob.id : null
    if (recoveryJobId) {
      recoveryJob!.status = 'launching'
      recoveryJob!.lastError = null
    }
    const session: SessionRecord = {
      id: randomUUID(),
      accountId: account.id,
      launchRequestId: input.launchRequestId,
      processId: input.processId,
      processParentId: null,
      processCreatedAt: null,
      processPath: input.processPath?.trim() ?? '',
      windowHandle: null,
      windowTitle: '',
      placeId: input.placeId.trim(),
      universeId: null,
      experienceName: this.getExperienceName(input.placeId, account.gameId),
      targetJobId: input.jobId.trim(),
      // A requested server is not the same thing as the server Roblox
      // actually placed the client in. The live Job ID is filled only from a
      // fresh presence response below.
      jobId: '',
      region: 'Unknown',
      processState: 'launching',
      presenceState: 'not-checked',
      status: 'launching',
      startedAt,
      lastProcessCheckAt: null,
      lastPresenceCheckAt: null,
      lastDataSource: 'launch',
      fps: null,
      memoryMb: null,
      cpuPercent: null,
      endedAt: null,
      closeReason: null,
      error: null,
      managed: true,
      recoveryJobId,
    }
    this.sessions.set(session.id, session)
    this.missingProcessChecks.delete(session.id)
    this.recordEvent('launch-requested', session, 'info', 'Launch tracked', 'Tracking ' + (account.alias || account.username) + ' from launch request ' + input.launchRequestId.slice(0, 8) + '.')
    await this.syncAccountRuntime(account.id)
    await this.persist()
    return clone(session)
  }

  async stop(sessionId: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    if (session.endedAt) return clone(session)
    if (process.platform !== 'win32') throw new Error('Stopping managed Roblox sessions is only available on Windows.')
    if (!session.managed || !session.processId) throw new Error('This session does not have a safely identified managed process.')
    const processes = await this.queryProcesses()
    const processInfo = processes.find((candidate) => candidate.id === session.processId)
    if (!processInfo) {
      await this.tick()
      return clone(this.sessions.get(sessionId) ?? session)
    }
    if (!this.isProcessCompatible(session, processInfo)) throw new Error('The recorded process ID no longer belongs to this session, so Virgue left it untouched.')
    session.processState = 'closing'
    session.status = 'closing'
    session.lastProcessCheckAt = new Date().toISOString()
    this.requestedStops.add(session.id)
    this.recordEvent('session-stop-requested', session, 'warning', 'Stop requested', 'Closing the managed Roblox client for ' + this.getAccountLabel(session.accountId) + '.')
    try {
      await execFileAsync('taskkill.exe', ['/PID', String(processInfo.id), '/T', '/F'], { windowsHide: true, timeout: 15000 })
    } catch (error) {
      this.requestedStops.delete(session.id)
      session.processState = 'unknown'
      session.status = 'unknown'
      session.error = error instanceof Error ? error.message : 'The managed Roblox process could not be closed.'
      this.recordEvent('session-refresh-failed', session, 'error', 'Session could not be stopped', session.error)
      await this.persist()
      throw new Error('The Roblox client could not be closed safely: ' + session.error)
    }
    await this.tick()
    return clone(this.sessions.get(sessionId) ?? session)
  }

  async cancelRecovery(jobId: string): Promise<RecoveryJob | null> {
    const job = this.recoveryJobs.get(jobId)
    if (!job) return null
    if (job.status === 'launching') throw new Error('This recovery attempt is already launching and cannot be cancelled.')
    if (job.status !== 'scheduled') return clone(job)
    job.status = 'cancelled'
    job.lastError = 'Cancelled by the user.'
    this.recordEventValues('recovery-cancelled', null, job.accountId, 'warning', 'Recovery cancelled', this.getAccountLabel(job.accountId) + ' will not be relaunched for this recovery job.')
    await this.persist()
    return clone(job)
  }

  async attachProcess(sessionId: string, processId: number | null, processPath: string, processCreatedAt: string | null = null, processParentId: number | null = null): Promise<SessionRecord | null> {
    const session = this.sessions.get(sessionId)
    if (!session || session.endedAt) return session ? clone(session) : null
    session.processId = processId
    session.processParentId = processParentId
    session.processCreatedAt = processCreatedAt
    session.processPath = processPath.trim() || session.processPath
    session.processState = processId ? 'launching' : 'unknown'
    session.status = processId ? 'launching' : 'unknown'
    session.lastDataSource = 'process'
    session.lastProcessCheckAt = new Date().toISOString()
    if (processId) this.recordEvent('process-attached', session, 'success', 'Roblox client attached', 'PID ' + processId + ' is now linked to ' + this.getAccountLabel(session.accountId) + '.')
    await this.persist()
    return clone(session)
  }

  async failLaunch(sessionId: string, reason: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(sessionId)
    if (!session || session.endedAt) return session ? clone(session) : null
    await this.endSession(session, true, reason.trim() || 'Roblox could not be started.', false)
    await this.persist()
    return clone(session)
  }

  private async tick(): Promise<void> {
    if (!this.initialized || this.tickInFlight) return
    this.tickInFlight = true
    try {
      const processes = await this.queryProcesses()
      const processById = new Map(processes.map((processInfo) => [processInfo.id, processInfo]))
      const active = [...this.sessions.values()].filter((session) => !session.endedAt)
      let dirty = false
      for (const session of active) {
        const direct = session.processId === null ? null : processById.get(session.processId)
        if (direct && !this.isProcessCompatible(session, direct)) {
          await this.endSession(session, false, 'The recorded process ID was reused by another process; Virgue left it untouched.', false)
          dirty = true
          continue
        }
        const processInfo = direct ?? this.findReplacementProcess(session, processes, active)
        if (!processInfo) {
          const misses = (this.missingProcessChecks.get(session.id) ?? 0) + 1
          this.missingProcessChecks.set(session.id, misses)
          const age = Date.now() - dateMs(session.startedAt)
          if (age < PROCESS_LAUNCH_GRACE_MS || misses < PROCESS_MISSING_LIMIT) {
            session.lastProcessCheckAt = new Date().toISOString()
            continue
          }
          // A missing process alone cannot prove a crash. A user closing the
          // Roblox window can leave a transient unresponsive observation
          // before the process exits; sustained unresponsiveness is classified
          // separately while the process is still present below.
          const requestedStop = this.requestedStops.has(session.id)
          const exitReason = requestedStop
            ? 'Closed by the user.'
            : session.processState === 'unresponsive'
              ? 'Roblox Player closed before Guardian could confirm a crash.'
              : 'Roblox Player exited or was no longer visible to Virgue.'
          await this.endSession(session, false, exitReason)
          this.unresponsiveChecks.delete(session.id)
          dirty = true
          continue
        }
        this.missingProcessChecks.delete(session.id)
        dirty = this.applyProcessObservation(session, processInfo) || dirty
        if (session.status === 'unresponsive') {
          const checks = (this.unresponsiveChecks.get(session.id) ?? 0) + 1
          this.unresponsiveChecks.set(session.id, checks)
          if (checks >= UNRESPONSIVE_CHECK_LIMIT) {
            await this.endSession(session, true, 'Roblox remained unresponsive across several Guardian checks.')
            this.unresponsiveChecks.delete(session.id)
            dirty = true
          }
        } else {
          this.unresponsiveChecks.delete(session.id)
        }
      }
      dirty = await this.refreshPresenceForActive() || dirty
      void this.processRecoveryJobs()
      if (dirty) this.persist()
    } catch (error) {
      console.warn('Session Guardian check failed.', error)
      this.recordGlobalFailure(error instanceof Error ? error.message : 'The session check failed.')
    } finally {
      this.tickInFlight = false
    }
  }

  private async queryProcesses(): Promise<RobloxProcessInfo[]> {
    if (process.platform !== 'win32') return []
    const script = "Get-CimInstance Win32_Process -Filter \"Name='RobloxPlayerBeta.exe'\" | ForEach-Object { $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($p) { $created = $null; try { $created = $p.StartTime.ToUniversalTime().ToString('o') } catch {}; [pscustomobject]@{ Id = [int]$_.ProcessId; ParentId = [int]$_.ParentProcessId; CreationTime = $created; MainWindowHandle = [int64]$p.MainWindowHandle; MainWindowTitle = [string]$p.MainWindowTitle; CommandLine = [string]$_.CommandLine; ProcessPath = [string]$_.ExecutablePath; WorkingSetBytes = [int64]$p.WorkingSet64 } } } | ConvertTo-Json -Compress"
    try {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 7000, maxBuffer: 2 * 1024 * 1024 })
      const raw = stdout.trim()
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      const values = Array.isArray(parsed) ? parsed : [parsed]
      return values.flatMap((value): RobloxProcessInfo[] => {
        if (!isRecord(value)) return []
        const id = Math.round(numberValue(value.Id, 0))
        if (id <= 0) return []
        const workingSetBytes = numberValue(value.WorkingSetBytes, 0)
        return [{
          id,
          parentId: Math.round(numberValue(value.ParentId, 0)),
          creationTime: nullableDate(value.CreationTime),
          mainWindowHandle: Math.round(numberValue(value.MainWindowHandle, 0)),
          mainWindowTitle: stringValue(value.MainWindowTitle),
          commandLine: stringValue(value.CommandLine),
          processPath: stringValue(value.ProcessPath),
          workingSetMb: Math.max(0, Math.round((workingSetBytes / 1024 / 1024) * 10) / 10),
        }]
      })
    } catch (error) {
      throw error instanceof Error ? error : new Error('Roblox processes could not be inspected.')
    }
  }

  private findReplacementProcess(session: SessionRecord, processes: RobloxProcessInfo[], active: SessionRecord[]): RobloxProcessInfo | null {
    const usedProcessIds = new Set(active.map((candidate) => candidate.processId).filter((id): id is number => id !== null && id !== session.processId))
    if (session.processId !== null) {
      const children = processes.filter((candidate) => candidate.parentId === session.processId && !usedProcessIds.has(candidate.id) && (isLikelyManagedLaunch(candidate) || this.isProcessCompatible(session, candidate)))
      if (children.length === 1) return children[0] ?? null
      return null
    }
    const started = dateMs(session.startedAt)
    const candidates = processes.filter((candidate) => !usedProcessIds.has(candidate.id) && isLikelyManagedLaunch(candidate)).filter((candidate) => {
      const created = dateMs(candidate.creationTime)
      return created === 0 || (created >= started - 5000 && created <= Date.now() + 5000)
    })
    return candidates.length === 1 ? candidates[0] ?? null : null
  }

  private isProcessCompatible(session: SessionRecord, processInfo: RobloxProcessInfo): boolean {
    if (session.processCreatedAt && processInfo.creationTime) {
      const difference = Math.abs(dateMs(session.processCreatedAt) - dateMs(processInfo.creationTime))
      if (difference > 10_000) return false
    } else if (!session.processCreatedAt && processInfo.creationTime && dateMs(processInfo.creationTime) < dateMs(session.startedAt) - 10_000) {
      return false
    }
    if (session.processPath && processInfo.processPath && session.processPath.toLowerCase() !== processInfo.processPath.toLowerCase()) return false
    return true
  }

  private applyProcessObservation(session: SessionRecord, processInfo: RobloxProcessInfo): boolean {
    const wasAttached = session.processId !== processInfo.id
    const previousStatus = session.status
    const previousProcessState = session.processState
    const previousCreatedAt = session.processCreatedAt
    const previousParentId = session.processParentId
    const previousPath = session.processPath
    const hasWindow = processInfo.mainWindowHandle > 0
    const age = Date.now() - dateMs(session.startedAt)
    const nextState: SessionProcessState = session.processState === 'closing'
      ? 'closing'
      : hasWindow ? 'alive' : age < PROCESS_WINDOW_GRACE_MS ? 'launching' : 'unresponsive'
    session.processId = processInfo.id
    session.processParentId = processInfo.parentId || null
    session.processCreatedAt = session.processCreatedAt ?? processInfo.creationTime
    session.processPath = processInfo.processPath || session.processPath
    session.windowHandle = processInfo.mainWindowHandle || null
    session.windowTitle = processInfo.mainWindowTitle
    session.processState = nextState
    session.status = statusForProcessState(nextState)
    session.lastProcessCheckAt = new Date().toISOString()
    session.lastDataSource = 'process'
    session.memoryMb = processInfo.workingSetMb
    if (wasAttached) this.recordEvent('process-attached', session, 'success', 'Roblox client attached', 'PID ' + processInfo.id + ' is now linked to ' + this.getAccountLabel(session.accountId) + '.')
    if (previousStatus !== session.status || previousProcessState !== session.processState) {
      const severity: SessionEventSeverity = session.status === 'unresponsive' ? 'warning' : session.status === 'running' ? 'success' : 'info'
      this.recordEvent('presence-updated', session, severity, this.processStatusTitle(session.status), this.processStatusDetail(session))
    }
    return wasAttached || previousStatus !== session.status || previousProcessState !== session.processState || previousCreatedAt !== session.processCreatedAt || previousParentId !== session.processParentId || previousPath !== session.processPath
  }

  private async refreshPresenceForActive(): Promise<boolean> {
    if (!this.presenceResolver || this.presenceInFlight) return false
    const snapshot = this.store.getSnapshot()
    if (!snapshot.settings.showPresence) return false
    const intervalMs = Math.max(15, snapshot.settings.presenceUpdateRate) * 1000
    if (Date.now() - this.lastPresenceRefresh < intervalMs) return false
    const active = [...this.sessions.values()].filter((session) => !session.endedAt)
    const accountIds = [...new Set(active.map((session) => session.accountId))]
    const accounts = accountIds.map((id) => this.store.getAccounts().find((account) => account.id === id)).filter((account): account is Account => Boolean(account && account.userId && account.hasCredentials))
    if (accounts.length === 0) return false
    this.lastPresenceRefresh = Date.now()
    this.presenceInFlight = true
    const checkedAt = new Date().toISOString()
    let dirty = false
    try {
      const results = await Promise.allSettled(accounts.map(async (account) => ({ account, presence: await this.presenceResolver!(account.userId!) })))
      for (const [index, result] of results.entries()) {
        const account = accounts[index]
        if (!account) continue
        if (result.status === 'rejected') {
          dirty = await this.applyPresenceResult(account, null, checkedAt, true) || dirty
          continue
        }
        dirty = await this.applyPresenceResult(result.value.account, result.value.presence, checkedAt, false) || dirty
      }
    } finally {
      this.presenceInFlight = false
    }
    return dirty
  }

  private async applyPresenceResult(account: Account, presence: Presence | null, checkedAt: string, failed: boolean): Promise<boolean> {
    const related = [...this.sessions.values()].filter((session) => session.accountId === account.id && !session.endedAt)
    if (related.length === 0) return false
    const previousValues = related.map((session) => session.presenceState + '|' + session.placeId + '|' + session.universeId + '|' + session.experienceName)
    const misses = failed || !presence ? (this.presenceMisses.get(account.id) ?? 0) + 1 : 0
    if (misses > 0) this.presenceMisses.set(account.id, misses)
    else this.presenceMisses.delete(account.id)
    try {
      await this.store.setAccountVerification(account.id, { presence, presenceCheckedAt: checkedAt })
    } catch {
      return false
    }
    related.forEach((session) => {
      const previousPresence = session.presenceState
      if (presence) {
        session.presenceState = presence.type
        session.lastPresenceCheckAt = checkedAt
        session.lastDataSource = 'presence'
        session.error = null
        if (presence.type === 'in-game') {
          if (presence.placeId) session.placeId = presence.placeId
          if (presence.universeId) session.universeId = presence.universeId
          session.jobId = presence.gameId || ''
          session.experienceName = this.getExperienceName(session.placeId, account.gameId, presence.lastLocation)
        } else {
          session.jobId = ''
        }
      } else {
        session.lastPresenceCheckAt = checkedAt
        session.lastDataSource = 'presence'
        session.presenceState = previousPresence === 'in-game' && misses >= PRESENCE_MISS_LIMIT ? 'stale' : 'unavailable'
        session.error = failed ? 'Roblox presence could not be checked.' : 'Roblox did not return presence for this account.'
      }
      if (previousPresence !== session.presenceState) {
        const stale = session.presenceState === 'stale'
        this.recordEvent(stale ? 'session-stale' : 'presence-updated', session, stale ? 'warning' : 'info', stale ? 'Presence is stale' : 'Presence updated', this.presenceDetail(session, presence))
        if (stale) void this.recoverStaleSession(session)
      }
    })
    await this.syncAccountRuntime(account.id)
    const nextValues = related.map((session) => session.presenceState + '|' + session.placeId + '|' + session.universeId + '|' + session.experienceName)
    return previousValues.some((value, index) => value !== nextValues[index])
  }

  private async recoverStaleSession(session: SessionRecord): Promise<void> {
    if (!session.managed || session.endedAt || this.staleRecoveryInFlight.has(session.id)) return
    this.staleRecoveryInFlight.add(session.id)
    try {
      let account: Account
      try {
        account = this.store.getAccount(session.accountId)
      } catch {
        return
      }
      if (!account.recoveryPolicy.enabled) return
      const staleReason = 'Roblox presence remained stale; Guardian is scheduling a safe relaunch.'
      if (process.platform !== 'win32' || !session.processId) {
        await this.endSession(session, true, staleReason)
        await this.persist()
        return
      }
      const processes = await this.queryProcesses()
      const processInfo = processes.find((candidate) => candidate.id === session.processId)
      if (!processInfo) {
        await this.endSession(session, true, staleReason)
        await this.persist()
        return
      }
      if (!this.isProcessCompatible(session, processInfo)) {
        this.recordEventValues('recovery-failed', session.id, session.accountId, 'warning', 'Stale session left untouched', 'The recorded process ID no longer matches the managed Roblox client, so Virgue did not close it.')
        await this.persist()
        return
      }
      session.processState = 'closing'
      session.status = 'closing'
      session.lastProcessCheckAt = new Date().toISOString()
      this.recordEvent('session-stop-requested', session, 'warning', 'Stale session restart requested', 'Closing the stale Roblox client before its bounded recovery retry.')
      try {
        await execFileAsync('taskkill.exe', ['/PID', String(processInfo.id), '/T', '/F'], { windowsHide: true, timeout: 15000 })
      } catch (error) {
        session.processState = 'unknown'
        session.status = 'unknown'
        session.error = error instanceof Error ? error.message : 'The stale Roblox process could not be closed.'
        this.recordEventValues('recovery-failed', session.id, session.accountId, 'error', 'Stale session could not be closed', session.error)
        await this.persist()
        return
      }
      await this.endSession(session, true, 'Roblox presence remained stale; the client was closed for recovery.')
      await this.persist()
    } catch (error) {
      this.recordEventValues('recovery-failed', session.id, session.accountId, 'error', 'Recovery could not inspect the stale session', error instanceof Error ? error.message : 'The stale session could not be recovered.')
      await this.persist()
    } finally {
      this.staleRecoveryInFlight.delete(session.id)
    }
  }

  private async scheduleRecovery(session: SessionRecord, reason: string): Promise<void> {
    if (!session.managed || this.hasActiveSessionForAccount(session.accountId)) return
    let account: Account
    try {
      account = this.store.getAccount(session.accountId)
    } catch {
      return
    }
    const policy = account.recoveryPolicy
    if (!policy.enabled) return
    if (!account.hasCredentials) {
      this.recordEventValues('recovery-failed', session.id, account.id, 'warning', 'Recovery needs a sign-in', this.getAccountLabel(account.id) + ' has no saved Roblox credentials, so Guardian cannot relaunch it.')
      return
    }
    const existing = session.recoveryJobId ? this.recoveryJobs.get(session.recoveryJobId) : undefined
    if (existing?.status === 'cancelled' || existing?.status === 'exhausted') return
    const now = Date.now()
    const scheduledAt = new Date(now + policy.cooldownSeconds * 1000).toISOString()
    const targetJobId = session.jobId.trim() || session.targetJobId.trim() || account.jobId.trim()
    if (existing) {
      existing.maxAttempts = policy.maxAttempts
      existing.placeId = session.placeId.trim() || account.placeId
      if (existing.attempt === 0 && targetJobId) existing.jobId = targetJobId
      existing.lastError = reason
      if (existing.attempt >= existing.maxAttempts) {
        existing.status = 'exhausted'
        existing.scheduledAt = new Date(now).toISOString()
        this.recordEventValues('recovery-exhausted', session.id, account.id, 'warning', 'Recovery attempts exhausted', this.getAccountLabel(account.id) + ' reached its ' + existing.maxAttempts + '-attempt recovery limit.')
      } else {
        existing.status = 'scheduled'
        existing.scheduledAt = scheduledAt
        this.recordEventValues('recovery-scheduled', session.id, account.id, 'warning', 'Recovery retry scheduled', this.getAccountLabel(account.id) + ' will retry in ' + policy.cooldownSeconds + ' seconds (' + existing.attempt + '/' + existing.maxAttempts + ' attempts used).')
      }
    } else {
      const job: RecoveryJob = {
        id: randomUUID(),
        accountId: account.id,
        sourceSessionId: session.id,
        attempt: 0,
        maxAttempts: policy.maxAttempts,
        placeId: session.placeId.trim() || account.placeId,
        jobId: targetJobId,
        scheduledAt,
        lastAttemptAt: null,
        lastError: reason,
        status: 'scheduled',
      }
      session.recoveryJobId = job.id
      this.recoveryJobs.set(job.id, job)
      this.recordEventValues('recovery-scheduled', session.id, account.id, 'warning', 'Recovery retry scheduled', this.getAccountLabel(account.id) + ' will retry in ' + policy.cooldownSeconds + ' seconds (0/' + job.maxAttempts + ' attempts used).')
    }
    await this.persist()
  }

  private async processRecoveryJobs(): Promise<void> {
    if (!this.initialized || !this.recoveryLauncher) return
    const due = [...this.recoveryJobs.values()].filter((job) => job.status === 'scheduled' && dateMs(job.scheduledAt) <= Date.now())
    for (const job of due) {
      if (this.recoveryInFlight.has(job.id)) continue
      let account: Account
      try {
        account = this.store.getAccount(job.accountId)
      } catch {
        job.status = 'cancelled'
        job.lastError = 'The account no longer exists.'
        this.recordEventValues('recovery-cancelled', null, job.accountId, 'warning', 'Recovery cancelled', 'The account for this recovery job no longer exists.')
        continue
      }
      const policy = account.recoveryPolicy
      job.maxAttempts = policy.maxAttempts
      if (!policy.enabled) {
        job.status = 'cancelled'
        job.lastError = 'Auto-recovery was disabled for this account.'
        this.recordEventValues('recovery-cancelled', null, account.id, 'info', 'Recovery cancelled', 'Auto-recovery is disabled for ' + this.getAccountLabel(account.id) + '.')
        continue
      }
      if (this.hasActiveSessionForAccount(account.id)) {
        job.status = 'cancelled'
        job.lastError = 'Another managed session for this account is already active.'
        this.recordEventValues('recovery-cancelled', null, account.id, 'info', 'Recovery skipped', 'Another managed Roblox session for ' + this.getAccountLabel(account.id) + ' is already active.')
        continue
      }
      if (job.attempt >= job.maxAttempts) {
        job.status = 'exhausted'
        job.lastError = job.lastError || 'The retry limit was reached.'
        this.recordEventValues('recovery-exhausted', null, account.id, 'warning', 'Recovery attempts exhausted', this.getAccountLabel(account.id) + ' reached its ' + job.maxAttempts + '-attempt recovery limit.')
        continue
      }
      if (job.attempt > 0 && policy.fallbackToPublicServer) job.jobId = ''
      job.attempt += 1
      job.status = 'launching'
      job.lastAttemptAt = new Date().toISOString()
      job.lastError = null
      this.recoveryInFlight.add(job.id)
      this.recordEventValues('recovery-started', null, account.id, 'info', 'Recovery launch started', 'Launching ' + this.getAccountLabel(account.id) + ' (attempt ' + job.attempt + ' of ' + job.maxAttempts + ').')
      await this.persist()
      try {
        await this.recoveryLauncher(clone(job))
        if (!this.hasActiveSessionForAccount(account.id)) throw new Error('The recovery launch did not create a tracked Roblox session.')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The recovery launch failed.'
        job.lastError = message
        if (job.attempt >= job.maxAttempts) {
          job.status = 'exhausted'
          job.scheduledAt = new Date().toISOString()
          this.recordEventValues('recovery-exhausted', null, account.id, 'error', 'Recovery launch limit reached', this.getAccountLabel(account.id) + ' could not be relaunched after ' + job.attempt + ' attempts: ' + message)
        } else {
          job.status = 'scheduled'
          job.scheduledAt = new Date(Date.now() + policy.cooldownSeconds * 1000).toISOString()
          this.recordEventValues('recovery-failed', null, account.id, 'warning', 'Recovery launch failed', message + ' Guardian will retry after the cooldown.')
        }
      } finally {
        this.recoveryInFlight.delete(job.id)
        await this.persist()
      }
    }
  }

  private async endSession(session: SessionRecord, crashed: boolean, reason: string, allowRecovery = true): Promise<void> {
    if (session.endedAt) return
    const userRequestedStop = this.requestedStops.has(session.id)
    const linkedRecoveryJob = session.recoveryJobId ? this.recoveryJobs.get(session.recoveryJobId) : undefined
    if (userRequestedStop && linkedRecoveryJob?.status === 'launching') {
      linkedRecoveryJob.status = 'cancelled'
      linkedRecoveryJob.lastError = 'The recovery-launched client was stopped by the user.'
      this.recordEventValues('recovery-cancelled', session.id, session.accountId, 'info', 'Recovery cancelled', 'The recovery-launched Roblox client was stopped by the user.')
    }
    session.endedAt = new Date().toISOString()
    session.lastProcessCheckAt = session.endedAt
    session.processState = crashed ? 'crashed' : 'exited'
    session.status = crashed ? 'crashed' : 'exited'
    session.presenceState = 'unavailable'
    session.closeReason = reason
    session.error = crashed ? reason : null
    this.missingProcessChecks.delete(session.id)
    this.unresponsiveChecks.delete(session.id)
    this.requestedStops.delete(session.id)
    if (allowRecovery && !userRequestedStop) await this.scheduleRecovery(session, reason)
    this.recordEvent(crashed ? 'session-crashed' : 'session-ended', session, crashed ? 'error' : 'info', crashed ? 'Roblox client crashed' : 'Roblox client ended', this.getAccountLabel(session.accountId) + ' — ' + reason)
    await this.syncAccountRuntime(session.accountId)
  }

  private async syncAccountRuntime(accountId: string): Promise<void> {
    let account: Account
    try {
      account = this.store.getAccount(accountId)
    } catch {
      return
    }
    const active = [...this.sessions.values()]
      .filter((session) => session.accountId === accountId && !session.endedAt)
      .sort((left, right) => dateMs(right.startedAt) - dateMs(left.startedAt))
    const latest = active[0]
    if (latest) {
      await this.store.setAccountRuntime(accountId, { status: 'running', placeId: latest.placeId, jobId: latest.jobId })
      return
    }
    const fallbackStatus = account.hasCredentials ? account.presence?.type === 'offline' ? 'offline' : 'ready' : 'idle'
    await this.store.setAccountRuntime(accountId, { status: fallbackStatus, jobId: '' })
  }

  private getExperienceName(placeId: string, accountGameId: string, fallback = ''): string {
    const normalized = placeId.trim()
    const game = this.store.getGames().find((candidate) => candidate.placeId === normalized)
      ?? this.store.getGames().find((candidate) => candidate.id === accountGameId)
    return fallback.trim() || game?.name || (normalized ? 'Place ' + normalized : 'Roblox')
  }

  private getAccountLabel(accountId: string): string {
    const account = this.store.getAccounts().find((candidate) => candidate.id === accountId)
    return account ? account.alias || account.username : 'Unknown account'
  }

  private processStatusTitle(status: SessionStatus): string {
    if (status === 'running') return 'Roblox client running'
    if (status === 'unresponsive') return 'Roblox client needs attention'
    if (status === 'launching') return 'Roblox client launching'
    if (status === 'closing') return 'Roblox client closing'
    return 'Roblox session updated'
  }

  private processStatusDetail(session: SessionRecord): string {
    const target = session.processId ? 'PID ' + session.processId : 'process not identified'
    return this.getAccountLabel(session.accountId) + ' — ' + target + (session.memoryMb !== null ? ' — ' + session.memoryMb.toFixed(1) + ' MB' : '') + '.'
  }

  private presenceDetail(session: SessionRecord, presence: Presence | null): string {
    if (!presence) return this.getAccountLabel(session.accountId) + ' presence is unavailable. Process state is tracked separately.'
    if (presence.type === 'in-game') return this.getAccountLabel(session.accountId) + ' is in ' + session.experienceName + '.'
    if (presence.type === 'in-studio') return this.getAccountLabel(session.accountId) + ' is in Roblox Studio.'
    if (presence.type === 'online') return this.getAccountLabel(session.accountId) + ' is online outside an experience.'
    return this.getAccountLabel(session.accountId) + ' is offline according to Roblox.'
  }

  private recordEvent(type: SessionEventType, session: SessionRecord, severity: SessionEventSeverity, title: string, detail: string): void {
    this.recordEventValues(type, session.id, session.accountId, severity, title, detail)
  }

  private recordGlobalFailure(detail: string): void {
    if (Date.now() - this.lastGlobalFailureAt < 30_000) return
    this.lastGlobalFailureAt = Date.now()
    this.recordEventValues('session-refresh-failed', null, null, 'warning', 'Session check delayed', detail)
  }

  private recordEventValues(type: SessionEventType, sessionId: string | null, accountId: string | null, severity: SessionEventSeverity, title: string, detail: string): void {
    const event: SessionEvent = { id: randomUUID(), type, sessionId, accountId, createdAt: new Date().toISOString(), severity, title, detail }
    this.events = [event, ...this.events].slice(0, SESSION_EVENT_LIMIT)
    for (const listener of this.listeners) {
      try {
        listener(clone(event))
      } catch {
        // A renderer subscriber cannot interrupt the process tracker.
      }
    }
    this.persist()
  }

  private persist(): Promise<void> {
    const payload = JSON.stringify({ sessions: [...this.sessions.values()], events: this.events, recoveryJobs: [...this.recoveryJobs.values()].slice(0, RECOVERY_JOB_LIMIT) }, null, 2) + '\n'
    this.persistQueue = this.persistQueue
      .catch(() => undefined)
      .then(() => writeFile(this.sessionFilePath, payload, 'utf8'))
      .catch((error) => {
        console.warn('Session history could not be saved.', error)
      })
    return this.persistQueue
  }
}
