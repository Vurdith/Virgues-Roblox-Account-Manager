import { app, BrowserWindow, powerMonitor, session, shell } from 'electron'
import { join } from 'node:path'
import { AccountStore } from './account-store'
import { AuthService } from './auth-service'
import { BillingService } from './billing-service'
import { BackgroundInputService } from './background-input'
import { AutoHotkeyService } from './autohotkey-service'
import { AhkAiService } from './ahk-ai-service'
import { ControlServer } from './control-server'
import { InputWorkerClient } from './input-worker-client'
import { InputWorkerService } from './input-worker'
import { ProtectedSessionService } from './protected-session'
import { registerIpcHandlers } from './ipc'
import { RobloxClient } from './roblox-client'
import { SecretStore } from './secret-store'
import { SessionGuardian } from './session-guardian'
import { WatcherService } from './watcher'
import { WebApiService } from './web-api'
import { UpdateService } from './update-service'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#e9e7df',
    title: "Valdor | A Roblox Account Manager",
    icon: join(__dirname, '../renderer/valdor-icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://www.roblox.com/')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('https://www.roblox.com/')) event.preventDefault()
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setAppUserModelId('com.valdor.robloxaccountmanager')

app.whenReady().then(async () => {
  const store = new AccountStore(app, shell)
  const secrets = new SecretStore(app)
  await store.initialize()
  await secrets.initialize()
  const auth = new AuthService(secrets)
  await auth.initialize()
  const billing = new BillingService(store, auth)
  const updates = new UpdateService(() => mainWindow)
  updates.initialize()
  try {
    await billing.refreshEntitlements()
  } catch (error) {
    console.warn('Billing entitlements could not be refreshed at startup.', error)
  }
  app.setLoginItemSettings({ openAtLogin: store.getSnapshot().settings.runOnStartup })
  const sessions = new SessionGuardian(store, app.getPath('userData'))
  await sessions.initialize()
  const protectedSession = new ProtectedSessionService(store)
  const roblox = new RobloxClient(store, secrets, shell, sessions)
  roblox.setProtectedSession(protectedSession)
  sessions.setPresenceResolver((userId) => roblox.getPresence(userId))
  sessions.setRecoveryLauncher((job) => roblox.launch(job.accountId, job.placeId, job.jobId, undefined, undefined, job.id))
  sessions.start()
  roblox.startBackgroundTasks()
  const control = new ControlServer(store, roblox)
  const inputWorker = new InputWorkerService(store, sessions)
  const inputWorkerClient = new InputWorkerClient()
  const backgroundInput = new BackgroundInputService(store, protectedSession)
  const autoHotkey = new AutoHotkeyService(protectedSession)
  const ahkAi = new AhkAiService()
  const webApi = new WebApiService(store, roblox, secrets, inputWorker)

  powerMonitor.on('resume', () => {
    const snapshot = store.getSnapshot()
    if (!snapshot.settings.protectedSessionEnabled || !snapshot.entitlements.isolatedWorkerInput) return
    void protectedSession.recoverAfterResume().catch((error) => {
      console.warn('Protected Session could not recover after Windows resumed.', error)
    })
  })

  if (store.getWebApi().enabled) {
    try {
      await webApi.start()
    } catch (error) {
      console.warn('Saved Web API settings could not be started.', error)
      await store.updateWebApi({ enabled: false })
    }
  }
  const watcher = new WatcherService(store)
  watcher.start()
  if (store.getControl().autoStart) void control.start()
  if (store.getSnapshot().settings.protectedSessionEnabled && store.getSnapshot().entitlements.isolatedWorkerInput) {
    void protectedSession.start().catch((error) => console.warn('Protected Session could not start automatically.', error))
  }
  registerIpcHandlers({ store, roblox, webApi, watcher, sessions, control, inputWorkerClient, backgroundInput, protectedSession, autoHotkey, ahkAi, secrets, auth, billing, updates, getWindow: () => mainWindow })

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'notifications')
  })
  createWindow()

  app.on('before-quit', () => { updates.dispose(); backgroundInput.dispose(); ahkAi.dispose(); void Promise.all([webApi.dispose(), control.dispose(), watcher.dispose(), protectedSession.dispose()]); sessions.dispose(); roblox.dispose() })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((error: unknown) => {
  console.error("Valdor | A Roblox Account Manager failed to start", error)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
