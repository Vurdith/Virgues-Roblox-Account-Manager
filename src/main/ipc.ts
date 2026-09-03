import { app, clipboard, ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import type { AccountTransferInput, AppSettings, AuthCredentialsInput, AuthSignUpInput, BackgroundInputCommandInput, ClientSettingsUpdateInput, ControlCommandInput, ControlSettings, IsolatedWorkerCommandInput, IsolatedWorkerConnectionInput, JoinServerInput, ServerQuery, UpdateAccountInput, UpdateGameInput, WebApiUpdateInput, WatcherUpdateInput } from '../shared/types'
import { AccountStore } from './account-store'
import { AuthService } from './auth-service'
import { BillingService } from './billing-service'
import { BackgroundInputService } from './background-input'
import { ControlServer } from './control-server'
import { InputWorkerClient } from './input-worker-client'
import { SecretStore } from './secret-store'
import { SessionGuardian } from './session-guardian'
import { RobloxClient } from './roblox-client'
import { WatcherService } from './watcher'
import { WebApiService } from './web-api'
import { UpdateService } from './update-service'

interface IpcServices {
  store: AccountStore
  roblox: RobloxClient
  webApi: WebApiService
  watcher: WatcherService
  sessions: SessionGuardian
  control: ControlServer
  inputWorkerClient: InputWorkerClient
  backgroundInput: BackgroundInputService
  secrets: SecretStore
  auth: AuthService
  billing: BillingService
  updates: UpdateService
  getWindow: () => BrowserWindow | null
}

export function registerIpcHandlers(services: IpcServices): void {
  const { store, roblox, webApi, watcher, sessions, control, inputWorkerClient, backgroundInput, secrets, auth, billing, updates, getWindow } = services
  ipcMain.handle(IPC_CHANNELS.appGetSnapshot, () => store.getSnapshot())
  ipcMain.handle(IPC_CHANNELS.appImportData, async () => { await store.importData(); return store.getSnapshot() })
  ipcMain.handle(IPC_CHANNELS.appOpenDataFolder, () => store.openDataFolder())
  ipcMain.handle(IPC_CHANNELS.appExportData, () => store.exportData())
  ipcMain.handle(IPC_CHANNELS.appOpenExternal, (_event, url: string) => store.openExternal(url))
  ipcMain.handle(IPC_CHANNELS.appCopyText, (_event, text: string) => { clipboard.writeText(text); return { message: 'Value copied to the clipboard.' } })

  ipcMain.handle(IPC_CHANNELS.accountsCreate, (_event, input) => store.create(input))
  ipcMain.handle(IPC_CHANNELS.accountsRemove, async (_event, id: string) => { await store.remove(id); await secrets.remove(id); await secrets.remove(`${id}:password`) })
  ipcMain.handle(IPC_CHANNELS.accountsUpdate, (_event, payload: { id: string; input: UpdateAccountInput }) => store.update(payload.id, payload.input))
  ipcMain.handle(IPC_CHANNELS.accountsTransfer, async (_event, input: AccountTransferInput) => {
    const result = await store.transfer(input)
    if (input.mode === 'duplicate') {
      for (const transfer of result.transfers) {
        await secrets.copy(transfer.sourceId, transfer.account.id)
        await secrets.copy(`${transfer.sourceId}:password`, `${transfer.account.id}:password`)
      }
    }
    return result
  })
  ipcMain.handle(IPC_CHANNELS.accountsLaunch, (_event, payload: { id: string; target: { placeId: string; jobId: string } }) => roblox.launch(payload.id, payload.target.placeId, payload.target.jobId))
  ipcMain.handle(IPC_CHANNELS.accountsLaunchMany, (_event, input) => roblox.launchMany(input))
  ipcMain.handle(IPC_CHANNELS.accountsLogin, (_event, input) => roblox.login(input))
  ipcMain.handle(IPC_CHANNELS.accountsImportCookie, (_event, input) => roblox.importCookie(input))
  ipcMain.handle(IPC_CHANNELS.accountsBulkImport, (_event, input) => roblox.bulkImport(input))
  ipcMain.handle(IPC_CHANNELS.accountsKillAllRoblox, () => roblox.killAllRoblox())
  ipcMain.handle(IPC_CHANNELS.accountsVerify, (_event, id: string) => roblox.verify(id))
  ipcMain.handle(IPC_CHANNELS.accountsOpenBrowser, (_event, payload) => roblox.openBrowser(payload.id, payload.options))
  ipcMain.handle(IPC_CHANNELS.accountsCopy, (_event, payload) => roblox.copy(payload.id, payload.kind))
  ipcMain.handle(IPC_CHANNELS.accountsUtility, (_event, input) => roblox.utility(input))
  ipcMain.handle(IPC_CHANNELS.accountsQuickLogin, (_event, input) => roblox.quickLogin(input.accountId, input.code))

  ipcMain.handle(IPC_CHANNELS.gamesCreate, (_event, input) => store.createGame(input))
  ipcMain.handle(IPC_CHANNELS.gamesUpdate, (_event, payload: { id: string; input: UpdateGameInput }) => store.updateGame(payload.id, payload.input))
  ipcMain.handle(IPC_CHANNELS.gamesRemove, (_event, id: string) => store.removeGame(id))
  ipcMain.handle(IPC_CHANNELS.gamesCreateCategory, (_event, payload) => store.createCategory(payload.gameId, payload.input))
  ipcMain.handle(IPC_CHANNELS.gamesUpdateCategory, (_event, payload) => store.updateCategory(payload.gameId, payload.categoryId, payload.input))
  ipcMain.handle(IPC_CHANNELS.gamesRemoveCategory, (_event, payload) => store.removeCategory(payload.gameId, payload.categoryId))
  ipcMain.handle(IPC_CHANNELS.gamesSearch, (_event, query: string) => roblox.searchGames(query))
  ipcMain.handle(IPC_CHANNELS.gamesToggleFavorite, (_event, id: string) => store.toggleFavoriteGame(id))
  ipcMain.handle(IPC_CHANNELS.gamesRefreshInfo, (_event, id: string) => roblox.refreshGameInfo(id))

  ipcMain.handle(IPC_CHANNELS.serversList, (_event, query: ServerQuery) => roblox.listServers(query))
  ipcMain.handle(IPC_CHANNELS.serversJoin, (_event, input: JoinServerInput) => roblox.joinServer(input))
  ipcMain.handle(IPC_CHANNELS.serversLoadRegion, (_event, payload: { placeId: string; serverId: string; accountId?: string }) => roblox.loadRegion(payload.placeId, payload.serverId, payload.accountId))

  ipcMain.handle(IPC_CHANNELS.toolsSearchPlayer, (_event, username: string) => roblox.searchPlayer(username))
  ipcMain.handle(IPC_CHANNELS.toolsGetUniverse, (_event, placeId: string) => roblox.getUniverse(placeId))
  ipcMain.handle(IPC_CHANNELS.toolsGetOutfit, (_event, userId: string) => roblox.getOutfit(userId))
  ipcMain.handle(IPC_CHANNELS.toolsApplyFpsSettings, (_event, input: ClientSettingsUpdateInput) => roblox.applyFpsSettings(input))
  ipcMain.handle(IPC_CHANNELS.toolsOpenRecentGame, async (_event, id: string) => {
    const recent = store.getSnapshot().recentGames.find((game) => game.id === id)
    if (!recent) return null
    const accountId = store.getSnapshot().accounts[0]?.id
    if (!accountId) return null
    return roblox.launch(accountId, recent.placeId, recent.jobId)
  })
  ipcMain.handle(IPC_CHANNELS.toolsAddRecentGame, async (_event, input) => {
    const recent = store.addRecentGame(input)
    await store.setRecentGames([recent, ...store.getSnapshot().recentGames.filter((game) => game.id !== recent.id)])
    return recent
  })

  ipcMain.handle(IPC_CHANNELS.controlStart, () => control.start())
  ipcMain.handle(IPC_CHANNELS.controlStop, () => control.stop())
  ipcMain.handle(IPC_CHANNELS.controlSend, (_event, input: ControlCommandInput) => control.send(input))
  ipcMain.handle(IPC_CHANNELS.controlSetAutoRelaunch, (_event, payload: { accountId: string; enabled: boolean; seconds?: number }) => store.setControlAutoRelaunch(payload.accountId, payload.enabled, payload.seconds))
  ipcMain.handle(IPC_CHANNELS.controlUpdate, (_event, input: Partial<ControlSettings>) => control.update(input))

  ipcMain.handle(IPC_CHANNELS.webApiUpdate, (_event, input: WebApiUpdateInput) => webApi.update(input))
  ipcMain.handle(IPC_CHANNELS.webApiStart, () => webApi.start())
  ipcMain.handle(IPC_CHANNELS.webApiStop, () => webApi.stop())
  const assertIsolatedWorkerAccess = () => {
    if (!store.getSnapshot().entitlements.isolatedWorkerInput) {
      throw new Error('Isolated worker controls are available with Virgue Pro.')
    }
  }
  ipcMain.handle(IPC_CHANNELS.isolatedWorkerGetSessions, (_event, input: IsolatedWorkerConnectionInput) => {
    assertIsolatedWorkerAccess()
    return inputWorkerClient.getSessions(input)
  })
  ipcMain.handle(IPC_CHANNELS.isolatedWorkerSendInput, (_event, input: IsolatedWorkerCommandInput) => {
    assertIsolatedWorkerAccess()
    return inputWorkerClient.sendInput(input)
  })
  ipcMain.handle(IPC_CHANNELS.backgroundInputGetSessions, () => backgroundInput.getSnapshot())
  ipcMain.handle(IPC_CHANNELS.backgroundInputSend, (_event, input: BackgroundInputCommandInput) => backgroundInput.send(input))
  ipcMain.handle(IPC_CHANNELS.watcherUpdate, (_event, input: WatcherUpdateInput) => watcher.update(input))
  ipcMain.handle(IPC_CHANNELS.watcherCheck, () => watcher.check())

  ipcMain.handle(IPC_CHANNELS.sessionsGetSnapshot, () => sessions.getSnapshot())
  ipcMain.handle(IPC_CHANNELS.sessionsRefresh, () => sessions.refresh())
  ipcMain.handle(IPC_CHANNELS.sessionsStop, (_event, sessionId: string) => sessions.stop(sessionId))
  ipcMain.handle(IPC_CHANNELS.sessionsCancelRecovery, (_event, jobId: string) => sessions.cancelRecovery(jobId))
  sessions.subscribe((event) => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(IPC_CHANNELS.sessionsEvent, event)
  })

  ipcMain.handle(IPC_CHANNELS.settingsUpdate, async (_event, input: Partial<AppSettings>) => {
    if (input.multiInstance !== undefined) await roblox.updateMultiInstance(input.multiInstance)
    const settings = await store.updateSettings(input)
    app.setLoginItemSettings({ openAtLogin: settings.runOnStartup })
    return settings
  })

  ipcMain.handle(IPC_CHANNELS.authGetSession, () => auth.getSession())
  ipcMain.handle(IPC_CHANNELS.authSignIn, async (_event, input: AuthCredentialsInput) => {
    const session = await auth.signIn(input)
    try { await billing.refreshEntitlements() } catch { billing.reset() }
    return session
  })
  ipcMain.handle(IPC_CHANNELS.authSignUp, async (_event, input: AuthSignUpInput) => {
    const session = await auth.signUp(input)
    try { await billing.refreshEntitlements() } catch { billing.reset() }
    return session
  })
  ipcMain.handle(IPC_CHANNELS.authSignOut, async () => { await auth.signOut(); billing.reset() })
  ipcMain.handle(IPC_CHANNELS.billingRefresh, () => billing.refreshEntitlements())
  ipcMain.handle(IPC_CHANNELS.updatesCheck, () => updates.check())
  ipcMain.handle(IPC_CHANNELS.updatesDownload, () => updates.download())
  ipcMain.handle(IPC_CHANNELS.updatesInstall, () => updates.install())

  ipcMain.handle(IPC_CHANNELS.windowMinimize, () => getWindow()?.minimize())
  ipcMain.handle(IPC_CHANNELS.windowToggleMaximize, () => {
    const window = getWindow()
    if (!window) return false
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return window.isMaximized()
  })
  ipcMain.handle(IPC_CHANNELS.windowIsMaximized, () => getWindow()?.isMaximized() ?? false)
  ipcMain.handle(IPC_CHANNELS.windowClose, () => getWindow()?.close())
}
