import { getPlanEntitlements, getPlanFeatureError, getPlanLimitError } from '@shared/entitlements'
import type {
  Account,
  AppSettings,
  AppSnapshot,
  ClientSettings,
  ControlAccount,
  ControlCommand,
  ControlSettings,
  GameCollection,
  GameSearchResult,
  GameCategory,
  RecentGame,
  ServerRecord,
  ServerFinderState,
  ServerHistoryRecord,
  ServerPreference,
  SessionEvent,
  SessionSnapshot,
  UpdateAccountInput,
  VirgueApi,
  VirgueAuthSession,
  WebApiSettings,
  WatcherSettings,
  AppUpdateEvent,
} from '@shared/types'

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const now = () => new Date().toISOString()

const previewGames: GameCollection[] = [
  {
    id: 'preview-dungeon-quest',
    name: 'Dungeon Quest Reborn',
    placeId: '77649408247578',
    description: 'Dungeon Quest Reborn profiles and storage runs.',
    accent: '#fa6d60',
    categories: [
      { id: 'preview-storage', name: 'Storage', accent: '#efb762', sortOrder: 0, icon: 'chest' },
      { id: 'preview-fighters', name: 'Fighters', accent: '#9e9b92', sortOrder: 1, icon: 'swords' },
    ],
    favorite: true,
    createdAt: '2026-08-18T10:20:00.000Z',
    lastUsed: '2026-08-24T21:18:00.000Z',
    universeId: 'preview-universe-dungeon',
    thumbnailUrl: '',
    creatorName: 'Virgue',
    creatorId: '1',
    playing: 0,
    visits: 0,
    infoUpdatedAt: null,
  },
]

const presence = (type: 'offline' | 'online' | 'in-game' | 'in-studio', location: string) => ({
  type,
  lastLocation: location,
  placeId: type === 'in-game' ? '77649408247578' : null,
  gameId: type === 'in-game' ? 'preview-dungeon-quest' : null,
  universeId: type === 'in-game' ? 'preview-universe-dungeon' : null,
  lastOnline: type === 'offline' ? '2026-08-24T21:18:00.000Z' : null,
})

const previewAccounts: Account[] = []

const previewSettings: AppSettings = {
  asyncJoin: false,
  runOnStartup: false,
  multiInstance: false,
  launchDelay: 8,
  autoCookieRefresh: false,
  showPresence: true,
  presenceUpdateRate: 60,
  maxRecentGames: 8,
  backgroundInputMainAccountId: null,
  protectedSessionEnabled: false,
  theme: 'neo',
}

const previewWebApi: WebApiSettings = {
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

const previewWatcher: WatcherSettings = {
  enabled: false,
  closeIfNoConnection: false,
  closeIfMemoryLow: false,
  memoryLowMb: 200,
  closeIfWindowTitle: false,
  expectedWindowTitle: 'Roblox',
}

const previewControl: ControlSettings = {
  enabled: false,
  port: 5242,
  allowExternalConnections: false,
  autoStart: false,
}

const previewClient: ClientSettings = {
  unlockFps: false,
  maxFps: 240,
  customSettingsPath: '',
  customSettingsEnabled: false,
}

const seedRecentGames: RecentGame[] = []

function makeServer(id: string, index: number, regionLoaded = false): ServerRecord {
  const seenAt = now()
  return {
    id,
    maxPlayers: 12,
    playing: Math.min(11, 2 + index * 2),
    fps: `${58 - index * 2}`,
    ping: 42 + index * 11,
    region: ['EU', 'US', 'AS', 'AU'][index % 4] ?? 'EU',
    type: index === 3 ? 'vip' : 'public',
    regionLoaded,
    regionSource: 'server',
    regionUpdatedAt: seenAt,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  }
}

function createControlAccounts(accounts: Account[], connected = false): ControlAccount[] {
  return accounts.map((account) => ({
    accountId: account.id,
    username: account.username,
    connected,
    jobId: account.jobId,
    placeId: account.placeId,
    lastMessage: connected ? 'Preview bridge connected' : '',
    autoRelaunch: false,
    relaunchAt: null,
  }))
}

function createPreviewApi(): VirgueApi {
  const previewParams = new URLSearchParams(window.location.search)
  let accounts = clone(previewAccounts)
  let games = clone(previewGames)
  let settings = clone(previewSettings)
  const showControlPreview = previewParams.get('controlPreview') === '1'
  if (showControlPreview) settings.backgroundInputMainAccountId = 'preview-main'
  let recentGames = clone(seedRecentGames)
  let webApi = clone(previewWebApi)
  let watcher = clone(previewWatcher)
  let client = clone(previewClient)
  let controlAccounts = createControlAccounts(accounts)
  let controlCommands: ControlCommand[] = []
  let control = clone(previewControl)
  let protectedSessionRunning = showControlPreview
  let serverPresets: ServerFinderState['presets'] = []
  let serverHistory: ServerHistoryRecord[] = []
  let serverPreferences: ServerPreference[] = []
  let sessionSnapshot: SessionSnapshot = { active: [], history: [], events: [], recoveryJobs: [], checkedAt: now() }
  let authSession: VirgueAuthSession | null = null
  let previewAhkScripts: import('@shared/types').AutoHotkeyScript[] = []
  let previewAiGenerating = false
  const sessionListeners = new Set<(event: SessionEvent) => void>()
  const entitlements = getPlanEntitlements(previewParams.get('plan') === 'pro' ? 'pro' : undefined)
  const accountSlotCount = () => new Set(accounts.map((account) => account.username.trim().toLowerCase()).filter(Boolean)).size
  const assertAccountCapacity = (additional = 1) => {
    if (entitlements.maxAccounts !== null && accountSlotCount() + additional > entitlements.maxAccounts) throw new Error(getPlanLimitError(entitlements, 'accounts'))
  }
  const assertGameCapacity = (additional = 1) => {
    if (entitlements.maxGames !== null && games.length + additional > entitlements.maxGames) throw new Error(getPlanLimitError(entitlements, 'games'))
  }

  const snapshot = (): AppSnapshot => ({
    accounts: clone(accounts),
    games: clone(games),
    recentGames: clone(recentGames),
    favoriteGames: clone(recentGames.filter((recent) => games.some((game) => game.placeId === recent.placeId && game.favorite))),
    controlAccounts: clone(controlAccounts),
    controlCommands: clone(controlCommands),
    control: clone(control),
    webApi: clone(webApi),
    watcher: clone(watcher),
    client: clone(client),
    settings: clone(settings),
    entitlements: clone(entitlements),
    info: { name: "Virgue's Roblox Account Manager", version: '1.0.5', platform: 'Browser preview', dataPath: 'Preview only' },
  })

  const firstAssignment = () => ({ gameId: games[0]?.id ?? '', categoryId: games[0]?.categories[0]?.id ?? '' })
  const findAccount = (id: string) => accounts.find((account) => account.id === id)
  const finderState = (gameId: string, accountId?: string): ServerFinderState => {
    const scope = accountId || null
    const history = serverHistory.filter((item) => item.gameId === gameId && item.accountId === scope)
    return { presets: clone(serverPresets.filter((item) => item.gameId === gameId && (item.accountId === null || item.accountId === scope))), history: clone(history), preferences: clone(serverPreferences.filter((item) => item.gameId === gameId && (item.accountId === null || item.accountId === scope))), lastKnown: clone(history.find((item) => item.lastJoinedAt) ?? history[0] ?? null) }
  }
  const previewServers = () => [0, 1, 2, 3].map((index) => makeServer(`preview-server-${index + 1}`, index))
  const backgroundInputSnapshot = () => {
    const protectedAccountId = settings.backgroundInputMainAccountId
    const sessions = showControlPreview ? [
      { id: 'preview-session-main', accountId: 'preview-main', accountLabel: 'Main account', experienceName: 'Dungeon Quest Reborn', windowTitle: 'Roblox', state: protectedAccountId === 'preview-main' ? 'protected' as const : 'ready' as const },
      { id: 'preview-session-alt-one', accountId: 'preview-alt-one', accountLabel: 'Storage alt', experienceName: 'Dungeon Quest Reborn', windowTitle: 'Roblox', state: protectedAccountId === 'preview-alt-one' ? 'protected' as const : 'ready' as const },
      { id: 'preview-session-alt-two', accountId: 'preview-alt-two', accountLabel: 'Fighter alt', experienceName: 'Dungeon Quest Reborn', windowTitle: 'Roblox', state: protectedAccountId === 'preview-alt-two' ? 'protected' as const : 'ready' as const },
    ] : []
    return { sessions, protectedAccountId, schedules: [], checkedAt: now() }
  }
  const updateAccount = (id: string, input: Partial<Account> | UpdateAccountInput) => {
    const current = findAccount(id)
    if (!current) throw new Error('Account not found.')
    const updated: Account = { ...current, ...input, recoveryPolicy: input.recoveryPolicy ? { ...current.recoveryPolicy, ...input.recoveryPolicy } : current.recoveryPolicy }
    accounts = accounts.map((account) => account.id === id ? updated : account)
    return updated
  }
  const transferPreviewAccounts: VirgueApi['accounts']['transfer'] = async (input) => {
    const destination = games.find((game) => game.id === input.gameId)
    if (!destination) throw new Error('Game not found.')
    const categoryId = destination.categories.some((category) => category.id === input.categoryId) ? input.categoryId : destination.categories[0]?.id ?? ''
    const sourceAccounts = input.accountIds.map((id) => findAccount(id)).filter((account): account is Account => Boolean(account))
    const transfers = sourceAccounts.map((source) => ({
      sourceId: source.id,
      account: {
        ...source,
        id: input.mode === 'duplicate' ? `preview-${Date.now()}-${Math.random()}` : source.id,
        gameId: destination.id,
        categoryId,
        status: source.hasCredentials ? 'ready' as const : source.status,
        placeId: destination.placeId,
        jobId: '',
        presence: null,
        presenceCheckedAt: null,
        accent: destination.accent,
        createdAt: input.mode === 'duplicate' ? now() : source.createdAt,
        fields: source.fields ? { ...source.fields } : {},
      },
    }))
    if (input.mode === 'duplicate') accounts = [...accounts, ...transfers.map((transfer) => transfer.account)]
    else accounts = accounts.map((account) => transfers.find((transfer) => transfer.sourceId === account.id)?.account ?? account)
    controlAccounts = createControlAccounts(accounts)
    return clone({ mode: input.mode, transfers })
  }
  const importPreviewCookie: VirgueApi['accounts']['importCookie'] = async (input) => {
    assertAccountCapacity()
    const assignment = firstAssignment()
    const username = input.username?.trim() || `cookieUser${accounts.length + 1}`
    const account: Account = {
      id: `preview-cookie-${Date.now()}`,
      username,
      alias: username,
      description: 'Imported Roblox session',
      gameId: input.gameId || assignment.gameId,
      categoryId: input.categoryId || assignment.categoryId,
      status: 'ready',
      favorite: false,
      lastUsed: null,
      placeId: games.find((game) => game.id === (input.gameId || assignment.gameId))?.placeId ?? '',
      jobId: '',
      sessions: 0,
      accent: '#efb762',
      createdAt: now(),
      userId: null,
      displayName: '',
      avatarUrl: '',
      hasCredentials: true,
      lastVerified: now(),
      presenceCheckedAt: now(),
      presence: presence('online', 'Imported session'),
      presenceVisibilityConfigured: true,
      robuxBalance: null,
      fpsOverride: null,
      memorySaver: false,
      recoveryPolicy: { enabled: false, maxAttempts: 3, cooldownSeconds: 30, fallbackToPublicServer: true },
    }
    accounts = [...accounts, account]
    controlAccounts = createControlAccounts(accounts)
    return clone(account)
  }

  return {
    accounts: {
      create: async (input) => {
        assertAccountCapacity()
        const assignment = firstAssignment()
        const account: Account = {
          id: `preview-${Date.now()}`,
          username: input.username.trim(),
          alias: input.alias.trim() || input.username.trim(),
          description: input.description.trim() || 'Local Roblox profile',
          gameId: input.gameId || assignment.gameId,
          categoryId: input.categoryId || assignment.categoryId,
          status: 'ready',
          favorite: false,
          lastUsed: null,
          placeId: games.find((game) => game.id === (input.gameId || assignment.gameId))?.placeId ?? '',
          jobId: '',
          sessions: 0,
          accent: '#fa6d60',
          createdAt: now(),
          userId: null,
          displayName: '',
          avatarUrl: '',
          hasCredentials: false,
          lastVerified: null,
          presenceCheckedAt: null,
          presence: presence('offline', 'Not verified in preview'),
          presenceVisibilityConfigured: false,
          robuxBalance: null,
          fpsOverride: null,
          memorySaver: false,
          recoveryPolicy: { enabled: false, maxAttempts: 3, cooldownSeconds: 30, fallbackToPublicServer: true },
        }
        accounts = [...accounts, account]
        controlAccounts = createControlAccounts(accounts)
        return clone(account)
      },
      login: async (input) => importPreviewCookie({ username: `previewUser${accounts.length + 1}`, cookie: 'preview-browser-session', gameId: input.gameId, categoryId: input.categoryId }),
      remove: async (id) => {
        accounts = accounts.filter((account) => account.id !== id)
        controlAccounts = controlAccounts.filter((account) => account.accountId !== id)
      },
      update: async (id, input) => clone(updateAccount(id, input)),
      transfer: transferPreviewAccounts,
      launch: async (id, target) => {
        const current = findAccount(id)
        if (!current) throw new Error('Account not found.')
        const updated = updateAccount(id, { placeId: target.placeId, jobId: target.jobId, status: 'running', sessions: current.sessions + 1, lastUsed: now(), presence: presence('in-game', 'Roblox game') })
        return { account: clone(updated), openedUrl: `https://www.roblox.com/games/${target.placeId}${target.jobId ? `?gameInstanceId=${target.jobId}` : ''}` }
      },
      launchMany: async (input) => {
        const entitlements = getPlanEntitlements()
        if (!entitlements.bulkLaunch) throw new Error(getPlanFeatureError(entitlements, 'bulk-launch'))
        return Promise.all(input.targets.map(async (target) => {
          const current = findAccount(target.accountId)
          if (!current) throw new Error('Account not found.')
          const placeId = target.placeId || current.placeId
          const jobId = target.jobId || current.jobId
          const updated = updateAccount(target.accountId, { placeId, jobId, status: 'running', sessions: current.sessions + 1, lastUsed: now(), presence: presence('in-game', 'Roblox game') })
          return { account: clone(updated), openedUrl: `https://www.roblox.com/games/${placeId}${jobId ? `?gameInstanceId=${jobId}` : ''}` }
        }))
      },
      importCookie: importPreviewCookie,
      bulkImport: async (input) => {
        const imported: Account[] = []
        const failed: string[] = []
        for (const [index, raw] of input.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).entries()) {
          const pieces = raw.split(/[,;:\t]/).map((piece) => piece.trim()).filter(Boolean)
          const username = input.format === 'cookie' ? `cookieUser${accounts.length + imported.length + 1}` : (pieces[0] ?? '')
          const credential = input.format === 'cookie' ? pieces.join('') : (pieces[1] ?? '')
          if (!username || !credential) { failed.push(`Line ${index + 1}: missing username or credential`); continue }
          imported.push(await importPreviewCookie({ username, cookie: credential, gameId: input.gameId, categoryId: input.categoryId }))
        }
        return { imported: clone(imported), failed }
      },
      killAllRoblox: async () => ({ closed: 0, message: 'No Roblox Player clients are running in preview.' }),
      verify: async (id) => clone(updateAccount(id, { status: 'ready', hasCredentials: true, lastVerified: now(), userId: findAccount(id)?.userId ?? `preview-${Date.now()}`, displayName: findAccount(id)?.displayName || findAccount(id)?.username || '', presence: presence('online', 'Roblox home') })),
      openBrowser: async (id) => {
        if (!findAccount(id)) throw new Error('Account not found.')
        return { opened: true, message: 'Preview account browser opened.' }
      },
      copy: async (_id, kind) => ({ message: `${kind} copied to the preview clipboard.` }),
      utility: async (input) => {
        if (!findAccount(input.accountId)) throw new Error('Account not found.')
        if (input.action === 'get-robux') updateAccount(input.accountId, { robuxBalance: 420 })
        if (input.action === 'refresh') updateAccount(input.accountId, { status: 'ready', lastVerified: now(), hasCredentials: true })
        return { ok: true, message: `${input.action.replaceAll('-', ' ')} completed in preview.`, value: input.action === 'get-robux' ? 420 : undefined }
      },
      quickLogin: async (input) => ({ ok: /^\d{6}$/.test(input.code), message: /^\d{6}$/.test(input.code) ? 'Quick Login code accepted in preview.' : 'Enter a six-digit Quick Login code.' }),
    },
    games: {
      create: async (input) => {
        assertGameCapacity()
        const game: GameCollection = { id: `preview-game-${Date.now()}`, name: input.name.trim() || 'Untitled game', placeId: input.placeId.trim(), description: input.description.trim(), accent: '#fa6d60', categories: [{ id: `preview-category-${Date.now()}`, name: 'Main', accent: '#fa6d60', sortOrder: 0, icon: 'folder' }], favorite: false, createdAt: now(), lastUsed: null, universeId: null, thumbnailUrl: '', creatorName: '', creatorId: '', playing: 0, visits: 0, infoUpdatedAt: null }
        games = [...games, game]
        return clone(game)
      },
      update: async (id, input) => {
        const current = games.find((game) => game.id === id)
        if (!current) throw new Error('Game not found.')
        const updated = { ...current, ...input }
        games = games.map((game) => game.id === id ? updated : game)
        return clone(updated)
      },
      remove: async (id) => {
        if (games.length <= 1) throw new Error('Keep at least one game collection.')
        const fallback = games.find((game) => game.id !== id)
        games = games.filter((game) => game.id !== id)
        if (fallback) accounts = accounts.map((account) => account.gameId === id ? { ...account, gameId: fallback.id, categoryId: fallback.categories[0]?.id ?? '' } : account)
      },
      createCategory: async (gameId, input) => {
        const current = games.find((game) => game.id === gameId)
        if (!current) throw new Error('Game not found.')
        const category: GameCategory = { id: `preview-category-${Date.now()}`, name: input.name.trim() || 'New category', accent: input.accent || '#efb762', sortOrder: current.categories.length, icon: input.icon || 'folder' }
        const updated = { ...current, categories: [...current.categories, category] }
        games = games.map((game) => game.id === gameId ? updated : game)
        return clone(updated)
      },
      updateCategory: async (gameId, categoryId, input) => {
        const current = games.find((game) => game.id === gameId)
        if (!current) throw new Error('Game not found.')
        if (input.name !== undefined) {
          const name = input.name.trim()
          if (!name) throw new Error('Give the category a name.')
          if (current.categories.some((category) => category.id !== categoryId && category.name.toLowerCase() === name.toLowerCase())) throw new Error('That category already exists in this game.')
        }
        const updated = { ...current, categories: current.categories.map((category) => category.id === categoryId ? { ...category, ...input } : category) }
        games = games.map((game) => game.id === gameId ? updated : game)
        return clone(updated)
      },
      removeCategory: async (gameId, categoryId) => {
        const current = games.find((game) => game.id === gameId)
        if (!current || current.categories.length <= 1) throw new Error('Keep at least one category.')
        const fallback = current.categories.find((category) => category.id !== categoryId)
        const updated = { ...current, categories: current.categories.filter((category) => category.id !== categoryId) }
        games = games.map((game) => game.id === gameId ? updated : game)
        if (fallback) accounts = accounts.map((account) => account.gameId === gameId && account.categoryId === categoryId ? { ...account, categoryId: fallback.id } : account)
        return clone(updated)
      },
      search: async (query) => [{ placeId: '77649408247578', universeId: 'preview-universe-dungeon', name: query.trim() || 'Dungeon Quest Reborn', creatorName: 'Virgue', playing: 0, visits: 0, imageUrl: '' } satisfies GameSearchResult],
      toggleFavorite: async (id) => {
        const current = games.find((game) => game.id === id)
        if (!current) throw new Error('Game not found.')
        const updated = { ...current, favorite: !current.favorite }
        games = games.map((game) => game.id === id ? updated : game)
        return clone(updated)
      },
      refreshInfo: async (id) => {
        const current = games.find((game) => game.id === id)
        if (!current) throw new Error('Game not found.')
        const updated = { ...current, universeId: current.universeId || 'preview-universe-dungeon', creatorName: current.creatorName || 'Virgue', creatorId: current.creatorId || '1', playing: current.playing || 0, visits: current.visits || 0, infoUpdatedAt: now() }
        games = games.map((game) => game.id === id ? updated : game)
        return clone(updated)
      },
    },
    app: {
      getSnapshot: async () => snapshot(),
      importData: async () => snapshot(),
      openDataFolder: async () => undefined,
      exportData: async () => JSON.stringify(snapshot(), null, 2),
      openExternal: async () => undefined,
      copyText: async () => ({ message: 'Value copied to the preview clipboard.' }),
    },
    servers: {
      list: async (query) => {
        if (query.finder?.action === 'state') return { placeId: query.placeId, servers: [], nextCursor: null, previousCursor: null, source: 'offline' as const, finderState: finderState(query.finder.gameId, query.finder.accountId) }
        if (query.finder?.action === 'save-preset') {
          const input = query.finder.preset; const existing = serverPresets.find((item) => item.gameId === input.gameId && item.accountId === (input.accountId || null) && item.name.toLowerCase() === input.name.trim().toLowerCase()); const timestamp = now()
          const preset = { id: existing?.id || `preview-preset-${Date.now()}`, name: input.name.trim(), gameId: input.gameId, accountId: input.accountId || null, criteria: clone(input.criteria), createdAt: existing?.createdAt || timestamp, updatedAt: timestamp }
          serverPresets = [preset, ...serverPresets.filter((item) => item.id !== preset.id)]
          return { placeId: query.placeId, servers: [], nextCursor: null, previousCursor: null, source: 'offline' as const, finderState: finderState(input.gameId, input.accountId || undefined) }
        }
        if (query.finder?.action === 'delete-preset') {
          const request = query.finder
          serverPresets = serverPresets.filter((item) => item.id !== request.presetId)
          return { placeId: query.placeId, servers: [], nextCursor: null, previousCursor: null, source: 'offline' as const, finderState: finderState(request.gameId, request.accountId || undefined) }
        }
        if (query.finder?.action === 'toggle-favorite' || query.finder?.action === 'toggle-avoid') {
          const request = query.finder
          const action = request.action === 'toggle-favorite' ? 'favorite' : 'avoid'; const scope = request.accountId || null
          const existing = serverPreferences.find((item) => item.gameId === request.gameId && item.accountId === scope && item.placeId === request.placeId && item.serverId === request.serverId)
          const preference = existing || { gameId: request.gameId, accountId: scope, placeId: request.placeId, serverId: request.serverId, favorite: false, avoid: false, updatedAt: now() }
          preference[action] = request.value ?? !preference[action]; preference.updatedAt = now()
          serverPreferences = [preference, ...serverPreferences.filter((item) => item !== existing)]
          return { placeId: query.placeId, servers: [], nextCursor: null, previousCursor: null, source: 'offline' as const, finderState: finderState(request.gameId, request.accountId || undefined) }
        }
        return { placeId: query.placeId, servers: previewServers(), nextCursor: null, previousCursor: null, source: 'offline' as const }
      },
      join: async (input) => {
        const current = findAccount(input.accountId)
        if (!current) throw new Error('Account not found.')
        const updated = updateAccount(input.accountId, { placeId: input.placeId, jobId: input.jobId || '', status: 'running', sessions: current.sessions + 1, lastUsed: now(), presence: presence('in-game', 'Roblox server') })
        const gameId = input.gameId || updated.gameId; const server = previewServers().find((item) => item.id === input.jobId)
        if (input.jobId) {
          const timestamp = now(); const history: ServerHistoryRecord = { id: `preview-history-${Date.now()}`, gameId, accountId: input.accountId, placeId: input.placeId, server: { ...(server || makeServer(input.jobId, 0)), lastJoinResult: 'launched', lastJoinAt: timestamp }, firstSeenAt: server?.firstSeenAt || timestamp, lastSeenAt: server?.lastSeenAt || timestamp, lastJoinedAt: timestamp, lastJoinResult: 'launched', lastJoinMessage: 'Preview launch completed.' }
          serverHistory = [history, ...serverHistory.filter((item) => !(item.gameId === gameId && item.accountId === input.accountId && item.placeId === input.placeId && item.server.id === input.jobId))]
        }
        return { account: clone(updated), openedUrl: input.vipLink || `https://www.roblox.com/games/${input.placeId}${input.jobId ? `?gameInstanceId=${input.jobId}` : ''}` }
      },
      loadRegion: async (placeId, serverId) => ({ ...makeServer(serverId, 0, true), id: serverId, region: 'EU', regionLoaded: true, type: 'public', maxPlayers: 12, playing: 5, fps: '60', ping: 34, accessCode: placeId }),
      getFinderState: async (input) => finderState(input.gameId, input.accountId),
      savePreset: async (input) => {
        const result = await (window.virgue.servers.list({ placeId: input.placeId, finder: { action: 'save-preset', preset: input.preset } }))
        return result.finderState!
      },
      deletePreset: async (input) => {
        const result = await window.virgue.servers.list({ placeId: input.placeId, finder: { action: 'delete-preset', gameId: input.gameId, presetId: input.presetId, accountId: input.accountId } })
        return result.finderState!
      },
      toggleFavorite: async (input) => {
        const result = await window.virgue.servers.list({ placeId: input.placeId, finder: { action: 'toggle-favorite', gameId: input.gameId, accountId: input.accountId, placeId: input.placeId, serverId: input.serverId, value: input.value } })
        return result.finderState!
      },
      toggleAvoid: async (input) => {
        const result = await window.virgue.servers.list({ placeId: input.placeId, finder: { action: 'toggle-avoid', gameId: input.gameId, accountId: input.accountId, placeId: input.placeId, serverId: input.serverId, value: input.value } })
        return result.finderState!
      },
    },
    tools: {
      searchPlayer: async (username) => ({ source: 'offline' as const, players: [{ id: '100001', username: username || 'player', displayName: username || 'Player', description: 'Preview player profile', createdAt: '2020-01-01T00:00:00.000Z', isBanned: false, avatarUrl: '', presence: presence('online', 'Roblox home') }] }),
      getUniverse: async (placeId) => ({ source: 'offline' as const, universe: { id: 'preview-universe-dungeon', rootPlaceId: placeId, name: 'Dungeon Quest Reborn', description: 'Preview universe information.', creatorName: 'Virgue', creatorId: '1', playing: 0, visits: 0, imageUrl: '', isPlayable: true } }),
      getOutfit: async (userId) => ({ userId, avatarUrl: '', assets: ['Classic Shirt', 'Classic Pants', 'Robloxian 2.0'] }),
      applyFpsSettings: async (input) => { client = { ...client, ...input }; return clone(client) },
      openRecentGame: async (id) => {
        const recent = recentGames.find((item) => item.id === id)
        const account = accounts[0]
        if (!recent || !account) return null
        const updated = updateAccount(account.id, { placeId: recent.placeId, jobId: recent.jobId, status: 'running', sessions: account.sessions + 1, lastUsed: now() })
        return { account: clone(updated), openedUrl: `https://www.roblox.com/games/${recent.placeId}` }
      },
      addRecentGame: async (input) => {
        const item: RecentGame = { id: `preview-recent-${Date.now()}`, name: input.name, placeId: input.placeId, jobId: input.jobId || '', lastOpened: now() }
        recentGames = [item, ...recentGames.filter((recent) => recent.placeId !== item.placeId)].slice(0, settings.maxRecentGames)
        return clone(item)
      },
    },
    control: {
      start: async () => { control = { ...control, enabled: true }; controlAccounts = createControlAccounts(accounts, true); return clone(controlAccounts) },
      stop: async () => { control = { ...control, enabled: false }; controlAccounts = controlAccounts.map((account) => ({ ...account, connected: false })) },
      send: async (input) => {
        const command: ControlCommand = { id: `preview-command-${Date.now()}`, command: input.command.trim(), payload: input.payload || '', createdAt: now(), target: input.target, status: 'sent' }
        controlCommands = [command, ...controlCommands].slice(0, 40)
        return clone(command)
      },
      setAutoRelaunch: async (accountId, enabled, seconds = 1800) => {
        const updated = controlAccounts.map((account) => account.accountId === accountId ? { ...account, autoRelaunch: enabled, relaunchAt: enabled ? new Date(Date.now() + seconds * 1000).toISOString() : null } : account)
        controlAccounts = updated
        const result = updated.find((account) => account.accountId === accountId)
        if (!result) throw new Error('Control account not found.')
        return clone(result)
      },
      update: async (input) => { control = { ...control, ...input }; return clone(control) },
    },
    webApi: {
      update: async (input) => { const { password: _password, ...rest } = input; webApi = { ...webApi, ...rest, passwordSet: Boolean(input.password) || webApi.passwordSet }; return clone(webApi) },
      start: async () => { webApi = { ...webApi, enabled: true }; return clone(webApi) },
      stop: async () => { webApi = { ...webApi, enabled: false }; return clone(webApi) },
    },
    isolatedWorker: {
      getSessions: async () => ({ workerName: 'Preview worker', sessions: [], checkedAt: now() }),
      sendInput: async (input) => ({ sessionId: input.sessionId, accountId: 'preview-account', accountLabel: 'Preview account', key: input.key, durationMs: input.durationMs, sentAt: now(), restoredPreviousWindow: true }),
    },
    backgroundInput: {
      getSessions: async () => backgroundInputSnapshot(),
      send: async (input) => {
        const snapshot = backgroundInputSnapshot()
        if (!snapshot.protectedAccountId) throw new Error('Choose which Roblox account is your main before sending background controls.')
        const targets = snapshot.sessions.filter((session) => input.sessionIds.includes(session.id))
        if (targets.some((session) => session.state === 'protected')) throw new Error('Virgue blocked an input directed at your protected main account.')
        return {
          key: input.key,
          durationMs: input.durationMs,
          issuedAt: now(),
          results: targets.map((session) => ({ sessionId: session.id, accountId: session.accountId, accountLabel: session.accountLabel, status: 'posted' as const, message: 'Preview accepted the background key message without changing focus.' })),
        }
      },
      startSchedule: async () => { throw new Error('Schedules are unavailable in browser preview.') },
      pauseSchedule: async () => { throw new Error('Schedules are unavailable in browser preview.') },
      resumeSchedule: async () => { throw new Error('Schedules are unavailable in browser preview.') },
      stopSchedule: async () => { throw new Error('Schedules are unavailable in browser preview.') },
    },
    protectedSession: {
      getStatus: async () => ({ supported: true, configured: true, firewallEnabled: true, phase: protectedSessionRunning ? 'ready' as const : 'stopped' as const, childSessionId: protectedSessionRunning ? 2 : null, message: protectedSessionRunning ? 'Protected Session is ready. Alt launches and inputs stay off your main desktop.' : 'Protected Session is ready to start.' }),
      setup: async () => {
        protectedSessionRunning = true
        settings.protectedSessionEnabled = true
        const status = { supported: true, configured: true, firewallEnabled: true, phase: 'ready' as const, childSessionId: 2, message: 'Protected Session is ready. Alt launches and inputs stay off your main desktop.' }
        return { ok: true, message: 'Protected Session is configured.', status }
      },
      start: async () => {
        protectedSessionRunning = true
        settings.protectedSessionEnabled = true
        return { supported: true, configured: true, firewallEnabled: true, phase: 'ready' as const, childSessionId: 2, message: 'Protected Session is ready. Alt launches and inputs stay off your main desktop.' }
      },
      stop: async () => {
        protectedSessionRunning = false
        settings.protectedSessionEnabled = false
        return { supported: true, configured: true, firewallEnabled: true, phase: 'stopped' as const, childSessionId: null, message: 'Protected Session is stopped. Your main desktop is unchanged.' }
      },
      showViewer: async () => undefined,
    },
    autoHotkey: {
      getSnapshot: async () => ({ installed: true, version: '2', sessionReady: protectedSessionRunning, scripts: clone(previewAhkScripts) }),
      save: async (input) => {
        const timestamp = now()
        const existing = input.id ? previewAhkScripts.find((script) => script.id === input.id) : undefined
        const script = { id: existing?.id ?? `preview-ahk-${Date.now()}`, name: input.name, content: input.content, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp, running: existing?.running ?? false }
        previewAhkScripts = existing ? previewAhkScripts.map((item) => item.id === script.id ? script : item) : [...previewAhkScripts, script]
        return { installed: true, version: '2', sessionReady: protectedSessionRunning, scripts: clone(previewAhkScripts) }
      },
      remove: async (id) => { previewAhkScripts = previewAhkScripts.filter((script) => script.id !== id); return { installed: true, version: '2', sessionReady: protectedSessionRunning, scripts: clone(previewAhkScripts) } },
      run: async (id) => { previewAhkScripts = previewAhkScripts.map((script) => script.id === id ? { ...script, running: true } : script); return { installed: true, version: '2', sessionReady: protectedSessionRunning, scripts: clone(previewAhkScripts) } },
      stop: async (id) => { previewAhkScripts = previewAhkScripts.map((script) => script.id === id ? { ...script, running: false } : script); return { installed: true, version: '2', sessionReady: protectedSessionRunning, scripts: clone(previewAhkScripts) } },
      openDownload: async () => undefined,
      getAiStatus: async () => ({ modelTier: 'standard', modelName: 'Qwen2.5-Coder 1.5B · Standard', totalRamGb: 16, modelSizeBytes: 1_117_320_768, downloadedBytes: 1_117_320_768, installed: true, downloading: false, generating: previewAiGenerating, runtimeActive: previewAiGenerating, progressPercent: 100 }),
      downloadAiModel: async () => ({ modelTier: 'standard', modelName: 'Qwen2.5-Coder 1.5B · Standard', totalRamGb: 16, modelSizeBytes: 1_117_320_768, downloadedBytes: 1_117_320_768, installed: true, downloading: false, generating: false, runtimeActive: false, progressPercent: 100 }),
      generateAiScript: async () => {
        previewAiGenerating = true
        previewAiGenerating = false
        return { script: '#Requires AutoHotkey v2.0\n#SingleInstance Force\n', explanation: 'Browser preview only; the desktop build runs the local model for real.', warnings: [], modelTier: 'standard', modelName: 'Qwen2.5-Coder 1.5B · Standard', validationMessage: 'Preview validation passed.', generationTrace: ['Browser preview only · no local model was run.'] }
      },
      cancelAi: async () => { previewAiGenerating = false; return { modelTier: 'standard', modelName: 'Qwen2.5-Coder 1.5B · Standard', totalRamGb: 16, modelSizeBytes: 1_117_320_768, downloadedBytes: 1_117_320_768, installed: true, downloading: false, generating: false, runtimeActive: false, progressPercent: 100 } },
      removeAiModel: async () => ({ modelTier: 'standard', modelName: 'Qwen2.5-Coder 1.5B · Standard', totalRamGb: 16, modelSizeBytes: 1_117_320_768, downloadedBytes: 0, installed: false, downloading: false, generating: false, runtimeActive: false, progressPercent: 0 }),
    },
    watcher: {
      update: async (input) => { watcher = { ...watcher, ...input }; return clone(watcher) },
      check: async () => ({ checked: accounts.length, closed: 0, message: 'Preview watcher checked the local workspace.' }),
    },
    sessions: {
      getSnapshot: async () => clone(sessionSnapshot),
      refresh: async () => { sessionSnapshot = { ...sessionSnapshot, checkedAt: now() }; return clone(sessionSnapshot) },
      stop: async (sessionId) => sessionSnapshot.active.find((session) => session.id === sessionId) ?? null,
      cancelRecovery: async (jobId) => sessionSnapshot.recoveryJobs.find((job) => job.id === jobId) ?? null,
      onEvent: (listener) => { sessionListeners.add(listener); return () => sessionListeners.delete(listener) },
    },
    settings: {
      update: async (input) => { settings = { ...settings, ...input }; return clone(settings) },
    },
    auth: {
      getSession: async () => clone(authSession),
      signIn: async (input) => {
        const session: VirgueAuthSession = {
          user: {
            id: 'preview-user',
            name: input.email.split('@')[0] || 'Preview User',
            email: input.email,
            emailVerified: true,
            image: null,
          },
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }
        authSession = session
        return clone(session)
      },
      signUp: async (input) => {
        const session: VirgueAuthSession = {
          user: {
            id: 'preview-user',
            name: input.name.trim() || input.email.split('@')[0] || 'Preview User',
            email: input.email,
            emailVerified: true,
            image: null,
          },
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }
        authSession = session
        return clone(session)
      },
      signOut: async () => { authSession = null },
    },
    billing: {
      refresh: async () => clone(entitlements),
    },
    updates: {
      check: async () => ({ state: 'not-available' as const }),
      download: async () => ({ state: 'not-available' as const }),
      install: async () => undefined,
      onEvent: (_listener: (event: AppUpdateEvent) => void) => () => undefined,
    },
    window: {
      minimize: async () => undefined,
      toggleMaximize: async () => false,
      isMaximized: async () => false,
      close: async () => undefined,
    },
  }
}

export function ensurePreviewApi(): void {
  if (typeof window.virgue === 'undefined') window.virgue = createPreviewApi()
}
