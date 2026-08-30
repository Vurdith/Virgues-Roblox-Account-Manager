import type { AuthCredentialsInput, AuthSignUpInput, VirgueAuthSession, VirgueUser } from '../shared/types'
import { SecretStore } from './secret-store'

// This is a public Neon Auth endpoint, not a database credential. The session
// cookie returned by it is kept in the encrypted SecretStore below.
const NEON_AUTH_URL = 'https://ep-morning-frost-zagg2ox8.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth'
// Electron calls Neon Auth from the main process rather than from a browser
// page, so fetch does not provide an Origin header automatically. Neon Auth
// uses this trusted origin to resolve the default relative callback safely.
const NEON_AUTH_ORIGIN = new URL(NEON_AUTH_URL).origin
const SESSION_SECRET_KEY = 'virgue-neon-auth-session'

interface JsonRecord {
  [key: string]: unknown
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function authError(payload: unknown, status: number): Error {
  if (isRecord(payload)) {
    const nested = isRecord(payload.error) ? payload.error : null
    const message = stringValue(payload.message) ?? stringValue(payload.error) ?? (nested ? stringValue(nested.message) : null)
    if (message) return new Error(message)
  }

  if (status === 401) return new Error('The email or password is incorrect.')
  if (status === 409) return new Error('An account with that email already exists.')
  return new Error(`Account service returned HTTP ${status}.`)
}

export class AuthService {
  private readonly cookies = new Map<string, string>()

  constructor(private readonly secrets: SecretStore) {}

  async initialize(): Promise<void> {
    try {
      const stored = this.secrets.get(SESSION_SECRET_KEY)
      if (stored) this.loadCookieHeader(stored)
    } catch {
      this.cookies.clear()
    }
  }

  async getSession(): Promise<VirgueAuthSession | null> {
    const payload = await this.request('/get-session', { method: 'GET' })
    const envelope = isRecord(payload) && isRecord(payload.data) ? payload.data : payload
    if (!isRecord(envelope) || !isRecord(envelope.user) || !isRecord(envelope.session)) {
      if (this.cookies.size > 0) await this.clearSession()
      return null
    }

    return this.toSession(envelope.user, envelope.session)
  }

  /**
   * Returns the short-lived Neon Auth JWT for server-to-server verification
   * only. It is deliberately never exposed through IPC.
   */
  async getSessionToken(): Promise<string | null> {
    const payload = await this.request('/token', { method: 'GET' })
    const envelope = isRecord(payload) && isRecord(payload.data) ? payload.data : payload
    if (!isRecord(envelope)) return null
    return stringValue(envelope.token)
  }

  async signIn(input: AuthCredentialsInput): Promise<VirgueAuthSession> {
    this.validateCredentials(input)
    await this.request('/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: input.email.trim().toLowerCase(), password: input.password }),
    })
    const session = await this.getSession()
    if (!session) throw new Error('Sign-in succeeded, but the session could not be established.')
    return session
  }

  async signUp(input: AuthSignUpInput): Promise<VirgueAuthSession> {
    this.validateCredentials(input)
    const name = input.name.trim()
    if (name.length < 2) throw new Error('Enter a name with at least two characters.')

    await this.request('/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ name, email: input.email.trim().toLowerCase(), password: input.password }),
    })
    const session = await this.getSession()
    if (!session) throw new Error('Your account was created, but sign-in still needs to be completed.')
    return session
  }

  async signOut(): Promise<void> {
    try {
      await this.request('/sign-out', { method: 'POST' })
    } finally {
      await this.clearSession()
    }
  }

  private validateCredentials(input: AuthCredentialsInput): void {
    const email = input.email.trim()
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.')
    if (input.password.length < 8) throw new Error('Your password must be at least eight characters.')
  }

  private async request(path: string, init: { method: 'GET' | 'POST'; body?: string }): Promise<unknown> {
    let response: Response
    try {
      response = await fetch(`${NEON_AUTH_URL}${path}`, {
        method: init.method,
        headers: {
          Accept: 'application/json',
          Origin: NEON_AUTH_ORIGIN,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(this.cookieHeader() ? { Cookie: this.cookieHeader() } : {}),
        },
        body: init.body,
      })
    } catch {
      throw new Error('Virgue could not reach the account service. Check your internet connection and try again.')
    }

    await this.captureCookies(response)
    const text = await response.text()
    let payload: unknown = null
    if (text) {
      try { payload = JSON.parse(text) as unknown } catch { payload = null }
    }
    if (!response.ok) throw authError(payload, response.status)
    return payload
  }

  private toSession(userPayload: JsonRecord, sessionPayload: JsonRecord): VirgueAuthSession {
    const id = stringValue(userPayload.id)
    const email = stringValue(userPayload.email)
    const name = stringValue(userPayload.name)
    const expiresAt = stringValue(sessionPayload.expiresAt)
    if (!id || !email || !name || !expiresAt) throw new Error('The account service returned an incomplete session.')

    const user: VirgueUser = {
      id,
      name,
      email,
      emailVerified: userPayload.emailVerified === true,
      image: stringValue(userPayload.image),
    }
    return { user, expiresAt }
  }

  private cookieHeader(): string {
    return Array.from(this.cookies.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
  }

  private loadCookieHeader(header: string): void {
    this.cookies.clear()
    for (const part of header.split(';')) {
      const separator = part.indexOf('=')
      if (separator <= 0) continue
      const name = part.slice(0, separator).trim()
      const value = part.slice(separator + 1).trim()
      if (name && value) this.cookies.set(name, value)
    }
  }

  private async captureCookies(response: Response): Promise<void> {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] }
    const setCookies = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (headers.get('set-cookie') ? [headers.get('set-cookie')!] : [])

    for (const header of setCookies) {
      const pair = header.split(';', 1)[0] ?? ''
      const separator = pair.indexOf('=')
      if (separator <= 0) continue
      const name = pair.slice(0, separator).trim()
      const value = pair.slice(separator + 1).trim()
      if (!value || /(?:^|;)\s*max-age=0/i.test(header) || /expires=Thu, 01 Jan 1970/i.test(header)) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }

    const header = this.cookieHeader()
    if (header) await this.secrets.set(SESSION_SECRET_KEY, header)
    else await this.secrets.remove(SESSION_SECRET_KEY)
  }

  private async clearSession(): Promise<void> {
    this.cookies.clear()
    await this.secrets.remove(SESSION_SECRET_KEY)
  }
}
