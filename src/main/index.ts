import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { AccountStore } from './account-store'
import { AuthService } from './auth-service'
import { ControlServer } from './control-server'
import { registerIpcHandlers } from './ipc'
import { RobloxClient } from './roblox-client'
import { SecretStore } from './secret-store'
import { SessionGuardian } from './session-guardian'
import { WatcherService } from './watcher'
import { WebApiService } from './web-api'

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
    title: "Virgue's Roblox Account Manager",
    icon: join(__dirname, '../renderer/virgue-icon.png'),
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

app.setAppUserModelId('com.virgue.robloxaccountmanager')

app.whenReady().then(async () => {
  const store = new AccountStore(app, shell)
  const secrets = new SecretStore(app)
  await store.initialize()
  await secrets.initialize()
  const auth = new AuthService(secrets)
  await auth.initialize()
  app.setLoginItemSettings({ openAtLogin: store.getSnapshot().settings.runOnStartup })
  const sessions = new SessionGuardian(store, app.getPath('userData'))
  await sessions.initialize()
  const roblox = new RobloxClient(store, secrets, shell, sessions)
  sessions.setPresenceResolver((userId) => roblox.getPresence(userId))
  sessions.setRecoveryLauncher((job) => roblox.launch(job.accountId, job.placeId, job.jobId, undefined, undefined, job.id))
  sessions.start()
  roblox.startBackgroundTasks()
  const control = new ControlServer(store, roblox)
  const webApi = new WebApiService(store, roblox, secrets)
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
  registerIpcHandlers({ store, roblox, webApi, watcher, sessions, control, secrets, auth, getWindow: () => mainWindow })

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'notifications')
  })
  createWindow()

  app.on('before-quit', () => { void Promise.all([webApi.dispose(), control.dispose(), watcher.dispose()]); sessions.dispose(); roblox.dispose() })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((error: unknown) => {
  console.error('Virgue account manager failed to start', error)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
