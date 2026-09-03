import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dialog, type App, type Shell } from 'electron'
import { DEFAULT_PLAN_KEY, getPlanEntitlements, getPlanLimitError, type PlanKey } from '../shared/entitlements'
import type {
  Account,
  AccountRecoveryPolicy,
  AccountTransferInput,
  AccountTransferResult,
  AccountStatus,
  AppInfo,
  AppSettings,
  AppSnapshot,
  ClientSettings,
  CategoryIcon,
  ControlAccount,
  ControlCommand,
  ControlCommandInput,
  ControlSettings,
  CreateAccountInput,
  CreateCategoryInput,
  CreateGameInput,
  GameCategory,
  GameCollection,
  GameSearchResult,
  PlayerLookup,
  Presence,
  RecentGame,
  ServerRecord,
  ServerFilterCriteria,
  ServerFilterPreset,
  ServerFinderState,
  ServerHistoryRecord,
  ServerJoinResult,
  ServerPreference,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpdateGameInput,
  WatcherSettings,
  WebApiSettings,
} from '../shared/types'

const APP_NAME = "Virgue's Roblox Account Manager"
const DATA_FILE = 'accounts.json'

const DEFAULT_GAME_ID = 'game-dungeon-quest'
const DEFAULT_GAME_PLACE_ID = '77649408247578'
const DEFAULT_CATEGORY_ID = 'category-storage'
const LEGACY_GAME_IDS = new Set([
  DEFAULT_GAME_ID,
  'game-bedwars',
])
const MOCK_ACCOUNT_IDS = new Set([
  'seed-sketchy-atlas',
  'seed-baseplate-scout',
  'seed-red-brick-moth',
])

export const defaultSettings: AppSettings = {
  asyncJoin: false,
  runOnStartup: false,
  multiInstance: false,
  launchDelay: 8,
  autoCookieRefresh: false,
  showPresence: true,
  presenceUpdateRate: 30,
  maxRecentGames: 8,
  backgroundInputMainAccountId: null,
  theme: 'neo',
}

export const defaultWebApi: WebApiSettings = {
  enabled: false,
  port: 7963,
  requirePassword: false,
  passwordSet: false,
  allowGetCookie: false,
  allowGetAccounts: true,
  allowLaunchAccount: false,
  allowAccountEditing: false,
  allowExternalConnections: false,
  allowSessionInput: false,
}

export const defaultControl: ControlSettings = {
  enabled: false,
  port: 5242,
  allowExternalConnections: false,
  autoStart: false,
}

export const defaultWatcher: WatcherSettings = {
  enabled: false,
  closeIfNoConnection: false,
  closeIfMemoryLow: false,
  memoryLowMb: 200,
  closeIfWindowTitle: false,
  expectedWindowTitle: 'Roblox',
}

export const defaultClientSettings: ClientSettings = {
  unlockFps: false,
  maxFps: 240,
  customSettingsPath: '',
  customSettingsEnabled: false,
}

export const defaultRecoveryPolicy: AccountRecoveryPolicy = {
  enabled: false,
  maxAttempts: 3,
  cooldownSeconds: 30,
  fallbackToPublicServer: true,
}

const seedGames: GameCollection[] = [
  {
    id: DEFAULT_GAME_ID,
    name: 'Dungeon Quest Reborn',
    placeId: DEFAULT_GAME_PLACE_ID,
    description: 'Dungeon Quest Reborn profiles and storage runs.',
    accent: '#fa6d60',
    categories: [
      { id: DEFAULT_CATEGORY_ID, name: 'Storage', accent: '#efc870', sortOrder: 0, icon: 'chest' },
      { id: 'category-fighters', name: 'Fighters', accent: '#a7d3e6', sortOrder: 1, icon: 'swords' },
    ],
    favorite: true,
    createdAt: '2026-08-18T10:20:00.000Z',
    lastUsed: '2026-08-24T21:18:00.000Z',
    universeId: null,
    thumbnailUrl: '',
    creatorName: '',
    creatorId: '',
    playing: 0,
    visits: 0,
    infoUpdatedAt: null,
  },
]

function isLegacyGameId(id: string): boolean {
  return LEGACY_GAME_IDS.has(id) || id.startsWith('game-legacy-')
}

interface PersistedData {
  accounts: Account[]
  games: GameCollection[]
  settings: AppSettings
  recentGames: RecentGame[]
  favoriteGames: RecentGame[]
  controlAccounts: ControlAccount[]
  controlCommands: ControlCommand[]
  control: ControlSettings
  webApi: WebApiSettings
  watcher: WatcherSettings
  client: ClientSettings
  serverPresets: ServerFilterPreset[]
  serverHistory: ServerHistoryRecord[]
  serverPreferences: ServerPreference[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeFpsOverride(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(1000, Math.max(15, Math.round(value)))
}

function normalizeRecoveryPolicy(value: unknown): AccountRecoveryPolicy {
  const source = isRecord(value) ? value : {}
  return {
    enabled: source.enabled === true,
    maxAttempts: Math.min(5, Math.max(1, Math.round(number(source.maxAttempts, defaultRecoveryPolicy.maxAttempts)))),
    cooldownSeconds: Math.min(3600, Math.max(0, Math.round(number(source.cooldownSeconds, defaultRecoveryPolicy.cooldownSeconds)))),
    fallbackToPublicServer: source.fallbackToPublicServer !== false,
  }
}

function normalizeStatus(value: unknown): AccountStatus {
  return value === 'ready' || value === 'idle' || value === 'running' || value === 'offline' ? value : 'idle'
}

function migrateLegacyAccount(value: unknown): unknown {
  if (!isRecord(value) || (value.gameId !== 'game-bedwars' && !(typeof value.gameId === 'string' && value.gameId.startsWith('game-legacy-')))) return value
  return { ...value, gameId: DEFAULT_GAME_ID, categoryId: DEFAULT_CATEGORY_ID }
}

function normalizeCategory(value: unknown, index: number): GameCategory {
  const source = isRecord(value) ? value : {}
  const iconValue = text(source.icon)
  const iconNames: CategoryIcon[] = ['archive', 'box', 'chest', 'coins', 'flame', 'folder', 'gem', 'gift', 'map', 'shield', 'spark', 'star', 'swords', 'target', 'users', 'wrench']
  return {
    id: text(source.id, `category-${randomUUID()}`),
    name: text(source.name, `Category ${index + 1}`),
    accent: text(source.accent, index % 2 === 0 ? '#efc870' : '#a7d3e6'),
    sortOrder: number(source.sortOrder, index),
    icon: iconNames.includes(iconValue as CategoryIcon) ? iconValue as CategoryIcon : 'folder',
  }
}

function normalizeGame(value: unknown, index: number): GameCollection | null {
  if (!isRecord(value) || !text(value.name)) return null
  const categories = Array.isArray(value.categories) ? value.categories.map(normalizeCategory) : []
  if (categories.length === 0) categories.push({ id: randomUUID(), name: 'General', accent: '#efc870', sortOrder: 0, icon: 'folder' })
  return {
    id: text(value.id, `game-${randomUUID()}`),
    name: text(value.name, `Game ${index + 1}`),
    placeId: text(value.placeId),
    description: text(value.description, 'A local game collection.'),
    accent: text(value.accent, index % 2 === 0 ? '#fa6d60' : '#efb762'),
    categories,
    favorite: value.favorite === true,
    createdAt: text(value.createdAt, new Date().toISOString()),
    lastUsed: typeof value.lastUsed === 'string' ? value.lastUsed : null,
    universeId: typeof value.universeId === 'string' ? value.universeId : null,
    thumbnailUrl: text(value.thumbnailUrl),
    creatorName: text(value.creatorName),
    creatorId: text(value.creatorId),
    playing: Math.max(0, Math.round(number(value.playing, 0))),
    visits: Math.max(0, Math.round(number(value.visits, 0))),
    infoUpdatedAt: typeof value.infoUpdatedAt === 'string' ? value.infoUpdatedAt : null,
  }
}

function normalizeAccount(value: unknown, index: number, games: GameCollection[]): Account | null {
  if (!isRecord(value) || text(value.username).length < 3) return null
  const legacyGroup = text(value.group, 'Unsorted')
  let gameId = text(value.gameId)
  let categoryId = text(value.categoryId)
  let game = games.find((candidate) => candidate.id === gameId)
  if (!game) {
    game = games.find((candidate) => candidate.name.toLowerCase() === legacyGroup.toLowerCase())
  }
  if (!game) {
    game = games[0]
  }
  if (!game) return null
  gameId = game.id
  if (!game.categories.some((category) => category.id === categoryId)) categoryId = game.categories[0]?.id ?? ''
  const now = new Date().toISOString()
  const presence: Presence | null = isRecord(value.presence) ? {
    type: value.presence.type === 'online' || value.presence.type === 'in-game' || value.presence.type === 'in-studio' ? value.presence.type : 'offline',
    lastLocation: text(value.presence.lastLocation),
    placeId: typeof value.presence.placeId === 'string' ? value.presence.placeId : null,
    gameId: typeof value.presence.gameId === 'string' ? value.presence.gameId : null,
    universeId: typeof value.presence.universeId === 'string' ? value.presence.universeId : null,
    lastOnline: typeof value.presence.lastOnline === 'string' ? value.presence.lastOnline : null,
  } : null
  return {
    id: text(value.id, `imported-${index}-${randomUUID()}`),
    username: text(value.username),
    alias: text(value.alias),
    description: text(value.description, 'Local Roblox profile'),
    gameId,
    categoryId,
    status: value.status === 'running' ? 'ready' : normalizeStatus(value.status),
    lastUsed: typeof value.lastUsed === 'string' ? value.lastUsed : null,
    placeId: text(value.placeId, game.placeId),
    jobId: text(value.jobId),
    sessions: Math.max(0, Math.round(number(value.sessions, 0))),
    accent: text(value.accent, '#fa6d60'),
    createdAt: text(value.createdAt, now),
    userId: typeof value.userId === 'string' ? value.userId : null,
    displayName: text(value.displayName),
    avatarUrl: text(value.avatarUrl),
    hasCredentials: value.hasCredentials === true,
    lastVerified: typeof value.lastVerified === 'string' ? value.lastVerified : null,
    presenceCheckedAt: typeof value.presenceCheckedAt === 'string' ? value.presenceCheckedAt : null,
    presence,
    presenceVisibilityConfigured: value.presenceVisibilityConfigured === true,
    robuxBalance: typeof value.robuxBalance === 'number' ? value.robuxBalance : null,
    fpsOverride: normalizeFpsOverride(value.fpsOverride),
    memorySaver: value.memorySaver === true,
    recoveryPolicy: normalizeRecoveryPolicy(value.recoveryPolicy),
    fields: stringMap(value.fields),
  }
}

function normalizeSettings(value: unknown): AppSettings {
  const source = isRecord(value) ? value : {}
  return {
    asyncJoin: source.asyncJoin === true,
    runOnStartup: source.runOnStartup === true,
    multiInstance: source.multiInstance === true,
    launchDelay: Math.min(60, Math.max(0, Math.round(number(source.launchDelay ?? source.accountJoinDelay, defaultSettings.launchDelay)))),
    autoCookieRefresh: source.autoCookieRefresh === true,
    showPresence: source.showPresence !== false,
    presenceUpdateRate: Math.min(300, Math.max(5, Math.round(number(source.presenceUpdateRate, defaultSettings.presenceUpdateRate)))),
    maxRecentGames: Math.min(50, Math.max(1, Math.round(number(source.maxRecentGames, defaultSettings.maxRecentGames)))),
    backgroundInputMainAccountId: typeof source.backgroundInputMainAccountId === 'string' && source.backgroundInputMainAccountId.trim()
      ? source.backgroundInputMainAccountId.trim()
      : null,
    theme: source.theme === 'dark' || source.theme === 'light' ? source.theme : 'neo',
  }
}

function normalizeRecentGame(value: unknown, index: number): RecentGame | null {
  if (!isRecord(value) || !text(value.placeId)) return null
  return {
    id: text(value.id, `recent-${index}-${randomUUID()}`),
    name: text(value.name, `Place ${value.placeId}`),
    placeId: text(value.placeId),
    jobId: text(value.jobId),
    lastOpened: text(value.lastOpened, new Date().toISOString()),
  }
}

function dedupeRecentGames(games: RecentGame[], limit = Number.POSITIVE_INFINITY): RecentGame[] {
  const unique = new Map<string, RecentGame>()
  games.forEach((game) => {
    const placeId = game.placeId.trim()
    if (!placeId) return
    const current = unique.get(placeId)
    if (!current || Date.parse(game.lastOpened) >= Date.parse(current.lastOpened)) unique.set(placeId, { ...game, placeId })
  })
  return [...unique.values()]
    .sort((left, right) => Date.parse(right.lastOpened) - Date.parse(left.lastOpened))
    .slice(0, limit)
}

function cloneGame(game: GameCollection): GameCollection {
  return { ...game, categories: game.categories.map((category) => ({ ...category })) }
}

function normalizeServers(value: unknown): ServerRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((server): ServerRecord => ({
    id: text(server.id),
    maxPlayers: Math.max(0, Math.round(number(server.maxPlayers, 0))),
    playing: Math.max(0, Math.round(number(server.playing, 0))),
    fps: text(server.fps, '—'),
    ping: Math.max(0, Math.round(number(server.ping, 0))),
    region: text(server.region, 'Unknown'),
    type: (server.type === 'vip' || server.type === 'reserved' ? server.type : 'public') as ServerRecord['type'],
    accessCode: typeof server.accessCode === 'string' ? server.accessCode : undefined,
    regionLoaded: server.regionLoaded === true,
    regionSource: server.regionSource === 'server' || server.regionSource === 'ip-lookup' ? server.regionSource : 'unknown',
    regionUpdatedAt: typeof server.regionUpdatedAt === 'string' ? server.regionUpdatedAt : null,
    firstSeenAt: typeof server.firstSeenAt === 'string' ? server.firstSeenAt : undefined,
    lastSeenAt: typeof server.lastSeenAt === 'string' ? server.lastSeenAt : undefined,
    expiresAt: typeof server.expiresAt === 'string' ? server.expiresAt : undefined,
    isFavorite: server.isFavorite === true,
    isAvoided: server.isAvoided === true,
    score: typeof server.score === 'number' && Number.isFinite(server.score) ? Math.round(server.score) : undefined,
    scoreReasons: Array.isArray(server.scoreReasons) ? server.scoreReasons.filter((reason): reason is string => typeof reason === 'string').slice(0, 5) : undefined,
    lastJoinResult: server.lastJoinResult === 'launched' || server.lastJoinResult === 'queued' || server.lastJoinResult === 'failed' || server.lastJoinResult === 'cancelled' ? server.lastJoinResult : undefined,
    lastJoinAt: typeof server.lastJoinAt === 'string' ? server.lastJoinAt : null,
  })).filter((server) => server.id)
}

function normalizeServerCriteria(value: unknown): ServerFilterCriteria {
  const source = isRecord(value) ? value : {}
  const finite = (candidate: unknown): number | null => typeof candidate === 'number' && Number.isFinite(candidate) ? Math.max(0, Math.round(candidate)) : null
  const list = (candidate: unknown): string[] => Array.isArray(candidate) ? candidate.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 25) : []
  const types: ServerRecord['type'][] = Array.isArray(source.serverTypes) ? source.serverTypes.filter((item): item is ServerRecord['type'] => item === 'public' || item === 'reserved' || item === 'vip') : ['public']
  const sort = source.sort === 'score' || source.sort === 'ping' || source.sort === 'players' || source.sort === 'newest' ? source.sort : 'default'
  return {
    minPlayers: finite(source.minPlayers), maxPlayers: finite(source.maxPlayers), minPing: finite(source.minPing), maxPing: finite(source.maxPing),
    regionAllowList: list(source.regionAllowList), regionDenyList: list(source.regionDenyList), serverTypes: types.length > 0 ? types : ['public'],
    jobId: text(source.jobId), maxAgeMinutes: finite(source.maxAgeMinutes), excludeVisited: source.excludeVisited === true, includeFavoritesOnly: source.includeFavoritesOnly === true, sort,
  }
}

function normalizeServerPresets(value: unknown): ServerFilterPreset[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((item): ServerFilterPreset | null => {
    const gameId = text(item.gameId)
    const name = text(item.name)
    if (!gameId || !name) return null
    const createdAt = text(item.createdAt, new Date().toISOString())
    return { id: text(item.id, randomUUID()), name: name.slice(0, 60), gameId, accountId: typeof item.accountId === 'string' ? item.accountId : null, criteria: normalizeServerCriteria(item.criteria), createdAt, updatedAt: text(item.updatedAt, createdAt) }
  }).filter((item): item is ServerFilterPreset => item !== null).slice(0, 100)
}

function normalizeServerHistory(value: unknown): ServerHistoryRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((item): ServerHistoryRecord | null => {
    const gameId = text(item.gameId)
    const placeId = text(item.placeId)
    const server = normalizeServers([item.server])[0]
    if (!gameId || !placeId || !server) return null
    const lastSeenAt = text(item.lastSeenAt, server.lastSeenAt ?? new Date().toISOString())
    return { id: text(item.id, randomUUID()), gameId, accountId: typeof item.accountId === 'string' ? item.accountId : null, placeId, server, firstSeenAt: text(item.firstSeenAt, lastSeenAt), lastSeenAt, lastJoinedAt: typeof item.lastJoinedAt === 'string' ? item.lastJoinedAt : null, lastJoinResult: item.lastJoinResult === 'launched' || item.lastJoinResult === 'queued' || item.lastJoinResult === 'failed' || item.lastJoinResult === 'cancelled' ? item.lastJoinResult : null, lastJoinMessage: text(item.lastJoinMessage) }
  }).filter((item): item is ServerHistoryRecord => item !== null).sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt)).slice(0, 500)
}

function normalizeServerPreferences(value: unknown): ServerPreference[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((item): ServerPreference | null => {
    const gameId = text(item.gameId); const placeId = text(item.placeId); const serverId = text(item.serverId)
    if (!gameId || !placeId || !serverId) return null
    return { gameId, accountId: typeof item.accountId === 'string' ? item.accountId : null, placeId, serverId, favorite: item.favorite === true, avoid: item.avoid === true, updatedAt: text(item.updatedAt, new Date().toISOString()) }
  }).filter((item): item is ServerPreference => item !== null).slice(0, 500)
}

function cloneServer(server: ServerRecord): ServerRecord { return { ...server, scoreReasons: server.scoreReasons ? [...server.scoreReasons] : undefined } }
function cloneHistory(item: ServerHistoryRecord): ServerHistoryRecord { return { ...item, server: cloneServer(item.server) } }
function cloneFinderState(state: ServerFinderState): ServerFinderState { return { presets: state.presets.map((preset) => ({ ...preset, criteria: { ...preset.criteria, regionAllowList: [...preset.criteria.regionAllowList], regionDenyList: [...preset.criteria.regionDenyList], serverTypes: [...preset.criteria.serverTypes] } })), history: state.history.map(cloneHistory), preferences: state.preferences.map((preference) => ({ ...preference })), lastKnown: state.lastKnown ? cloneHistory(state.lastKnown) : null } }

export class AccountStore {
  private readonly dataPath: string
  // Billing resolution will replace this local default once the desktop
  // client reads the authenticated user's Neon entitlement.
  private planKey: PlanKey = DEFAULT_PLAN_KEY
  private data: PersistedData = {
    accounts: [],
    games: seedGames,
    settings: { ...defaultSettings },
    recentGames: [],
    favoriteGames: [],
    controlAccounts: [],
    controlCommands: [],
    control: { ...defaultControl },
    webApi: { ...defaultWebApi },
    watcher: { ...defaultWatcher },
    client: { ...defaultClientSettings },
    serverPresets: [],
    serverHistory: [],
    serverPreferences: [],
  }
  private cachedServers: Record<string, ServerRecord[]> = {}
  private cachedPlayerResults: PlayerLookup[] = []

  constructor(private readonly electronApp: App, private readonly electronShell: Shell) {
    this.dataPath = join(electronApp.getPath('userData'), DATA_FILE)
  }

  async initialize(): Promise<void> {
    await mkdir(this.electronApp.getPath('userData'), { recursive: true })
    try {
      const contents = await readFile(this.dataPath, 'utf8')
      const parsed: unknown = JSON.parse(contents)
      if (isRecord(parsed)) {
        const games = (Array.isArray(parsed.games) ? parsed.games : []).map((game, index) => normalizeGame(game, index)).filter((game): game is GameCollection => game !== null)
        const normalizedGames = games.length > 0
          ? [...seedGames.map(cloneGame), ...games.filter((game) => !isLegacyGameId(game.id)).map(cloneGame)]
          : seedGames.map(cloneGame)
        const rawAccounts = Array.isArray(parsed.accounts) ? parsed.accounts : []
        const accounts = rawAccounts
          .map((account, index) => normalizeAccount(migrateLegacyAccount(account), index, normalizedGames))
          .filter((account): account is Account => account !== null && !MOCK_ACCOUNT_IDS.has(account.id))
        const normalizedSettings = normalizeSettings(parsed.settings)
        this.data = {
          accounts,
          games: normalizedGames,
          settings: normalizedSettings,
          recentGames: dedupeRecentGames((Array.isArray(parsed.recentGames) ? parsed.recentGames : []).map(normalizeRecentGame).filter((game): game is RecentGame => game !== null), normalizedSettings.maxRecentGames),
          favoriteGames: (Array.isArray(parsed.favoriteGames) ? parsed.favoriteGames : []).map(normalizeRecentGame).filter((game): game is RecentGame => game !== null),
          controlAccounts: Array.isArray(parsed.controlAccounts) ? parsed.controlAccounts.filter(isRecord).map((control) => ({
            accountId: text(control.accountId), username: text(control.username), connected: control.connected === true, jobId: text(control.jobId), placeId: text(control.placeId), lastMessage: text(control.lastMessage), autoRelaunch: control.autoRelaunch === true, relaunchAt: typeof control.relaunchAt === 'string' ? control.relaunchAt : null,
          })) : [],
          controlCommands: Array.isArray(parsed.controlCommands) ? parsed.controlCommands.filter(isRecord).map((command) => ({
            id: text(command.id, randomUUID()), command: text(command.command), payload: text(command.payload), createdAt: text(command.createdAt, new Date().toISOString()), target: text(command.target, 'All connected accounts'), status: command.status === 'sent' || command.status === 'failed' ? command.status : 'queued',
          })) : [],
          control: this.normalizeControl(parsed.control),
          webApi: this.normalizeWebApi(parsed.webApi),
          watcher: this.normalizeWatcher(parsed.watcher),
          client: this.normalizeClient(parsed.client),
          serverPresets: normalizeServerPresets(parsed.serverPresets),
          serverHistory: normalizeServerHistory(parsed.serverHistory),
          serverPreferences: normalizeServerPreferences(parsed.serverPreferences),
        }
      } else {
        await this.persist()
      }
    } catch {
      await this.persist()
    }
    this.syncControlAccounts()
    await this.persist()
  }

  getSnapshot(): AppSnapshot {
    const info: AppInfo = {
      name: APP_NAME,
      version: this.electronApp.getVersion(),
      platform: process.platform === 'win32' ? 'Windows x64' : process.platform,
      dataPath: this.dataPath,
    }
    return {
      accounts: this.data.accounts.map((account) => ({ ...account, presence: account.presence ? { ...account.presence } : null })),
      games: this.data.games.map(cloneGame),
      recentGames: dedupeRecentGames(this.data.recentGames).map((game) => ({ ...game })),
      favoriteGames: this.data.favoriteGames.map((game) => ({ ...game })),
      controlAccounts: this.data.controlAccounts.map((account) => ({ ...account })),
      controlCommands: this.data.controlCommands.map((command) => ({ ...command })),
      control: { ...this.data.control },
      webApi: { ...this.data.webApi },
      watcher: { ...this.data.watcher },
      client: { ...this.data.client },
      settings: { ...this.data.settings },
      entitlements: getPlanEntitlements(this.planKey),
      info,
    }
  }

  setPlanKey(planKey: PlanKey): void {
    this.planKey = planKey
  }

  private accountSlotCount(): number {
    return new Set(this.data.accounts.map((account) => account.username.trim().toLowerCase()).filter(Boolean)).size
  }

  private assertAccountCapacity(additional = 1): void {
    const entitlements = getPlanEntitlements(this.planKey)
    if (entitlements.maxAccounts !== null && this.accountSlotCount() + additional > entitlements.maxAccounts) {
      throw new Error(getPlanLimitError(entitlements, 'accounts'))
    }
  }

  private assertGameCapacity(additional = 1): void {
    const entitlements = getPlanEntitlements(this.planKey)
    if (entitlements.maxGames !== null && this.data.games.length + additional > entitlements.maxGames) {
      throw new Error(getPlanLimitError(entitlements, 'games'))
    }
  }

  getAccount(id: string): Account {
    const account = this.data.accounts.find((candidate) => candidate.id === id)
    if (!account) throw new Error('Account not found.')
    return account
  }

  getAccounts(): Account[] {
    return this.data.accounts
  }

  getField(accountId: string, field: string): string {
    return this.getAccount(accountId).fields?.[field] ?? ''
  }

  async setField(accountId: string, field: string, value: string): Promise<void> {
    const account = this.getAccount(accountId)
    account.fields = { ...(account.fields ?? {}), [field.trim()]: value }
    await this.persist()
  }

  async removeField(accountId: string, field: string): Promise<void> {
    const account = this.getAccount(accountId)
    if (account.fields) delete account.fields[field]
    await this.persist()
  }

  async create(input: CreateAccountInput): Promise<Account> {
    const username = input.username.trim()
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) throw new Error('Use a Roblox username with 3–20 letters, numbers, or underscores.')
    if (this.data.accounts.some((account) => account.username.toLowerCase() === username.toLowerCase())) throw new Error('That username is already in your workspace.')
    this.assertAccountCapacity()
    const game = this.getGame(input.gameId)
    const categoryId = game.categories.some((category) => category.id === input.categoryId) ? input.categoryId : game.categories[0]?.id ?? ''
    const account: Account = {
      id: randomUUID(), username, alias: input.alias.trim(), description: input.description.trim() || 'Local Roblox profile', gameId: game.id, categoryId, status: 'ready', lastUsed: null, placeId: game.placeId, jobId: '', sessions: 0, accent: game.accent, createdAt: new Date().toISOString(), userId: null, displayName: '', avatarUrl: '', hasCredentials: false, lastVerified: null, presenceCheckedAt: null, presence: null, presenceVisibilityConfigured: false, robuxBalance: null, fpsOverride: null, memorySaver: false, recoveryPolicy: { ...defaultRecoveryPolicy }, fields: {},
    }
    this.data.accounts.push(account)
    this.syncControlAccounts()
    await this.persist()
    return { ...account }
  }

  async remove(id: string): Promise<void> {
    const previousLength = this.data.accounts.length
    this.data.accounts = this.data.accounts.filter((account) => account.id !== id)
    if (this.data.accounts.length === previousLength) throw new Error('Account not found.')
    this.data.controlAccounts = this.data.controlAccounts.filter((account) => account.accountId !== id)
    await this.persist()
  }

  async update(id: string, input: UpdateAccountInput): Promise<Account> {
    const account = this.getAccount(id)
    if (input.alias !== undefined) account.alias = input.alias.trim()
    if (input.description !== undefined) account.description = input.description.trim()
    if (input.gameId !== undefined) {
      const game = this.getGame(input.gameId)
      const gameChanged = account.gameId !== game.id
      account.gameId = game.id
      account.categoryId = game.categories.some((category) => category.id === input.categoryId) ? input.categoryId ?? account.categoryId : game.categories[0]?.id ?? ''
      account.accent = game.accent
      if (gameChanged) {
        account.placeId = game.placeId
        account.jobId = ''
        account.presence = null
        account.presenceCheckedAt = null
        account.status = account.hasCredentials ? 'ready' : account.status
      } else if (!account.placeId) account.placeId = game.placeId
    }
    if (input.categoryId !== undefined) {
      const game = this.getGame(account.gameId)
      if (!game.categories.some((category) => category.id === input.categoryId)) throw new Error('Category does not belong to that game.')
      account.categoryId = input.categoryId
    }
    if (input.placeId !== undefined) account.placeId = input.placeId.trim()
    if (input.jobId !== undefined) account.jobId = input.jobId.trim()
    if (input.fpsOverride !== undefined) account.fpsOverride = normalizeFpsOverride(input.fpsOverride)
    if (input.memorySaver !== undefined) account.memorySaver = input.memorySaver === true
    if (input.recoveryPolicy !== undefined) account.recoveryPolicy = normalizeRecoveryPolicy({ ...account.recoveryPolicy, ...input.recoveryPolicy })
    await this.persist()
    return { ...account, recoveryPolicy: { ...account.recoveryPolicy }, presence: account.presence ? { ...account.presence } : null }
  }

  async transfer(input: AccountTransferInput): Promise<AccountTransferResult> {
    const accountIds = [...new Set(input.accountIds.map((id) => id.trim()).filter(Boolean))]
    if (accountIds.length === 0) throw new Error('Select at least one profile to transfer.')
    if (input.mode !== 'move' && input.mode !== 'duplicate') throw new Error('Choose whether to move or duplicate the profiles.')

    const destination = this.getGame(input.gameId)
    const categoryId = destination.categories.some((category) => category.id === input.categoryId) ? input.categoryId : destination.categories[0]?.id ?? ''
    if (!categoryId) throw new Error('The destination game has no category.')

    const sourceAccounts = accountIds.map((id) => this.getAccount(id))
    const transfers = sourceAccounts.map((source) => {
      if (input.mode === 'duplicate') {
        const account: Account = {
          ...source,
          id: randomUUID(),
          gameId: destination.id,
          categoryId,
          status: source.hasCredentials ? 'ready' : source.status,
          placeId: destination.placeId,
          jobId: '',
          presence: null,
          presenceCheckedAt: null,
          accent: destination.accent,
          createdAt: new Date().toISOString(),
          fields: source.fields ? { ...source.fields } : {},
        }
        return { sourceId: source.id, account }
      }

      source.gameId = destination.id
      source.categoryId = categoryId
      source.accent = destination.accent
      source.placeId = destination.placeId
      source.jobId = ''
      source.presence = null
      source.presenceCheckedAt = null
      if (source.hasCredentials) source.status = 'ready'
      return { sourceId: source.id, account: { ...source, presence: null, fields: source.fields ? { ...source.fields } : {} } }
    })

    if (input.mode === 'duplicate') this.data.accounts.push(...transfers.map(({ account }) => account))
    this.syncControlAccounts()
    await this.persist()
    return { mode: input.mode, transfers }
  }

  async markLaunched(accountId: string, placeId: string, jobId: string): Promise<Account> {
    const account = this.getAccount(accountId)
    account.placeId = placeId
    account.jobId = jobId
    account.lastUsed = new Date().toISOString()
    account.sessions += 1
    const game = this.getGame(account.gameId)
    game.lastUsed = account.lastUsed
    this.addRecentGame({ name: game.name, placeId, jobId })
    await this.persist()
    return { ...account, presence: account.presence ? { ...account.presence } : null }
  }

  async setAccountRuntime(id: string, input: Partial<Pick<Account, 'status' | 'placeId' | 'jobId'>>): Promise<Account> {
    const account = this.getAccount(id)
    let changed = false
    if (input.status !== undefined && account.status !== input.status) {
      account.status = input.status
      changed = true
    }
    if (input.placeId !== undefined && account.placeId !== input.placeId) {
      account.placeId = input.placeId
      changed = true
    }
    if (input.jobId !== undefined && account.jobId !== input.jobId) {
      account.jobId = input.jobId
      changed = true
    }
    if (changed) await this.persist()
    return { ...account, presence: account.presence ? { ...account.presence } : null }
  }

  async setAccountVerification(id: string, input: Partial<Pick<Account, 'username' | 'alias' | 'userId' | 'displayName' | 'avatarUrl' | 'hasCredentials' | 'lastVerified' | 'presenceCheckedAt' | 'presence' | 'presenceVisibilityConfigured' | 'robuxBalance'>>): Promise<Account> {
    const account = this.getAccount(id)
    Object.assign(account, input)
    if (input.userId !== undefined && input.userId !== null) account.hasCredentials = true
    if (input.hasCredentials === false && account.status !== 'running') account.status = 'idle'
    else if (input.presence?.type === 'in-game') account.status = 'running'
    else if (input.presence?.type === 'offline' && account.status !== 'running') account.status = 'offline'
    else if (input.presence !== undefined && account.status !== 'running') account.status = 'ready'
    else if (input.userId !== undefined) account.status = 'ready'
    await this.persist()
    return { ...account, presence: account.presence ? { ...account.presence } : null }
  }

  getGame(id: string): GameCollection {
    const game = this.data.games.find((candidate) => candidate.id === id)
    if (!game) throw new Error('Game not found.')
    return game
  }

  getGames(): GameCollection[] {
    return this.data.games
  }

  getDefaultAssignment(): { gameId: string; categoryId: string } {
    const game = this.data.games[0]
    return { gameId: game?.id ?? '', categoryId: game?.categories[0]?.id ?? '' }
  }

  async createGame(input: CreateGameInput): Promise<GameCollection> {
    const name = input.name.trim()
    if (name.length < 2) throw new Error('Give the game a name.')
    if (this.data.games.some((game) => game.name.toLowerCase() === name.toLowerCase())) throw new Error('That game already exists.')
    this.assertGameCapacity()
    const game: GameCollection = { id: randomUUID(), name, placeId: input.placeId.trim(), description: input.description.trim() || 'A local game collection.', accent: this.data.games.length % 2 === 0 ? '#fa6d60' : '#efb762', categories: [{ id: randomUUID(), name: 'General', accent: '#efc870', sortOrder: 0, icon: 'folder' }], favorite: false, createdAt: new Date().toISOString(), lastUsed: null, universeId: null, thumbnailUrl: '', creatorName: '', creatorId: '', playing: 0, visits: 0, infoUpdatedAt: null }
    this.data.games.push(game)
    await this.persist()
    return cloneGame(game)
  }

  async updateGame(id: string, input: UpdateGameInput): Promise<GameCollection> {
    const game = this.getGame(id)
    if (input.name !== undefined) game.name = input.name.trim() || game.name
    if (input.placeId !== undefined) game.placeId = input.placeId.trim()
    if (input.description !== undefined) game.description = input.description.trim()
    if (input.favorite !== undefined) game.favorite = input.favorite
    await this.persist()
    return cloneGame(game)
  }

  async setGameInfo(id: string, input: Pick<GameCollection, 'universeId' | 'thumbnailUrl' | 'creatorName' | 'creatorId' | 'playing' | 'visits' | 'infoUpdatedAt'>): Promise<GameCollection> {
    const game = this.getGame(id)
    Object.assign(game, input)
    await this.persist()
    return cloneGame(game)
  }

  async removeGame(id: string): Promise<void> {
    if (this.data.games.length <= 1) throw new Error('Keep at least one game collection in the workspace.')
    this.getGame(id)
    const fallback = this.data.games.find((candidate) => candidate.id !== id)
    if (!fallback) throw new Error('A fallback game collection is required.')
    this.data.accounts.forEach((account) => {
      if (account.gameId === id) {
        account.gameId = fallback.id
        account.categoryId = fallback.categories[0]?.id ?? ''
        account.accent = fallback.accent
      }
    })
    this.data.games = this.data.games.filter((candidate) => candidate.id !== id)
    await this.persist()
  }

  async createCategory(gameId: string, input: CreateCategoryInput): Promise<GameCollection> {
    const game = this.getGame(gameId)
    const name = input.name.trim()
    if (name.length < 1) throw new Error('Give the category a name.')
    if (game.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) throw new Error('That category already exists in this game.')
    game.categories.push({ id: randomUUID(), name, accent: input.accent || '#a7d3e6', sortOrder: game.categories.length, icon: input.icon || 'folder' })
    await this.persist()
    return cloneGame(game)
  }

  async updateCategory(gameId: string, categoryId: string, input: UpdateCategoryInput): Promise<GameCollection> {
    const game = this.getGame(gameId)
    const category = game.categories.find((candidate) => candidate.id === categoryId)
    if (!category) throw new Error('Category not found.')
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) throw new Error('Give the category a name.')
      if (game.categories.some((candidate) => candidate.id !== categoryId && candidate.name.toLowerCase() === name.toLowerCase())) throw new Error('That category already exists in this game.')
      category.name = name
    }
    if (input.accent !== undefined) category.accent = input.accent
    if (input.icon !== undefined) category.icon = input.icon
    await this.persist()
    return cloneGame(game)
  }

  async removeCategory(gameId: string, categoryId: string): Promise<GameCollection> {
    const game = this.getGame(gameId)
    if (game.categories.length <= 1) throw new Error('Keep at least one category in each game.')
    const fallback = game.categories.find((category) => category.id !== categoryId)
    if (!fallback) throw new Error('A fallback category is required.')
    this.data.accounts.forEach((account) => {
      if (account.gameId === gameId && account.categoryId === categoryId) account.categoryId = fallback.id
    })
    game.categories = game.categories.filter((category) => category.id !== categoryId)
    await this.persist()
    return cloneGame(game)
  }

  async toggleFavoriteGame(id: string): Promise<GameCollection> {
    const game = this.getGame(id)
    game.favorite = !game.favorite
    await this.persist()
    return cloneGame(game)
  }

  async setRecentGames(recentGames: RecentGame[]): Promise<void> {
    this.data.recentGames = dedupeRecentGames(recentGames, this.data.settings.maxRecentGames)
    await this.persist()
  }

  addRecentGame(input: { name: string; placeId: string; jobId?: string }): RecentGame {
    const entry: RecentGame = { id: randomUUID(), name: input.name.trim() || `Place ${input.placeId}`, placeId: input.placeId.trim(), jobId: input.jobId?.trim() ?? '', lastOpened: new Date().toISOString() }
    this.data.recentGames = dedupeRecentGames([entry, ...this.data.recentGames], this.data.settings.maxRecentGames)
    return { ...entry }
  }

  async updateSettings(input: Partial<AppSettings>): Promise<AppSettings> {
    this.data.settings = normalizeSettings({ ...this.data.settings, ...input })
    this.data.recentGames = this.data.recentGames.slice(0, this.data.settings.maxRecentGames)
    await this.persist()
    return { ...this.data.settings }
  }

  async updateWebApi(input: Partial<WebApiSettings>): Promise<WebApiSettings> {
    this.data.webApi = { ...this.data.webApi, ...input }
    await this.persist()
    return { ...this.data.webApi }
  }

  async updateWatcher(input: Partial<WatcherSettings>): Promise<WatcherSettings> {
    this.data.watcher = this.normalizeWatcher({ ...this.data.watcher, ...input })
    await this.persist()
    return { ...this.data.watcher }
  }

  async updateClient(input: Partial<ClientSettings>): Promise<ClientSettings> {
    this.data.client = this.normalizeClient({ ...this.data.client, ...input })
    await this.persist()
    return { ...this.data.client }
  }

  getWebApi(): WebApiSettings { return { ...this.data.webApi } }
  getWatcher(): WatcherSettings { return { ...this.data.watcher } }
  getClient(): ClientSettings { return { ...this.data.client } }

  cacheServers(placeId: string, servers: ServerRecord[]): void { this.cachedServers[placeId] = normalizeServers(servers) }
  getCachedServers(placeId: string): ServerRecord[] {
    const now = Date.now()
    return (this.cachedServers[placeId] ?? []).filter((server) => Boolean(server.expiresAt) && Date.parse(server.expiresAt!) > now).map(cloneServer)
  }
  updateCachedServer(placeId: string, serverId: string, input: Partial<ServerRecord>): ServerRecord {
    const server = this.cachedServers[placeId]?.find((candidate) => candidate.id === serverId)
    if (!server) throw new Error('Server not found in the current list.')
    Object.assign(server, input)
    return cloneServer(server)
  }

  async recordServerObservations(input: { gameId?: string; accountId?: string; placeId: string; servers: ServerRecord[] }): Promise<void> {
    const gameId = input.gameId?.trim()
    if (!gameId) return
    const accountId = input.accountId?.trim() || null
    const now = new Date().toISOString()
    for (const raw of input.servers) {
      const server = cloneServer(raw)
      const existing = this.data.serverHistory.find((item) => item.gameId === gameId && item.accountId === accountId && item.placeId === input.placeId && item.server.id === server.id)
      const firstSeenAt = existing?.firstSeenAt ?? server.firstSeenAt ?? now
      const lastSeenAt = server.lastSeenAt ?? now
      const preference = this.data.serverPreferences.find((item) => item.gameId === gameId && item.accountId === accountId && item.placeId === input.placeId && item.serverId === server.id)
      server.firstSeenAt = firstSeenAt; server.lastSeenAt = lastSeenAt; server.expiresAt = server.expiresAt ?? new Date(Date.parse(lastSeenAt) + 10 * 60 * 1000).toISOString()
      server.isFavorite = preference?.favorite ?? existing?.server.isFavorite ?? false
      server.isAvoided = preference?.avoid ?? existing?.server.isAvoided ?? false
      const history: ServerHistoryRecord = { id: existing?.id ?? randomUUID(), gameId, accountId, placeId: input.placeId, server, firstSeenAt, lastSeenAt, lastJoinedAt: existing?.lastJoinedAt ?? null, lastJoinResult: existing?.lastJoinResult ?? null, lastJoinMessage: existing?.lastJoinMessage ?? '' }
      this.data.serverHistory = [history, ...this.data.serverHistory.filter((item) => item.id !== history.id)].slice(0, 500)
    }
    await this.persist()
  }

  getServerFinderState(gameId: string, accountId?: string | null): ServerFinderState {
    const normalizedGameId = gameId.trim(); const normalizedAccountId = accountId?.trim() || null
    const presets = this.data.serverPresets.filter((preset) => preset.gameId === normalizedGameId && (preset.accountId === null || preset.accountId === normalizedAccountId))
    const history = this.data.serverHistory.filter((item) => item.gameId === normalizedGameId && item.accountId === normalizedAccountId)
    const preferences = this.data.serverPreferences.filter((item) => item.gameId === normalizedGameId && (item.accountId === null || item.accountId === normalizedAccountId))
    const lastKnown = history.filter((item) => item.lastJoinedAt && item.lastJoinResult !== 'failed').sort((left, right) => Date.parse(right.lastJoinedAt ?? '') - Date.parse(left.lastJoinedAt ?? ''))[0] ?? history[0] ?? null
    return cloneFinderState({ presets, history, preferences, lastKnown })
  }

  async saveServerFilterPreset(input: { name: string; gameId: string; accountId?: string | null; criteria: ServerFilterCriteria }): Promise<ServerFinderState> {
    const name = input.name.trim()
    if (!name) throw new Error('Name the server preset before saving it.')
    const now = new Date().toISOString(); const accountId = input.accountId?.trim() || null
    const existing = this.data.serverPresets.find((preset) => preset.gameId === input.gameId && preset.accountId === accountId && preset.name.toLowerCase() === name.toLowerCase())
    const preset: ServerFilterPreset = { id: existing?.id ?? randomUUID(), name: name.slice(0, 60), gameId: input.gameId, accountId, criteria: normalizeServerCriteria(input.criteria), createdAt: existing?.createdAt ?? now, updatedAt: now }
    this.data.serverPresets = [preset, ...this.data.serverPresets.filter((item) => item.id !== preset.id)].slice(0, 100)
    await this.persist()
    return this.getServerFinderState(input.gameId, accountId)
  }

  async deleteServerFilterPreset(gameId: string, presetId: string): Promise<ServerFinderState> {
    return this.deleteServerFilterPresetForAccount(gameId, presetId)
  }

  async deleteServerFilterPresetForAccount(gameId: string, presetId: string, accountId?: string | null): Promise<ServerFinderState> {
    this.data.serverPresets = this.data.serverPresets.filter((preset) => preset.id !== presetId)
    await this.persist()
    return this.getServerFinderState(gameId, accountId ?? undefined)
  }

  async setServerPreference(input: { gameId: string; accountId?: string | null; placeId: string; serverId: string; kind: 'favorite' | 'avoid'; value?: boolean }): Promise<ServerFinderState> {
    const accountId = input.accountId?.trim() || null
    const existing = this.data.serverPreferences.find((item) => item.gameId === input.gameId && item.accountId === accountId && item.placeId === input.placeId && item.serverId === input.serverId)
    const preference: ServerPreference = existing ?? { gameId: input.gameId, accountId, placeId: input.placeId, serverId: input.serverId, favorite: false, avoid: false, updatedAt: new Date().toISOString() }
    preference[input.kind] = input.value ?? !preference[input.kind]
    preference.updatedAt = new Date().toISOString()
    this.data.serverPreferences = [preference, ...this.data.serverPreferences.filter((item) => item !== existing)].slice(0, 500)
    const cached = this.cachedServers[input.placeId]?.find((server) => server.id === input.serverId)
    if (cached) cached[input.kind === 'favorite' ? 'isFavorite' : 'isAvoided'] = preference[input.kind]
    await this.persist()
    return this.getServerFinderState(input.gameId, accountId)
  }

  async recordServerJoin(input: { gameId?: string; accountId: string; placeId: string; serverId: string; result: ServerJoinResult; message: string }): Promise<void> {
    const gameId = input.gameId?.trim()
    if (!gameId || !input.serverId.trim()) return
    const now = new Date().toISOString()
    const existing = this.data.serverHistory.find((item) => item.gameId === gameId && item.accountId === input.accountId && item.placeId === input.placeId && item.server.id === input.serverId)
    const server = existing?.server ?? { id: input.serverId, maxPlayers: 0, playing: 0, fps: '—', ping: 0, region: 'Unknown', type: 'public' as const, regionLoaded: false, regionSource: 'unknown' as const }
    const history: ServerHistoryRecord = { id: existing?.id ?? randomUUID(), gameId, accountId: input.accountId, placeId: input.placeId, server: { ...server, lastJoinResult: input.result, lastJoinAt: now }, firstSeenAt: existing?.firstSeenAt ?? now, lastSeenAt: existing?.lastSeenAt ?? now, lastJoinedAt: now, lastJoinResult: input.result, lastJoinMessage: input.message }
    this.data.serverHistory = [history, ...this.data.serverHistory.filter((item) => item.id !== history.id)].slice(0, 500)
    const cached = this.cachedServers[input.placeId]?.find((candidate) => candidate.id === input.serverId)
    if (cached) { cached.lastJoinResult = input.result; cached.lastJoinAt = now }
    await this.persist()
  }

  async updateServerHistoryServer(placeId: string, serverId: string, input: Partial<ServerRecord>): Promise<void> {
    let changed = false
    this.data.serverHistory = this.data.serverHistory.map((item) => {
      if (item.placeId !== placeId || item.server.id !== serverId) return item
      changed = true
      return { ...item, server: { ...item.server, ...input } }
    })
    if (changed) await this.persist()
  }

  cachePlayers(players: PlayerLookup[]): void { this.cachedPlayerResults = players.map((player) => ({ ...player })) }
  getCachedPlayers(): PlayerLookup[] { return this.cachedPlayerResults.map((player) => ({ ...player, presence: player.presence ? { ...player.presence } : undefined })) }

  async exportData(): Promise<string> {
    const result = await dialog.showSaveDialog({ title: 'Export Virgue profile data', defaultPath: 'virgue-account-data.json', filters: [{ name: 'JSON files', extensions: ['json'] }] })
    if (result.canceled || !result.filePath) return ''
    await writeFile(result.filePath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
    return result.filePath
  }

  async importData(): Promise<void> {
    const result = await dialog.showOpenDialog({ title: 'Import workspace data', properties: ['openFile'], filters: [{ name: 'JSON files', extensions: ['json'] }] })
    if (result.canceled || result.filePaths.length === 0) return
    const contents = await readFile(result.filePaths[0]!, 'utf8')
    const parsed: unknown = JSON.parse(contents)
    if (!isRecord(parsed)) throw new Error('The selected file is not a JSON object.')
    const games = (Array.isArray(parsed.games) ? parsed.games : []).map((game, index) => normalizeGame(game, index)).filter((game): game is GameCollection => game !== null)
    const importedGames = games.length > 0 ? games : this.data.games
    const rawAccounts = Array.isArray(parsed.accounts) ? parsed.accounts : Array.isArray(parsed) ? parsed : []
    const imported = rawAccounts.map((account, index) => normalizeAccount(account, index, importedGames)).filter((account): account is Account => account !== null)
    const existing = new Set(this.data.accounts.map((account) => account.username.toLowerCase()))
    const entitlements = getPlanEntitlements(this.planKey)
    if (entitlements.maxGames !== null && importedGames.length > entitlements.maxGames) {
      throw new Error(`${entitlements.displayName} supports up to ${entitlements.maxGames} game collections. This import contains ${importedGames.length}.`)
    }
    const newAccountNames = new Set(imported.map((account) => account.username.toLowerCase()).filter((username) => !existing.has(username)))
    if (entitlements.maxAccounts !== null && this.accountSlotCount() + newAccountNames.size > entitlements.maxAccounts) {
      throw new Error(`${entitlements.displayName} supports up to ${entitlements.maxAccounts} unique Roblox accounts. This import would exceed that limit.`)
    }
    this.data.games = importedGames
    this.data.accounts.push(...imported.filter((account) => !existing.has(account.username.toLowerCase())))
    await this.persist()
  }

  async openDataFolder(): Promise<void> {
    const error = await this.electronShell.openPath(this.electronApp.getPath('userData'))
    if (error) throw new Error(error)
  }

  async openExternal(url: string): Promise<void> {
    if (!/^https:\/\/(www\.)?roblox\.com\//i.test(url)) throw new Error('Only Roblox links can be opened from this app.')
    await this.electronShell.openExternal(url)
  }

  startControl(): ControlAccount[] {
    this.data.control.enabled = true
    this.syncControlAccounts()
    this.data.controlAccounts.forEach((account) => { if (account.connected === false) account.lastMessage = 'Waiting for control client connection' })
    return this.data.controlAccounts.map((account) => ({ ...account }))
  }

  stopControl(): void {
    this.data.control.enabled = false
    this.data.controlAccounts.forEach((account) => { account.connected = false; account.lastMessage = 'Control server stopped' })
  }

  async addControlCommand(input: ControlCommandInput): Promise<ControlCommand> {
    const command: ControlCommand = { id: randomUUID(), command: input.command.trim(), payload: input.payload?.trim() ?? '', createdAt: new Date().toISOString(), target: input.target.trim() || 'All connected accounts', status: this.data.controlAccounts.some((account) => account.connected && (input.target === 'all' || account.accountId === input.target)) ? 'sent' : 'queued' }
    this.data.controlCommands = [command, ...this.data.controlCommands].slice(0, 100)
    await this.persist()
    return { ...command }
  }

  async setControlAutoRelaunch(accountId: string, enabled: boolean, seconds = 1800): Promise<ControlAccount> {
    const control = this.data.controlAccounts.find((candidate) => candidate.accountId === accountId)
    if (!control) throw new Error('Account is not registered with Account Control.')
    control.autoRelaunch = enabled
    control.relaunchAt = enabled ? new Date(Date.now() + Math.max(1, seconds) * 1000).toISOString() : null
    await this.persist()
    return { ...control }
  }

  async updateControl(input: Partial<ControlSettings>): Promise<ControlSettings> {
    this.data.control = this.normalizeControl({ ...this.data.control, ...input })
    await this.persist()
    return { ...this.data.control }
  }

  getControl(): ControlSettings { return { ...this.data.control } }

  async updateControlAccount(accountId: string, input: Partial<ControlAccount>): Promise<ControlAccount> {
    const control = this.data.controlAccounts.find((candidate) => candidate.accountId === accountId)
    if (!control) throw new Error('Account is not registered with Account Control.')
    Object.assign(control, input)
    await this.persist()
    return { ...control }
  }

  private syncControlAccounts(): void {
    const existing = new Map(this.data.controlAccounts.map((account) => [account.accountId, account]))
    this.data.controlAccounts = this.data.accounts.map((account) => existing.get(account.id) ?? { accountId: account.id, username: account.username, connected: false, jobId: account.jobId, placeId: account.placeId, lastMessage: 'Not connected', autoRelaunch: false, relaunchAt: null })
  }

  private normalizeWebApi(value: unknown): WebApiSettings {
    const source = isRecord(value) ? value : {}
    return { ...defaultWebApi, enabled: source.enabled === true, port: Math.min(65535, Math.max(1024, Math.round(number(source.port, defaultWebApi.port)))), requirePassword: source.requirePassword === true, passwordSet: source.passwordSet === true, allowGetCookie: source.allowGetCookie === true, allowGetAccounts: source.allowGetAccounts !== false, allowLaunchAccount: source.allowLaunchAccount === true, allowAccountEditing: source.allowAccountEditing === true, allowExternalConnections: source.allowExternalConnections === true, allowSessionInput: source.allowSessionInput === true }
  }

  private normalizeControl(value: unknown): ControlSettings {
    const source = isRecord(value) ? value : {}
    return { ...defaultControl, enabled: source.enabled === true, port: Math.min(65535, Math.max(1024, Math.round(number(source.port, defaultControl.port)))), allowExternalConnections: source.allowExternalConnections === true, autoStart: source.autoStart === true }
  }

  private normalizeWatcher(value: unknown): WatcherSettings {
    const source = isRecord(value) ? value : {}
    return { ...defaultWatcher, enabled: source.enabled === true, closeIfNoConnection: source.closeIfNoConnection === true, closeIfMemoryLow: source.closeIfMemoryLow === true, memoryLowMb: Math.min(4096, Math.max(32, Math.round(number(source.memoryLowMb, defaultWatcher.memoryLowMb)))), closeIfWindowTitle: source.closeIfWindowTitle === true, expectedWindowTitle: text(source.expectedWindowTitle, defaultWatcher.expectedWindowTitle) }
  }

  private normalizeClient(value: unknown): ClientSettings {
    const source = isRecord(value) ? value : {}
    return { unlockFps: source.unlockFps === true, maxFps: Math.min(1000, Math.max(15, Math.round(number(source.maxFps, defaultClientSettings.maxFps)))), customSettingsPath: text(source.customSettingsPath), customSettingsEnabled: source.customSettingsEnabled === true }
  }

  private async persist(): Promise<void> {
    await writeFile(this.dataPath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
  }
}

export function parseGameSearchResult(value: unknown): GameSearchResult | null {
  if (!isRecord(value) || !text(value.placeId)) return null
  return { placeId: text(value.placeId), universeId: text(value.universeId), name: text(value.name, `Place ${value.placeId}`), creatorName: text(value.creatorName, 'Unknown creator'), playing: Math.max(0, Math.round(number(value.playing, 0))), visits: Math.max(0, Math.round(number(value.visits, 0))), imageUrl: text(value.imageUrl) }
}
