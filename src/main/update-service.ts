import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC_CHANNELS } from '../shared/ipc'
import type { AppUpdateEvent } from '../shared/types'

const INITIAL_CHECK_DELAY_MS = 15_000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The update service returned an unknown error.'
}

/**
 * Keeps update discovery in the privileged process. The renderer only gets a
 * small, display-safe event and never receives updater configuration details.
 */
export class UpdateService {
  private initialized = false
  private checkPromise: Promise<AppUpdateEvent> | null = null
  private downloadPromise: Promise<AppUpdateEvent> | null = null
  private checkTimer: NodeJS.Timeout | null = null
  private current: AppUpdateEvent = { state: 'not-available' }

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  initialize(): void {
    if (this.initialized) return
    this.initialized = true
    if (!this.isSupported()) return

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false
    autoUpdater.on('checking-for-update', this.handleChecking)
    autoUpdater.on('update-available', this.handleAvailable)
    autoUpdater.on('update-not-available', this.handleNotAvailable)
    autoUpdater.on('download-progress', this.handleDownloadProgress)
    autoUpdater.on('update-downloaded', this.handleDownloaded)
    autoUpdater.on('error', this.handleError)

    this.checkTimer = setTimeout(() => {
      this.checkTimer = null
      void this.check()
    }, INITIAL_CHECK_DELAY_MS)
  }

  async check(): Promise<AppUpdateEvent> {
    if (!this.isSupported()) return this.emit({ state: 'not-available' })
    if (this.checkPromise) return this.checkPromise

    this.checkPromise = (async () => {
      this.emit({ state: 'checking' })
      try {
        const result = await autoUpdater.checkForUpdates()
        if (result?.updateInfo && this.current.state === 'checking') {
          this.emit({ state: 'available', version: result.updateInfo.version })
        } else if (!result?.updateInfo && this.current.state === 'checking') {
          this.emit({ state: 'not-available' })
        }
        return this.current
      } catch (error) {
        console.warn('Virgue update check failed.', error)
        return this.emit({ state: 'error', message: errorMessage(error) })
      } finally {
        this.checkPromise = null
      }
    })()

    return this.checkPromise
  }

  async download(): Promise<AppUpdateEvent> {
    if (!this.isSupported()) return this.emit({ state: 'not-available' })
    if (this.downloadPromise) return this.downloadPromise
    if (this.current.state !== 'available' || !this.current.version) {
      throw new Error('There is no update ready to download.')
    }

    this.emit({ state: 'downloading', version: this.current.version, percent: 0 })
    this.downloadPromise = (async () => {
      try {
        await autoUpdater.downloadUpdate()
        if (this.current.state !== 'downloaded') {
          this.emit({ state: 'downloaded', version: this.current.version })
        }
        return this.current
      } catch (error) {
        console.warn('Virgue update download failed.', error)
        return this.emit({ state: 'error', message: errorMessage(error) })
      } finally {
        this.downloadPromise = null
      }
    })()

    return this.downloadPromise
  }

  install(): void {
    if (!this.isSupported()) return
    if (this.current.state !== 'downloaded') throw new Error('The update has not finished downloading.')
    autoUpdater.quitAndInstall(false, true)
  }

  dispose(): void {
    if (this.checkTimer) clearTimeout(this.checkTimer)
    this.checkTimer = null
    if (!this.initialized || !this.isSupported()) return
    autoUpdater.removeListener('checking-for-update', this.handleChecking)
    autoUpdater.removeListener('update-available', this.handleAvailable)
    autoUpdater.removeListener('update-not-available', this.handleNotAvailable)
    autoUpdater.removeListener('download-progress', this.handleDownloadProgress)
    autoUpdater.removeListener('update-downloaded', this.handleDownloaded)
    autoUpdater.removeListener('error', this.handleError)
  }

  private isSupported(): boolean {
    return app.isPackaged && process.platform === 'win32'
  }

  private emit(event: AppUpdateEvent): AppUpdateEvent {
    this.current = event
    const window = this.getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(IPC_CHANNELS.updatesEvent, event)
    return event
  }

  private handleChecking = (): void => { this.emit({ state: 'checking' }) }

  private handleAvailable = (info: { version: string }): void => {
    this.emit({ state: 'available', version: info.version })
  }

  private handleNotAvailable = (): void => { this.emit({ state: 'not-available' }) }

  private handleDownloadProgress = (progress: { percent: number }): void => {
    this.emit({ state: 'downloading', version: this.current.version, percent: Math.round(progress.percent) })
  }

  private handleDownloaded = (info: { version: string }): void => {
    this.emit({ state: 'downloaded', version: info.version })
  }

  private handleError = (error: Error): void => {
    console.warn('Virgue updater error.', error)
    this.emit({ state: 'error', message: errorMessage(error) })
  }
}
