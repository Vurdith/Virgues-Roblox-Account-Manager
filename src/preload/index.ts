import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import type {
  AccountUtilityInput,
  AccountTransferInput,
  AccountCopyKind,
  AuthCredentialsInput,
  AuthSignUpInput,
  BackgroundInputCommandInput,
  BrowserOpenOptions,
  AppSettings,
  BulkImportInput,
  ClientSettingsUpdateInput,
  ControlCommandInput,
  ControlSettings,
  IsolatedWorkerCommandInput,
  IsolatedWorkerConnectionInput,
  CreateAccountInput,
  CreateCategoryInput,
  CreateGameInput,
  ImportCookieInput,
  JoinServerInput,
  LaunchManyInput,
  LaunchTarget,
  QuickLoginInput,
  RobloxLoginInput,
  ServerQuery,
  ServerFinderRequest,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpdateGameInput,
  WatcherUpdateInput,
  WebApiUpdateInput,
  SessionEvent,
  AppUpdateEvent,
  VirgueApi,
} from '../shared/types'

const api: VirgueApi = {
  accounts: {
    create: (input: CreateAccountInput) => ipcRenderer.invoke(IPC_CHANNELS.accountsCreate, input),
    remove: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.accountsRemove, id),
    update: (id: string, input: UpdateAccountInput) => ipcRenderer.invoke(IPC_CHANNELS.accountsUpdate, { id, input }),
    transfer: (input: AccountTransferInput) => ipcRenderer.invoke(IPC_CHANNELS.accountsTransfer, input),
    launch: (id: string, target: LaunchTarget) => ipcRenderer.invoke(IPC_CHANNELS.accountsLaunch, { id, target }),
    launchMany: (input: LaunchManyInput) => ipcRenderer.invoke(IPC_CHANNELS.accountsLaunchMany, input),
    login: (input: RobloxLoginInput) => ipcRenderer.invoke(IPC_CHANNELS.accountsLogin, input),
    importCookie: (input: ImportCookieInput) => ipcRenderer.invoke(IPC_CHANNELS.accountsImportCookie, input),
    bulkImport: (input: BulkImportInput) => ipcRenderer.invoke(IPC_CHANNELS.accountsBulkImport, input),
    killAllRoblox: () => ipcRenderer.invoke(IPC_CHANNELS.accountsKillAllRoblox),
    verify: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.accountsVerify, id),
    openBrowser: (id: string, options?: BrowserOpenOptions) => ipcRenderer.invoke(IPC_CHANNELS.accountsOpenBrowser, { id, options }),
    copy: (id: string, kind: AccountCopyKind) => ipcRenderer.invoke(IPC_CHANNELS.accountsCopy, { id, kind }),
    utility: (input: AccountUtilityInput) => ipcRenderer.invoke(IPC_CHANNELS.accountsUtility, input),
    quickLogin: (input: QuickLoginInput) => ipcRenderer.invoke(IPC_CHANNELS.accountsQuickLogin, input),
  },
  games: {
    create: (input: CreateGameInput) => ipcRenderer.invoke(IPC_CHANNELS.gamesCreate, input),
    update: (id: string, input: UpdateGameInput) => ipcRenderer.invoke(IPC_CHANNELS.gamesUpdate, { id, input }),
    remove: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.gamesRemove, id),
    createCategory: (gameId: string, input: CreateCategoryInput) => ipcRenderer.invoke(IPC_CHANNELS.gamesCreateCategory, { gameId, input }),
    updateCategory: (gameId: string, categoryId: string, input: UpdateCategoryInput) => ipcRenderer.invoke(IPC_CHANNELS.gamesUpdateCategory, { gameId, categoryId, input }),
    removeCategory: (gameId: string, categoryId: string) => ipcRenderer.invoke(IPC_CHANNELS.gamesRemoveCategory, { gameId, categoryId }),
    search: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.gamesSearch, query),
    toggleFavorite: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.gamesToggleFavorite, id),
    refreshInfo: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.gamesRefreshInfo, id),
  },
  app: {
    getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.appGetSnapshot),
    importData: () => ipcRenderer.invoke(IPC_CHANNELS.appImportData),
    openDataFolder: () => ipcRenderer.invoke(IPC_CHANNELS.appOpenDataFolder),
    exportData: () => ipcRenderer.invoke(IPC_CHANNELS.appExportData),
    openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.appOpenExternal, url),
    copyText: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.appCopyText, text),
  },
  servers: {
    list: (query: ServerQuery) => ipcRenderer.invoke(IPC_CHANNELS.serversList, query),
    join: (input: JoinServerInput) => ipcRenderer.invoke(IPC_CHANNELS.serversJoin, input),
    loadRegion: (placeId: string, serverId: string, accountId?: string) => ipcRenderer.invoke(IPC_CHANNELS.serversLoadRegion, { placeId, serverId, accountId }),
    getFinderState: async (input) => {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.serversList, { placeId: input.placeId, finder: { action: 'state', gameId: input.gameId, accountId: input.accountId } satisfies ServerFinderRequest })
      return result.finderState
    },
    savePreset: async (input) => {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.serversList, { placeId: input.placeId, finder: { action: 'save-preset', preset: input.preset } satisfies ServerFinderRequest })
      return result.finderState
    },
    deletePreset: async (input) => {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.serversList, { placeId: input.placeId, finder: { action: 'delete-preset', gameId: input.gameId, presetId: input.presetId, accountId: input.accountId } satisfies ServerFinderRequest })
      return result.finderState
    },
    toggleFavorite: async (input) => {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.serversList, { placeId: input.placeId, finder: { action: 'toggle-favorite', gameId: input.gameId, accountId: input.accountId, placeId: input.placeId, serverId: input.serverId, value: input.value } satisfies ServerFinderRequest })
      return result.finderState
    },
    toggleAvoid: async (input) => {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.serversList, { placeId: input.placeId, finder: { action: 'toggle-avoid', gameId: input.gameId, accountId: input.accountId, placeId: input.placeId, serverId: input.serverId, value: input.value } satisfies ServerFinderRequest })
      return result.finderState
    },
  },
  tools: {
    searchPlayer: (username: string) => ipcRenderer.invoke(IPC_CHANNELS.toolsSearchPlayer, username),
    getUniverse: (placeId: string) => ipcRenderer.invoke(IPC_CHANNELS.toolsGetUniverse, placeId),
    getOutfit: (userId: string) => ipcRenderer.invoke(IPC_CHANNELS.toolsGetOutfit, userId),
    applyFpsSettings: (input: ClientSettingsUpdateInput) => ipcRenderer.invoke(IPC_CHANNELS.toolsApplyFpsSettings, input),
    openRecentGame: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.toolsOpenRecentGame, id),
    addRecentGame: (input: { name: string; placeId: string; jobId?: string }) => ipcRenderer.invoke(IPC_CHANNELS.toolsAddRecentGame, input),
  },
  control: {
    start: () => ipcRenderer.invoke(IPC_CHANNELS.controlStart),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.controlStop),
    send: (input: ControlCommandInput) => ipcRenderer.invoke(IPC_CHANNELS.controlSend, input),
    setAutoRelaunch: (accountId: string, enabled: boolean, seconds?: number) => ipcRenderer.invoke(IPC_CHANNELS.controlSetAutoRelaunch, { accountId, enabled, seconds }),
    update: (input: Partial<ControlSettings>) => ipcRenderer.invoke(IPC_CHANNELS.controlUpdate, input),
  },
  webApi: {
    update: (input: WebApiUpdateInput) => ipcRenderer.invoke(IPC_CHANNELS.webApiUpdate, input),
    start: () => ipcRenderer.invoke(IPC_CHANNELS.webApiStart),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.webApiStop),
  },
  isolatedWorker: {
    getSessions: (input: IsolatedWorkerConnectionInput) => ipcRenderer.invoke(IPC_CHANNELS.isolatedWorkerGetSessions, input),
    sendInput: (input: IsolatedWorkerCommandInput) => ipcRenderer.invoke(IPC_CHANNELS.isolatedWorkerSendInput, input),
  },
  backgroundInput: {
    getSessions: () => ipcRenderer.invoke(IPC_CHANNELS.backgroundInputGetSessions),
    send: (input: BackgroundInputCommandInput) => ipcRenderer.invoke(IPC_CHANNELS.backgroundInputSend, input),
  },
  watcher: {
    update: (input: WatcherUpdateInput) => ipcRenderer.invoke(IPC_CHANNELS.watcherUpdate, input),
    check: () => ipcRenderer.invoke(IPC_CHANNELS.watcherCheck),
  },
  sessions: {
    getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.sessionsGetSnapshot),
    refresh: () => ipcRenderer.invoke(IPC_CHANNELS.sessionsRefresh),
    stop: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.sessionsStop, sessionId),
    cancelRecovery: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.sessionsCancelRecovery, jobId),
    onEvent: (listener: (event: SessionEvent) => void) => {
      const handler = (_event: IpcRendererEvent, event: SessionEvent) => listener(event)
      ipcRenderer.on(IPC_CHANNELS.sessionsEvent, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.sessionsEvent, handler)
    },
  },
  settings: {
    update: (input: Partial<AppSettings>) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, input),
  },
  auth: {
    getSession: () => ipcRenderer.invoke(IPC_CHANNELS.authGetSession),
    signIn: (input: AuthCredentialsInput) => ipcRenderer.invoke(IPC_CHANNELS.authSignIn, input),
    signUp: (input: AuthSignUpInput) => ipcRenderer.invoke(IPC_CHANNELS.authSignUp, input),
    signOut: () => ipcRenderer.invoke(IPC_CHANNELS.authSignOut),
  },
  billing: {
    refresh: () => ipcRenderer.invoke(IPC_CHANNELS.billingRefresh),
  },
  updates: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.updatesCheck),
    download: () => ipcRenderer.invoke(IPC_CHANNELS.updatesDownload),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.updatesInstall),
    onEvent: (listener: (event: AppUpdateEvent) => void) => {
      const handler = (_event: IpcRendererEvent, event: AppUpdateEvent) => listener(event)
      ipcRenderer.on(IPC_CHANNELS.updatesEvent, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.updatesEvent, handler)
    },
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.windowMinimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.windowToggleMaximize),
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.windowIsMaximized),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.windowClose),
  },
}

contextBridge.exposeInMainWorld('virgue', api)
