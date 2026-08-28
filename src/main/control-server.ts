import { WebSocket, WebSocketServer } from 'ws'
import type { IncomingMessage } from 'node:http'
import { URL } from 'node:url'
import type { ControlAccount, ControlCommand, ControlCommandInput, ControlSettings } from '../shared/types'
import { AccountStore } from './account-store'
import { RobloxClient } from './roblox-client'

type ControlPayload = Record<string, string>

interface ControlMessage {
  Name?: string
  Payload?: ControlPayload
}

export class ControlServer {
  private server: WebSocketServer | null = null
  private readonly clients = new Map<string, WebSocket>()
  private relaunchTimer: NodeJS.Timeout | null = null
  private readonly relaunching = new Set<string>()

  constructor(private readonly store: AccountStore, private readonly roblox: RobloxClient) {}

  async start(): Promise<ControlAccount[]> {
    if (this.server) return this.store.startControl()
    const settings = this.store.getControl()
    const host = settings.allowExternalConnections ? '0.0.0.0' : '127.0.0.1'
    const server = new WebSocketServer({ host, port: settings.port })
    server.on('connection', (socket, request) => this.handleConnection(socket, request))
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => { server.off('listening', onListening); reject(error) }
      const onListening = () => { server.off('error', onError); resolve() }
      server.once('error', onError)
      server.once('listening', onListening)
    })
    this.server = server
    await this.store.updateControl({ enabled: true })
    this.store.startControl()
    this.relaunchTimer = setInterval(() => { void this.tryAutoRelaunch() }, 10000)
    return this.store.getSnapshot().controlAccounts
  }

  async stop(): Promise<void> {
    if (this.relaunchTimer) clearInterval(this.relaunchTimer)
    this.relaunchTimer = null
    this.relaunching.clear()
    for (const socket of this.clients.values()) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close(1000, 'Control server stopped')
    }
    this.clients.clear()
    const server = this.server
    this.server = null
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    this.store.stopControl()
    await this.store.updateControl({ enabled: false })
  }

  async update(input: Partial<ControlSettings>): Promise<ControlSettings> {
    const wasRunning = Boolean(this.server)
    if (wasRunning && (input.port !== undefined || input.allowExternalConnections !== undefined)) await this.stop()
    const settings = await this.store.updateControl(input)
    if (wasRunning) await this.start()
    return this.store.getControl().enabled ? this.store.getControl() : settings
  }

  async send(input: ControlCommandInput): Promise<ControlCommand> {
    const command = await this.store.addControlCommand(input)
    const targetIds = input.target === 'all'
      ? [...this.clients.keys()]
      : [input.target]
    const message = `${input.command.trim()}${input.payload?.trim() ? ` ${input.payload.trim()}` : ''}`
    for (const accountId of targetIds) {
      const socket = this.clients.get(accountId)
      if (socket?.readyState === WebSocket.OPEN) socket.send(message)
    }
    return command
  }

  async dispose(): Promise<void> {
    await this.stop()
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    const username = requestUrl.searchParams.get('name')?.trim() ?? ''
    const userId = requestUrl.searchParams.get('id')?.trim() ?? ''
    const jobId = requestUrl.searchParams.get('jobId')?.trim() ?? ''
    const account = this.store.getAccounts().find((candidate) => candidate.username.toLowerCase() === username.toLowerCase() || (userId && candidate.userId === userId))
    if (!account || !username || !userId) {
      socket.close(1008, 'Account is not registered with Virgue')
      return
    }
    const previous = this.clients.get(account.id)
    if (previous && previous !== socket) previous.close(1000, 'Replaced by a new connection')
    this.clients.set(account.id, socket)
    void this.store.updateControlAccount(account.id, { connected: true, jobId, placeId: account.placeId, lastMessage: 'Control client connected' })
    socket.on('message', (data) => this.handleMessage(account.id, data.toString()))
    socket.on('close', () => {
      if (this.clients.get(account.id) === socket) {
        this.clients.delete(account.id)
        void this.store.updateControlAccount(account.id, { connected: false, lastMessage: 'Control client disconnected' })
      }
    })
    socket.on('error', () => undefined)
  }

  private handleMessage(accountId: string, raw: string): void {
    let message: ControlMessage
    try { message = JSON.parse(raw) as ControlMessage } catch { return }
    const name = message.Name ?? ''
    const payload = message.Payload ?? {}
    const lastMessage = name === 'Log' ? payload.Content ?? 'Control client log received' : name === 'ping' ? 'Control client ping' : `${name}${payload.Content ? `: ${payload.Content}` : ''}`
    const update: Partial<ControlAccount> = { lastMessage }
    if (payload.JobId || (name === 'SetJobId' && payload.Content)) update.jobId = payload.JobId ?? payload.Content
    if (payload.PlaceId || (name === 'SetPlaceId' && payload.Content)) update.placeId = payload.PlaceId ?? payload.Content
    if (name === 'SetRelaunch') {
      const seconds = Number(payload.Seconds ?? payload.Content)
      if (Number.isFinite(seconds)) update.relaunchAt = new Date(Date.now() + Math.max(1, seconds) * 1000).toISOString()
    }
    if (name === 'SetAutoRelaunch' && payload.Content) {
      update.autoRelaunch = payload.Content.toLowerCase() === 'true'
      if (!update.autoRelaunch) update.relaunchAt = null
    }
    void this.store.updateControlAccount(accountId, update)
  }

  private async tryAutoRelaunch(): Promise<void> {
    if (!this.server) return
    const now = Date.now()
    for (const control of this.store.getSnapshot().controlAccounts) {
      if (!control.autoRelaunch || control.connected || !control.relaunchAt || Date.parse(control.relaunchAt) > now || this.relaunching.has(control.accountId)) continue
      this.relaunching.add(control.accountId)
      try {
        const account = this.store.getAccount(control.accountId)
        const placeId = control.placeId || account.placeId
        if (!placeId) throw new Error('No relaunch Place ID is configured.')
        await this.store.updateControlAccount(control.accountId, { relaunchAt: new Date(Date.now() + 1800 * 1000).toISOString(), lastMessage: 'Auto-relaunch requested' })
        await this.roblox.launch(account.id, placeId, control.jobId || account.jobId)
      } catch (error) {
        await this.store.updateControlAccount(control.accountId, { relaunchAt: new Date(Date.now() + 60 * 1000).toISOString(), lastMessage: error instanceof Error ? `Auto-relaunch failed: ${error.message}` : 'Auto-relaunch failed' })
      } finally {
        this.relaunching.delete(control.accountId)
      }
    }
  }
}
