export type PlanKey = 'free' | 'pro'

export interface PlanEntitlements {
  planKey: PlanKey
  displayName: string
  /** Maximum number of unique Roblox accounts in the local workspace. */
  maxAccounts: number | null
  /** Maximum number of game collections in the local workspace. */
  maxGames: number | null
  /** Whether the plan can launch the visible account set in one action. */
  bulkLaunch: boolean
}

export const DEFAULT_PLAN_KEY: PlanKey = 'free'

const PLAN_ENTITLEMENTS: Record<PlanKey, PlanEntitlements> = {
  free: {
    planKey: 'free',
    displayName: 'Free plan',
    maxAccounts: 2,
    maxGames: 2,
    bulkLaunch: false,
  },
  pro: {
    planKey: 'pro',
    displayName: 'Virgue Pro',
    maxAccounts: null,
    maxGames: null,
    bulkLaunch: true,
  },
}

export function getPlanEntitlements(planKey: PlanKey = DEFAULT_PLAN_KEY): PlanEntitlements {
  return { ...PLAN_ENTITLEMENTS[planKey] }
}

export function getPlanLimitError(entitlements: PlanEntitlements, resource: 'accounts' | 'games'): string {
  const limit = resource === 'accounts' ? entitlements.maxAccounts : entitlements.maxGames
  if (limit === null) return ''
  const label = resource === 'accounts'
    ? limit === 1 ? 'unique Roblox account' : 'unique Roblox accounts'
    : limit === 1 ? 'game collection' : 'game collections'
  return `${entitlements.displayName} includes up to ${limit} ${label}. Remove one before adding another.`
}

export function getPlanFeatureError(entitlements: PlanEntitlements, feature: 'bulk-launch'): string {
  if (feature === 'bulk-launch' && !entitlements.bulkLaunch) return `Bulk launch is available with Virgue Pro. Launch accounts individually on the ${entitlements.displayName}.`
  return ''
}
