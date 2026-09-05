import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { URL } from 'node:url'
import type { Account, IsolatedWorkerInputKey, WebApiSettings, WebApiUpdateInput } from '../shared/types'
import { AccountStore } from './account-store'
import { InputWorkerService } from './input-worker'
import { RobloxClient } from './roblox-client'
import { SecretStore } from './secret-store'

export class WebApiService {
  private server: Server | null = null
  private password = ''
  private readonly workerNonces = new Map<string, number>()

  constructor(
    private readonly store: AccountStore,
    private readonly roblox: RobloxClient,
    private readonly secrets: SecretStore,
    private readonly inputWorker: InputWorkerService,
  ) {}

  async update(input: WebApiUpdateInput): Promise<WebApiSettings> {
    const current = this.store.getWebApi()
    const wasRunning = Boolean(this.server)
    const endpointChanged = wasRunning && ((input.port !== undefined && input.port !== current.port) || (input.allowExternalConnections !== undefined && input.allowExternalConnections !== current.allowExternalConnections))
    const suppliedPassword = input.password?.trim()
    const passwordSet = input.password === undefined ? current.passwordSet : Boolean(suppliedPassword)
    const requirePassword = input.requirePassword ?? current.requirePassword
    const allowSessionInput = input.allowSessionInput ?? current.allowSessionInput
    const effectivePassword = input.password === undefined ? this.loadPassword() : suppliedPassword ?? ''
    if (input.password !== undefined && input.password.length > 128) throw new Error('The Web API password must be 128 characters or fewer.')
    if (allowSessionInput && (!requirePassword || !passwordSet)) {
      throw new Error('Isolated worker input requires a saved Web API password and Require password enabled.')
    }
    if (allowSessionInput && effectivePassword.length < 12) {
      throw new Error('Use a Web API password with at least 12 characters for isolated worker input.')
    }
    if (input.password !== undefined) {
      this.password = suppliedPassword ?? ''
      if (this.password) await this.secrets.set('web-api-password', this.password)
      else await this.secrets.remove('web-api-password')
      await this.store.updateWebApi({ passwordSet })
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
      this.password = this.loadPassword()
    }
    if (settings.allowSessionInput && (!settings.requirePassword || this.password.length < 12)) {
      throw new Error('Isolated worker input requires password protection with a password of at least 12 characters.')
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
      const workerRoute = url.pathname.startsWith('/worker/')
      let workerBody = ''
      if (workerRoute) {
        if (!this.store.getWebApi().allowSessionInput) return this.send(response, 403, { error: 'Isolated worker input is disabled on this installation.' })
        if (request.method === 'POST') workerBody = await this.readBody(request)
        if (!this.isWorkerAuthorized(request, url, workerBody)) return this.send(response, 401, { error: 'The isolated worker signature was rejected. Check the password and system clocks.' })
      } else if (!this.isAuthorized(request, url)) {
        return this.send(response, 401, { error: 'Unauthorized' })
      }
      if (request.method === 'GET' && url.pathname === '/worker/health') {
        return this.send(response, 200, { ok: true, service: 'valdor-isolated-worker' })
      }
      if (request.method === 'GET' && url.pathname === '/worker/sessions') {
        return this.send(response, 200, await this.inputWorker.getSnapshot())
      }
      if (request.method === 'POST' && url.pathname === '/worker/input') {
        const payload: unknown = JSON.parse(workerBody)
        if (!payload || typeof payload !== 'object') return this.send(response, 400, { error: 'A worker input command is required.' })
        const command = payload as { sessionId?: unknown; key?: unknown; durationMs?: unknown }
        if (typeof command.sessionId !== 'string' || typeof command.key !== 'string' || typeof command.durationMs !== 'number') {
          return this.send(response, 400, { error: 'sessionId, key, and durationMs are required.' })
        }
        const result = await this.inputWorker.send({ sessionId: command.sessionId, key: command.key as IsolatedWorkerInputKey, durationMs: command.durationMs })
        return this.send(response, 200, result)
      }
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
    const headerValue = this.headerValue(request, 'x-valdor-password') || this.headerValue(request, 'x-virgue-password')
    const supplied = headerValue || url.searchParams.get('password') || ''
    if (!supplied || !this.password) return false
    const suppliedBytes = Buffer.from(supplied, 'utf8')
    const expectedBytes = Buffer.from(this.password, 'utf8')
    return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes)
  }

  private isWorkerAuthorized(request: IncomingMessage, url: URL, body: string): boolean {
    if (!this.store.getWebApi().requirePassword || !this.password) return false
    const timestamp = this.headerValue(request, 'x-valdor-timestamp') || this.headerValue(request, 'x-virgue-timestamp')
    const nonce = this.headerValue(request, 'x-valdor-nonce') || this.headerValue(request, 'x-virgue-nonce')
    const suppliedSignature = (this.headerValue(request, 'x-valdor-signature') || this.headerValue(request, 'x-virgue-signature')).toLowerCase()
    const parsedTimestamp = Number(timestamp)
    const now = Date.now()
    if (!Number.isFinite(parsedTimestamp) || Math.abs(now - parsedTimestamp) > 60_000) return false
    if (!/^[a-f0-9]{32}$/i.test(nonce) || !/^[a-f0-9]{64}$/.test(suppliedSignature)) return false

    for (const [seenNonce, expiresAt] of this.workerNonces) {
      if (expiresAt <= now) this.workerNonces.delete(seenNonce)
    }
    if (this.workerNonces.has(nonce)) return false

    if (this.workerNonces.size >= 4096) {
      const oldestNonce = this.workerNonces.keys().next().value as string | undefined
      if (oldestNonce) this.workerNonces.delete(oldestNonce)
    }

    const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex')
    const method = (request.method ?? 'GET').toUpperCase()
    const expectedSignature = createHmac('sha256', this.password)
      .update(`${timestamp}\n${nonce}\n${method}\n${url.pathname}\n${bodyHash}`, 'utf8')
      .digest('hex')
    const suppliedBytes = Buffer.from(suppliedSignature, 'hex')
    const expectedBytes = Buffer.from(expectedSignature, 'hex')
    if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return false
    this.workerNonces.set(nonce, now + 60_000)
    return true
  }

  private headerValue(request: IncomingMessage, name: string): string {
    const value = request.headers[name]
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
  }

  private loadPassword(): string {
    if (this.password) return this.password
    try { return this.secrets.get('web-api-password')?.trim() ?? '' } catch { return '' }
  }

  private publicAccount(account: Account): Omit<Account, 'hasCredentials'> & { hasCredentials: boolean } {
    return { ...account, hasCredentials: account.hasCredentials }
  }

  private async readBody(request: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
      const buffer = Buffer.from(chunk)
      size += buffer.length
      if (size > 16 * 1024) throw new Error('The Web API request body is too large.')
      chunks.push(buffer)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  private send(response: ServerResponse, status: number, data: unknown): void {
    response.statusCode = status
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.end(JSON.stringify(data))
  }

}
