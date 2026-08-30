export type AccountStatus = 'ready' | 'idle' | 'running' | 'offline'
import type { PlanEntitlements } from './entitlements'
export type { PlanEntitlements } from './entitlements'

export type PresenceType = 'offline' | 'online' | 'in-game' | 'in-studio'

export type CategoryIcon =
  | 'archive'
  | 'box'
  | 'chest'
  | 'coins'
  | 'flame'
  | 'folder'
  | 'gem'
  | 'gift'
  | 'map'
  | 'shield'
  | 'spark'
  | 'star'
  | 'swords'
  | 'target'
  | 'users'
  | 'wrench'

export interface GameCategory {
  id: string
  name: string
  accent: string
  sortOrder: number
  icon: CategoryIcon
}

export interface GameCollection {
  id: string
  name: string
  placeId: string
  description: string
  accent: string
  categories: GameCategory[]
  favorite: boolean
  createdAt: string
  lastUsed: string | null
  universeId: string | null
  thumbnailUrl: string
  creatorName: string
  creatorId: string
  playing: number
  visits: number
  infoUpdatedAt: string | null
}

export interface RecentGame {
  id: string
  name: string
  placeId: string
  jobId: string
  lastOpened: string
}

export interface Presence {
  type: PresenceType
  lastLocation: string
  placeId: string | null
  gameId: string | null
  universeId: string | null
  lastOnline: string | null
}

export interface ServerRecord {
  id: string
  maxPlayers: number
  playing: number
  fps: string
  ping: number
  region: string
  type: 'public' | 'vip' | 'reserved'
  accessCode?: string
  regionLoaded: boolean
  regionSource?: 'unknown' | 'server' | 'ip-lookup'
  regionUpdatedAt?: string | null
  firstSeenAt?: string
  lastSeenAt?: string
  expiresAt?: string
  isFavorite?: boolean
  isAvoided?: boolean
  score?: number
  scoreReasons?: string[]
  lastJoinResult?: ServerJoinResult
  lastJoinAt?: string | null
}

export type ServerJoinResult = 'launched' | 'queued' | 'failed' | 'cancelled'

export type ServerFinderSort = 'default' | 'score' | 'ping' | 'players' | 'newest'

export interface ServerFilterCriteria {
  minPlayers: number | null
  maxPlayers: number | null
  minPing: number | null
  maxPing: number | null
  regionAllowList: string[]
  regionDenyList: string[]
  serverTypes: Array<ServerRecord['type']>
  jobId: string
  maxAgeMinutes: number | null
  excludeVisited: boolean
  includeFavoritesOnly: boolean
  sort: ServerFinderSort
}

export interface ServerFilterPreset {
  id: string
  name: string
  gameId: string
  accountId: string | null
  criteria: ServerFilterCriteria
  createdAt: string
  updatedAt: string
}

export interface ServerHistoryRecord {
  id: string
  gameId: string
  accountId: string | null
  placeId: string
  server: ServerRecord
  firstSeenAt: string
  lastSeenAt: string
  lastJoinedAt: string | null
  lastJoinResult: ServerJoinResult | null
  lastJoinMessage: string
}

export interface ServerPreference {
  gameId: string
  accountId: string | null
  placeId: string
  serverId: string
  favorite: boolean
  avoid: boolean
  updatedAt: string
}

export interface ServerFinderState {
  presets: ServerFilterPreset[]
  history: ServerHistoryRecord[]
  preferences: ServerPreference[]
  lastKnown: ServerHistoryRecord | null
}

export type ServerFinderRequest =
  | { action: 'state'; gameId: string; accountId?: string; placeId?: string }
  | { action: 'save-preset'; preset: { name: string; gameId: string; accountId?: string | null; criteria: ServerFilterCriteria } }
  | { action: 'delete-preset'; gameId: string; presetId: string; accountId?: string | null }
  | { action: 'toggle-favorite' | 'toggle-avoid'; gameId: string; accountId?: string | null; placeId: string; serverId: string; value?: boolean }

export interface UniverseInfo {
  id: string
  rootPlaceId: string
  name: string
  description: string
  creatorName: string
  creatorId: string
  playing: number
  visits: number
  imageUrl: string
  isPlayable: boolean
}

export interface PlayerLookup {
  id: string
  username: string
  displayName: string
  description: string
  createdAt: string
  isBanned: boolean
  avatarUrl: string
  presence?: Presence
}

export interface OutfitPreview {
  userId: string
  avatarUrl: string
  assets: string[]
}

export interface AccountUtilityResult {
  ok: boolean
  message: string
  value?: string | number | boolean
}

export interface RobloxProcessActionResult {
  closed: number
  message: string
}

export type SessionProcessState = 'launching' | 'alive' | 'unresponsive' | 'closing' | 'exited' | 'crashed' | 'unknown'
export type SessionPresenceState = 'not-checked' | 'offline' | 'online' | 'in-game' | 'in-studio' | 'stale' | 'unavailable'
export type SessionStatus = 'launching' | 'running' | 'unresponsive' | 'closing' | 'exited' | 'crashed' | 'unknown'
export type SessionEventSeverity = 'info' | 'success' | 'warning' | 'error'
export type SessionEventType = 'launch-requested' | 'process-attached' | 'presence-updated' | 'session-stale' | 'session-ended' | 'session-crashed' | 'session-stop-requested' | 'session-refresh-failed' | 'recovery-scheduled' | 'recovery-started' | 'recovery-failed' | 'recovery-exhausted' | 'recovery-cancelled'

export type RecoveryJobStatus = 'scheduled' | 'launching' | 'exhausted' | 'cancelled'

export interface AccountRecoveryPolicy {
  enabled: boolean
  maxAttempts: number
  cooldownSeconds: number
  fallbackToPublicServer: boolean
}

export interface SessionRecord {
  id: string
  accountId: string
  launchRequestId: string
  processId: number | null
  processParentId: number | null
  processCreatedAt: string | null
  processPath: string
  windowHandle: number | null
  windowTitle: string
  placeId: string
  universeId: string | null
  experienceName: string
  targetJobId: string
  jobId: string
  region: string
  processState: SessionProcessState
  presenceState: SessionPresenceState
  status: SessionStatus
  startedAt: string
  lastProcessCheckAt: string | null
  lastPresenceCheckAt: string | null
  lastDataSource: 'launch' | 'process' | 'presence' | 'unknown'
  fps: number | null
  memoryMb: number | null
  cpuPercent: number | null
  endedAt: string | null
  closeReason: string | null
  error: string | null
  managed: boolean
  recoveryJobId: string | null
}

export interface SessionEvent {
  id: string
  type: SessionEventType
  sessionId: string | null
  accountId: string | null
  createdAt: string
  severity: SessionEventSeverity
  title: string
  detail: string
}

export interface SessionSnapshot {
  active: SessionRecord[]
  history: SessionRecord[]
  events: SessionEvent[]
  recoveryJobs: RecoveryJob[]
  checkedAt: string
}

export interface RecoveryJob {
  id: string
  accountId: string
  sourceSessionId: string
  attempt: number
  maxAttempts: number
  placeId: string
  jobId: string
  scheduledAt: string
  lastAttemptAt: string | null
  lastError: string | null
  status: RecoveryJobStatus
}

export interface SessionLaunchInput {
  accountId: string
  launchRequestId: string
  processId: number | null
  processPath?: string
  placeId: string
  jobId: string
  startedAt?: string
  recoveryJobId?: string | null
}

export interface ControlAccount {
  accountId: string
  username: string
  connected: boolean
  jobId: string
  placeId: string
  lastMessage: string
  autoRelaunch: boolean
  relaunchAt: string | null
}

export interface ControlCommand {
  id: string
  command: string
  payload: string
  createdAt: string
  target: string
  status: 'queued' | 'sent' | 'failed'
}

export interface ControlSettings {
  enabled: boolean
  port: number
  allowExternalConnections: boolean
  autoStart: boolean
}

export interface WebApiSettings {
  enabled: boolean
  port: number
  requirePassword: boolean
  passwordSet: boolean
  allowGetCookie: boolean
  allowGetAccounts: boolean
  allowLaunchAccount: boolean
  allowAccountEditing: boolean
  allowExternalConnections: boolean
}

export interface WatcherSettings {
  enabled: boolean
  closeIfNoConnection: boolean
  closeIfMemoryLow: boolean
  memoryLowMb: number
  closeIfWindowTitle: boolean
  expectedWindowTitle: string
}

export interface ClientSettings {
  unlockFps: boolean
  maxFps: number
  customSettingsPath: string
  customSettingsEnabled: boolean
}

export interface Account {
  id: string
  username: string
  alias: string
  description: string
  gameId: string
  categoryId: string
  status: AccountStatus
  lastUsed: string | null
  placeId: string
  jobId: string
  sessions: number
  accent: string
  createdAt: string
  userId: string | null
  displayName: string
  avatarUrl: string
  hasCredentials: boolean
  lastVerified: string | null
  presenceCheckedAt: string | null
  presence: Presence | null
  presenceVisibilityConfigured: boolean
  robuxBalance: number | null
  fpsOverride: number | null
  memorySaver: boolean
  recoveryPolicy: AccountRecoveryPolicy
  fields?: Record<string, string>
}

export interface AppSettings {
  asyncJoin: boolean
  runOnStartup: boolean
  multiInstance: boolean
  launchDelay: number
  autoCookieRefresh: boolean
  showPresence: boolean
  presenceUpdateRate: number
  maxRecentGames: number
  theme: 'neo' | 'dark' | 'light'
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  dataPath: string
}

export interface AppSnapshot {
  accounts: Account[]
  games: GameCollection[]
  recentGames: RecentGame[]
  favoriteGames: RecentGame[]
  controlAccounts: ControlAccount[]
  controlCommands: ControlCommand[]
  control: ControlSettings
  webApi: WebApiSettings
  watcher: WatcherSettings
  client: ClientSettings
  settings: AppSettings
  entitlements: PlanEntitlements
  info: AppInfo
}

export interface CreateAccountInput {
  username: string
  alias: string
  description: string
  gameId: string
  categoryId: string
}

export interface UpdateAccountInput {
  alias?: string
  description?: string
  gameId?: string
  categoryId?: string
  placeId?: string
  jobId?: string
  fpsOverride?: number | null
  memorySaver?: boolean
  recoveryPolicy?: Partial<AccountRecoveryPolicy>
}

export type AccountTransferMode = 'move' | 'duplicate'

export interface AccountTransferInput {
  accountIds: string[]
  gameId: string
  categoryId: string
  mode: AccountTransferMode
}

export interface AccountTransferRecord {
  sourceId: string
  account: Account
}

export interface AccountTransferResult {
  mode: AccountTransferMode
  transfers: AccountTransferRecord[]
}

export interface CreateGameInput {
  name: string
  placeId: string
  description: string
}

export interface UpdateGameInput {
  name?: string
  placeId?: string
  description?: string
  favorite?: boolean
}

export interface CreateCategoryInput {
  name: string
  accent?: string
  icon?: CategoryIcon
}

export interface UpdateCategoryInput {
  name?: string
  accent?: string
  icon?: CategoryIcon
}

export interface LaunchTarget {
  placeId: string
  jobId: string
}

export interface LaunchManyInput {
  targets: Array<{ accountId: string; placeId?: string; jobId?: string }>
}

export interface LaunchResult {
  account: Account
  openedUrl: string
}

export interface ImportCookieInput {
  username?: string
  cookie: string
  gameId?: string
  categoryId?: string
}

export interface RobloxLoginInput {
  gameId?: string
  categoryId?: string
}

export interface BulkImportInput {
  text: string
  format: 'cookie' | 'username-password' | 'username-cookie'
  gameId: string
  categoryId: string
}

export interface ServerQuery {
  placeId: string
  cursor?: string
  limit?: number
  smallest?: boolean
  gameId?: string
  accountId?: string
  filters?: ServerFilterCriteria
  finder?: ServerFinderRequest
}

export interface ServerQueryResult {
  placeId: string
  servers: ServerRecord[]
  nextCursor: string | null
  previousCursor: string | null
  source: 'roblox' | 'offline'
  cacheAgeMs?: number | null
  finderState?: ServerFinderState
}

export interface JoinServerInput {
  accountId: string
  placeId: string
  jobId?: string
  vipLink?: string
  followUserId?: string
  gameId?: string
}

export interface GameSearchResult {
  placeId: string
  universeId: string
  name: string
  creatorName: string
  playing: number
  visits: number
  imageUrl: string
}

export interface PlayerSearchResult {
  players: PlayerLookup[]
  source: 'roblox' | 'offline'
}

export interface UniverseResult {
  universe: UniverseInfo
  source: 'roblox' | 'offline'
}

export interface AccountBrowserResult {
  opened: boolean
  message: string
}

export interface BrowserOpenOptions {
  url?: string
  javascript?: string
}

export type AccountCopyKind = 'username' | 'password' | 'userpass' | 'profile' | 'userId' | 'security-token' | 'authentication-ticket' | 'rbx-player' | 'app-link' | 'group' | 'details'

export interface AccountUtilityInput {
  accountId: string
  action: 'refresh' | 'get-robux' | 'get-email' | 'logout-sessions' | 'set-follow-privacy' | 'change-password' | 'change-email' | 'set-display-name' | 'send-friend-request' | 'toggle-block' | 'unblock-everyone' | 'join-group'
  value?: string
  secondaryValue?: string
}

export interface QuickLoginInput {
  accountId: string
  code: string
}

export interface ControlCommandInput {
  target: string
  command: string
  payload?: string
}

export interface WebApiUpdateInput extends Partial<WebApiSettings> {
  password?: string
}

export interface WatcherUpdateInput extends Partial<WatcherSettings> {}

export interface ClientSettingsUpdateInput extends Partial<ClientSettings> {}

export interface VirgueUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
}

export interface VirgueAuthSession {
  user: VirgueUser
  expiresAt: string
}

export interface AuthCredentialsInput {
  email: string
  password: string
}

export interface AuthSignUpInput extends AuthCredentialsInput {
  name: string
}

export interface VirgueApi {
  accounts: {
    create(input: CreateAccountInput): Promise<Account>
    remove(id: string): Promise<void>
    update(id: string, input: UpdateAccountInput): Promise<Account>
    transfer(input: AccountTransferInput): Promise<AccountTransferResult>
    launch(id: string, target: LaunchTarget): Promise<LaunchResult>
    launchMany(input: LaunchManyInput): Promise<LaunchResult[]>
    login(input: RobloxLoginInput): Promise<Account>
    importCookie(input: ImportCookieInput): Promise<Account>
    bulkImport(input: BulkImportInput): Promise<{ imported: Account[]; failed: string[] }>
    killAllRoblox(): Promise<RobloxProcessActionResult>
    verify(id: string): Promise<Account>
    openBrowser(id: string, options?: BrowserOpenOptions): Promise<AccountBrowserResult>
    copy(id: string, kind: AccountCopyKind): Promise<{ message: string }>
    utility(input: AccountUtilityInput): Promise<AccountUtilityResult>
    quickLogin(input: QuickLoginInput): Promise<AccountUtilityResult>
  }
  games: {
    create(input: CreateGameInput): Promise<GameCollection>
    update(id: string, input: UpdateGameInput): Promise<GameCollection>
    remove(id: string): Promise<void>
    createCategory(gameId: string, input: CreateCategoryInput): Promise<GameCollection>
    updateCategory(gameId: string, categoryId: string, input: UpdateCategoryInput): Promise<GameCollection>
    removeCategory(gameId: string, categoryId: string): Promise<GameCollection>
    search(query: string): Promise<GameSearchResult[]>
    toggleFavorite(id: string): Promise<GameCollection>
    refreshInfo(id: string): Promise<GameCollection>
  }
  app: {
    getSnapshot(): Promise<AppSnapshot>
    importData(): Promise<AppSnapshot>
    openDataFolder(): Promise<void>
    exportData(): Promise<string>
    openExternal(url: string): Promise<void>
    copyText(text: string): Promise<{ message: string }>
  }
  servers: {
    list(query: ServerQuery): Promise<ServerQueryResult>
    join(input: JoinServerInput): Promise<LaunchResult>
    loadRegion(placeId: string, serverId: string, accountId?: string): Promise<ServerRecord>
    getFinderState(input: { placeId: string; gameId: string; accountId?: string }): Promise<ServerFinderState>
    savePreset(input: { placeId: string; preset: { name: string; gameId: string; accountId?: string | null; criteria: ServerFilterCriteria } }): Promise<ServerFinderState>
    deletePreset(input: { placeId: string; gameId: string; presetId: string; accountId?: string | null }): Promise<ServerFinderState>
    toggleFavorite(input: { placeId: string; gameId: string; accountId?: string | null; serverId: string; value?: boolean }): Promise<ServerFinderState>
    toggleAvoid(input: { placeId: string; gameId: string; accountId?: string | null; serverId: string; value?: boolean }): Promise<ServerFinderState>
  }
  tools: {
    searchPlayer(username: string): Promise<PlayerSearchResult>
    getUniverse(placeId: string): Promise<UniverseResult>
    getOutfit(userId: string): Promise<OutfitPreview>
    applyFpsSettings(input: ClientSettingsUpdateInput): Promise<ClientSettings>
    openRecentGame(id: string): Promise<LaunchResult | null>
    addRecentGame(input: { name: string; placeId: string; jobId?: string }): Promise<RecentGame>
  }
  control: {
    start(): Promise<ControlAccount[]>
    stop(): Promise<void>
    send(input: ControlCommandInput): Promise<ControlCommand>
    setAutoRelaunch(accountId: string, enabled: boolean, seconds?: number): Promise<ControlAccount>
    update(input: Partial<ControlSettings>): Promise<ControlSettings>
  }
  webApi: {
    update(input: WebApiUpdateInput): Promise<WebApiSettings>
    start(): Promise<WebApiSettings>
    stop(): Promise<WebApiSettings>
  }
  watcher: {
    update(input: WatcherUpdateInput): Promise<WatcherSettings>
    check(): Promise<{ checked: number; closed: number; message: string }>
  }
  sessions: {
    getSnapshot(): Promise<SessionSnapshot>
    refresh(): Promise<SessionSnapshot>
    stop(sessionId: string): Promise<SessionRecord | null>
    cancelRecovery(jobId: string): Promise<RecoveryJob | null>
    onEvent(listener: (event: SessionEvent) => void): () => void
  }
  settings: {
    update(input: Partial<AppSettings>): Promise<AppSettings>
  }
  auth: {
    getSession(): Promise<VirgueAuthSession | null>
    signIn(input: AuthCredentialsInput): Promise<VirgueAuthSession>
    signUp(input: AuthSignUpInput): Promise<VirgueAuthSession>
    signOut(): Promise<void>
  }
  billing: {
    refresh(): Promise<PlanEntitlements>
  }
  window: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<boolean>
    isMaximized(): Promise<boolean>
    close(): Promise<void>
  }
}
