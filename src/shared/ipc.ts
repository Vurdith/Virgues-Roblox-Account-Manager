import type {
  AccountUtilityInput,
  AccountTransferInput,
  BulkImportInput,
  ClientSettingsUpdateInput,
  ControlCommandInput,
  CreateAccountInput,
  CreateCategoryInput,
  CreateGameInput,
  ImportCookieInput,
  JoinServerInput,
  LaunchTarget,
  QuickLoginInput,
  RobloxLoginInput,
  ServerQuery,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpdateGameInput,
  WatcherUpdateInput,
  WebApiUpdateInput,
  AppSettings,
  BackgroundInputCommandInput,
  ControlSettings,
  IsolatedWorkerCommandInput,
  IsolatedWorkerConnectionInput,
  AuthCredentialsInput,
  AuthSignUpInput,
  ValdorApi,
} from './types'

export const IPC_CHANNELS = {
  appGetSnapshot: 'app:get-snapshot',
  appImportData: 'app:import-data',
  appOpenDataFolder: 'app:open-data-folder',
  appExportData: 'app:export-data',
  appOpenExternal: 'app:open-external',
  appCopyText: 'app:copy-text',
  accountsCreate: 'accounts:create',
  accountsRemove: 'accounts:remove',
  accountsUpdate: 'accounts:update',
  accountsTransfer: 'accounts:transfer',
  accountsLaunch: 'accounts:launch',
  accountsLaunchMany: 'accounts:launch-many',
  accountsLogin: 'accounts:login',
  accountsImportCookie: 'accounts:import-cookie',
  accountsBulkImport: 'accounts:bulk-import',
  accountsKillAllRoblox: 'accounts:kill-all-roblox',
  accountsVerify: 'accounts:verify',
  accountsOpenBrowser: 'accounts:open-browser',
  accountsCopy: 'accounts:copy',
  accountsUtility: 'accounts:utility',
  accountsQuickLogin: 'accounts:quick-login',
  gamesCreate: 'games:create',
  gamesUpdate: 'games:update',
  gamesRemove: 'games:remove',
  gamesCreateCategory: 'games:create-category',
  gamesUpdateCategory: 'games:update-category',
  gamesRemoveCategory: 'games:remove-category',
  gamesSearch: 'games:search',
  gamesToggleFavorite: 'games:toggle-favorite',
  gamesRefreshInfo: 'games:refresh-info',
  serversList: 'servers:list',
  serversJoin: 'servers:join',
  serversLoadRegion: 'servers:load-region',
  toolsSearchPlayer: 'tools:search-player',
  toolsGetUniverse: 'tools:get-universe',
  toolsGetOutfit: 'tools:get-outfit',
  toolsApplyFpsSettings: 'tools:apply-fps-settings',
  toolsOpenRecentGame: 'tools:open-recent-game',
  toolsAddRecentGame: 'tools:add-recent-game',
  controlStart: 'control:start',
  controlStop: 'control:stop',
  controlSend: 'control:send',
  controlSetAutoRelaunch: 'control:set-auto-relaunch',
  controlUpdate: 'control:update',
  webApiUpdate: 'web-api:update',
  webApiStart: 'web-api:start',
  webApiStop: 'web-api:stop',
  isolatedWorkerGetSessions: 'isolated-worker:get-sessions',
  isolatedWorkerSendInput: 'isolated-worker:send-input',
  backgroundInputGetSessions: 'background-input:get-sessions',
  backgroundInputSend: 'background-input:send',
  protectedSessionGetStatus: 'protected-session:get-status',
  protectedSessionSetup: 'protected-session:setup',
  protectedSessionStart: 'protected-session:start',
  protectedSessionStop: 'protected-session:stop',
  watcherUpdate: 'watcher:update',
  watcherCheck: 'watcher:check',
  sessionsGetSnapshot: 'sessions:get-snapshot',
  sessionsRefresh: 'sessions:refresh',
  sessionsStop: 'sessions:stop',
  sessionsCancelRecovery: 'sessions:cancel-recovery',
  sessionsEvent: 'sessions:event',
  settingsUpdate: 'settings:update',
  authGetSession: 'auth:get-session',
  authSignIn: 'auth:sign-in',
  authSignUp: 'auth:sign-up',
  authSignOut: 'auth:sign-out',
  billingRefresh: 'billing:refresh',
  updatesCheck: 'updates:check',
  updatesDownload: 'updates:download',
  updatesInstall: 'updates:install',
  updatesEvent: 'updates:event',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowIsMaximized: 'window:is-maximized',
  windowClose: 'window:close',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

export interface IpcPayloads {
  [IPC_CHANNELS.appGetSnapshot]: undefined
  [IPC_CHANNELS.appImportData]: undefined
  [IPC_CHANNELS.appOpenDataFolder]: undefined
  [IPC_CHANNELS.appExportData]: undefined
  [IPC_CHANNELS.appOpenExternal]: string
  [IPC_CHANNELS.appCopyText]: string
  [IPC_CHANNELS.accountsCreate]: CreateAccountInput
  [IPC_CHANNELS.accountsRemove]: string
  [IPC_CHANNELS.accountsUpdate]: { id: string; input: UpdateAccountInput }
  [IPC_CHANNELS.accountsTransfer]: AccountTransferInput
  [IPC_CHANNELS.accountsLaunch]: { id: string; target: LaunchTarget }
  [IPC_CHANNELS.accountsLaunchMany]: import('./types').LaunchManyInput
  [IPC_CHANNELS.accountsLogin]: RobloxLoginInput
  [IPC_CHANNELS.accountsImportCookie]: ImportCookieInput
  [IPC_CHANNELS.accountsBulkImport]: BulkImportInput
  [IPC_CHANNELS.accountsKillAllRoblox]: undefined
  [IPC_CHANNELS.accountsVerify]: string
  [IPC_CHANNELS.accountsOpenBrowser]: { id: string; options?: import('./types').BrowserOpenOptions }
  [IPC_CHANNELS.accountsCopy]: { id: string; kind: import('./types').AccountCopyKind }
  [IPC_CHANNELS.accountsUtility]: AccountUtilityInput
  [IPC_CHANNELS.accountsQuickLogin]: QuickLoginInput
  [IPC_CHANNELS.gamesCreate]: CreateGameInput
  [IPC_CHANNELS.gamesUpdate]: { id: string; input: UpdateGameInput }
  [IPC_CHANNELS.gamesRemove]: string
  [IPC_CHANNELS.gamesCreateCategory]: { gameId: string; input: CreateCategoryInput }
  [IPC_CHANNELS.gamesUpdateCategory]: { gameId: string; categoryId: string; input: UpdateCategoryInput }
  [IPC_CHANNELS.gamesRemoveCategory]: { gameId: string; categoryId: string }
  [IPC_CHANNELS.gamesSearch]: string
  [IPC_CHANNELS.gamesToggleFavorite]: string
  [IPC_CHANNELS.gamesRefreshInfo]: string
  [IPC_CHANNELS.serversList]: ServerQuery
  [IPC_CHANNELS.serversJoin]: JoinServerInput
  [IPC_CHANNELS.serversLoadRegion]: { placeId: string; serverId: string; accountId?: string }
  [IPC_CHANNELS.toolsSearchPlayer]: string
  [IPC_CHANNELS.toolsGetUniverse]: string
  [IPC_CHANNELS.toolsGetOutfit]: string
  [IPC_CHANNELS.toolsApplyFpsSettings]: ClientSettingsUpdateInput
  [IPC_CHANNELS.toolsOpenRecentGame]: string
  [IPC_CHANNELS.toolsAddRecentGame]: { name: string; placeId: string; jobId?: string }
  [IPC_CHANNELS.controlStart]: undefined
  [IPC_CHANNELS.controlStop]: undefined
  [IPC_CHANNELS.controlSend]: ControlCommandInput
  [IPC_CHANNELS.controlSetAutoRelaunch]: { accountId: string; enabled: boolean; seconds?: number }
  [IPC_CHANNELS.controlUpdate]: Partial<ControlSettings>
  [IPC_CHANNELS.webApiUpdate]: WebApiUpdateInput
  [IPC_CHANNELS.webApiStart]: undefined
  [IPC_CHANNELS.webApiStop]: undefined
  [IPC_CHANNELS.isolatedWorkerGetSessions]: IsolatedWorkerConnectionInput
  [IPC_CHANNELS.isolatedWorkerSendInput]: IsolatedWorkerCommandInput
  [IPC_CHANNELS.backgroundInputGetSessions]: undefined
  [IPC_CHANNELS.backgroundInputSend]: BackgroundInputCommandInput
  [IPC_CHANNELS.protectedSessionGetStatus]: undefined
  [IPC_CHANNELS.protectedSessionSetup]: undefined
  [IPC_CHANNELS.protectedSessionStart]: undefined
  [IPC_CHANNELS.protectedSessionStop]: undefined
  [IPC_CHANNELS.watcherUpdate]: WatcherUpdateInput
  [IPC_CHANNELS.watcherCheck]: undefined
  [IPC_CHANNELS.sessionsGetSnapshot]: undefined
  [IPC_CHANNELS.sessionsRefresh]: undefined
  [IPC_CHANNELS.sessionsStop]: string
  [IPC_CHANNELS.sessionsCancelRecovery]: string
  [IPC_CHANNELS.settingsUpdate]: Partial<AppSettings>
  [IPC_CHANNELS.authGetSession]: undefined
  [IPC_CHANNELS.authSignIn]: AuthCredentialsInput
  [IPC_CHANNELS.authSignUp]: AuthSignUpInput
  [IPC_CHANNELS.authSignOut]: undefined
  [IPC_CHANNELS.billingRefresh]: undefined
  [IPC_CHANNELS.updatesCheck]: undefined
  [IPC_CHANNELS.updatesDownload]: undefined
  [IPC_CHANNELS.updatesInstall]: undefined
  [IPC_CHANNELS.windowMinimize]: undefined
  [IPC_CHANNELS.windowToggleMaximize]: undefined
  [IPC_CHANNELS.windowIsMaximized]: undefined
  [IPC_CHANNELS.windowClose]: undefined
}

declare global {
  interface Window {
    valdor: ValdorApi
  }
}

export type { ValdorApi }
