import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { URL } from 'node:url'
import type { Account, WebApiSettings, WebApiUpdateInput } from '../shared/types'
import { AccountStore } from './account-store'
import { RobloxClient } from './roblox-client'
import { SecretStore } from './secret-store'

export class WebApiService {
  private server: Server | null = null
  private password = ''

  constructor(private readonly store: AccountStore, private readonly roblox: RobloxClient, private readonly secrets: SecretStore) {}

  async update(input: WebApiUpdateInput): Promise<WebApiSettings> {
    const current = this.store.getWebApi()
    const wasRunning = Boolean(this.server)
    const endpointChanged = wasRunning && ((input.port !== undefined && input.port !== current.port) || (input.allowExternalConnections !== undefined && input.allowExternalConnections !== current.allowExternalConnections))
    if (input.password !== undefined) {
      this.password = input.password
      await this.secrets.set('web-api-password', input.password)
      await this.store.updateWebApi({ passwordSet: Boolean(input.password) })
    }
    const { password: _password, ...settings } = input
    if (endpointChanged) await this.stop()
    const enabled = input.enabled ?? (endpointChanged ? true : current.enabled)
    const next = await this.store.updateWebApi({ ...settings, enabled })
    if (next.enabled) await this.start()
    else await this.stop()
    return this.store.getWebApi()
  }

  async start(): Promise<WebApiSettings> {
    if (this.server) return this.store.getWebApi()
    const settings = this.store.getWebApi()
    if (settings.requirePassword && !this.password) {
      try { this.password = this.secrets.get('web-api-password') ?? '' } catch { this.password = '' }
    }
    this.server = createServer((request, response) => { void this.handle(request, response) })
    const host = settings.allowExternalConnections ? '0.0.0.0' : '127.0.0.1'
    try {
      await new Promise<void>((resolve, reject) => {
      const server = this.server
      if (!server) return reject(new Error('Web API server was not created.'))
        const onError = (error: Error) => {
          server.removeListener('listening', onListening)
          reject(error)
        }
        const onListening = () => {
          server.removeListener('error', onError)
          resolve()
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(settings.port, host)
      })
    } catch (error) {
      const failedServer = this.server
      this.server = null
      failedServer?.close()
      throw error
    }
    await this.store.updateWebApi({ enabled: true })
    return this.store.getWebApi()
  }

  async stop(): Promise<WebApiSettings> {
    const server = this.server
    this.server = null
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await this.store.updateWebApi({ enabled: false })
    return this.store.getWebApi()
  }

  async dispose(): Promise<void> {
    await this.stop()
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (!this.isAuthorized(request, url)) return this.send(response, 401, { error: 'Unauthorized' })
      if (request.method === 'GET' && url.pathname === '/accounts') {
        if (!this.store.getWebApi().allowGetAccounts) return this.send(response, 403, { error: 'Account listing is disabled.' })
        return this.send(response, 200, { accounts: this.store.getSnapshot().accounts.map((account) => this.publicAccount(account)) })
      }
      if (request.method === 'GET' && url.pathname === '/cookie') {
        if (!this.store.getWebApi().allowGetCookie) return this.send(response, 403, { error: 'Cookie access is disabled.' })
        const id = url.searchParams.get('id') ?? ''
        const cookie = this.secrets.get(id)
        return cookie ? this.send(response, 200, { cookie }) : this.send(response, 404, { error: 'Credential not found.' })
      }
      if (request.method === 'POST' && url.pathname === '/launch') {
        if (!this.store.getWebApi().allowLaunchAccount) return this.send(response, 403, { error: 'Account launching is disabled.' })
        const body = await this.readBody(request)
        const payload = JSON.parse(body) as { accountId?: string; placeId?: string; jobId?: string; vipLink?: string }
        if (!payload.accountId) return this.send(response, 400, { error: 'accountId is required.' })
        const result = await this.roblox.launch(payload.accountId, payload.placeId ?? '', payload.jobId ?? '', payload.vipLink)
        return this.send(response, 200, result)
      }
      if (request.method === 'PATCH' && url.pathname.startsWith('/accounts/')) {
        if (!this.store.getWebApi().allowAccountEditing) return this.send(response, 403, { error: 'Account editing is disabled.' })
        const id = url.pathname.split('/')[2] ?? ''
        const body = await this.readBody(request)
        const account = await this.store.update(id, JSON.parse(body))
        return this.send(response, 200, { account: this.publicAccount(account) })
      }
      return this.send(response, 404, { error: 'Route not found.' })
    } catch (error) {
      return this.send(response, 500, { error: error instanceof Error ? error.message : 'Web API request failed.' })
    }
  }

  private isAuthorized(request: IncomingMessage, url: URL): boolean {
    const settings = this.store.getWebApi()
    if (!settings.requirePassword) return true
    const supplied = request.headers['x-virgue-password'] ?? url.searchParams.get('password') ?? ''
    return supplied === this.password && Boolean(this.password)
  }

  private publicAccount(account: Account): Omit<Account, 'hasCredentials'> & { hasCredentials: boolean } {
    return { ...account, hasCredentials: account.hasCredentials }
  }

  private async readBody(request: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    return Buffer.concat(chunks).toString('utf8')
  }

  private send(response: ServerResponse, status: number, data: unknown): void {
    response.statusCode = status
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify(data))
  }

}
