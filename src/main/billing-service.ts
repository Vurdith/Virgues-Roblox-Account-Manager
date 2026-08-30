import { DEFAULT_PLAN_KEY, getPlanEntitlements, type PlanKey, type PlanEntitlements } from '../shared/entitlements'
import { AccountStore } from './account-store'
import { AuthService } from './auth-service'

const BILLING_API_URL = (process.env.VIRGUE_BILLING_API_URL || 'https://virgues-roblox-account-manager.vercel.app/api').replace(/\/$/, '')

function planKeyFrom(value: unknown): PlanKey {
  return value === 'pro' ? 'pro' : DEFAULT_PLAN_KEY
}

function errorFrom(response: Response): Promise<Error> {
  return response.json().then((payload: unknown) => {
    const outer = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const nested = outer.error && typeof outer.error === 'object' ? outer.error as Record<string, unknown> : {}
    const message = typeof nested.message === 'string' ? nested.message : typeof outer.message === 'string' ? outer.message : `Billing returned HTTP ${response.status}.`
    return new Error(message)
  }).catch(() => new Error(`Billing returned HTTP ${response.status}.`))
}

/** Keeps Electron feature gates aligned with the entitlement resolved by Stripe + Neon. */
export class BillingService {
  constructor(private readonly store: AccountStore, private readonly auth: AuthService) {}

  async refreshEntitlements(): Promise<PlanEntitlements> {
    if (!BILLING_API_URL) return getPlanEntitlements(DEFAULT_PLAN_KEY)
    const token = await this.auth.getSessionToken()
    if (!token) {
      this.store.setPlanKey(DEFAULT_PLAN_KEY)
      return getPlanEntitlements(DEFAULT_PLAN_KEY)
    }

    const response = await fetch(`${BILLING_API_URL}/billing/me`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw await errorFrom(response)
    const payload = await response.json() as { planKey?: unknown }
    const planKey = planKeyFrom(payload.planKey)
    this.store.setPlanKey(planKey)
    return getPlanEntitlements(planKey)
  }

  reset(): void {
    this.store.setPlanKey(DEFAULT_PLAN_KEY)
  }
}
