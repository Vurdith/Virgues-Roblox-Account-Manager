import { createHash, createHmac, randomBytes } from 'node:crypto'
import type {
  IsolatedWorkerCommandInput,
  IsolatedWorkerCommandResult,
  IsolatedWorkerConnectionInput,
  IsolatedWorkerSnapshot,
} from '../shared/types'

const REQUEST_TIMEOUT_MS = 6000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function responseError(response: Response): Promise<Error> {
  try {
    const payload: unknown = await response.json()
    if (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim()) return new Error(payload.error)
  } catch {
    // Fall through to the HTTP status when the worker did not return JSON.
  }
  return new Error(`The isolated worker returned HTTP ${response.status}.`)
}

export class InputWorkerClient {
  async getSessions(input: IsolatedWorkerConnectionInput): Promise<IsolatedWorkerSnapshot> {
    return this.request<IsolatedWorkerSnapshot>(input, '/worker/sessions')
  }

  async sendInput(input: IsolatedWorkerCommandInput): Promise<IsolatedWorkerCommandResult> {
    return this.request<IsolatedWorkerCommandResult>(input, '/worker/input', {
      method: 'POST',
      body: JSON.stringify({ sessionId: input.sessionId, key: input.key, durationMs: input.durationMs }),
    })
  }

  private async request<T>(input: IsolatedWorkerConnectionInput, route: string, init: RequestInit = {}): Promise<T> {
    const endpoint = this.normalizeEndpoint(input.endpoint)
    const password = input.password.trim()
    if (!password) throw new Error('Enter the isolated worker password.')

    const requestUrl = new URL(`${endpoint}${route}`)
    const body = typeof init.body === 'string' ? init.body : ''
    const timestamp = String(Date.now())
    const nonce = randomBytes(16).toString('hex')
    const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex')
    const method = (init.method ?? 'GET').toUpperCase()
    const signature = createHmac('sha256', password)
      .update(`${timestamp}\n${nonce}\n${method}\n${requestUrl.pathname}\n${bodyHash}`, 'utf8')
      .digest('hex')

    let response: Response
    try {
      response = await fetch(requestUrl, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...init.headers,
          'X-Virgue-Timestamp': timestamp,
          'X-Virgue-Nonce': nonce,
          'X-Virgue-Signature': signature,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      const detail = error instanceof Error && error.name === 'TimeoutError'
        ? 'The isolated worker did not respond in time.'
        : 'Virgue could not reach that isolated worker. Check its address, firewall, and Web API settings.'
      throw new Error(detail)
    }
    if (!response.ok) throw await responseError(response)
    return response.json() as Promise<T>
  }

  private normalizeEndpoint(value: string): string {
    const raw = value.trim()
    if (!raw) throw new Error('Enter the isolated worker address.')
    let parsed: URL
    try { parsed = new URL(raw) } catch { throw new Error('Use a full worker address such as http://192.168.1.40:7963.') }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('The worker address must use HTTP or HTTPS.')
    if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Keep credentials, query text, and fragments out of the worker address.')
    parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    return parsed.toString().replace(/\/$/, '')
  }
}
