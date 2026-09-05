import { app, BrowserWindow, clipboard, session, type Shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, readdir, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import type {
  Account,
  AccountBrowserResult,
  AccountUtilityInput,
  AccountUtilityResult,
  BulkImportInput,
  ClientSettings,
  GameCollection,
  GameSearchResult,
  ImportCookieInput,
  JoinServerInput,
  LaunchResult,
  OutfitPreview,
  PlayerLookup,
  PlayerSearchResult,
  Presence,
  RobloxProcessActionResult,
  RobloxLoginInput,
  ServerQuery,
  ServerQueryResult,
  ServerRecord,
  ServerFilterCriteria,
  SessionLaunchInput,
  UniverseInfo,
  UniverseResult,
} from '../shared/types'
import { getPlanFeatureError } from '../shared/entitlements'
import { AccountStore, parseGameSearchResult } from './account-store'
import { SecretStore } from './secret-store'
import type { SessionGuardian } from './session-guardian'
import type { ProtectedSessionService } from './protected-session'

const ROBLOX_USER_AGENT = "Valdor — Roblox Account Manager/1.0"
const SERVER_CACHE_TTL_MS = 10 * 60 * 1000
const execFileAsync = promisify(execFile)
const ACCOUNT_PARTITION_PREFIX = 'persist:valdor-account-'
const LEGACY_ACCOUNT_PARTITION_PREFIX = 'persist:virgue-account-'

const defaultServerCriteria: ServerFilterCriteria = {
  minPlayers: null, maxPlayers: null, minPing: null, maxPing: null, regionAllowList: [], regionDenyList: [], serverTypes: ['public'], jobId: '', maxAgeMinutes: null, excludeVisited: false, includeFavoritesOnly: false, sort: 'default',
}

function serverCriteria(value?: ServerFilterCriteria): ServerFilterCriteria {
  return { ...defaultServerCriteria, ...(value ?? {}), regionAllowList: [...(value?.regionAllowList ?? [])], regionDenyList: [...(value?.regionDenyList ?? [])], serverTypes: [...(value?.serverTypes ?? defaultServerCriteria.serverTypes)] }
}

function scoreServer(server: ServerRecord, criteria: ServerFilterCriteria, visited: Set<string>): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0
  if (server.ping > 0) { score += Math.max(0, 35 - Math.min(35, Math.round(server.ping / 5))); reasons.push(`${server.ping} ms ping`) } else reasons.push('Ping unknown')
  const capacity = server.maxPlayers > 0 ? server.playing / server.maxPlayers : 1
  score += Math.max(0, 25 - Math.round(capacity * 25)); reasons.push(`${server.playing}/${server.maxPlayers || '?'} players`)
  const freshnessMinutes = server.lastSeenAt ? Math.max(0, (Date.now() - Date.parse(server.lastSeenAt)) / 60000) : 999
  score += Math.max(0, 20 - Math.min(20, Math.round(freshnessMinutes / 3))); reasons.push(freshnessMinutes < 2 ? 'Fresh observation' : `Seen ${Math.round(freshnessMinutes)}m ago`)
  if (server.region && server.region !== 'Unknown') { score += criteria.regionAllowList.length > 0 && criteria.regionAllowList.includes(server.region) ? 15 : 8; reasons.push(server.region) } else reasons.push('Region unknown')
  if (server.isFavorite) { score += 10; reasons.push('Favourite') }
  if (visited.has(server.id)) reasons.push('Visited before')
  return { score: Math.max(0, Math.min(100, score)), reasons: reasons.slice(0, 4) }
}

function filterAndRankServers(servers: ServerRecord[], criteriaInput: ServerFilterCriteria, history: Set<string>): ServerRecord[] {
  const criteria = serverCriteria(criteriaInput)
  const now = Date.now()
  const output = servers.filter((server) => {
    const ping = server.ping > 0 ? server.ping : null
    return (!criteria.jobId || server.id.toLowerCase().includes(criteria.jobId.toLowerCase()))
      && (criteria.minPlayers === null || server.playing >= criteria.minPlayers)
      && (criteria.maxPlayers === null || server.playing <= criteria.maxPlayers)
      && (criteria.minPing === null || (ping !== null && ping >= criteria.minPing))
      && (criteria.maxPing === null || (ping !== null && ping <= criteria.maxPing))
      && (criteria.regionAllowList.length === 0 || criteria.regionAllowList.includes(server.region))
      && (!criteria.regionDenyList.includes(server.region))
      && criteria.serverTypes.includes(server.type)
      && (criteria.maxAgeMinutes === null || !server.lastSeenAt || now - Date.parse(server.lastSeenAt) <= criteria.maxAgeMinutes * 60000)
      && (!criteria.excludeVisited || !history.has(server.id))
      && (!criteria.includeFavoritesOnly || server.isFavorite === true)
  }).map((server) => {
    const scored = scoreServer(server, criteria, history)
    return { ...server, score: scored.score, scoreReasons: scored.reasons }
  })
  if (criteria.sort === 'score') output.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id))
  if (criteria.sort === 'ping') output.sort((a, b) => (a.ping || Number.MAX_SAFE_INTEGER) - (b.ping || Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id))
  if (criteria.sort === 'players') output.sort((a, b) => a.playing - b.playing || a.id.localeCompare(b.id))
  if (criteria.sort === 'newest') output.sort((a, b) => Date.parse(b.lastSeenAt ?? '') - Date.parse(a.lastSeenAt ?? '') || a.id.localeCompare(b.id))
  return output
}

interface RobloxUser {
  id: number
  name: string
  displayName: string
  description?: string
  created?: string
  isBanned?: boolean
}

interface RobloxResponse {
  data?: unknown[]
  nextPageCursor?: string | null
  previousPageCursor?: string | null
  [key: string]: unknown
}

interface LaunchGlobalSettings {
  path: string
  directory: string
}

interface NvidiaFpsState {
  present: boolean
  value: number
}

interface AccountBrowserRequestResult {
  status: number
  body: string
}

class RobloxAuthenticationTicketError extends Error {
  constructor(readonly status: number) {
    super(`Roblox authentication ticket request failed (${status}).`)
    this.name = 'RobloxAuthenticationTicketError'
  }
}

interface TrackedRobloxProcess {
  startedAt: number
  launchSettings: LaunchGlobalSettings | null
}

interface LaunchProcessResult {
  executable: string
  processId: number | null
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function optionalBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
  }
  if (typeof value === 'object' && value !== null) {
    const source = value as Record<string, unknown>
    if ('isBlocked' in source) return optionalBoolean(source.isBlocked)
    if ('blocked' in source) return optionalBoolean(source.blocked)
  }
  return null
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return ''
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : ''
}

function isFileLockedError(error: unknown): boolean {
  return ['EPERM', 'EBUSY', 'EACCES'].includes(errorCode(error))
}

function setXmlFramerateCap(content: string, value: number): string {
  const serialized = String(Math.round(value))
  const existing = /(<int\s+name=["']FramerateCap["']\s*>)[^<]*(<\/int>)/i
  if (existing.test(content)) return content.replace(existing, `$1${serialized}$2`)
  const propertiesEnd = /<\/Properties>/i
  if (propertiesEnd.test(content)) return content.replace(propertiesEnd, `      <int name="FramerateCap">${serialized}</int>\n    </Properties>`)
  return content
}

function createGlobalSettingsTemplate(framerateCap: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
  <External>null</External>
  <External>nil</External>
  <Item class="UserGameSettings" referent="VALDORFPSSETTINGS">
    <Properties>
      <int name="FramerateCap">${Math.round(framerateCap)}</int>
      <string name="Name">GameSettings</string>
    </Properties>
  </Item>
</roblox>
`
}

function identifier(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function parseCookieFromResponse(response: Response): string | null {
  const header = response.headers.get('set-cookie') ?? ''
  const match = header.match(/\.ROBLOSECURITY=([^;]+)/i)
  return match?.[1] ?? null
}

function toPresence(value: unknown): Presence | null {
  if (typeof value !== 'object' || value === null) return null
  const source = value as Record<string, unknown>
  const presenceType = Number(source.userPresenceType)
  const type = presenceType === 2 ? 'in-game' : presenceType === 3 ? 'in-studio' : presenceType === 1 ? 'online' : 'offline'
  const placeId = identifier(source.placeId) || null
  const universeId = identifier(source.universeId) || null
  return { type, lastLocation: stringValue(source.lastLocation), placeId, gameId: identifier(source.gameId) || null, universeId, lastOnline: typeof source.lastOnline === 'string' ? source.lastOnline : null }
}

export class RobloxClient {
  private readonly browserWindows = new Set<BrowserWindow>()
  private readonly accountBrowsers = new Map<string, BrowserWindow>()
  private readonly browserTrackerIds = new Map<string, string>()
  private loginWindow: BrowserWindow | null = null
  private backgroundTimer: NodeJS.Timeout | null = null
  private multiRobloxMutex: ChildProcess | null = null
  private multiRobloxMutexStart: Promise<void> | null = null
  private multiRobloxMonitor: NodeJS.Timeout | null = null
  private multiInstanceEnabled = false
  private lastPresenceRefresh = 0
  private lastCookieRefresh = 0
  private presenceRefreshInFlight = false
  private readonly presenceMisses = new Map<string, number>()
  private windowsLaunchQueue: Promise<void> = Promise.resolve()
  private readonly launchSettings = new Set<LaunchGlobalSettings>()
  private readonly launchedRobloxProcesses = new Map<number, TrackedRobloxProcess>()
  private cleanupInFlight = false
  private protectedSession: ProtectedSessionService | null = null

  constructor(private readonly store: AccountStore, private readonly secrets: SecretStore, private readonly electronShell: Shell, private readonly sessionGuardian: SessionGuardian | null = null) {}

  setProtectedSession(service: ProtectedSessionService): void {
    this.protectedSession = service
  }

  startBackgroundTasks(): void {
    if (this.backgroundTimer) return
    void this.updateMultiInstance(this.store.getSnapshot().settings.multiInstance).catch((error) => {
      console.warn('Roblox multi-session guard could not start.', error)
      if (this.store.getSnapshot().settings.multiInstance) void this.store.updateSettings({ multiInstance: false })
    })
    void this.refreshPresence()
    this.backgroundTimer = setInterval(() => {
      if (Date.now() - this.lastCookieRefresh >= 60000) {
        this.lastCookieRefresh = Date.now()
        void this.refreshStaleCookies()
      }
      void this.refreshPresence()
      void this.reapClosedRobloxClients()
    }, 15000)
    void this.reapClosedRobloxClients()
  }

  async updateMultiInstance(enabled: boolean): Promise<void> {
    if (process.platform !== 'win32') return
    if (!enabled) {
      this.multiInstanceEnabled = false
      if (this.multiRobloxMonitor) clearInterval(this.multiRobloxMonitor)
      this.multiRobloxMonitor = null
      this.multiRobloxMutex?.kill()
      this.multiRobloxMutex = null
      return
    }
    if (!this.multiRobloxMutex && !this.multiRobloxMutexStart && await this.isRobloxPlayerRunning()) {
      throw new Error('Close all running Roblox clients before enabling multiple sessions. Roblox currently owns its single-instance guard.')
    }
    this.multiInstanceEnabled = true
    if (!this.multiRobloxMonitor) this.multiRobloxMonitor = setInterval(() => { void this.releaseIdleMultiInstanceMutex() }, 15000)
    if (this.multiRobloxMutex && !this.multiRobloxMutex.killed) return
    if (this.multiRobloxMutexStart) return this.multiRobloxMutexStart
    const start = this.startMultiInstanceMutex()
    this.multiRobloxMutexStart = start
    try {
      await start
    } catch (error) {
      this.multiInstanceEnabled = false
      if (this.multiRobloxMonitor) clearInterval(this.multiRobloxMonitor)
      this.multiRobloxMonitor = null
      throw error
    } finally {
      if (this.multiRobloxMutexStart === start) this.multiRobloxMutexStart = null
    }
  }

  private async startMultiInstanceMutex(): Promise<void> {
    const signalPath = join(tmpdir(), `valdor-mutex-${randomUUID()}.ready`)
    const escapedSignalPath = signalPath.replace(/'/g, "''")
    const script = `$signalPath = '${escapedSignalPath}'; $created = $false; try { $mutex = New-Object System.Threading.Mutex($true, 'ROBLOX_singletonMutex', [ref]$created); if (-not $created) { try { if (-not $mutex.WaitOne(0)) { exit 2 } } catch { exit 2 } }; [System.IO.File]::WriteAllText($signalPath, 'ready'); while ($true) { Start-Sleep -Seconds 3600 } } catch { exit 1 }`
    // Keep the helper attached to the manager so Windows does not discard its startup signal.
    // It is unrefed after readiness and explicitly stopped during dispose().
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { detached: false, windowsHide: true, stdio: 'ignore' })
    this.multiRobloxMutex = child
    child.once('exit', () => { if (this.multiRobloxMutex === child) this.multiRobloxMutex = null })
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false
        const timeout = setTimeout(() => finish(new Error('The Roblox multi-session guard did not start.')), 3000)
        const poll = setInterval(() => {
          void readFile(signalPath, 'utf8').then((value) => {
            if (value.trim() === 'ready') finish()
          }).catch(() => {
            // The marker is not present until PowerShell has acquired the mutex.
          })
        }, 50)
        const finish = (error?: Error) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          clearInterval(poll)
          if (error) reject(error)
          else resolve()
        }
        child.once('error', (error) => finish(error instanceof Error ? error : new Error('The Roblox multi-session guard could not start.')))
        child.once('exit', (code) => finish(new Error(code === 2 ? 'Another Roblox multi-session guard is already active.' : 'The Roblox multi-session guard exited before it was ready.')))
      })
      await unlink(signalPath).catch(() => undefined)
      child.unref()
    } catch (error) {
      child.kill()
      if (this.multiRobloxMutex === child) this.multiRobloxMutex = null
      await unlink(signalPath).catch(() => undefined)
      throw error
    }
  }

  private async releaseIdleMultiInstanceMutex(): Promise<void> {
    if (!this.multiInstanceEnabled || !this.multiRobloxMutex || this.multiRobloxMutex.killed) return
    if (await this.isRobloxPlayerRunning()) return
    this.multiRobloxMutex.kill()
    this.multiRobloxMutex = null
  }

  dispose(): void {
    if (this.backgroundTimer) clearInterval(this.backgroundTimer)
    this.backgroundTimer = null
    if (this.multiRobloxMonitor) clearInterval(this.multiRobloxMonitor)
    this.multiRobloxMonitor = null
    this.multiInstanceEnabled = false
    this.multiRobloxMutex?.kill()
    this.multiRobloxMutex = null
    for (const browser of this.browserWindows) browser.close()
    this.browserWindows.clear()
    this.accountBrowsers.clear()
    this.browserTrackerIds.clear()
    this.presenceMisses.clear()
    this.launchedRobloxProcesses.clear()
    for (const settings of this.launchSettings) void this.removeLaunchGlobalSettings(settings)
  }

  async importCookie(input: ImportCookieInput): Promise<Account> {
    const cookie = input.cookie.trim()
    if (cookie.length < 30) throw new Error('That does not look like a Roblox session cookie.')
    const user = await this.getAuthenticated(cookie)
    return this.storeAuthenticatedCookie(cookie, user, input)
  }

  async login(input: RobloxLoginInput = {}): Promise<Account> {
    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      this.loginWindow.focus()
      throw new Error('A Roblox sign-in window is already open.')
    }

    const partition = `valdor-login-${randomUUID()}`
    const loginSession = session.fromPartition(partition)
    const browser = new BrowserWindow({
      width: 520,
      height: 760,
      minWidth: 420,
      minHeight: 620,
      show: false,
      title: "Sign in to Roblox — Valdor — Roblox Account Manager",
      icon: join(__dirname, '../renderer/valdor-icon.png'),
      backgroundColor: '#e9e7df',
      webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: false, webSecurity: true },
    })
    this.loginWindow = browser
    this.browserWindows.add(browser)

    const isRobloxUrl = (value: string): boolean => {
      try {
        const hostname = new URL(value).hostname.toLowerCase()
        return hostname === 'roblox.com' || hostname.endsWith('.roblox.com')
      } catch {
        return false
      }
    }
    browser.webContents.setWindowOpenHandler(({ url }) => isRobloxUrl(url) ? { action: 'allow' } : { action: 'deny' })
    browser.webContents.on('will-navigate', (event, url) => { if (!isRobloxUrl(url)) event.preventDefault() })
    browser.once('ready-to-show', () => browser.show())

    return new Promise<Account>((resolve, reject) => {
      let settled = false
      let checking = false
      let lastCookie = ''
      let timer: NodeJS.Timeout | null = null

      const cleanup = () => {
        if (timer) clearInterval(timer)
        timer = null
        loginSession.cookies.removeListener('changed', onCookieChanged)
        browser.webContents.removeListener('did-finish-load', onPageLoaded)
        browser.webContents.removeListener('did-navigate', onPageLoaded)
        browser.removeListener('closed', onClosed)
        this.browserWindows.delete(browser)
        if (this.loginWindow === browser) this.loginWindow = null
        if (!browser.isDestroyed()) browser.close()
      }
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error instanceof Error ? error : new Error('Roblox sign-in failed.'))
      }
      const complete = (account: Account) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(account)
      }
      const checkCookie = async () => {
        if (settled || checking) return
        checking = true
        try {
          const cookies = await loginSession.cookies.get({ url: 'https://www.roblox.com/' })
          const cookie = cookies.find((candidate) => candidate.name === '.ROBLOSECURITY')?.value ?? ''
          if (!cookie || cookie === lastCookie) return
          lastCookie = cookie
          try {
            complete(await this.importCookie({ cookie, gameId: input.gameId, categoryId: input.categoryId }))
          } catch (error) {
            lastCookie = ''
            console.warn('Roblox sign-in cookie was not accepted yet.', error)
          }
        } catch (error) {
          console.warn('Roblox sign-in cookie check failed.', error)
        } finally {
          checking = false
        }
      }
      const onCookieChanged = () => { void checkCookie() }
      const onPageLoaded = () => { void checkCookie() }
      const onClosed = () => fail(new Error('Roblox sign-in was cancelled.'))
      loginSession.cookies.on('changed', onCookieChanged)
      browser.webContents.on('did-finish-load', onPageLoaded)
      browser.webContents.on('did-navigate', onPageLoaded)
      browser.on('closed', onClosed)
      timer = setInterval(() => { void checkCookie() }, 1000)
      void checkCookie()
      void browser.loadURL('https://www.roblox.com/login').catch(fail)
    })
  }

  private async getAccountPartition(accountId: string): Promise<string> {
    const canonical = ACCOUNT_PARTITION_PREFIX + accountId
    const legacy = LEGACY_ACCOUNT_PARTITION_PREFIX + accountId
    const partitionsDirectory = join(dirname(this.store.getSnapshot().info.dataPath), 'Partitions')
    try {
      await stat(join(partitionsDirectory, canonical.slice('persist:'.length)))
      return canonical
    } catch {
      try {
        await stat(join(partitionsDirectory, legacy.slice('persist:'.length)))
        return legacy
      } catch {
        return canonical
      }
    }
  }

  private async requestFromAccountBrowser(account: Account, url: string, payload: Record<string, string>): Promise<AccountBrowserRequestResult> {
    const cookie = this.requireCookie(account)
    const existing = this.accountBrowsers.get(account.id)
    let browser = existing && !existing.isDestroyed() ? existing : null
    let temporary = false

    try {
      if (!browser) {
        const partition = await this.getAccountPartition(account.id)
        browser = new BrowserWindow({
          show: false,
          width: 1180,
          height: 820,
          title: `${account.alias || account.username} — Roblox`,
          backgroundColor: '#e9e7df',
          webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: false },
        })
        temporary = true
        this.browserWindows.add(browser)
        await browser.webContents.session.cookies.set({ url: 'https://www.roblox.com', name: '.ROBLOSECURITY', value: cookie, domain: '.roblox.com', path: '/', secure: true, httpOnly: true })
        await browser.loadURL('https://www.roblox.com/my/account#!/privacy')
      } else {
        // Keep the browser context tied to the currently stored session. This
        // also handles a cookie rotated by a logout/re-authentication action.
        await browser.webContents.session.cookies.set({ url: 'https://www.roblox.com', name: '.ROBLOSECURITY', value: cookie, domain: '.roblox.com', path: '/', secure: true, httpOnly: true })
        const currentUrl = browser.webContents.getURL()
        if (!/^https:\/\/(www\.)?roblox\.com\//i.test(currentUrl)) await browser.loadURL('https://www.roblox.com/my/account#!/privacy')
      }

      const script = `(() => {
        const endpoint = ${JSON.stringify(url)};
        const payload = ${JSON.stringify(payload)};
        return (async () => {
          const init = {
            method: 'POST',
            credentials: 'include',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          };
          let response = await fetch(endpoint, init);
          if (response.status === 403) {
            const csrf = response.headers.get('x-csrf-token');
            if (csrf) {
              init.headers['X-CSRF-TOKEN'] = csrf;
              response = await fetch(endpoint, init);
            }
          }
          return { status: response.status, body: await response.text() };
        })();
      })()`
      const result = await browser.webContents.executeJavaScript(script, true) as Partial<AccountBrowserRequestResult> | null
      const status = typeof result?.status === 'number' ? result.status : 0
      const body = typeof result?.body === 'string' ? result.body : ''
      if (status < 200 || status >= 300) throw new Error(`Roblox request failed (${status}).${body ? ` ${body.slice(0, 180)}` : ''}`)
      return { status, body }
    } finally {
      if (temporary && browser && !browser.isDestroyed()) {
        this.browserWindows.delete(browser)
        browser.close()
      }
    }
  }

  private async setDefaultPresenceVisibility(account: Account): Promise<void> {
    const endpoint = 'https://apis.roblox.com/user-settings-api/v1/user-settings'
    // Roblox's user-settings service validates a browser context in addition
    // to the .ROBLOSECURITY cookie. Run these writes inside the isolated
    // account browser session so Roblox supplies its own tracker cookies and
    // browser context instead of rejecting a main-process request.
    await this.requestFromAccountBrowser(account, endpoint, { whoCanJoinMeInExperiences: 'All' })
    await this.requestFromAccountBrowser(account, endpoint, { whoCanSeeMyOnlineStatus: 'AllUsers' })
  }

  private async setFollowPrivacy(account: Account, privacy: string): Promise<void> {
    try {
      await this.requestFromAccountBrowser(account, 'https://apis.roblox.com/user-settings-api/v1/user-settings', { whoCanJoinMeInExperiences: privacy })
      return
    } catch (modernError) {
      // Keep a compatibility path for accounts/regions where Roblox still
      // serves the legacy form endpoint. The modern endpoint is attempted
      // first so normal web behavior remains the source of truth.
      try {
        const response = await this.requestWithCsrf('https://www.roblox.com/account/settings/follow-me-privacy', {
          method: 'POST',
          body: new URLSearchParams({ FollowMePrivacy: privacy }),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Origin: 'https://www.roblox.com', Referer: 'https://www.roblox.com/my/account' },
        }, this.requireCookie(account))
        if (!response.ok) throw new Error(`Roblox request failed (${response.status}).`)
      } catch {
        throw modernError
      }
    }
  }

  private async storeAuthenticatedCookie(cookie: string, user: RobloxUser, input: { username?: string; gameId?: string; categoryId?: string }): Promise<Account> {
    const avatarUrl = await this.getAvatarUrl(user.id)
    const alias = user.displayName && user.displayName !== user.name ? user.displayName : ''
    const checkedAt = new Date().toISOString()
    const existing = this.store.getAccounts().find((candidate) => candidate.username.toLowerCase() === user.name.toLowerCase())
    if (existing) {
      await this.secrets.set(existing.id, cookie)
      let presenceVisibilityConfigured = existing.presenceVisibilityConfigured
      if (!presenceVisibilityConfigured) {
        try {
          await this.setDefaultPresenceVisibility(existing)
          presenceVisibilityConfigured = true
        } catch (error) {
          console.warn('Roblox visibility defaults could not be applied for this existing account.', error)
        }
      }
      const presence = await this.getPresence(String(user.id))
      const identity = { username: user.name, userId: String(user.id), displayName: user.displayName, avatarUrl, hasCredentials: true, lastVerified: checkedAt, presenceCheckedAt: checkedAt, presence, presenceVisibilityConfigured }
      return this.store.setAccountVerification(existing.id, { ...identity, alias: existing.alias || alias })
    }
    const assignment = input.gameId && input.categoryId ? { gameId: input.gameId, categoryId: input.categoryId } : this.store.getDefaultAssignment()
    const account = await this.store.create({ username: input.username?.trim() || user.name, alias, description: 'Imported Roblox session', gameId: assignment.gameId, categoryId: assignment.categoryId })
    await this.secrets.set(account.id, cookie)
    let presenceVisibilityConfigured = false
    try {
      await this.setDefaultPresenceVisibility(account)
      presenceVisibilityConfigured = true
    } catch (error) {
      // Account creation should still succeed when Roblox, an age gate, or a
      // parent-controlled account prevents this preference from being changed.
      console.warn('Roblox visibility defaults could not be applied for the new account.', error)
    }
    const presence = await this.getPresence(String(user.id))
    const identity = { username: user.name, userId: String(user.id), displayName: user.displayName, avatarUrl, hasCredentials: true, lastVerified: checkedAt, presenceCheckedAt: checkedAt, presence, presenceVisibilityConfigured }
    return this.store.setAccountVerification(account.id, identity)
  }

  private async findRegisteredRobloxPlayer(): Promise<string | null> {
    if (process.platform !== 'win32') return null
    for (const key of [
      'HKCU\\Software\\Classes\\roblox-player\\shell\\open\\command',
      'HKCU\\Software\\Classes\\roblox\\shell\\open\\command',
    ]) {
      try {
        const { stdout } = await execFileAsync('reg.exe', ['query', key, '/ve'], { windowsHide: true, timeout: 5000 })
        const match = stdout.match(/REG_SZ\s+"([^"]+RobloxPlayerBeta\.exe)"/i)
        if (match?.[1] && await this.isOfficialRobloxPlayer(match[1])) return match[1]
      } catch {
        // Fall back to the installed Versions folders below.
      }
    }
    return null
  }

  private async findInstalledRobloxPlayer(): Promise<string | null> {
    if (process.platform !== 'win32') return null
    const localAppData = process.env.LOCALAPPDATA
    if (!localAppData) return null
    const registered = await this.findRegisteredRobloxPlayer()
    if (registered) return registered
    const versionsPath = join(localAppData, 'Roblox', 'Versions')
    let folders: string[]
    try {
      folders = (await readdir(versionsPath, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith('version-')).map((entry) => entry.name)
    } catch {
      return null
    }
    const candidates = await Promise.all(folders.map(async (folder) => {
      const folderPath = join(versionsPath, folder)
      const executable = join(folderPath, 'RobloxPlayerBeta.exe')
      try {
        const [folderInfo, executableInfo] = await Promise.all([stat(folderPath), stat(executable)])
        if (!(await this.isOfficialRobloxPlayer(executable))) return null
        return { executable, lastWriteMs: Math.max(folderInfo.mtimeMs, executableInfo.mtimeMs) }
      } catch {
        return null
      }
    }))
    return candidates.filter((candidate): candidate is { executable: string; lastWriteMs: number } => candidate !== null).sort((left, right) => right.lastWriteMs - left.lastWriteMs)[0]?.executable ?? null
  }

  private async isOfficialRobloxPlayer(executable: string): Promise<boolean> {
    if (process.platform !== 'win32') return false
    const localAppData = process.env.LOCALAPPDATA
    if (!localAppData) return false
    const versionsPath = resolve(join(localAppData, 'Roblox', 'Versions'))
    const target = resolve(executable)
    const relativeTarget = relative(versionsPath, target)
    const [versionFolder, fileName] = relativeTarget.split(/[\\/]/)
    if (!versionFolder || !/^version-[^\\/]+$/i.test(versionFolder) || fileName?.toLowerCase() !== 'robloxplayerbeta.exe' || isAbsolute(relativeTarget) || relativeTarget.startsWith('..')) return false
    try {
      const [playerInfo, libraryInfo] = await Promise.all([stat(target), stat(join(dirname(target), 'RobloxPlayerBeta.dll'))])
      if (!playerInfo.isFile() || playerInfo.size <= 0 || !libraryInfo.isFile() || libraryInfo.size <= 0) return false
      const escapedPath = target.replace(/'/g, "''")
      const signatureScript = `$signature = Get-AuthenticodeSignature -LiteralPath '${escapedPath}'; if ($signature.Status -eq 'Valid' -and $signature.SignerCertificate.Subject -match 'Roblox Corporation') { 'VALDOR_ROBLOX_SIGNATURE_VALID' }`
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', signatureScript], { windowsHide: true, timeout: 10000 })
      return stdout.includes('VALDOR_ROBLOX_SIGNATURE_VALID')
    } catch {
      return false
    }
  }

  private async isRobloxInstallerRunning(): Promise<boolean> {
    if (process.platform !== 'win32') return false
    try {
      const { stdout } = await execFileAsync('tasklist.exe', ['/FI', 'IMAGENAME eq RobloxPlayerInstaller.exe', '/NH'], { windowsHide: true, timeout: 5000 })
      return /RobloxPlayerInstaller\.exe/i.test(stdout)
    } catch {
      return false
    }
  }

  private async isRobloxPlayerRunning(): Promise<boolean> {
    if (process.platform !== 'win32') return false
    try {
      return await this.getRobloxPlayerProcessCount() > 0
    } catch {
      return false
    }
  }

  private async getRobloxPlayerProcessCount(): Promise<number> {
    if (process.platform !== 'win32') return 0
    // Roblox keeps a harmless --launch-to-tray process alive after the last
    // client closes. It is not an active game session and must not block the
    // multi-session guard or make the manager report a running account.
    const script = "Get-CimInstance Win32_Process -Filter \"Name='RobloxPlayerBeta.exe'\" | Where-Object { $_.CommandLine -match '(?i)(^|\\s)-t(\\s|$)' -and $_.CommandLine -match '(?i)(^|\\s)-j(\\s|$)' } | Measure-Object | Select-Object -ExpandProperty Count"
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 5000 })
    const count = Number.parseInt(stdout.trim(), 10)
    return Number.isFinite(count) ? count : 0
  }

  private async reapClosedRobloxClients(): Promise<void> {
    if (process.platform !== 'win32' || this.cleanupInFlight || this.launchedRobloxProcesses.size === 0) return
    this.cleanupInFlight = true
    try {
      const processScript = "Get-CimInstance Win32_Process -Filter \"Name='RobloxPlayerBeta.exe'\" | ForEach-Object { $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($p) { [pscustomobject]@{ Id = [int]$_.ProcessId; MainWindowHandle = [int64]$p.MainWindowHandle } } } | ConvertTo-Json -Compress"
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', processScript], { windowsHide: true, maxBuffer: 1024 * 1024, timeout: 5000 })
      const raw = stdout.trim()
      const parsed: unknown = raw ? JSON.parse(raw) : []
      const processes = Array.isArray(parsed) ? parsed : [parsed]
      const runningIds = new Set<number>()
      processes.forEach((value) => {
        if (typeof value !== 'object' || value === null) return
        const processInfo = value as { Id?: number; MainWindowHandle?: number }
        if (typeof processInfo.Id === 'number') runningIds.add(processInfo.Id)
      })
      for (const [processId, tracked] of this.launchedRobloxProcesses) {
        if (!runningIds.has(processId)) {
          this.launchedRobloxProcesses.delete(processId)
          if (tracked.launchSettings) await this.removeLaunchGlobalSettings(tracked.launchSettings)
          continue
        }
        const processInfo = processes.find((value) => typeof value === 'object' && value !== null && (value as { Id?: number }).Id === processId) as { Id?: number; MainWindowHandle?: number } | undefined
        if (!processInfo || Number(processInfo.MainWindowHandle ?? 0) !== 0) continue
        // Roblox can hide its window briefly while handing off from the
        // launcher to the game. Only reap a managed process that has stayed
        // windowless beyond that handoff grace period.
        if (Date.now() - tracked.startedAt < 60_000) continue
        await execFileAsync('taskkill.exe', ['/PID', String(processId), '/T', '/F'], { windowsHide: true, timeout: 15000 })
        this.launchedRobloxProcesses.delete(processId)
        if (tracked.launchSettings) await this.removeLaunchGlobalSettings(tracked.launchSettings)
      }
    } catch (error) {
      // Cleanup is best effort. A permissions error or a transient WMI read
      // must never interrupt presence refreshes or the next launch.
      console.warn('Roblox process cleanup check failed.', error)
    } finally {
      this.cleanupInFlight = false
    }
  }

  async killAllRoblox(): Promise<RobloxProcessActionResult> {
    if (process.platform !== 'win32') return { closed: 0, message: 'Closing Roblox Player clients is only available on Windows.' }
    try {
      const running = await this.getRobloxPlayerProcessCount()
      if (running === 0) return { closed: 0, message: 'No Roblox Player clients are running.' }
      await execFileAsync('taskkill.exe', ['/IM', 'RobloxPlayerBeta.exe', '/T', '/F'], { windowsHide: true, timeout: 15000 })
      this.launchedRobloxProcesses.clear()
      for (const settings of this.launchSettings) void this.removeLaunchGlobalSettings(settings)
      return { closed: running, message: `Closed ${running} Roblox Player client${running === 1 ? '' : 's'}.` }
    } catch (error) {
      throw new Error(error instanceof Error ? `Roblox Player clients could not be closed: ${error.message}` : 'Roblox Player clients could not be closed.')
    }
  }

  private async waitForRobloxInstallerToFinish(timeoutMs = 60000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    let clearChecks = 0
    while (Date.now() < deadline) {
      if (await this.isRobloxInstallerRunning()) {
        clearChecks = 0
        await new Promise<void>((resolve) => setTimeout(resolve, 750))
        continue
      }
      clearChecks += 1
      if (clearChecks >= 2) return
      await new Promise<void>((resolve) => setTimeout(resolve, 350))
    }
    throw new Error('Roblox is still updating. Wait for the Roblox installer to finish, then try launching again.')
  }

  private async syncClientSettings(executable: string, settings: ClientSettings, tolerateLockedGlobal = false): Promise<string> {
    const settingsFolder = join(dirname(executable), 'ClientSettings')
    const settingsPath = join(settingsFolder, 'ClientAppSettings.json')
    await mkdir(settingsFolder, { recursive: true })
    const syncGlobal = async () => {
      try {
        await this.syncGlobalFpsSettings(settings)
      } catch (error) {
        if (tolerateLockedGlobal && isFileLockedError(error)) return
        if (isFileLockedError(error)) throw new Error('Roblox is using its global settings file. Close all Roblox Player clients, then apply the FPS setting again.')
        throw error
      }
    }
    if (settings.customSettingsEnabled) {
      if (!settings.customSettingsPath) throw new Error('Choose a custom ClientAppSettings.json file before enabling custom settings.')
      const parsed: unknown = JSON.parse(await readFile(settings.customSettingsPath, 'utf8'))
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('The custom ClientAppSettings file must contain a JSON object.')
      const customSettings = { ...(parsed as Record<string, unknown>) }
      // Roblox's current Windows client rejects this Fast Flag. FPS is
      // controlled through GlobalBasicSettings_13.xml instead.
      delete customSettings.DFIntTaskSchedulerTargetFps
      await writeFile(settingsPath, `${JSON.stringify(customSettings)}\n`, 'utf8')
      await syncGlobal()
      return settingsPath
    }
    let current: Record<string, unknown> = {}
    try {
      const parsed: unknown = JSON.parse(await readFile(settingsPath, 'utf8'))
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) current = parsed as Record<string, unknown>
    } catch {
      current = {}
    }
    // Remove stale manager-generated values as well as the unsupported flag
    // from older installs. The XML setting below is the supported FPS path.
    delete current.DFIntTaskSchedulerTargetFps
    await writeFile(settingsPath, `${JSON.stringify(current)}\n`, 'utf8')
    await syncGlobal()
    return settingsPath
  }

  private getGlobalSettingsPath(): string | null {
    const localAppData = process.env.LOCALAPPDATA
    return localAppData ? join(localAppData, 'Roblox', 'GlobalBasicSettings_13.xml') : null
  }

  private getGlobalSettingsBackupPath(): string {
    return join(dirname(this.store.getSnapshot().info.dataPath), 'valdor-global-settings-backup.xml')
  }

  private getLegacyGlobalSettingsBackupPath(): string {
    return join(dirname(this.store.getSnapshot().info.dataPath), 'virgue-global-settings-backup.xml')
  }

  private async readOptionalFile(path: string): Promise<string | null> {
    try {
      return await readFile(path, 'utf8')
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return null
      throw error
    }
  }

  private async syncGlobalFpsSettings(settings: ClientSettings): Promise<void> {
    const settingsPath = this.getGlobalSettingsPath()
    if (!settingsPath) return
    const backupPath = this.getGlobalSettingsBackupPath()
    const legacyBackupPath = this.getLegacyGlobalSettingsBackupPath()
    const current = await this.readOptionalFile(settingsPath)

    if (!settings.unlockFps) {
      const backup = (await this.readOptionalFile(backupPath)) ?? (await this.readOptionalFile(legacyBackupPath))
      if (backup !== null) {
        await writeFile(settingsPath, backup, 'utf8')
        await unlink(backupPath).catch(() => undefined)
        await unlink(legacyBackupPath).catch(() => undefined)
      }
      return
    }

    if (current !== null) {
      const backup = (await this.readOptionalFile(backupPath)) ?? (await this.readOptionalFile(legacyBackupPath))
      if (backup === null) await writeFile(backupPath, current, 'utf8')
      await writeFile(settingsPath, setXmlFramerateCap(current, settings.maxFps), 'utf8')
      return
    }

    await writeFile(settingsPath, createGlobalSettingsTemplate(settings.maxFps), 'utf8')
  }

  private async createLaunchGlobalSettings(framerateCap: number): Promise<{ path: string; directory: string }> {
    const directory = join(dirname(this.store.getSnapshot().info.dataPath), 'launch-settings', randomUUID())
    await mkdir(directory, { recursive: true })
    const path = join(directory, 'GlobalBasicSettings_13.xml')
    const sharedPath = this.getGlobalSettingsPath()
    let sharedSettings: string | null = null
    if (sharedPath) {
      try {
        sharedSettings = await readFile(sharedPath, 'utf8')
      } catch {
        // Roblox can keep the shared settings file open while a client is
        // running. The isolated file can safely start from a minimal default.
      }
    }
    const base = sharedSettings && /<roblox\b/i.test(sharedSettings) ? sharedSettings : createGlobalSettingsTemplate(framerateCap)
    await writeFile(path, setXmlFramerateCap(base, framerateCap), 'utf8')
    return { path, directory }
  }

  private watchLaunchGlobalSettings(settings: LaunchGlobalSettings, child: ChildProcess): void {
    this.launchSettings.add(settings)
    let cleaned = false
    let timeout: NodeJS.Timeout | null = null
    const cleanup = (): void => {
      if (cleaned) return
      cleaned = true
      if (timeout) clearTimeout(timeout)
      void this.removeLaunchGlobalSettings(settings)
    }
    child.once('exit', cleanup)
    child.once('error', cleanup)
    timeout = setTimeout(cleanup, 30 * 60 * 1000)
    timeout.unref()
  }

  private async removeLaunchGlobalSettings(settings: LaunchGlobalSettings): Promise<void> {
    await unlink(settings.path).catch(() => undefined)
    await rmdir(settings.directory).catch(() => undefined)
    this.launchSettings.delete(settings)
  }

  private async waitForRobloxPlayerStart(previousCount: number, timeoutMs = 8000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        if (await this.getRobloxPlayerProcessCount() > previousCount) return true
      } catch {
        return false
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 250))
    }
    return false
  }

  private async waitForRobloxPlayerWindow(processId: number | null, timeoutMs = 12000): Promise<boolean> {
    if (!processId) return false
    const deadline = Date.now() + timeoutMs
    const windowScript = `$process = Get-Process -Id ${processId} -ErrorAction SilentlyContinue; if ($process -and $process.MainWindowHandle -ne 0) { 'VALDOR_ROBLOX_WINDOW_READY' }`
    while (Date.now() < deadline) {
      try {
        const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowScript], {
          windowsHide: true,
          timeout: 3000,
        })
        if (stdout.includes('VALDOR_ROBLOX_WINDOW_READY')) {
          // Give the renderer a short settling period after its top-level
          // window exists so the driver has consumed the launch profile.
          await new Promise<void>((resolve) => setTimeout(resolve, 750))
          return true
        }
      } catch {
        // Keep waiting while Roblox performs its launch/update handoff.
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 350))
    }
    return false
  }

  private getNvidiaFpsHelperPath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'native', 'nvidia-fps-helper.exe')
      : join(process.cwd(), 'native', 'bin', 'nvidia-fps-helper.exe')
  }

  private async queryNvidiaFpsState(executable: string): Promise<NvidiaFpsState | null> {
    try {
      const { stdout } = await execFileAsync(this.getNvidiaFpsHelperPath(), ['query', executable], {
        windowsHide: true,
        timeout: 5000,
      })
      const present = /^present=1$/m.test(stdout)
      const valueMatch = stdout.match(/^value=(\d+)$/m)
      return { present, value: valueMatch ? Number(valueMatch[1]) : 0 }
    } catch (error) {
      // This helper intentionally supports NVIDIA only. XML remains the
      // fallback on other GPUs or if the driver API is unavailable.
      console.warn('NVIDIA launch-time FPS limiter is unavailable; using Roblox settings fallback.', error)
      return null
    }
  }

  private async setNvidiaFps(executable: string, fps: number): Promise<void> {
    await execFileAsync(this.getNvidiaFpsHelperPath(), ['set', executable, String(fps)], {
      windowsHide: true,
      timeout: 5000,
    })
  }

  private async restoreNvidiaFps(executable: string, state: NvidiaFpsState): Promise<void> {
    const args = state.present ? ['set', executable, String(state.value)] : ['delete', executable]
    await execFileAsync(this.getNvidiaFpsHelperPath(), args, { windowsHide: true, timeout: 5000 })
  }

  private getProcessMemoryHelperPath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'native', 'process-memory-helper.exe')
      : join(process.cwd(), 'native', 'bin', 'process-memory-helper.exe')
  }

  private async applyMemorySaver(processId: number | null): Promise<void> {
    if (!processId) throw new Error('Roblox did not expose a process ID for Memory Saver.')
    await execFileAsync(this.getProcessMemoryHelperPath(), ['apply', String(processId)], {
      windowsHide: true,
      timeout: 5000,
    })
  }

  private async launchInstalledRoblox(ticket: string, launcherUrl: string, fpsOverride: number | null, memorySaver: boolean, launchInput: Omit<SessionLaunchInput, 'processId' | 'processPath'>): Promise<LaunchProcessResult> {
    const run = this.windowsLaunchQueue.then(async () => {
      await this.waitForRobloxInstallerToFinish()
      if (this.store.getSnapshot().settings.multiInstance) await this.updateMultiInstance(true)
      const executable = await this.findInstalledRobloxPlayer()
      if (!executable) throw new Error('Roblox Player is not installed. Open Roblox.com once and install Roblox Player before launching an account.')
      await this.syncClientSettings(executable, this.store.getClient(), true)
      const previousPlayerCount = await this.getRobloxPlayerProcessCount().catch(() => 0)
      let launchSettings: LaunchGlobalSettings | null = null
      let launchSettingsWatched = false
      let nvidiaFpsState: NvidiaFpsState | null = null
      let nvidiaFpsApplied = false
      let launchedProcessId: number | null = null
      const launchStartedAt = launchInput.startedAt ?? new Date().toISOString()
      let guardianSessionId: string | null = null
      let guardianProcessAttached = false
      try {
        if (this.sessionGuardian) {
          try {
            const tracked = await this.sessionGuardian.registerLaunch({ ...launchInput, processId: null, processPath: executable, startedAt: launchStartedAt })
            guardianSessionId = tracked.id
          } catch (error) {
            // Session tracking must never turn a valid Roblox launch into a
            // failed launch. The process cleanup path remains available.
            console.warn('Session Guardian could not register the Roblox launch request.', error)
          }
        }
        if (fpsOverride !== null) {
          // Roblox supports an isolated settings path for a client process.
          // Keep this file alive for the lifetime of the launched process so
          // the client cannot fall back to the shared 240 FPS setting after
          // the manager's short launch handshake finishes.
          launchSettings = await this.createLaunchGlobalSettings(fpsOverride)
          nvidiaFpsState = await this.queryNvidiaFpsState(executable)
          if (nvidiaFpsState) {
            try {
              await this.setNvidiaFps(executable, fpsOverride)
              nvidiaFpsApplied = true
            } catch (error) {
              console.warn('NVIDIA launch-time FPS limiter could not be applied; using Roblox settings fallback.', error)
            }
          }
        }
        const launchArgs = launchSettings
          ? ['-g', launchSettings.path, '--app', '-t', ticket, '-j', launcherUrl]
          : ['--app', '-t', ticket, '-j', launcherUrl]
        if (this.protectedSession?.shouldRouteLaunch(launchInput.accountId)) {
          launchedProcessId = await this.protectedSession.launch(executable, launchArgs, launchInput.accountId, launchInput.launchRequestId)
          if (launchSettings) {
            this.launchSettings.add(launchSettings)
            launchSettingsWatched = true
          }
        } else {
          launchedProcessId = await new Promise<number | null>((resolve, reject) => {
            const child = spawn(executable, launchArgs, { detached: true, windowsHide: true, stdio: 'ignore' })
            child.once('error', reject)
            child.once('spawn', () => {
              if (launchSettings) {
                this.watchLaunchGlobalSettings(launchSettings, child)
                launchSettingsWatched = true
              }
              child.unref()
              resolve(child.pid ?? null)
            })
          }).catch(() => { throw new Error('Roblox Player could not be started. Close any Roblox installer or update window and try again.') })
        }
        if (launchedProcessId) this.launchedRobloxProcesses.set(launchedProcessId, { startedAt: Date.now(), launchSettings })
        if (this.sessionGuardian && guardianSessionId) {
          try {
            await this.sessionGuardian.attachProcess(guardianSessionId, launchedProcessId, executable)
            guardianProcessAttached = true
          } catch (error) {
            console.warn('Session Guardian could not attach to the Roblox process.', error)
          }
        }
        if ((nvidiaFpsApplied && nvidiaFpsState) || memorySaver) {
          // NVIDIA snapshots profile settings when the client initializes.
          // A background Roblox tray process can make process-count polling
          // report a false start. Wait for this exact launched process to own
          // its game window before restoring the user's driver profile.
          await this.waitForRobloxPlayerWindow(launchedProcessId)
          if (memorySaver) {
            try {
              await this.applyMemorySaver(launchedProcessId)
            } catch (error) {
              console.warn('Per-account Memory Saver could not be applied to the Roblox process.', error)
            }
          }
        }
        if (nvidiaFpsApplied && nvidiaFpsState) {
          await this.restoreNvidiaFps(executable, nvidiaFpsState)
          nvidiaFpsApplied = false
        }
        // An older player can start the installer asynchronously. Hold the queue
        // until that update has settled so another account cannot start a second
        // RobloxPlayerInstaller process and trigger Roblox's collision dialog.
        await new Promise<void>((resolve) => setTimeout(resolve, 1200))
        await this.waitForRobloxInstallerToFinish()
        if (fpsOverride !== null) {
          await this.waitForRobloxPlayerStart(previousPlayerCount)
        }
        return { executable, processId: launchedProcessId }
      } catch (error) {
        if (this.sessionGuardian && guardianSessionId && !guardianProcessAttached) {
          await this.sessionGuardian.failLaunch(guardianSessionId, error instanceof Error ? error.message : 'Roblox Player could not be started.').catch((guardianError) => {
            console.warn('Session Guardian could not close the failed launch record.', guardianError)
          })
        }
        throw error
      } finally {
        if (nvidiaFpsApplied && nvidiaFpsState) {
          await this.restoreNvidiaFps(executable, nvidiaFpsState).catch((error) => {
            console.warn('NVIDIA FPS profile could not be restored after launch.', error)
          })
        }
        // The per-account XML is cleaned up by the Roblox child-process
        // watcher. Do not remove it here: Roblox may read it after the
        // installer/launch handshake has completed.
        if (launchSettings && !launchSettingsWatched) await this.removeLaunchGlobalSettings(launchSettings)
      }
    })
    this.windowsLaunchQueue = run.then(() => undefined, () => undefined)
    return run
  }

  async bulkImport(input: BulkImportInput): Promise<{ imported: Account[]; failed: string[] }> {
    const imported: Account[] = []
    const failed: string[] = []
    for (const rawLine of input.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
      try {
        let username: string | undefined
        let password = ''
        let cookie = rawLine
        if (input.format === 'username-cookie') {
          const parts = rawLine.split(/\s*[|,]\s*/)
          username = parts[0]
          cookie = parts[1] ?? ''
        } else if (input.format === 'username-password') {
          const separator = rawLine.indexOf(':')
          if (separator <= 0) throw new Error('Expected username:password format.')
          username = rawLine.slice(0, separator)
          password = rawLine.slice(separator + 1)
          cookie = await this.loginWithPassword(username, password)
        }
        const account = await this.importCookie({ username, cookie, gameId: input.gameId, categoryId: input.categoryId })
        imported.push(account)
      } catch (error) {
        failed.push(`${rawLine.slice(0, 42)} — ${error instanceof Error ? error.message : 'Import failed'}`)
      }
    }
    return { imported, failed }
  }

  async verify(id: string): Promise<Account> {
    const account = this.store.getAccount(id)
    const cookie = this.requireCookie(account)
    const user = await this.getAuthenticated(cookie)
    const avatarUrl = await this.getAvatarUrl(user.id)
    let presenceVisibilityConfigured = account.presenceVisibilityConfigured
    if (!presenceVisibilityConfigured) {
      try {
        await this.setDefaultPresenceVisibility(account)
        presenceVisibilityConfigured = true
      } catch (error) {
        console.warn('Roblox visibility defaults could not be applied while refreshing this account.', error)
      }
    }
    const presence = await this.getPresence(String(user.id))
    const alias = user.displayName && user.displayName !== user.name ? user.displayName : ''
    const checkedAt = new Date().toISOString()
    return this.store.setAccountVerification(id, { username: user.name, alias: account.alias || alias, userId: String(user.id), displayName: user.displayName, avatarUrl, hasCredentials: true, lastVerified: checkedAt, presenceCheckedAt: checkedAt, presence, presenceVisibilityConfigured })
  }

  async launch(accountId: string, placeId: string, jobId: string, vipLink?: string, followUserId?: string, recoveryJobId?: string): Promise<LaunchResult> {
    const account = this.store.getAccount(accountId)
    const assignedGame = this.store.getGame(account.gameId)
    const placeInput = placeId.trim()
    const jobInput = jobId.trim()
    const embeddedVipLink = /^VIP:/i.test(jobInput) ? jobInput.slice(4).trim() : /privateServerLinkCode=|roblox\.com\/share\//i.test(placeInput) ? placeInput : ''
    const rawVipLink = vipLink?.trim() || embeddedVipLink
    const isVipLink = Boolean(rawVipLink)
    const normalizedPlace = this.normalizePlaceId(placeInput || account.placeId || assignedGame.placeId)
    if (!normalizedPlace && !followUserId && !isVipLink) throw new Error('Add a Place ID before opening Roblox.')
    let selectedJobId = /^VIP:/i.test(jobInput) ? '' : jobInput
    let url = followUserId ? `https://www.roblox.com/users/${encodeURIComponent(followUserId)}/profile` : isVipLink ? rawVipLink : `https://www.roblox.com/games/${normalizedPlace}`
    if (selectedJobId && !isVipLink && !followUserId) url += `?gameInstanceId=${encodeURIComponent(selectedJobId)}`
    let openedUrl = url
    let launchedDirectly = false
    const launchRequestId = randomUUID()
    if (!isVipLink) {
      const ticket = await this.getLaunchAuthTicket(account)
      const trackerId = this.browserTrackerIds.get(account.id) ?? `${Math.floor(100000 + Math.random() * 800000)}${Math.floor(100000 + Math.random() * 800000)}`
      this.browserTrackerIds.set(account.id, trackerId)
      const launcherUrl = followUserId
        ? `https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestFollowUser&userId=${encodeURIComponent(followUserId)}`
        : `https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestGame${selectedJobId ? 'Job' : ''}&browserTrackerId=${trackerId}&placeId=${encodeURIComponent(normalizedPlace)}${selectedJobId ? `&gameId=${encodeURIComponent(selectedJobId)}` : ''}&isPlayTogetherGame=false`
      if (process.platform === 'win32') {
        await this.launchInstalledRoblox(ticket, launcherUrl, account.fpsOverride, account.memorySaver, { accountId, launchRequestId, placeId: normalizedPlace, jobId: selectedJobId, recoveryJobId })
        launchedDirectly = true
      } else {
        openedUrl = `roblox-player:1+launchmode:play+gameinfo:${ticket}+launchtime:${Date.now()}+placelauncherurl:${encodeURIComponent(launcherUrl)}+browsertrackerid:${trackerId}+robloxLocale:en_us+gameLocale:en_us+channel:+LaunchExp:InApp`
      }
    }
    if (!launchedDirectly) await this.electronShell.openExternal(openedUrl)
    if (!launchedDirectly && this.sessionGuardian) {
      try {
        await this.sessionGuardian.registerLaunch({ accountId, launchRequestId, processId: null, processPath: '', placeId: normalizedPlace, jobId: selectedJobId, recoveryJobId })
      } catch (error) {
        console.warn('Session Guardian could not register the Roblox launch request.', error)
      }
    }
    const updated = await this.store.markLaunched(accountId, normalizedPlace || account.placeId, selectedJobId)
    return { account: updated, openedUrl }
  }

  async launchMany(input: { targets: Array<{ accountId: string; placeId?: string; jobId?: string }> }): Promise<LaunchResult[]> {
    const entitlements = this.store.getSnapshot().entitlements
    if (!entitlements.bulkLaunch) throw new Error(getPlanFeatureError(entitlements, 'bulk-launch'))
    const targets = input.targets.filter((target) => target.accountId)
    const launchOne = (target: { accountId: string; placeId?: string; jobId?: string }) => this.launch(target.accountId, target.placeId ?? '', target.jobId ?? '')
    if (this.store.getSnapshot().settings.asyncJoin) return Promise.all(targets.map(launchOne))
    const results: LaunchResult[] = []
    for (const [index, target] of targets.entries()) {
      if (index > 0) {
        const delay = this.store.getSnapshot().settings.launchDelay * 1000
        if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay))
      }
      results.push(await launchOne(target))
    }
    return results
  }

  async joinServer(input: JoinServerInput): Promise<LaunchResult> {
    const serverId = input.jobId?.trim() ?? ''
    try {
      const result = await this.launch(input.accountId, input.placeId, serverId, input.vipLink, input.followUserId)
      await this.store.recordServerJoin({ gameId: input.gameId, accountId: input.accountId, placeId: this.normalizePlaceId(input.placeId), serverId, result: 'launched', message: 'Roblox launch request completed.' })
      return result
    } catch (error) {
      await this.store.recordServerJoin({ gameId: input.gameId, accountId: input.accountId, placeId: this.normalizePlaceId(input.placeId), serverId, result: 'failed', message: error instanceof Error ? error.message : 'Roblox launch failed.' })
      throw error
    }
  }

  async openBrowser(id: string, options: { url?: string; javascript?: string } = {}): Promise<AccountBrowserResult> {
    const account = this.store.getAccount(id)
    const cookie = this.requireCookie(account)
    const targetUrl = options.url?.trim() || 'https://www.roblox.com/home'
    if (!/^https:\/\/(www\.)?roblox\.com\//i.test(targetUrl)) throw new Error('Account browser URLs must stay on Roblox.')
    const existing = this.accountBrowsers.get(id)
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
      if (options.url?.trim() || options.javascript?.trim()) {
        await existing.loadURL(targetUrl)
        if (options.javascript?.trim()) await existing.webContents.executeJavaScript(options.javascript.slice(0, 200000), true)
        return { opened: true, message: options.javascript?.trim() ? 'The isolated Roblox browser ran the requested page script.' : 'The isolated Roblox browser navigated to the requested page.' }
      }
      return { opened: true, message: 'The isolated Roblox browser for this profile is already open.' }
    }
    const partition = await this.getAccountPartition(id)
    const browser = new BrowserWindow({ width: 1180, height: 820, title: `${account.alias || account.username} — Roblox`, backgroundColor: '#e9e7df', webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: false } })
    this.browserWindows.add(browser)
    this.accountBrowsers.set(id, browser)
    browser.on('closed', () => { this.browserWindows.delete(browser); if (this.accountBrowsers.get(id) === browser) this.accountBrowsers.delete(id) })
    await browser.webContents.session.cookies.set({ url: 'https://www.roblox.com', name: '.ROBLOSECURITY', value: cookie, domain: '.roblox.com', path: '/', secure: true, httpOnly: true })
    await browser.loadURL(targetUrl)
    if (options.javascript?.trim()) await browser.webContents.executeJavaScript(options.javascript.slice(0, 200000), true)
    return { opened: true, message: options.javascript?.trim() ? 'Roblox opened with the requested page script.' : 'Roblox opened in a separate account browser.' }
  }

  async copy(id: string, kind: import('../shared/types').AccountCopyKind): Promise<{ message: string }> {
    const account = this.store.getAccount(id)
    const cookie = kind === 'password' || kind === 'userpass' ? undefined : this.secrets.get(account.id)
    let value = ''
    switch (kind) {
      case 'username': value = account.username; break
      case 'password': value = this.secrets.get(`${account.id}:password`) ?? ''; break
      case 'userpass': value = `${account.username}:${this.secrets.get(`${account.id}:password`) ?? ''}`; break
      case 'profile': value = account.userId ? `https://www.roblox.com/users/${account.userId}/profile` : `https://www.roblox.com/search/users?keyword=${encodeURIComponent(account.username)}`; break
      case 'userId': value = account.userId ?? ''; break
      case 'security-token': value = cookie ?? ''; break
      case 'group': value = this.store.getGame(account.gameId).categories.find((category) => category.id === account.categoryId)?.name ?? ''; break
      case 'details': value = JSON.stringify(account, null, 2); break
      case 'authentication-ticket': value = await this.getLaunchAuthTicket(account); break
      case 'rbx-player': {
        const ticket = await this.getLaunchAuthTicket(account)
        const trackerId = this.browserTrackerIds.get(account.id) ?? `${Math.floor(100000 + Math.random() * 800000)}${Math.floor(100000 + Math.random() * 800000)}`
        this.browserTrackerIds.set(account.id, trackerId)
        const launcherUrl = `https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestGame${account.jobId ? 'Job' : ''}&browserTrackerId=${trackerId}&placeId=${encodeURIComponent(account.placeId)}${account.jobId ? `&gameId=${encodeURIComponent(account.jobId)}` : ''}&isPlayTogetherGame=false`
        value = `<roblox-player://1/1+launchmode:play+gameinfo:${ticket}+launchtime:${Date.now()}+browsertrackerid:${trackerId}+placelauncherurl:${encodeURIComponent(launcherUrl)}+robloxLocale:en_us+gameLocale:en_us>`
        break
      }
      case 'app-link': value = `<roblox-player://1/1+launchmode:app+gameinfo:${await this.getLaunchAuthTicket(account)}+launchtime:${Date.now()}+robloxLocale:en_us+gameLocale:en_us>`; break
      default: throw new Error('Nothing is available to copy for this profile.')
    }
    if (!value) throw new Error(kind === 'userId' ? 'Verify the profile before copying its User ID.' : 'That secure value is not stored for this profile.')
    clipboard.writeText(value)
    return { message: `${kind === 'details' ? 'Profile details' : kind} copied to the clipboard.` }
  }

  async utility(input: AccountUtilityInput): Promise<AccountUtilityResult> {
    const account = this.store.getAccount(input.accountId)
    const cookie = this.requireCookie(account)
    const userId = account.userId
    switch (input.action) {
      case 'refresh':
        await this.verify(account.id)
        return { ok: true, message: 'Account details refreshed.' }
      case 'get-robux': {
        let data: Record<string, unknown>
        try {
          data = await this.requestJson<Record<string, unknown>>('https://economy.roblox.com/v1/user/currency', { headers: { Origin: 'https://www.roblox.com', Referer: 'https://www.roblox.com/' } }, cookie)
        } catch (firstError) {
          // Keep a compatibility fallback for older Roblox account sessions.
          try {
            data = await this.requestJson<Record<string, unknown>>('https://www.roblox.com/mobileapi/userinfo', { headers: { Origin: 'https://www.roblox.com', Referer: 'https://www.roblox.com/' } }, cookie)
          } catch {
            throw firstError
          }
        }
        const balance = optionalNumber(data.robux ?? data.RobuxBalance ?? data.robuxBalance)
        if (balance === null) throw new Error('Roblox did not return a Robux balance for this account.')
        await this.store.setAccountVerification(account.id, { robuxBalance: balance })
        return { ok: true, message: `Robux balance: ${balance.toLocaleString()}`, value: balance }
      }
      case 'get-email': {
        const data = await this.requestJson<Record<string, unknown>>('https://accountsettings.roblox.com/v1/email', { headers: { Origin: 'https://www.roblox.com', Referer: 'https://www.roblox.com/my/account#!/security' } }, cookie)
        const email = stringValue(data.emailAddress ?? data.email)
        const verified = data.verified === true || data.isVerified === true
        return { ok: true, message: email ? `Email: ${email}${verified ? ' (verified)' : ' (not verified)'}` : 'No email address is attached to this account.' }
      }
      case 'logout-sessions': {
        const { response } = await this.requestJsonWithResponse<Record<string, unknown>>('https://auth.roblox.com/v2/logoutfromallsessionsandreauthenticate', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', Origin: 'https://www.roblox.com', Referer: 'https://www.roblox.com/' } }, cookie)
        const refreshedCookie = parseCookieFromResponse(response)
        if (refreshedCookie) {
          await this.secrets.set(account.id, refreshedCookie)
        }
        await this.store.setAccountVerification(account.id, { hasCredentials: true, lastVerified: new Date().toISOString() })
        return { ok: true, message: refreshedCookie ? 'Other sessions were signed out and this account session was refreshed.' : 'Other Roblox sessions were signed out. Roblox did not return a replacement cookie, so reconnect this profile if its next action asks you to sign in again.' }
      }
      case 'set-follow-privacy': {
        const privacy = input.value?.trim() || 'Friends'
        const allowed = new Set(['All', 'Followers', 'Following', 'Friends', 'NoOne'])
        if (!allowed.has(privacy)) throw new Error('Choose a valid follow privacy value.')
        await this.setFollowPrivacy(account, privacy)
        await this.store.setAccountVerification(account.id, { presenceVisibilityConfigured: true })
        return { ok: true, message: `Follow privacy set to ${privacy}.` }
      }
      case 'change-password': {
        if (typeof input.value !== 'string' || input.value.length === 0 || typeof input.secondaryValue !== 'string' || input.secondaryValue.length === 0) throw new Error('Enter the current and new password.')
        const { response } = await this.requestJsonWithResponse<Record<string, unknown>>('https://auth.roblox.com/v2/user/passwords/change', { method: 'POST', body: new URLSearchParams({ currentPassword: input.value, newPassword: input.secondaryValue }), headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Origin: 'https://www.roblox.com', Referer: 'https://www.roblox.com/my/account#!/security' } }, cookie)
        await this.secrets.set(`${account.id}:password`, input.secondaryValue)
        const refreshedCookie = parseCookieFromResponse(response)
        if (refreshedCookie) await this.secrets.set(account.id, refreshedCookie)
        await this.store.setAccountVerification(account.id, { hasCredentials: true, lastVerified: new Date().toISOString() })
        return { ok: true, message: refreshedCookie ? 'Password changed and the secure session was refreshed.' : 'Password changed. Roblox may require this profile to reconnect before its next launch.' }
      }
      case 'change-email': {
        const password = input.value ?? ''
        const email = input.secondaryValue?.trim() ?? ''
        if (!password || !email) throw new Error('Enter the password and new email.')
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.')
        await this.requestJson('https://accountsettings.roblox.com/v1/email', { method: 'POST', body: new URLSearchParams({ password, emailAddress: email }), headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Origin: 'https://www.roblox.com', Referer: 'https://www.roblox.com/my/account#!/security' } }, cookie)
        return { ok: true, message: `Email change requested for ${email}.` }
      }
      case 'set-display-name': {
        const displayName = input.value?.trim() ?? ''
        if (!displayName) throw new Error('Enter a display name.')
        if (!userId) throw new Error('Refresh this profile before changing its display name.')
        await this.requestJson(`https://users.roblox.com/v1/users/${userId}/display-names`, { method: 'PATCH', body: JSON.stringify({ newDisplayName: displayName }), headers: { 'Content-Type': 'application/json', Origin: 'https://www.roblox.com', Referer: `https://www.roblox.com/users/${userId}/profile` } }, cookie)
        await this.store.setAccountVerification(account.id, { displayName })
        return { ok: true, message: 'Display name updated.' }
      }
      case 'send-friend-request':
        if (!input.value) throw new Error('Enter a username to add.')
        {
          const target = await this.lookupUser(input.value)
          if (target.id === Number(userId)) throw new Error('You cannot send a friend request to the same account.')
          await this.requestJson(`https://friends.roblox.com/v1/users/${target.id}/request-friendship`, { method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json', Origin: 'https://www.roblox.com', Referer: `https://www.roblox.com/users/${target.id}/profile` } }, cookie)
        }
        return { ok: true, message: 'Friend request sent.' }
      case 'toggle-block':
        if (!input.value) throw new Error('Enter a username to block or unblock.')
        {
          const target = await this.lookupUser(input.value)
          if (target.id === Number(userId)) throw new Error('You cannot block the same account.')
          const blocked = await this.requestJson<unknown>(`https://apis.roblox.com/user-blocking-api/v1/users/${target.id}/is-blocked`, { headers: { Origin: 'https://www.roblox.com', Referer: `https://www.roblox.com/users/${target.id}/profile` } }, cookie)
          const shouldUnblock = optionalBoolean(blocked)
          if (shouldUnblock === null) throw new Error('Roblox returned an invalid block status.')
          const action = shouldUnblock ? 'unblock-user' : 'block-user'
          await this.requestJson(`https://apis.roblox.com/user-blocking-api/v1/users/${target.id}/${action}`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', Origin: 'https://www.roblox.com', Referer: `https://www.roblox.com/users/${target.id}/profile` } }, cookie)
          return { ok: true, message: `${shouldUnblock ? 'Unblocked' : 'Blocked'} ${target.name}.` }
        }
      case 'unblock-everyone':
        {
          const users = await this.getBlockedUserIds(cookie)
          if (users.length === 0) return { ok: true, message: 'No blocked players were found.' }
          const failures: string[] = []
          for (const blockedUserId of users) {
            try {
              await this.requestJson(`https://apis.roblox.com/user-blocking-api/v1/users/${blockedUserId}/unblock-user`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', Origin: 'https://www.roblox.com', Referer: 'https://www.roblox.com/' } }, cookie)
            } catch {
              failures.push(blockedUserId)
            }
          }
          const cleared = users.length - failures.length
          return { ok: failures.length === 0, message: failures.length === 0 ? `Unblocked ${cleared} player${cleared === 1 ? '' : 's'}.` : `Unblocked ${cleared} player${cleared === 1 ? '' : 's'}; ${failures.length} could not be unblocked.` }
        }
      case 'join-group': {
        const groupId = (input.value ?? '').match(/\d+/)?.[0]
        if (!groupId) throw new Error('Enter a Roblox group ID or group link.')
        await this.requestJson(`https://groups.roblox.com/v1/groups/${groupId}/users`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', Origin: 'https://www.roblox.com', Referer: `https://www.roblox.com/communities/${groupId}` } }, cookie)
        return { ok: true, message: `Join request sent for group ${groupId}.` }
      }
      default:
        throw new Error('Unsupported account utility.')
    }
  }

  async quickLogin(accountId: string, code: string): Promise<AccountUtilityResult> {
    const account = this.store.getAccount(accountId)
    const cookie = this.requireCookie(account)
    if (!/^\d{6}$/.test(code)) throw new Error('Quick Login codes contain six digits.')
    const result = await this.requestJson<{ deviceInfo?: string; location?: string }>('https://apis.roblox.com/auth-token-service/v1/login/enterCode', { method: 'POST', body: JSON.stringify({ code }), headers: { 'Content-Type': 'application/json' } }, cookie)
    await this.requestJson('https://apis.roblox.com/auth-token-service/v1/login/validateCode', { method: 'POST', body: JSON.stringify({ code }), headers: { 'Content-Type': 'application/json' } }, cookie)
    return { ok: true, message: `Quick Login validated for ${result.deviceInfo || result.location || 'the requesting device'}.` }
  }

  async listServers(query: ServerQuery): Promise<ServerQueryResult> {
    const placeId = this.normalizePlaceId(query.placeId)
    if (!placeId) throw new Error('Enter a Place ID before refreshing servers.')
    if (query.finder) {
      const request = query.finder
      if (request.action === 'state') return { placeId, servers: [], nextCursor: null, previousCursor: null, source: 'offline', finderState: this.store.getServerFinderState(request.gameId, request.accountId) }
      if (request.action === 'save-preset') return { placeId, servers: [], nextCursor: null, previousCursor: null, source: 'offline', finderState: await this.store.saveServerFilterPreset(request.preset) }
      if (request.action === 'delete-preset') return { placeId, servers: [], nextCursor: null, previousCursor: null, source: 'offline', finderState: await this.store.deleteServerFilterPresetForAccount(request.gameId, request.presetId, request.accountId) }
      const state = await this.store.setServerPreference({ gameId: request.gameId, accountId: request.accountId, placeId: request.placeId, serverId: request.serverId, kind: request.action === 'toggle-favorite' ? 'favorite' : 'avoid', value: request.value })
      return { placeId, servers: this.store.getCachedServers(placeId), nextCursor: null, previousCursor: null, source: 'offline', finderState: state }
    }
    const now = new Date().toISOString()
    try {
      const data = await this.requestJson<RobloxResponse>(`https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Asc&excludeFullGames=${query.smallest ? 'true' : 'false'}&limit=${Math.min(100, Math.max(10, query.limit ?? 50))}${query.cursor ? `&cursor=${encodeURIComponent(query.cursor)}` : ''}`)
      const servers = (Array.isArray(data.data) ? data.data.map((server) => this.parseServer(server)).filter((server): server is ServerRecord => server !== null) : []).map((server) => ({ ...server, firstSeenAt: server.firstSeenAt ?? now, lastSeenAt: now, expiresAt: new Date(Date.now() + SERVER_CACHE_TTL_MS).toISOString() }))
      if (query.smallest) servers.sort((left, right) => left.playing - right.playing || left.ping - right.ping)
      const state = query.gameId ? this.store.getServerFinderState(query.gameId, query.accountId) : null
      const preferences = new Map((state?.preferences ?? []).filter((item) => item.placeId === placeId).map((item) => [item.serverId, item]))
      const history = new Set((state?.history ?? []).map((item) => item.server.id))
      servers.forEach((server) => { const preference = preferences.get(server.id); server.isFavorite = preference?.favorite ?? false; server.isAvoided = preference?.avoid ?? false })
      this.store.cacheServers(placeId, servers)
      await this.store.recordServerObservations({ gameId: query.gameId, accountId: query.accountId, placeId, servers })
      const ranked = filterAndRankServers(servers.filter((server) => !server.isAvoided), query.filters ?? defaultServerCriteria, history)
      return { placeId, servers: ranked, nextCursor: typeof data.nextPageCursor === 'string' ? data.nextPageCursor : null, previousCursor: typeof data.previousPageCursor === 'string' ? data.previousPageCursor : null, source: 'roblox', cacheAgeMs: 0, finderState: query.gameId ? this.store.getServerFinderState(query.gameId, query.accountId) : undefined }
    } catch {
      const cached = this.store.getCachedServers(placeId)
      const state = query.gameId ? this.store.getServerFinderState(query.gameId, query.accountId) : null
      const history = new Set((state?.history ?? []).map((item) => item.server.id))
      const ranked = filterAndRankServers(cached.filter((server) => !server.isAvoided), query.filters ?? defaultServerCriteria, history)
      const newest = cached.reduce((latest, server) => Math.max(latest, Date.parse(server.lastSeenAt ?? '')), 0)
      return { placeId, servers: ranked, nextCursor: null, previousCursor: null, source: 'offline', cacheAgeMs: newest > 0 ? Math.max(0, Date.now() - newest) : null, finderState: query.gameId ? state ?? undefined : undefined }
    }
  }

  async loadRegion(placeId: string, serverId: string, accountId?: string): Promise<ServerRecord> {
    const normalizedPlace = this.normalizePlaceId(placeId)
    const existing = this.store.getCachedServers(normalizedPlace).find((server) => server.id === serverId)
    if (!existing) throw new Error('Server not found in the current list.')
    if (!accountId) throw new Error('Select a connected account before loading server regions.')
    const account = this.store.getAccount(accountId)
    const cookie = this.requireCookie(account)
    const updateRegion = async (input: Partial<ServerRecord>): Promise<ServerRecord> => {
      const updated = this.store.updateCachedServer(normalizedPlace, serverId, input)
      await this.store.updateServerHistoryServer(normalizedPlace, serverId, input)
      return updated
    }
    let data: { joinScript?: Record<string, unknown> | string | null; joinScriptUrl?: string | null; jobId?: string | null; status?: number; message?: string | null }
    try {
      data = await this.requestJson<{ joinScript?: Record<string, unknown> | string | null; joinScriptUrl?: string | null; jobId?: string | null; status?: number; message?: string | null }>('https://gamejoin.roblox.com/v1/join-game-instance', { method: 'POST', body: JSON.stringify({ gameId: serverId, gameJoinAttemptId: serverId, placeId: Number(normalizedPlace), isTeleport: false, isPartyLeader: true, isPlayTogetherGame: false, browserTrackerId: 0 }), headers: { 'Content-Type': 'application/json', Origin: 'https://www.roblox.com', Referer: `https://www.roblox.com/games/${normalizedPlace}/` } }, cookie)
    } catch {
      return updateRegion({ region: 'Unknown', regionSource: 'unknown', regionUpdatedAt: new Date().toISOString(), regionLoaded: true })
    }
    const parseJoinScript = (value: unknown): Record<string, unknown> | null => {
      if (typeof value === 'object' && value !== null) return value as Record<string, unknown>
      if (typeof value !== 'string' || !value.trim()) return null
      try {
        const parsed: unknown = JSON.parse(value)
        return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null
      } catch {
        return null
      }
    }
    const getMachineAddress = (value: unknown): string => {
      const source = parseJoinScript(value)
      const normalizeAddress = (candidate: string): string => {
        const clean = candidate.trim()
        const bracketed = clean.match(/^\[([^\]]+)\](?::\d+)?$/)
        if (bracketed?.[1]) return bracketed[1]
        const withPort = clean.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
        return withPort?.[1] ?? clean
      }
      const readAddress = (candidate: unknown): string => {
        if (typeof candidate === 'string') return normalizeAddress(candidate)
        if (typeof candidate !== 'object' || candidate === null) return ''
        const nested = candidate as Record<string, unknown>
        return normalizeAddress(stringValue(nested.Address ?? nested.address ?? nested.Ip ?? nested.ip ?? nested.IP ?? nested.Host ?? nested.host ?? nested.ServerAddress ?? nested.serverAddress))
      }
      const endpoints = Array.isArray(source?.UdmuxEndpoints) ? source.UdmuxEndpoints : source?.UdmuxEndpoints ? [source.UdmuxEndpoints] : []
      const directReturn = Array.isArray(source?.DirectServerReturn) ? source.DirectServerReturn : source?.DirectServerReturn ? [source.DirectServerReturn] : []
      const candidates = [source?.MachineAddress, source?.machineAddress, source?.ServerIp, source?.serverIp, source?.Address, source?.address, ...endpoints, ...directReturn].map(readAddress).filter(Boolean)
      const isPublicIpv4 = (candidate: string): boolean => {
        const octets = candidate.split('.').map(Number)
        if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false
        const first = octets[0] ?? -1
        const second = octets[1] ?? -1
        return first > 0 && first < 224 && first !== 10 && first !== 127 && !(first === 169 && second === 254) && !(first === 172 && second >= 16 && second <= 31) && !(first === 192 && second === 168)
      }
      return candidates.find(isPublicIpv4) ?? candidates[0] ?? ''
    }
    const fetchJoinScript = async (url: string): Promise<Record<string, unknown> | null> => {
      try {
        const response = await this.rawRequest(new URL(url, 'https://gamejoin.roblox.com').toString(), { headers: { Origin: 'https://www.roblox.com', Referer: `https://www.roblox.com/games/${normalizedPlace}/` } }, cookie)
        if (!response.ok) return null
        const content = await response.text()
        return parseJoinScript(content)
      } catch {
        return null
      }
    }
    let joinScript = parseJoinScript(data.joinScript)
    if (!joinScript && data.joinScriptUrl) {
      const joinScriptResponse = await fetchJoinScript(data.joinScriptUrl)
      joinScript = parseJoinScript(joinScriptResponse?.joinScript) ?? joinScriptResponse
    }
    if (!getMachineAddress(joinScript)) {
      const trackerId = this.browserTrackerIds.get(account.id) ?? `${Math.floor(100000 + Math.random() * 800000)}${Math.floor(100000 + Math.random() * 800000)}`
      this.browserTrackerIds.set(account.id, trackerId)
      const launcherUrl = `https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestGameJob&browserTrackerId=${trackerId}&placeId=${encodeURIComponent(normalizedPlace)}&gameId=${encodeURIComponent(serverId)}&isPlayTogetherGame=false`
      const launcherScript = await fetchJoinScript(launcherUrl)
      joinScript = parseJoinScript(launcherScript?.joinScript) ?? launcherScript
    }
    const machineAddress = getMachineAddress(joinScript)
    if (!machineAddress) return updateRegion({ region: 'Unknown', regionSource: 'unknown', regionUpdatedAt: new Date().toISOString(), regionLoaded: true })
    const region = await this.lookupServerRegion(machineAddress)
    return updateRegion({ region: region || 'Unknown', regionSource: region ? 'ip-lookup' : 'unknown', regionUpdatedAt: new Date().toISOString(), regionLoaded: true })
  }

  async searchGames(query: string): Promise<GameSearchResult[]> {
    const clean = query.trim()
    if (!clean) return []
    try {
      const data = await this.requestJson<RobloxResponse>(`https://games.roblox.com/v1/games/list?model.keyword=${encodeURIComponent(clean)}&model.maxRows=30&model.startRows=0&model.sortType=1`)
      const values: unknown[] = Array.isArray(data.data) ? data.data : Array.isArray((data as Record<string, unknown>).games) ? (data as Record<string, unknown>).games as unknown[] : []
      return values.map(parseGameSearchResult).filter((game): game is GameSearchResult => game !== null)
    } catch {
      return []
    }
  }

  async refreshGameInfo(id: string): Promise<GameCollection> {
    const game = this.store.getGame(id)
    if (!game.placeId) throw new Error('Add a Place ID to this game before refreshing its Roblox information.')
    const result = await this.getUniverse(game.placeId)
    if (result.source !== 'roblox') return { ...game, categories: game.categories.map((category) => ({ ...category })) }
    const { universe } = result
    return this.store.setGameInfo(id, { universeId: universe.id, thumbnailUrl: universe.imageUrl, creatorName: universe.creatorName, creatorId: universe.creatorId, playing: universe.playing, visits: universe.visits, infoUpdatedAt: new Date().toISOString() })
  }

  async searchPlayer(username: string): Promise<PlayerSearchResult> {
    try {
      const response = await this.requestJson<{ data?: Array<{ id: number; name: string; displayName: string }> }>('https://users.roblox.com/v1/usernames/users', { method: 'POST', body: JSON.stringify({ usernames: [username.trim()], excludeBannedUsers: false }), headers: { 'Content-Type': 'application/json' } })
      const players = await Promise.all((response.data ?? []).map((user) => this.toPlayerLookup(user.id, user.name, user.displayName)))
      this.store.cachePlayers(players)
      return { players, source: 'roblox' }
    } catch {
      return { players: this.store.getCachedPlayers(), source: 'offline' }
    }
  }

  async getUniverse(placeId: string): Promise<UniverseResult> {
    const cleanPlaceId = this.normalizePlaceId(placeId)
    try {
      const universeLink = await this.requestJson<{ universeId?: number }>(`https://apis.roblox.com/universes/v1/places/${cleanPlaceId}/universe`)
      const universeId = String(universeLink.universeId ?? cleanPlaceId)
      const data = await this.requestJson<{ data?: Array<Record<string, unknown>> }>(`https://games.roblox.com/v1/games?universeIds=${universeId}`)
      const raw = data.data?.[0] ?? {}
      const universe: UniverseInfo = { id: universeId, rootPlaceId: stringValue(raw.rootPlaceId, cleanPlaceId), name: stringValue(raw.name, `Place ${cleanPlaceId}`), description: stringValue(raw.description), creatorName: stringValue((raw.creator as Record<string, unknown> | undefined)?.name, 'Unknown creator'), creatorId: String(numberValue((raw.creator as Record<string, unknown> | undefined)?.id, 0)), playing: numberValue(raw.playing), visits: numberValue(raw.visits), imageUrl: await this.getGameThumbnail(universeId), isPlayable: raw.isPlayable !== false }
      return { universe, source: 'roblox' }
    } catch {
      return { universe: { id: cleanPlaceId, rootPlaceId: cleanPlaceId, name: `Place ${cleanPlaceId}`, description: 'Roblox details are unavailable offline.', creatorName: 'Unknown creator', creatorId: '', playing: 0, visits: 0, imageUrl: '', isPlayable: true }, source: 'offline' }
    }
  }

  async getOutfit(userId: string): Promise<OutfitPreview> {
    const data = await this.requestJson<{ assets?: Array<{ id: number }> }>(`https://avatar.roblox.com/v1/users/${encodeURIComponent(userId)}/currently-wearing`)
    return { userId, avatarUrl: await this.getAvatarUrl(Number(userId)), assets: (data.assets ?? []).map((asset) => String(asset.id)) }
  }

  async applyFpsSettings(input: { unlockFps?: boolean; maxFps?: number; customSettingsPath?: string; customSettingsEnabled?: boolean }): Promise<import('../shared/types').ClientSettings> {
    const settings = await this.store.updateClient(input)
    if (process.platform !== 'win32') return settings
    const executable = await this.findInstalledRobloxPlayer()
    if (!executable) throw new Error('Roblox Player is not installed in the current Windows profile.')
    await this.syncClientSettings(executable, settings)
    return settings
  }

  async getPresence(userId: string): Promise<Presence | null> {
    const presences = await this.getPresences([userId])
    return presences?.get(userId) ?? null
  }

  private async getPresences(userIds: string[]): Promise<Map<string, Presence | null> | null> {
    const uniqueIds = [...new Set(userIds.filter(Boolean))]
    const result = new Map<string, Presence | null>(uniqueIds.map((id) => [id, null]))
    if (uniqueIds.length === 0) return result
    try {
      for (let offset = 0; offset < uniqueIds.length; offset += 50) {
        const batch = uniqueIds.slice(offset, offset + 50)
        const data = await this.requestJson<{ userPresences?: unknown[] }>('https://presence.roblox.com/v1/presence/users', { method: 'POST', body: JSON.stringify({ userIds: batch.map(Number) }), headers: { 'Content-Type': 'application/json' } })
        const values = data.userPresences ?? []
        values.forEach((value, index) => {
          const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
          const returnedId = source && (typeof source.userId === 'number' || typeof source.userId === 'string') ? String(source.userId) : batch[index]
          if (returnedId) result.set(returnedId, toPresence(value))
        })
      }
    } catch {
      // A transient Roblox response should not interrupt the background watcher.
      return null
    }
    return result
  }

  private async refreshStaleCookies(): Promise<void> {
    if (!this.store.getSnapshot().settings.autoCookieRefresh) return
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    for (const account of this.store.getAccounts()) {
      if (!account.hasCredentials || (account.lastVerified && Date.parse(account.lastVerified) > cutoff)) continue
      try { await this.utility({ accountId: account.id, action: 'logout-sessions' }) } catch { /* A stale account can be refreshed on the next cycle. */ }
    }
  }

  private async refreshPresence(): Promise<void> {
    const snapshot = this.store.getSnapshot()
    if (!snapshot.settings.showPresence) return
    const intervalMs = snapshot.settings.presenceUpdateRate * 1000
    if (this.presenceRefreshInFlight || Date.now() - this.lastPresenceRefresh < intervalMs) return
    this.lastPresenceRefresh = Date.now()
    const accounts = this.store.getAccounts().filter((account) => account.userId && account.hasCredentials && !this.sessionGuardian?.hasActiveSessionForAccount(account.id))
    if (accounts.length === 0) return
    this.presenceRefreshInFlight = true
    try {
      const checkedAt = new Date().toISOString()
      // Resolve each profile independently. One malformed/stale user ID must
      // never cause the first response to be reused for every account.
      const checks = await Promise.allSettled(accounts.map(async (account) => ({ account, presence: await this.getPresence(account.userId!) })))
      for (const [index, result] of checks.entries()) {
        const account = accounts[index]
        if (!account) continue
        if (result.status === 'rejected') {
          const misses = (this.presenceMisses.get(account.id) ?? 0) + 1
          this.presenceMisses.set(account.id, misses)
          if (misses >= 2 && account.status === 'running') {
            try { await this.store.setAccountVerification(account.id, { presence: null, presenceCheckedAt: checkedAt }) } catch { /* The account may have been removed while refreshing. */ }
          }
          continue
        }
        this.presenceMisses.delete(account.id)
        try { await this.store.setAccountVerification(account.id, { presence: result.value.presence, presenceCheckedAt: checkedAt }) } catch { /* Presence is best effort. */ }
      }
    } finally {
      this.presenceRefreshInFlight = false
    }
  }

  private async toPlayerLookup(id: number, name: string, displayName: string): Promise<PlayerLookup> {
    const data = await this.requestJson<RobloxUser>(`https://users.roblox.com/v1/users/${id}`)
    return { id: String(id), username: name, displayName, description: stringValue(data.description), createdAt: stringValue(data.created), isBanned: data.isBanned === true, avatarUrl: await this.getAvatarUrl(id), presence: await this.getPresence(String(id)) ?? undefined }
  }

  private async lookupUser(username: string): Promise<{ id: number; name: string }> {
    const response = await this.requestJson<{ data?: Array<{ id: number; name: string }> }>('https://users.roblox.com/v1/usernames/users', { method: 'POST', body: JSON.stringify({ usernames: [username.trim()], excludeBannedUsers: false }), headers: { 'Content-Type': 'application/json' } })
    const user = response.data?.[0]
    if (!user) throw new Error(`No Roblox user found for ${username}.`)
    return user
  }

  private async getBlockedUserIds(cookie: string): Promise<string[]> {
    const ids = new Set<string>()
    let cursor = ''
    for (let page = 0; page < 100; page += 1) {
      const query = new URLSearchParams({ count: '50' })
      if (cursor) query.set('cursor', cursor)
      const data = await this.requestJson<{ blockedUserIds?: unknown[]; nextCursor?: unknown; nextPageCursor?: unknown }>(`https://apis.roblox.com/user-blocking-api/v1/users/get-blocked-users?${query.toString()}`, {}, cookie)
      for (const value of data.blockedUserIds ?? []) {
        const id = identifier(value)
        if (id) ids.add(id)
      }
      const next = identifier(data.nextCursor ?? data.nextPageCursor)
      if (!next || next === cursor) break
      cursor = next
    }
    return [...ids]
  }

  private async getAuthenticated(cookie: string): Promise<RobloxUser> {
    return this.requestJson<RobloxUser>('https://users.roblox.com/v1/users/authenticated', {}, cookie)
  }

  private async getAvatarUrl(userId: number): Promise<string> {
    try {
      const data = await this.requestJson<{ data?: Array<{ imageUrl?: string }> }>(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`)
      return stringValue(data.data?.[0]?.imageUrl)
    } catch {
      return ''
    }
  }

  private async getGameThumbnail(universeId: string): Promise<string> {
    try {
      const data = await this.requestJson<{ data?: Array<{ imageUrl?: string }> }>(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${encodeURIComponent(universeId)}&size=512x512&format=Png&isCircular=false`)
      return stringValue(data.data?.[0]?.imageUrl)
    } catch {
      return ''
    }
  }

  private async lookupServerRegion(ip: string): Promise<string | null> {
    try {
      const octets = ip.split('.').map(Number)
      const first = octets[0] ?? -1
      const second = octets[1] ?? -1
      const isPrivateIpv4 = octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) && (first === 10 || first === 127 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168))
      if (isPrivateIpv4) return null
      const data = await this.requestJson<{ success?: boolean; message?: string; city?: string; region?: string; country?: string; country_code?: string }>(`https://ipwho.is/${encodeURIComponent(ip)}`)
      if (data.success === false) return null
      const location = [data.city, data.region, data.country_code || data.country].filter(Boolean)
      return location.join(', ') || null
    } catch {
      return null
    }
  }

  private async loginWithPassword(username: string, password: string): Promise<string> {
    let response = await this.rawRequest('https://auth.roblox.com/v2/login', { method: 'POST', body: JSON.stringify({ ctype: 'Username', cvalue: username, password }), headers: { 'Content-Type': 'application/json' } })
    const csrf = response.headers.get('x-csrf-token')
    if (response.status === 403 && csrf) response = await this.rawRequest('https://auth.roblox.com/v2/login', { method: 'POST', body: JSON.stringify({ ctype: 'Username', cvalue: username, password }), headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf } })
    if (!response.ok) throw new Error(`Roblox login failed (${response.status}).`)
    const cookie = parseCookieFromResponse(response)
    if (!cookie) throw new Error('Roblox did not return a session cookie. Complete login in the browser.')
    return cookie
  }

  private requireCookie(account: Account): string {
    if (!this.secrets.has(account.id)) throw new Error('This profile has no secure Roblox session. Import a cookie first.')
    const cookie = this.secrets.get(account.id)
    if (!cookie) throw new Error('The secure Roblox session could not be read.')
    return cookie
  }

  private async getAuthTicket(cookie: string): Promise<string> {
    const url = 'https://auth.roblox.com/v1/authentication-ticket/'
    const init: RequestInit = { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', Origin: 'https://www.roblox.com', Referer: 'https://www.roblox.com/' } }
    let response = await this.rawRequest(url, init, cookie)
    const csrf = response.headers.get('x-csrf-token')
    if (response.status === 403 && csrf) response = await this.rawRequest(url, { ...init, headers: { ...(init.headers as Record<string, string>), 'X-CSRF-TOKEN': csrf } }, cookie)
    const ticket = response.headers.get('rbx-authentication-ticket')
    if (!response.ok || !ticket) throw new RobloxAuthenticationTicketError(response.status)
    return ticket
  }

  private async getLaunchAuthTicket(account: Account): Promise<string> {
    const storedCookie = this.requireCookie(account)
    try {
      return await this.getAuthTicket(storedCookie)
    } catch (error) {
      if (!(error instanceof RobloxAuthenticationTicketError) || error.status !== 401) throw error
    }

    // An isolated account browser can receive a rotated Roblox cookie after a
    // security challenge or re-authentication. Recover that newer cookie only
    // when it still belongs to this exact profile.
    const browserCookie = await this.getPersistedAccountBrowserCookie(account.id)
    if (browserCookie && browserCookie !== storedCookie) {
      try {
        const user = await this.getAuthenticated(browserCookie)
        const matchesAccount = account.userId ? String(user.id) === account.userId : user.name.toLowerCase() === account.username.toLowerCase()
        if (matchesAccount) {
          const ticket = await this.getAuthTicket(browserCookie)
          const checkedAt = new Date().toISOString()
          await this.secrets.set(account.id, browserCookie)
          await this.store.setAccountVerification(account.id, { username: user.name, userId: String(user.id), displayName: user.displayName, hasCredentials: true, lastVerified: checkedAt })
          return ticket
        }
      } catch {
        // Fall through to distinguish an expired cookie from a temporary
        // authentication-ticket outage using the stored session itself.
      }
    }

    let storedSessionValid: boolean | null = null
    try {
      const response = await this.rawRequest('https://users.roblox.com/v1/users/authenticated', {}, storedCookie)
      storedSessionValid = response.ok ? true : response.status === 401 ? false : null
    } catch {
      storedSessionValid = null
    }

    if (storedSessionValid) {
      throw new Error(`Roblox is not issuing a launch ticket for @${account.username} right now. The saved session is still valid; wait a moment and try again.`)
    }
    if (storedSessionValid === null) {
      throw new Error(`Valdor could not confirm the Roblox session for @${account.username}. Check your connection and try again.`)
    }

    const checkedAt = new Date().toISOString()
    await this.store.setAccountVerification(account.id, { hasCredentials: false, lastVerified: null, presence: null, presenceCheckedAt: checkedAt })
    throw new Error(`Roblox signed @${account.username} out. Reconnect this profile, then launch again.`)
  }

  private async getPersistedAccountBrowserCookie(accountId: string): Promise<string | null> {
    try {
      const browserSession = session.fromPartition(await this.getAccountPartition(accountId))
      const cookies = await browserSession.cookies.get({ url: 'https://www.roblox.com/' })
      return cookies.find((cookie) => cookie.name === '.ROBLOSECURITY')?.value ?? null
    } catch {
      return null
    }
  }

  private parseServer(value: unknown): ServerRecord | null {
    if (typeof value !== 'object' || value === null) return null
    const source = value as Record<string, unknown>
    const id = stringValue(source.id)
    if (!id) return null
    const region = stringValue(source.region, 'Unknown')
    return { id, maxPlayers: numberValue(source.maxPlayers), playing: numberValue(source.playing), fps: stringValue(source.fps, '—'), ping: numberValue(source.ping), region, type: 'public', regionLoaded: region !== 'Unknown' || source.regionLoaded === true, regionSource: region === 'Unknown' ? 'unknown' : 'server', regionUpdatedAt: region === 'Unknown' ? null : new Date().toISOString() }
  }

  private normalizePlaceId(value: string): string {
    const trimmed = value.trim()
    const match = trimmed.match(/roblox\.com\/games\/(\d+)/i)
    return match?.[1] ?? trimmed.replace(/[^0-9]/g, '')
  }

  private async rawRequest(url: string, init: RequestInit = {}, cookie?: string): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    headers.set('User-Agent', ROBLOX_USER_AGENT)
    if (cookie) headers.set('Cookie', `.ROBLOSECURITY=${cookie}`)
    try {
      return await fetch(url, { ...init, headers, signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
  }

  private async requestJson<T>(url: string, init: RequestInit = {}, cookie?: string, retry = true): Promise<T> {
    const result = await this.requestJsonWithResponse<T>(url, init, cookie, retry)
    return result.data
  }

  private async requestWithCsrf(url: string, init: RequestInit = {}, cookie?: string, retry = true): Promise<Response> {
    let response = await this.rawRequest(url, init, cookie)
    const csrf = response.headers.get('x-csrf-token')
    if (response.status === 403 && csrf && retry) {
      const headers = new Headers(init.headers)
      headers.set('X-CSRF-TOKEN', csrf)
      response = await this.rawRequest(url, { ...init, headers }, cookie)
    }
    return response
  }

  private async requestJsonWithResponse<T>(url: string, init: RequestInit = {}, cookie?: string, retry = true): Promise<{ data: T; response: Response }> {
    const response = await this.requestWithCsrf(url, init, cookie, retry)
    const content = await response.text()
    if (!response.ok) throw new Error(`Roblox request failed (${response.status}).${content ? ` ${content.slice(0, 180)}` : ''}`)
    if (!content.trim()) return { data: {} as T, response }
    try {
      return { data: JSON.parse(content) as T, response }
    } catch {
      throw new Error(`Roblox returned an invalid response (${response.status}).`)
    }
  }
}
