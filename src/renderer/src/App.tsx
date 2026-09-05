import { createElement, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type {
  Account,
  AccountTransferInput,
  AccountTransferMode,
  AccountUtilityInput,
  AccountUtilityResult,
  AccountCopyKind,
  AuthCredentialsInput,
  AuthSignUpInput,
  AppSettings,
  AppSnapshot,
  BackgroundInputSnapshot,
  CategoryIcon,
  ControlAccount,
  ControlSettings,
  GameCollection,
  GameSearchResult,
  OutfitPreview,
  PlayerLookup,
  RecentGame,
  RecoveryJob,
  RobloxLoginInput,
  ServerRecord,
  ServerFilterCriteria,
  ServerFinderState,
  ServerFilterPreset,
  SessionEvent,
  SessionRecord,
  SessionSnapshot,
  UniverseInfo,
  WatcherUpdateInput,
  WatcherSettings,
  WebApiUpdateInput,
  WebApiSettings,
  UpdateAccountInput,
  UpdateCategoryInput,
  PlanEntitlements,
  ProtectedSessionStatus,
  ValdorAuthSession,
  AppUpdateEvent,
  AutoHotkeySnapshot,
  AhkAiGenerationResult,
  AhkAiStatus,
} from '@shared/types'
import { getPlanEntitlements, getPlanFeatureError, getPlanLimitError } from '@shared/entitlements'
import { registerAccountMenuElement, type ValdorAccountMenuElement } from '@shared/account-menu'
import { Icon, type IconName } from './components/Icons'
import AccountView from './AccountView'
import { ThinkingOrb, type OrbState } from 'thinking-orbs'

type View = 'accounts' | 'games' | 'sessions' | 'servers' | 'utilities' | 'control' | 'activity' | 'settings'
type ActivityTone = 'normal' | 'positive' | 'warning'
type SettingsTab = 'features' | 'privacy' | 'billing'

registerAccountMenuElement()

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; description: string; icon: IconName }> = [
  { id: 'features', label: 'App features', description: 'Workspace, watcher, and Roblox controls', icon: 'spark' },
  { id: 'privacy', label: 'Privacy & security', description: 'Local data and integration access', icon: 'shield' },
  { id: 'billing', label: 'Billing', description: 'Plan and subscription access', icon: 'coins' },
]

const SETTINGS_TAB_CONTENT: Record<SettingsTab, { title: string; description: string }> = {
  features: { title: 'Tune the workspace', description: 'Set how Valdor launches Roblox, watches clients, and applies client defaults.' },
  privacy: { title: 'Keep integrations contained', description: 'Choose which local API routes are available and when another device may connect.' },
  billing: { title: 'Your plan and capacity', description: 'See what your current plan includes and how much of the workspace you are using.' },
}

const DEFAULT_ENTITLEMENTS = getPlanEntitlements()
const PRICING_URL = 'https://valdor-roblox-account-manager.vercel.app/pricing.html'

interface ActivityItem { id: number; message: string; detail: string; tone: ActivityTone }

interface MultiInstanceChangeResult { ok: boolean; requiresClientShutdown: boolean; message: string }

const EMPTY_SESSION_SNAPSHOT: SessionSnapshot = { active: [], history: [], events: [], recoveryJobs: [], checkedAt: '' }

const STATUS_LABELS: Record<Account['status'], string> = { ready: 'Ready', idle: 'Idle', running: 'Running', offline: 'Offline' }
const STATUS_ORDER: Account['status'][] = ['running', 'ready', 'idle', 'offline']

function formatCount(value: number, singular: string, plural = `${singular}s`): string { return `${value} ${value === 1 ? singular : plural}` }

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return 'Never checked'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'Unknown time'
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatRetryTime(value: string): string {
  const remaining = Math.max(0, Date.parse(value) - Date.now())
  if (remaining < 1000) return 'starting now'
  const seconds = Math.ceil(remaining / 1000)
  if (seconds < 60) return `in ${seconds}s`
  const minutes = Math.ceil(seconds / 60)
  return `in ${minutes}m`
}

function formatMetric(value: number): string { return value.toLocaleString() }

function userFacingError(caught: unknown, fallback: string): string {
  const message = caught instanceof Error ? caught.message : fallback
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim() || fallback
}

function getInitials(account: Account): string {
  const source = account.alias || account.username
  return source.split(/\s|_/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'VR'
}

function accountIdentityKey(account: Account): string {
  // A duplicated profile can have one fresh userId record and one older
  // record without it. Username is the stable display key for both rows, so
  // the workspace never renders the same Roblox account twice.
  return account.username.trim() ? `username:${account.username.trim().toLowerCase()}` : `user:${account.userId?.trim() ?? account.id}`
}

function accountFreshnessScore(account: Account): number {
  let score = 0
  if (account.presence?.type === 'in-game') score += 100
  if (account.status === 'running') score += 50
  if (account.jobId) score += 20
  if (account.hasCredentials) score += 10
  if (account.placeId) score += 2
  return score
}

function accountFreshnessTime(account: Account): number {
  return Math.max(
    account.presenceCheckedAt ? Date.parse(account.presenceCheckedAt) : 0,
    account.lastUsed ? Date.parse(account.lastUsed) : 0,
    account.lastVerified ? Date.parse(account.lastVerified) : 0,
  )
}

const RECENT_ACCOUNT_WINDOW_MS = 2 * 60 * 60 * 1000

function isAccountRecentlyUsed(account: Account, now = Date.now()): boolean {
  if (!account.lastUsed) return false
  const lastUsed = Date.parse(account.lastUsed)
  return Number.isFinite(lastUsed) && lastUsed <= now && now - lastUsed <= RECENT_ACCOUNT_WINDOW_MS
}

function accountPriority(account: Account): number {
  if (account.favorite) return 0
  if (isAccountRecentlyUsed(account)) return 1
  return 2
}

function uniqueAccounts(accounts: Account[]): Account[] {
  const unique = new Map<string, Account>()
  accounts.forEach((account) => {
    const key = accountIdentityKey(account)
    const current = unique.get(key)
    if (!current || accountFreshnessScore(account) > accountFreshnessScore(current) || (accountFreshnessScore(account) === accountFreshnessScore(current) && accountFreshnessTime(account) > accountFreshnessTime(current))) {
      unique.set(key, account)
    }
  })
  return [...unique.values()]
}

function uniqueRecentGames(recentGames: RecentGame[]): RecentGame[] {
  const unique = new Map<string, RecentGame>()
  recentGames.forEach((game) => {
    const key = game.placeId.trim()
    if (!key) return
    const current = unique.get(key)
    if (!current || Date.parse(game.lastOpened) >= Date.parse(current.lastOpened)) unique.set(key, game)
  })
  return [...unique.values()].sort((left, right) => Date.parse(right.lastOpened) - Date.parse(left.lastOpened))
}

const CATEGORY_ICON_OPTIONS: Array<{ name: CategoryIcon; label: string }> = [
  { name: 'chest', label: 'Chest' },
  { name: 'box', label: 'Box' },
  { name: 'archive', label: 'Archive' },
  { name: 'swords', label: 'Fighters' },
  { name: 'target', label: 'Target' },
  { name: 'gem', label: 'Gem' },
  { name: 'coins', label: 'Coins' },
  { name: 'gift', label: 'Gift' },
  { name: 'flame', label: 'Flame' },
  { name: 'map', label: 'Map' },
  { name: 'shield', label: 'Shield' },
  { name: 'star', label: 'Star' },
  { name: 'users', label: 'Users' },
  { name: 'wrench', label: 'Tools' },
  { name: 'spark', label: 'Spark' },
  { name: 'folder', label: 'Folder' },
]

function useMotionReveal<T extends HTMLElement>(delay = 0) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    node.style.setProperty('--motion-delay', `${delay}ms`)
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (reducedMotion || !('IntersectionObserver' in window)) {
      node.classList.add('motion-visible')
      return
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('motion-visible')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })

    observer.observe(node)
    return () => observer.disconnect()
  }, [delay])

  return ref
}

function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [sessionSnapshot, setSessionSnapshot] = useState<SessionSnapshot>(EMPTY_SESSION_SNAPSHOT)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedGameId, setSelectedGameId] = useState<string>('all')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
  const [activeView, setActiveView] = useState<View>('accounts')
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<'status' | 'name' | 'last-used' | 'sessions'>('status')
  const [showCookieImport, setShowCookieImport] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(true)
  const [error, setError] = useState('')
  const [authSession, setAuthSession] = useState<ValdorAuthSession | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [appUpdate, setAppUpdate] = useState<AppUpdateEvent | null>(null)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [launchingAccountId, setLaunchingAccountId] = useState<string | null>(null)
  const [launchingMany, setLaunchingMany] = useState(false)
  const launchingAccountRef = useRef<string | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([
    { id: 1, message: 'Workspace ready', detail: 'Local profile data is loaded', tone: 'positive' },
    { id: 2, message: 'No sensitive data stored', detail: 'Cookies and passwords stay out of this build until you import them', tone: 'normal' },
  ])

  const accounts = snapshot?.accounts ?? []
  const games = snapshot?.games ?? []
  const entitlements = snapshot?.entitlements ?? DEFAULT_ENTITLEMENTS
  const selectedAccount = accounts.find((account) => account.id === selectedId) ?? null
  const selectedGame = games.find((game) => game.id === selectedGameId) ?? null
  const uniqueWorkspaceAccounts = useMemo(() => uniqueAccounts(accounts), [accounts])
  const lastUsedAccount = useMemo(() => uniqueWorkspaceAccounts.reduce<Account | null>((latest, account) => {
    const currentTime = account.lastUsed ? Date.parse(account.lastUsed) : 0
    const latestTime = latest?.lastUsed ? Date.parse(latest.lastUsed) : 0
    return currentTime > latestTime ? account : latest
  }, null), [uniqueWorkspaceAccounts])
  const accountLimitReached = entitlements.maxAccounts !== null && uniqueWorkspaceAccounts.length >= entitlements.maxAccounts
  const gameLimitReached = entitlements.maxGames !== null && games.length >= entitlements.maxGames
  const activeSessionAccountIds = useMemo(() => new Set(sessionSnapshot.active.map((session) => session.accountId)), [sessionSnapshot.active])
  const runningAccounts = useMemo(() => uniqueAccounts(accounts.filter((account) => activeSessionAccountIds.has(account.id))), [accounts, activeSessionAccountIds])
  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase()
    const visible = accounts
      .filter((account) => selectedGameId === 'all' || account.gameId === selectedGameId)
      .filter((account) => selectedCategoryId === 'all' || account.categoryId === selectedCategoryId)
      .filter((account) => !query || [account.username, account.alias, account.description, account.displayName].some((value) => value.toLowerCase().includes(query)))
    return uniqueAccounts(visible).sort((a, b) => {
      const priorityDifference = accountPriority(a) - accountPriority(b)
      if (priorityDifference !== 0) return priorityDifference
      if (sortMode === 'name') return a.username.localeCompare(b.username)
      if (sortMode === 'last-used') return (b.lastUsed ? Date.parse(b.lastUsed) : 0) - (a.lastUsed ? Date.parse(a.lastUsed) : 0) || a.username.localeCompare(b.username)
      if (sortMode === 'sessions') return b.sessions - a.sessions || a.username.localeCompare(b.username)
      return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.username.localeCompare(b.username)
    })
  }, [accounts, search, selectedCategoryId, selectedGameId, sortMode])

  const loadSnapshot = async () => {
    setIsLoading(true)
    try {
      const [nextSnapshot, nextSessions, maximized] = await Promise.all([window.valdor.app.getSnapshot(), window.valdor.sessions.getSnapshot(), window.valdor.window.isMaximized()])
      setSnapshot(nextSnapshot)
      setSessionSnapshot(nextSessions)
      setIsMaximized(maximized)
      setSelectedId((current) => current && nextSnapshot.accounts.some((account) => account.id === current) ? current : nextSnapshot.accounts[0]?.id ?? null)
      setSelectedGameId((current) => current === 'all' || nextSnapshot.games.some((game) => game.id === current) ? current : 'all')
      setError('')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The workspace could not be loaded.') } finally { setIsLoading(false) }
  }

  useEffect(() => { void loadSnapshot() }, [])

  useEffect(() => {
    void window.valdor.auth.getSession().then((session) => {
      setAuthSession(session)
      setAuthError('')
    }).catch((caught: unknown) => {
      setAuthSession(null)
      setAuthError(caught instanceof Error ? caught.message : 'Your account session could not be restored.')
    }).finally(() => setAuthLoading(false))
  }, [])

  useEffect(() => {
    const unsubscribe = window.valdor.updates.onEvent((event) => setAppUpdate(event))
    void window.valdor.updates.check().catch(() => {
      // The updater reports a user-safe error event when a packaged check fails.
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = window.valdor.sessions.onEvent(() => {
      void window.valdor.sessions.getSnapshot().then(setSessionSnapshot).catch(() => {
        // Keep the last known session registry when a renderer refresh is unavailable.
      })
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void Promise.all([window.valdor.app.getSnapshot(), window.valdor.sessions.getSnapshot()]).then(([nextSnapshot, nextSessions]) => {
        setSnapshot(nextSnapshot)
        setSessionSnapshot(nextSessions)
        setSelectedId((current) => current && nextSnapshot.accounts.some((account) => account.id === current) ? current : nextSnapshot.accounts[0]?.id ?? null)
        setSelectedGameId((current) => current === 'all' || nextSnapshot.games.some((game) => game.id === current) ? current : 'all')
      }).catch(() => {
        // Keep the last known state when a background refresh is unavailable.
      })
    }, 5000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!authSession) return
    const refreshBilling = () => {
      void window.valdor.billing.refresh()
        .then(() => window.valdor.app.getSnapshot())
        .then(setSnapshot)
        .catch(() => {
          // Keep the last known entitlement when billing is temporarily unavailable.
        })
    }
    const timer = window.setInterval(refreshBilling, 30_000)
    window.addEventListener('focus', refreshBilling)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshBilling)
    }
  }, [authSession?.user.id])

  const pushActivity = (message: string, detail: string, tone: ActivityTone = 'normal') => setActivity((current) => [{ id: Date.now(), message, detail, tone }, ...current].slice(0, 40))
  const setErrorFrom = (caught: unknown, fallback: string) => setError(userFacingError(caught, fallback))
  const updateSnapshot = (next: AppSnapshot) => setSnapshot(next)
  const updateAccount = (updated: Account) => setSnapshot((current) => current ? { ...current, accounts: current.accounts.map((account) => account.id === updated.id ? updated : account) } : current)
  const updateGame = (updated: GameCollection) => setSnapshot((current) => current ? { ...current, games: current.games.map((game) => game.id === updated.id ? updated : game) } : current)
  const handleCopyText = async (text: string): Promise<boolean> => {
    if (!text) return false
    try {
      const result = await window.valdor.app.copyText(text)
      pushActivity('Copied to clipboard', result.message, 'positive')
      return true
    } catch (caught) {
      setErrorFrom(caught, 'The value could not be copied.')
      return false
    }
  }

  const handleAuthSignIn = async (input: AuthCredentialsInput): Promise<void> => {
    setAuthBusy(true)
    setAuthError('')
    try {
      const session = await window.valdor.auth.signIn(input)
      setAuthSession(session)
      setSnapshot(await window.valdor.app.getSnapshot())
      setActiveView('accounts')
      setIsAccountMenuOpen(false)
      pushActivity(`Signed in as ${session.user.name}`, 'Account connected for subscriptions', 'positive')
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : 'Account sign-in failed.')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleAuthSignUp = async (input: AuthSignUpInput): Promise<void> => {
    setAuthBusy(true)
    setAuthError('')
    try {
      const session = await window.valdor.auth.signUp(input)
      setAuthSession(session)
      setSnapshot(await window.valdor.app.getSnapshot())
      setActiveView('accounts')
      setIsAccountMenuOpen(false)
      pushActivity('Account created', 'Account identity is ready for subscriptions', 'positive')
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : 'Account creation failed.')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleAuthSignOut = async (): Promise<void> => {
    setAuthBusy(true)
    setAuthError('')
    try {
      await window.valdor.auth.signOut()
      setAuthSession(null)
      setSnapshot(await window.valdor.app.getSnapshot())
      setActiveView('accounts')
      setIsAccountMenuOpen(false)
      pushActivity('Signed out of account', 'Sign in again to reopen the workspace', 'normal')
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : 'Account sign-out failed.')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleLogin = async (input: RobloxLoginInput): Promise<void> => {
    setError('')
    pushActivity('Roblox sign-in opened', 'Finish signing in in the separate Roblox window')
    try {
      const account = await window.valdor.accounts.login(input)
      setSnapshot((current) => current ? { ...current, accounts: current.accounts.some((item) => item.id === account.id) ? current.accounts.map((item) => item.id === account.id ? account : item) : [...current.accounts, account] } : current)
      setSelectedId(account.id)
      pushActivity(`Connected ${account.username}`, 'Roblox session stored with Windows secure storage', 'positive')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Roblox sign-in failed.'
      if (/cancelled/i.test(message)) pushActivity('Roblox sign-in cancelled', 'No account was added', 'warning')
      else setError(message)
    }
  }

  const handleAddAccount = () => {
    if (accountLimitReached) {
      setError(getPlanLimitError(entitlements, 'accounts'))
      setActiveView('accounts')
      return
    }
    void handleLogin({})
  }

  const handleRemoveAccount = async () => {
    if (!selectedAccount) return
    try {
      await window.valdor.accounts.remove(selectedAccount.id)
      const nextAccounts = accounts.filter((account) => account.id !== selectedAccount.id)
      setSnapshot((current) => current ? { ...current, accounts: nextAccounts } : current)
      setSelectedId(nextAccounts[0]?.id ?? null)
      pushActivity(`Removed ${selectedAccount.username}`, 'Profile deleted from local storage', 'warning')
    } catch (caught) { setErrorFrom(caught, 'The profile could not be removed.') }
  }

  const handleAccountUpdate = async (input: UpdateAccountInput) => {
    if (!selectedAccount) return
    try {
      const updated = await window.valdor.accounts.update(selectedAccount.id, input)
      updateAccount(updated)
      pushActivity(`Saved ${updated.alias || updated.username}`, 'Profile details updated', 'positive')
    } catch (caught) { setErrorFrom(caught, 'The profile could not be updated.') }
  }

  const handleAccountFavoriteToggle = async (accountId: string) => {
    const account = accounts.find((candidate) => candidate.id === accountId)
    if (!account) return
    try {
      const updated = await window.valdor.accounts.update(accountId, { favorite: !account.favorite })
      updateAccount(updated)
      pushActivity(updated.favorite ? `Favourited ${updated.alias || updated.username}` : `Unfavourited ${updated.alias || updated.username}`, updated.favorite ? 'Pinned above recently used profiles' : 'Removed from the priority shelf', 'positive')
    } catch (caught) { setErrorFrom(caught, 'The favourite could not be saved.') }
  }

  const handleAccountTransfer = async (input: AccountTransferInput): Promise<boolean> => {
    try {
      const result = await window.valdor.accounts.transfer(input)
      const transferred = result.transfers.map((transfer) => transfer.account)
      const bySource = new Map(result.transfers.map((transfer) => [transfer.sourceId, transfer.account]))
      setSnapshot((current) => {
        if (!current) return current
        return {
          ...current,
          accounts: result.mode === 'duplicate' ? [...current.accounts, ...transferred] : current.accounts.map((account) => bySource.get(account.id) ?? account),
        }
      })
      pushActivity(`${result.mode === 'duplicate' ? 'Duplicated' : 'Moved'} ${formatCount(transferred.length, 'profile')}`, `Destination: ${games.find((game) => game.id === input.gameId)?.name ?? 'selected game'}`, 'positive')
      return true
    } catch (caught) {
      setErrorFrom(caught, 'The profiles could not be transferred.')
      return false
    }
  }

  const handleAccountUtility = async (input: AccountUtilityInput, redirectToActivity = true): Promise<AccountUtilityResult | null> => {
    try {
      const result = await window.valdor.accounts.utility(input)
      pushActivity(result.message, 'Account utility completed', result.ok ? 'positive' : 'warning')
      // Utility actions can update persisted account identity, balances, or
      // credentials. Refresh the snapshot after every successful action so
      // the selected profile and the modal always reflect the backend result.
      if (result.ok) {
        if (redirectToActivity) await loadSnapshot()
        else setSnapshot(await window.valdor.app.getSnapshot())
      }
      if (redirectToActivity) setActiveView('activity')
      return result
    } catch (caught) {
      setErrorFrom(caught, 'Account utility failed.')
      return null
    }
  }

  const handleLaunch = async (placeId: string, jobId: string, vipLink?: string, followUserId?: string, accountIdOverride?: string, serverContext?: { gameId: string }): Promise<boolean> => {
    const launchAccount = accountIdOverride ? accounts.find((account) => account.id === accountIdOverride) ?? null : selectedAccount
    if (!launchAccount || launchingAccountRef.current === launchAccount.id) return false
    const accountId = launchAccount.id
    launchingAccountRef.current = accountId
    setLaunchingAccountId(accountId)
    try {
      const result = followUserId || vipLink || serverContext ? await window.valdor.servers.join({ accountId, placeId, jobId, vipLink, followUserId, gameId: serverContext?.gameId }) : await window.valdor.accounts.launch(accountId, { placeId, jobId })
      updateAccount(result.account)
      pushActivity(`Launched Roblox for ${result.account.alias || result.account.username}`, `Place ${result.account.placeId || placeId} opened with this account`, 'positive')
      return true
    } catch (caught) {
      const message = userFacingError(caught, 'Roblox could not be launched for this account.')
      if (/reconnect this profile/i.test(message)) {
        try { setSnapshot(await window.valdor.app.getSnapshot()) } catch { /* Keep the current workspace if refresh also fails. */ }
      }
      setError(message)
      return false
    } finally {
      if (launchingAccountRef.current === accountId) launchingAccountRef.current = null
      setLaunchingAccountId((current) => current === accountId ? null : current)
    }
  }

  const handleLaunchMany = async (targets: Array<{ accountId: string; placeId?: string; jobId?: string }>) => {
    if (!entitlements.bulkLaunch) {
      setError(getPlanFeatureError(entitlements, 'bulk-launch'))
      return
    }
    if (launchingMany || targets.length === 0) return
    setLaunchingMany(true)
    try {
      const results = await window.valdor.accounts.launchMany({ targets })
      results.forEach((result) => updateAccount(result.account))
      pushActivity(`Launched ${results.length} profiles`, snapshot?.settings.asyncJoin ? 'Async launching enabled' : `Launch delay ${snapshot?.settings.launchDelay ?? 0}s`, 'positive')
    } catch (caught) {
      const message = userFacingError(caught, 'The profiles could not be launched.')
      if (/reconnect this profile/i.test(message)) {
        try { setSnapshot(await window.valdor.app.getSnapshot()) } catch { /* Keep the current workspace if refresh also fails. */ }
      }
      setError(message)
    } finally { setLaunchingMany(false) }
  }
  const handleImport = async () => {
    try {
      const imported = await window.valdor.app.importData()
      updateSnapshot(imported)
      setSelectedId(imported.accounts[0]?.id ?? null)
      pushActivity('Import complete', `${formatCount(imported.accounts.length, 'profile')} in the workspace`, 'positive')
    } catch (caught) { setErrorFrom(caught, 'Import failed.') }
  }

  const handleSetting = async (input: Partial<AppSettings>, announce = true) => {
    try {
      const settings = await window.valdor.settings.update(input)
      setSnapshot((current) => current ? { ...current, settings } : current)
      if (announce) pushActivity('Settings saved', 'Workspace preferences updated', 'positive')
    } catch (caught) { setErrorFrom(caught, 'Settings could not be saved.') }
  }

  const handleMultiInstanceSetting = async (enabled: boolean): Promise<MultiInstanceChangeResult> => {
    try {
      const settings = await window.valdor.settings.update({ multiInstance: enabled })
      setSnapshot((current) => current ? { ...current, settings } : current)
      setError('')
      pushActivity('Settings saved', enabled ? 'Multiple Roblox sessions enabled' : 'Multiple Roblox sessions disabled', 'positive')
      return { ok: true, requiresClientShutdown: false, message: '' }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Multiple Roblox sessions could not be updated.'
      setError(message)
      return { ok: false, requiresClientShutdown: /Close all running Roblox clients/i.test(message), message }
    }
  }

  const handleStopSession = async (sessionId: string) => {
    try {
      const stopped = await window.valdor.sessions.stop(sessionId)
      setSessionSnapshot(await window.valdor.sessions.getSnapshot())
      if (stopped) pushActivity('Stop requested', 'The selected Roblox client is being closed safely', 'warning')
    } catch (caught) { setErrorFrom(caught, 'The Roblox session could not be stopped.') }
  }

  const handleCancelRecovery = async (jobId: string) => {
    try {
      const cancelled = await window.valdor.sessions.cancelRecovery(jobId)
      setSessionSnapshot(await window.valdor.sessions.getSnapshot())
      if (cancelled) pushActivity('Recovery cancelled', 'The selected account will stay closed until you launch it again', 'warning')
    } catch (caught) { setErrorFrom(caught, 'The recovery retry could not be cancelled.') }
  }

  const handleControlSetting = async (input: Partial<ControlSettings>) => {
    try {
      const control = await window.valdor.control.update(input)
      setSnapshot((current) => current ? { ...current, control } : current)
      pushActivity('Control settings saved', `Control bridge ${control.port}`, 'positive')
    } catch (caught) { setErrorFrom(caught, 'Control settings could not be saved.') }
  }

  const handleMaximize = async () => setIsMaximized(await window.valdor.window.toggleMaximize())

  const handleUpdateDownload = async () => {
    try { await window.valdor.updates.download() } catch (caught) { setAppUpdate({ state: 'error', message: caught instanceof Error ? caught.message : 'The update could not be downloaded.' }) }
  }

  const handleUpdateInstall = async () => {
    try { await window.valdor.updates.install() } catch (caught) { setAppUpdate({ state: 'error', message: caught instanceof Error ? caught.message : 'The update could not be installed.' }) }
  }

  const handleUpdateCheck = async () => {
    try { await window.valdor.updates.check() } catch (caught) { setAppUpdate({ state: 'error', message: caught instanceof Error ? caught.message : 'The update check failed.' }) }
  }

  if (isLoading || authLoading) return <div className="loading-screen"><div className="loading-mark"><img src="./valdor-icon.png" alt="Valdor app icon" /></div><p>{authLoading ? 'Checking your account' : 'Opening the account workspace'}</p></div>

  const themeClass = `theme-${snapshot?.settings.theme ?? 'neo'}`

  if (!authSession) return <div className={`app-shell auth-gate-shell ${themeClass}`}>
    <header className="titlebar auth-titlebar">
      <BrandArea />
      <div className="titlebar-actions"><WindowControls isMaximized={isMaximized} onMaximize={() => void handleMaximize()} /></div>
    </header>
    <UpdateBanner update={appUpdate} onDownload={() => void handleUpdateDownload()} onInstall={() => void handleUpdateInstall()} onCheck={() => void handleUpdateCheck()} onDismiss={() => setAppUpdate(null)} />
    <main className="auth-gate-main" id="main-content">
      <AccountView busy={authBusy} error={authError} onSignIn={handleAuthSignIn} onSignUp={handleAuthSignUp} />
    </main>
  </div>

  const workspaceEyebrow = activeView === 'accounts' ? 'Profiles' : activeView === 'games' ? 'Collections' : activeView === 'sessions' ? 'Live activity' : activeView === 'servers' ? 'Roblox servers' : activeView === 'control' ? 'Protected controls' : activeView === 'activity' ? 'Workspace analytics' : activeView === 'settings' ? 'Preferences' : 'Workspace tools'
  const workspaceTitle = activeView === 'accounts' ? 'Account desk' : activeView === 'games' ? 'Game shelf' : activeView === 'sessions' ? 'Session board' : activeView === 'servers' ? 'Server finder' : activeView === 'control' ? 'Alt controls' : activeView === 'activity' ? 'Analytics' : activeView === 'settings' ? 'Settings' : 'Utilities'

  return <div className={`app-shell ${themeClass}`}>
    <header className={`titlebar ${isAccountMenuOpen ? 'account-menu-open' : ''}`}>
      <BrandArea />
      <nav className="titlebar-nav" aria-label="Workspace views">
        <ViewButton active={activeView === 'accounts'} icon="users" label="Accounts" onClick={() => setActiveView('accounts')} />
        <ViewButton active={activeView === 'games'} icon="game" label="Games" onClick={() => setActiveView('games')} count={games.length} />
        <ViewButton active={activeView === 'sessions'} icon="window" label="Sessions" onClick={() => setActiveView('sessions')} count={runningAccounts.length} />
        <ViewButton active={activeView === 'servers'} icon="server" label="Servers" onClick={() => setActiveView('servers')} />
        <ViewButton active={activeView === 'utilities'} icon="spark" label="Utilities" onClick={() => setActiveView('utilities')} />
        <ViewButton active={activeView === 'control'} icon="terminal" label="Control" onClick={() => setActiveView('control')} />
        <ViewButton active={activeView === 'activity'} icon="chart" label="Analytics" onClick={() => setActiveView('activity')} />
      </nav>
      <div className="titlebar-actions"><AccountMenu session={authSession} busy={authBusy} entitlements={entitlements} avatarUrl={lastUsedAccount?.avatarUrl ?? ''} isOpen={isAccountMenuOpen} onToggle={() => setIsAccountMenuOpen((current) => !current)} onOpenSettings={() => { setActiveView('settings'); setIsAccountMenuOpen(false) }} onSignOut={handleAuthSignOut} /><WindowControls isMaximized={isMaximized} onMaximize={() => void handleMaximize()} /></div>
    </header>
    <UpdateBanner update={appUpdate} onDownload={() => void handleUpdateDownload()} onInstall={() => void handleUpdateInstall()} onCheck={() => void handleUpdateCheck()} onDismiss={() => setAppUpdate(null)} />

    <div className={`app-body ${activeView === 'settings' ? 'settings-mode' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-intro"><span className="eyebrow">Your workspace</span><h2>{activeView === 'games' ? 'Game shelf' : activeView === 'servers' ? 'Server finder' : activeView === 'control' ? 'Alt controls' : activeView === 'activity' ? 'Analytics' : activeView === 'settings' ? 'Settings' : 'Account desk'}</h2><p>{activeView === 'games' ? 'Make a game collection for each experience, then sort profiles into useful categories.' : activeView === 'servers' ? 'Browse public Roblox servers, narrow the list, and join as the selected account.' : activeView === 'control' ? 'Protect the account you are playing, then run AutoHotkey scripts on your alts.' : activeView === 'activity' ? 'See launch patterns, favourite profiles, and session health in one clear view.' : activeView === 'settings' ? 'Manage app features, privacy, and billing from one place.' : 'Keep local profiles clear, grouped by game, and ready for the next session.'}</p></div>
        <div className="sidebar-actions"><button type="button" className="primary-button full-button" disabled={accountLimitReached} title={accountLimitReached ? getPlanLimitError(entitlements, 'accounts') : undefined} onClick={() => { setActiveView('accounts'); handleAddAccount() }}><Icon name="plus" size={17} /> Add Account</button><button type="button" className="outline-button full-button" onClick={() => setActiveView('games')}><Icon name="game" size={17} /> Manage games</button></div>
        <div className="sidebar-section"><div className="section-heading"><span>Games</span><span className="section-count">{games.length}</span></div><div className="group-list"><button type="button" className={`group-button ${selectedGameId === 'all' ? 'active' : ''}`} onClick={() => { setSelectedGameId('all'); setSelectedCategoryId('all'); setActiveView('accounts') }}><span className="group-name"><span className="tree-icon"><Icon name="grid" size={14} /></span>All games</span><span>{uniqueWorkspaceAccounts.length}</span></button>{games.map((game) => <div className="game-tree" key={game.id}><button type="button" className={`group-button ${selectedGameId === game.id && selectedCategoryId === 'all' ? 'active' : ''}`} onClick={() => { setSelectedGameId(game.id); setSelectedCategoryId('all'); setActiveView('accounts') }}><span className="group-name"><span className="tree-icon game-tree-icon"><Icon name={game.favorite ? 'star' : 'game'} size={14} filled={game.favorite} /></span>{game.name}</span><span>{accounts.filter((account) => account.gameId === game.id).length}</span></button>{game.categories.map((category) => <button type="button" className={`category-button ${selectedGameId === game.id && selectedCategoryId === category.id ? 'active' : ''}`} key={category.id} onClick={() => { setSelectedGameId(game.id); setSelectedCategoryId(category.id); setActiveView('accounts') }}><span className="category-icon"><Icon name={category.icon ?? 'folder'} size={13} /></span>{category.name}<span>{accounts.filter((account) => account.gameId === game.id && account.categoryId === category.id).length}</span></button>)}</div>)}</div></div>
      </aside>

      <main className="workspace" id="main-content">
        <div className="workspace-header"><div><span className="eyebrow">{workspaceEyebrow}</span><h1>{workspaceTitle}</h1></div><div className="workspace-header-right"><div className="workspace-summary"><div className="summary-item"><span className="summary-number">{uniqueWorkspaceAccounts.length}</span><span>profiles</span></div><div className="summary-divider" /><div className="summary-item"><span className="status-dot ready" /><span>{runningAccounts.length} active</span></div></div>{(activeView === 'accounts' || activeView === 'games') && <button type="button" className="primary-button workspace-add-button" disabled={activeView === 'accounts' ? accountLimitReached : gameLimitReached} title={activeView === 'accounts' && accountLimitReached ? getPlanLimitError(entitlements, 'accounts') : activeView === 'games' && gameLimitReached ? getPlanLimitError(entitlements, 'games') : undefined} onClick={() => activeView === 'games' ? setActiveView('games') : handleAddAccount()}><Icon name="plus" size={16} /> {activeView === 'games' ? 'New game' : 'Add Account'}</button>}</div></div>
        {error && <div className="error-banner" role="alert"><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close" size={16} /></button></div>}

        <div className="view-stage" key={activeView}>
          {activeView === 'accounts' && <AccountsView accounts={filteredAccounts} allAccounts={accounts} games={games} entitlements={entitlements} selectedAccount={selectedAccount} selectedGameId={selectedGameId} selectedCategoryId={selectedCategoryId} search={search} sortMode={sortMode} onSort={setSortMode} showCookieImport={showCookieImport} launchingMany={launchingMany} onSearch={setSearch} onSelect={setSelectedId} onResetScope={() => { setSelectedGameId('all'); setSelectedCategoryId('all') }} onAdd={handleAddAccount} onImport={handleImport} onCookieImport={() => setShowCookieImport(true)} onCookieClose={() => setShowCookieImport(false)} onRemove={handleRemoveAccount} onLaunch={handleLaunch} onLaunchMany={(targets) => void handleLaunchMany(targets)} onUpdate={handleAccountUpdate} onToggleFavorite={handleAccountFavoriteToggle} onTransfer={handleAccountTransfer} onOpenBrowser={async () => { if (!selectedAccount) return; try { await window.valdor.accounts.openBrowser(selectedAccount.id); pushActivity('Browser opened', 'Roblox opened in an isolated account window', 'positive') } catch (caught) { setErrorFrom(caught, 'Account browser failed.') } }} />}
          {activeView === 'games' && <GamesView
            games={games}
            accounts={accounts}
            entitlements={entitlements}
            selectedGame={selectedGame}
            onSelect={(id) => setSelectedGameId(id)}
            onUpdate={updateGame}
            onCreate={async (input) => { try { const game = await window.valdor.games.create(input); setSnapshot((current) => current ? { ...current, games: [...current.games, game] } : current); setSelectedGameId(game.id); pushActivity('Created ' + game.name, 'Game collection ready for categories', 'positive') } catch (caught) { setErrorFrom(caught, 'Game could not be created.') } }}
            onRemove={async (id) => { try { await window.valdor.games.remove(id); await loadSnapshot(); setSelectedGameId('all'); pushActivity('Game removed', 'Accounts were moved to the remaining collection', 'warning') } catch (caught) { setErrorFrom(caught, 'Game could not be removed.') } }}
            onCategoryCreate={async (gameId, name) => { try { const game = await window.valdor.games.createCategory(gameId, { name }); updateGame(game); pushActivity('Added ' + name, 'New sub-category created', 'positive') } catch (caught) { setErrorFrom(caught, 'Category could not be created.') } }}
            onCategoryUpdate={async (gameId, categoryId, input) => { try { const game = await window.valdor.games.updateCategory(gameId, categoryId, input); updateGame(game); pushActivity(input.name ? 'Renamed ' + input.name : 'Category icon updated', input.name ? 'Sub-category name updated' : 'Sub-category icon saved', 'positive'); return true } catch (caught) { setErrorFrom(caught, 'Category could not be updated.'); return false } }}
            onCategoryRemove={async (gameId, categoryId) => { try { updateGame(await window.valdor.games.removeCategory(gameId, categoryId)); pushActivity('Category removed', 'Profiles were moved to the remaining category', 'warning') } catch (caught) { setErrorFrom(caught, 'Category could not be removed.') } }}
          />}
          {activeView === 'sessions' && <SessionsView accounts={accounts} games={games} sessions={sessionSnapshot} onSelect={(id) => { setSelectedId(id); setActiveView('accounts') }} onCopy={handleCopyText} onStop={handleStopSession} onCancelRecovery={handleCancelRecovery} />}
          {activeView === 'servers' && <ServersView selectedAccount={selectedAccount} recentGames={uniqueRecentGames(snapshot?.recentGames ?? [])} launching={launchingAccountId === selectedAccount?.id} onLaunch={(place, job, gameId) => handleLaunch(place, job, undefined, undefined, undefined, gameId ? { gameId } : undefined)} onCopy={handleCopyText} onActivity={pushActivity} onError={(message) => setError(message)} />}
          {activeView === 'utilities' && <UtilitiesView selectedAccount={selectedAccount} onImport={handleImport} onExport={async () => { const path = await window.valdor.app.exportData(); if (path) pushActivity('Export complete', path, 'positive') }} onCookieImport={() => setShowCookieImport(true)} onOpenAccounts={() => setActiveView('accounts')} onAccountUtility={(input) => handleAccountUtility(input, false)} onError={(message) => setError(message)} onActivity={pushActivity} />}
          {activeView === 'control' && <ControlView accounts={snapshot?.controlAccounts ?? []} settings={snapshot?.settings ?? null} entitlements={entitlements} onSettings={handleSetting} onError={(message) => setError(message)} onActivity={pushActivity} />}
          {activeView === 'activity' && <AnalyticsView activity={activity} sessions={sessionSnapshot} accounts={accounts} games={games} onSelect={(id) => { setSelectedId(id); setActiveView('accounts') }} onCopy={handleCopyText} onRejoin={async (session) => { await handleLaunch(session.placeId, session.jobId || session.targetJobId, undefined, undefined, session.accountId) }} onAdd={handleAddAccount} onOpenAccounts={() => setActiveView('accounts')} />}
          {activeView === 'settings' && <SettingsView settings={snapshot?.settings ?? null} client={snapshot?.client} webApi={snapshot?.webApi} watcher={snapshot?.watcher} control={snapshot?.control} entitlements={entitlements} accountCount={uniqueWorkspaceAccounts.length} gameCount={games.length} onSettings={handleSetting} onClientUpdate={(client) => setSnapshot((current) => current ? { ...current, client } : current)} onWebApiUpdate={(webApi) => setSnapshot((current) => current ? { ...current, webApi } : current)} onControl={handleControlSetting} onMultiInstanceChange={handleMultiInstanceSetting} onError={(message) => setError(message)} onActivity={pushActivity} />}
        </div>
      </main>

          <aside className="detail-panel">{activeView === 'accounts' && selectedAccount ? <AccountDetail key={selectedAccount.id} account={selectedAccount} games={games} launching={launchingAccountId === selectedAccount.id} onLogin={handleLogin} onLaunch={handleLaunch} onUpdate={handleAccountUpdate} onTransfer={handleAccountTransfer} onUtility={handleAccountUtility} onRemove={handleRemoveAccount} onOpenBrowser={async () => { try { await window.valdor.accounts.openBrowser(selectedAccount.id); pushActivity('Browser opened', 'Roblox opened in an isolated account window', 'positive') } catch (caught) { setErrorFrom(caught, 'Account browser could not be opened.') } }} onCopy={async (kind) => { try { const result = await window.valdor.accounts.copy(selectedAccount.id, kind); pushActivity('Copied to clipboard', result.message, 'positive'); return true } catch (caught) { setErrorFrom(caught, 'The value could not be copied.'); return false } }} /> : <ActivityPanel activity={activity} />}</aside>
    </div>
    <footer className="statusbar"><div className="statusbar-left"><span>{snapshot?.info.platform}</span><span className="status-separator" />v{snapshot?.info.version}</div><div className="statusbar-right"><span>{formatCount(uniqueWorkspaceAccounts.length, 'profile')}</span></div></footer>
  </div>
}

function BrandArea() {
  return <div className="brand-area" aria-label="Valdor — Roblox Account Manager"><div className="brand-mark"><img src="./valdor-icon.png" alt="Valdor app icon" /></div><div className="brand-copy"><span className="brand-name">Valdor</span><span className="brand-product">Roblox Account Manager</span></div></div>
}

function WindowControls({ isMaximized, onMaximize }: { isMaximized: boolean; onMaximize: () => void }) {
  return <div className="window-controls" aria-label="Window controls"><button type="button" className="window-button" aria-label="Minimize" onClick={() => void window.valdor.window.minimize()}><Icon name="minus" size={16} /></button><button type="button" className="window-button" aria-label={isMaximized ? 'Restore' : 'Maximize'} onClick={onMaximize}><Icon name="square" size={14} /></button><button type="button" className="window-button close-window" aria-label="Close" onClick={() => void window.valdor.window.close()}><Icon name="close" size={16} /></button></div>
}

function UpdateBanner({ update, onDownload, onInstall, onCheck, onDismiss }: { update: AppUpdateEvent | null; onDownload: () => void; onInstall: () => void; onCheck: () => void; onDismiss: () => void }) {
  if (!update || update.state === 'checking' || update.state === 'not-available') return null
  const version = update.version ? `v${update.version}` : 'the latest version'
  const isError = update.state === 'error'
  const heading = update.state === 'available' ? `Update available: ${version}` : update.state === 'downloading' ? `Downloading ${version}` : update.state === 'downloaded' ? `${version} is ready` : 'Update check failed'
  const message = update.state === 'available'
    ? 'Download it now. Your workspace stays open until you choose to restart.'
    : update.state === 'downloading'
      ? `${Math.max(0, Math.min(100, update.percent ?? 0))}% downloaded.`
      : update.state === 'downloaded'
        ? 'Restart the app to finish installing the update.'
        : 'We could not check for a newer version. You can try again.'
  return <section className={`update-banner ${isError ? 'is-error' : ''}`} role={isError ? 'alert' : 'status'} aria-live="polite"><div><strong>{heading}</strong><p>{message}</p></div><div className="update-banner-actions">{update.state === 'available' && <button type="button" className="primary-button" onClick={onDownload}>Download update</button>}{update.state === 'downloaded' && <button type="button" className="primary-button" onClick={onInstall}>Restart and install</button>}{update.state === 'downloading' && <span className="update-progress" aria-label={`${update.percent ?? 0}% downloaded`}>{Math.round(update.percent ?? 0)}%</span>}{isError && <button type="button" className="outline-button" onClick={onCheck}>Try again</button>}<button type="button" className="text-button" onClick={onDismiss}>Dismiss</button></div></section>
}

function AccountMenu({ session, busy, entitlements, avatarUrl, isOpen, onToggle, onOpenSettings, onSignOut }: { session: ValdorAuthSession; busy: boolean; entitlements: PlanEntitlements; avatarUrl: string; isOpen: boolean; onToggle: () => void; onOpenSettings: () => void; onSignOut: () => Promise<void> }) {
  const menuRef = useRef<ValdorAccountMenuElement | null>(null)

  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const handleToggle = () => onToggle()
    const handleSettings = () => onOpenSettings()
    const handleSignOut = () => { void onSignOut() }
    menu.addEventListener('account-menu-toggle', handleToggle)
    menu.addEventListener('account-menu-settings', handleSettings)
    menu.addEventListener('account-menu-signout', handleSignOut)
    return () => {
      menu.removeEventListener('account-menu-toggle', handleToggle)
      menu.removeEventListener('account-menu-settings', handleSettings)
      menu.removeEventListener('account-menu-signout', handleSignOut)
    }
  }, [onOpenSettings, onSignOut, onToggle])

  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    menu.name = session.user.name
    menu.email = session.user.email
    menu.plan = entitlements.displayName
    menu.avatarUrl = avatarUrl
    menu.signedInState = true
    menu.busyState = busy
    menu.open = isOpen
  }, [avatarUrl, busy, entitlements.displayName, isOpen, session.user.email, session.user.name])

  return createElement('valdor-account-menu', { ref: menuRef })
}

function ViewButton({ active, icon, label, onClick, count }: { active: boolean; icon: IconName; label: string; onClick: () => void; count?: number }) { return <button type="button" className={`view-button ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClick}><Icon name={icon} size={16} /><span>{label}</span>{count !== undefined && count > 0 && <span className="nav-count">{count}</span>}</button> }

function AccountsView(props: { accounts: Account[]; allAccounts: Account[]; games: GameCollection[]; entitlements: PlanEntitlements; selectedAccount: Account | null; selectedGameId: string; selectedCategoryId: string; search: string; sortMode: 'status' | 'name' | 'last-used' | 'sessions'; onSort: (value: 'status' | 'name' | 'last-used' | 'sessions') => void; showCookieImport: boolean; launchingMany: boolean; onSearch: (value: string) => void; onSelect: (id: string) => void; onResetScope: () => void; onAdd: () => void; onImport: () => void; onCookieImport: () => void; onCookieClose: () => void; onRemove: () => void; onLaunch: (placeId: string, jobId: string, vipLink?: string, followUserId?: string) => void; onLaunchMany: (targets: Array<{ accountId: string; placeId?: string; jobId?: string }>) => void; onUpdate: (input: UpdateAccountInput) => void; onToggleFavorite: (id: string) => Promise<void>; onTransfer: (input: AccountTransferInput) => Promise<boolean>; onOpenBrowser: () => void }) {
  const { accounts, allAccounts, games, selectedGameId, selectedCategoryId, search, showCookieImport } = props
  const [showTransfer, setShowTransfer] = useState(false)
  const uniqueWorkspaceAccounts = uniqueAccounts(allAccounts)
  const accountLimitReached = props.entitlements.maxAccounts !== null && uniqueWorkspaceAccounts.length >= props.entitlements.maxAccounts
  const sourceGame = games.find((game) => game.id === selectedGameId)
  const sourceCategory = sourceGame?.categories.find((category) => category.id === selectedCategoryId)
  const sectionAccounts = allAccounts.filter((account) => selectedGameId === 'all' || account.gameId === selectedGameId).filter((account) => selectedCategoryId === 'all' || account.categoryId === selectedCategoryId)
  const sectionLabel = selectedGameId === 'all' ? 'All games' : [sourceGame?.name, sourceCategory?.name].filter(Boolean).join(' / ') || 'Game'
  const hasSearch = Boolean(search.trim())
  const hasScope = selectedGameId !== 'all' || selectedCategoryId !== 'all'
  const recentCount = uniqueWorkspaceAccounts.filter((account) => isAccountRecentlyUsed(account)).length
  const favoriteCount = uniqueWorkspaceAccounts.filter((account) => account.favorite).length

  return <>
    {showCookieImport && <CookieImportPanel games={games} onClose={props.onCookieClose} onImported={props.onImport} />}
    <div className="toolbar">
      <label className="search-field"><Icon name="search" size={17} /><span className="sr-only">Search profiles</span><input value={search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Search profiles" /></label>
      <div className="toolbar-actions">
        <span className="toolbar-meta">{accounts.length} shown <span className="toolbar-rule" /> {sectionLabel}</span>
        <label className="sort-field"><span>Sort by</span><select aria-label="Sort profiles" title="Recommended prioritizes favourites and recently used profiles. Username sorts alphabetically." value={props.sortMode} onChange={(event) => props.onSort(event.target.value as 'status' | 'name' | 'last-used' | 'sessions')}><option value="status">Recommended</option><option value="last-used">Last used</option><option value="name">Username (A–Z)</option><option value="sessions">Launches</option></select></label>
        <button type="button" className="text-button" disabled={accountLimitReached} title={accountLimitReached ? getPlanLimitError(props.entitlements, 'accounts') : undefined} onClick={props.onAdd}><Icon name="plus" size={15} /> Add Account</button>
        <button type="button" className="text-button" disabled={!props.entitlements.bulkLaunch || accounts.length === 0 || props.launchingMany} title={!props.entitlements.bulkLaunch ? getPlanFeatureError(props.entitlements, 'bulk-launch') : undefined} onClick={() => props.onLaunchMany(accounts.map((account) => ({ accountId: account.id, placeId: account.placeId, jobId: account.jobId })))}><Icon name={props.launchingMany ? 'clock' : props.entitlements.bulkLaunch ? 'launch' : 'gem'} size={15} /> {props.launchingMany ? 'Launching...' : props.entitlements.bulkLaunch ? 'Bulk launch' : 'Bulk launch · Pro'}</button>
        <button type="button" className="text-button" disabled={sectionAccounts.length === 0} onClick={() => setShowTransfer(true)}><Icon name="arrow" size={15} /> Transfer section</button>
        <button type="button" className="text-button" onClick={props.onImport}><Icon name="import" size={15} /> Import JSON</button>
      </div>
    </div>
    {accounts.length > 0 ? <div className="account-grid">{accounts.map((account, index) => <AccountCard key={account.id} account={account} index={index} selected={account.id === props.selectedAccount?.id} recent={isAccountRecentlyUsed(account)} game={games.find((candidate) => candidate.id === account.gameId)} onSelect={() => props.onSelect(account.id)} onToggleFavorite={() => props.onToggleFavorite(account.id)} />)}</div> : <EmptyState hasSearch={hasSearch} hasScope={hasScope} onReset={() => { props.onSearch(''); }} onResetScope={props.onResetScope} onAdd={props.onAdd} />}
    {(recentCount > 0 || favoriteCount > 0) && <div className="workspace-insights" aria-label="Workspace highlights">
      {recentCount > 0 && <span><Icon name="clock" size={15} /> {formatCount(recentCount, 'profile')} used recently</span>}
      {favoriteCount > 0 && <span><Icon name="star" size={15} filled /> {formatCount(favoriteCount, 'favourite')} saved</span>}
    </div>}
    {showTransfer && <AccountTransferModal accounts={sectionAccounts} games={games} sourceLabel={sectionLabel} onClose={() => setShowTransfer(false)} onTransfer={props.onTransfer} />}
  </>
}

function AccountTransferModal({ accounts, games, sourceLabel, onClose, onTransfer }: { accounts: Account[]; games: GameCollection[]; sourceLabel: string; onClose: () => void; onTransfer: (input: AccountTransferInput) => Promise<boolean> }) {
  const sourceGameIds = new Set(accounts.map((account) => account.gameId))
  const firstDestination = games.find((game) => !sourceGameIds.has(game.id)) ?? games[0]
  const [mode, setMode] = useState<AccountTransferMode>('move')
  const [targetGameId, setTargetGameId] = useState(firstDestination?.id ?? '')
  const [targetCategoryId, setTargetCategoryId] = useState(firstDestination?.categories[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const targetGame = games.find((game) => game.id === targetGameId)
  const validTargetCategory = Boolean(targetGame?.categories.some((category) => category.id === targetCategoryId))
  const sameDestination = accounts.length === 0 || accounts.every((account) => account.gameId === targetGameId && account.categoryId === targetCategoryId)

  const submit = async () => {
    if (busy || !targetGame || !validTargetCategory || sameDestination) return
    setBusy(true)
    setMessage('')
    const ok = await onTransfer({ accountIds: accounts.map((account) => account.id), gameId: targetGameId, categoryId: targetCategoryId, mode })
    setBusy(false)
    if (ok) onClose()
    else setMessage('Transfer failed. Check the error banner and try again.')
  }

  const modal = <div className="action-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="action-modal transfer-modal" role="dialog" aria-modal="true" aria-labelledby="section-transfer-title" onMouseDown={(event) => event.stopPropagation()}><div className="action-modal-header"><div><span className="eyebrow">Section transfer</span><h2 id="section-transfer-title">{mode === 'move' ? 'Move profiles' : 'Duplicate profiles'}</h2><p>{formatCount(accounts.length, 'profile')} from {sourceLabel}</p></div><button type="button" className="icon-button" aria-label="Close section transfer" onClick={onClose}><Icon name="close" size={17} /></button></div><div className="action-modal-body"><div className="action-modal-section"><div className="action-modal-section-heading"><strong>Choose what happens</strong><span>{mode === 'move' ? 'Source section will be cleared' : 'Originals stay in place'}</span></div><div className="transfer-choice-grid"><button type="button" className={'transfer-choice ' + (mode === 'move' ? 'selected' : '')} aria-pressed={mode === 'move'} onClick={() => setMode('move')}><strong><Icon name="arrow" size={15} /> Move</strong><span>Remove the profiles from the source section after assigning them to the destination.</span></button><button type="button" className={'transfer-choice ' + (mode === 'duplicate' ? 'selected' : '')} aria-pressed={mode === 'duplicate'} onClick={() => setMode('duplicate')}><strong><Icon name="copy" size={15} /> Duplicate</strong><span>Keep the originals and create matching profiles with their secure session data.</span></button></div></div><div className="action-modal-section"><div className="action-modal-section-heading"><strong>Destination</strong><span>{sourceLabel} <Icon name="arrow" size={13} /> {targetGame?.name ?? 'Choose a game'}</span></div><p className="action-modal-description">Choose the game collection and sub-category for every profile in this section.</p><div className="action-modal-two-col"><label className="field-label">Destination game<select value={targetGameId} onChange={(event) => { const nextGameId = event.target.value; setTargetGameId(nextGameId); setTargetCategoryId(games.find((game) => game.id === nextGameId)?.categories[0]?.id ?? '') }}>{games.map((game) => <option value={game.id} key={game.id}>{game.name}</option>)}</select></label><label className="field-label">Category<select value={targetCategoryId} onChange={(event) => setTargetCategoryId(event.target.value)}>{(targetGame?.categories ?? []).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label></div><button type="button" className="primary-button" disabled={busy || !targetGame || !validTargetCategory || sameDestination} onClick={() => void submit()}>{busy ? 'Transferring...' : mode === 'move' ? 'Move profiles' : 'Duplicate profiles'} <Icon name={busy ? 'clock' : 'arrow'} size={15} /></button>{sameDestination && <span className="action-modal-note">Choose a different destination to continue.</span>}{message && <span className="action-modal-feedback">{message}</span>}</div></div></section></div>
  return createPortal(modal, document.body)
}

function CategoryIconPicker({ categoryName, categoryId, icon, open, busy, onToggle, onPick }: { categoryName?: string; categoryId?: string; icon: CategoryIcon; open: boolean; busy: boolean; onToggle: () => void; onPick: (icon: CategoryIcon) => void }) {
  const selected = CATEGORY_ICON_OPTIONS.find((option) => option.name === icon) ?? { name: 'folder' as CategoryIcon, label: 'Folder' }
  const label = categoryName ?? categoryId ?? 'category'
  return <div className="category-icon-picker">
    <button type="button" className={'category-icon-button ' + (open ? 'active' : '')} aria-label={`Choose icon for category ${label}`} aria-expanded={open} title={`Category icon: ${selected.label}`} onClick={onToggle}><Icon name={selected.name} size={15} /></button>
    {open && <div className="category-icon-menu" role="listbox" aria-label="Category icon choices">{CATEGORY_ICON_OPTIONS.map((option) => <button type="button" role="option" aria-selected={option.name === icon} className={'category-icon-option ' + (option.name === icon ? 'selected' : '')} key={option.name} title={option.label} aria-label={option.label} disabled={busy} onClick={() => onPick(option.name)}><Icon name={option.name} size={16} /></button>)}</div>}
  </div>
}

function AccountCard({ account, index, selected, recent, game, onSelect, onToggleFavorite }: { account: Account; index: number; selected: boolean; recent: boolean; game?: GameCollection; onSelect: () => void; onToggleFavorite: () => void }) {
  const accountName = account.alias || account.username
  const categoryName = game?.categories.find((category) => category.id === account.categoryId)?.name ?? 'General'
  const prioritySignals = [
    ...(account.favorite ? [{ key: 'favorite', label: 'Favourite' }] : []),
    ...(recent ? [{ key: 'recent', label: 'Recently used' }] : []),
  ]

  return <div className="account-card-shell"><button type="button" className={`account-card ${selected ? 'selected' : ''}`} style={{ '--card-delay': `${index * 35}ms`, '--account-accent': account.accent } as CSSProperties} onClick={onSelect}>
    <div className="account-card-top"><div className="avatar-block">{account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <span>{getInitials(account)}</span>}</div>{(account.status === 'running' || account.status === 'offline') && <span className={`status-label ${account.status}`}><span className="status-dot" />{STATUS_LABELS[account.status]}</span>}</div>
    <div className="account-card-copy"><strong>{accountName}</strong><span className="account-card-handle">@{account.username}</span>{prioritySignals.length > 0 && <span className="account-card-priority" aria-label={prioritySignals.map((signal) => signal.label).join(' and ')}>{prioritySignals.map((signal, signalIndex) => <span className="account-card-priority-group" key={signal.key}>{signalIndex > 0 && <span className="account-card-priority-divider" aria-hidden="true">|</span>}<span className={signal.key}><span className="account-card-priority-marker" aria-hidden="true"><Icon name={signal.key === 'favorite' ? 'star' : 'clock'} size={11} filled={signal.key === 'favorite'} /></span>{signal.label}</span></span>)}</span>}</div>
    <div className="account-card-bottom"><span className="account-card-location"><Icon name="game" size={12} /><span>{game?.name ?? 'Unassigned'}</span><span className="account-card-separator">/</span><span>{categoryName}</span></span></div>
  </button><button type="button" className={`account-favorite-toggle ${account.favorite ? 'active' : ''}`} aria-label={account.favorite ? `Remove ${accountName} from favourites` : `Favourite ${accountName}`} aria-pressed={account.favorite} title={account.favorite ? 'Remove from favourites' : 'Add to favourites'} onClick={() => void onToggleFavorite()}><Icon name="star" size={15} filled={account.favorite} /></button></div>
}

function AccountDetail({ account, games, launching, onLogin, onLaunch, onUpdate, onTransfer, onUtility, onRemove, onOpenBrowser, onCopy }: { account: Account; games: GameCollection[]; launching: boolean; onLogin: (input: RobloxLoginInput) => Promise<void>; onLaunch: (placeId: string, jobId: string, vipLink?: string, followUserId?: string) => void; onUpdate: (input: UpdateAccountInput) => Promise<void>; onTransfer: (input: AccountTransferInput) => Promise<boolean>; onUtility: (input: AccountUtilityInput) => Promise<AccountUtilityResult | null>; onRemove: () => void; onOpenBrowser: () => void; onCopy: (kind: AccountCopyKind) => Promise<boolean> }) {
  const defaultPlaceId = games.find((game) => game.id === account.gameId)?.placeId || ''
  const [placeId, setPlaceId] = useState(account.placeId || defaultPlaceId)
  const [jobId, setJobId] = useState(account.jobId)
  const [followUserId, setFollowUserId] = useState('')
  const [alias, setAlias] = useState(account.alias)
  const [description, setDescription] = useState(account.description)
  const [gameId, setGameId] = useState(account.gameId)
  const [categoryId, setCategoryId] = useState(account.categoryId)
  const [showActions, setShowActions] = useState(false)
  const [utility, setUtility] = useState<UtilityAction>('refresh')
  const [utilityValue, setUtilityValue] = useState('')
  const [utilitySecondaryValue, setUtilitySecondaryValue] = useState('')
  const [utilityMessage, setUtilityMessage] = useState('')
  const [utilityBusy, setUtilityBusy] = useState(false)
  const [transferMode, setTransferMode] = useState<AccountTransferMode>('move')
  const [transferBusy, setTransferBusy] = useState(false)
  const [targetGameId, setTargetGameId] = useState(account.gameId)
  const [targetCategoryId, setTargetCategoryId] = useState(account.categoryId)
  const [fpsEnabled, setFpsEnabled] = useState(account.fpsOverride !== null)
  const [fpsValue, setFpsValue] = useState(account.fpsOverride ?? 240)
  const [fpsBusy, setFpsBusy] = useState(false)
  const [memorySaver, setMemorySaver] = useState(account.memorySaver)
  const [memoryBusy, setMemoryBusy] = useState(false)
  const [recoveryEnabled, setRecoveryEnabled] = useState(account.recoveryPolicy.enabled)
  const [recoveryAttempts, setRecoveryAttempts] = useState(account.recoveryPolicy.maxAttempts)
  const [recoveryCooldown, setRecoveryCooldown] = useState(account.recoveryPolicy.cooldownSeconds)
  const [recoveryFallback, setRecoveryFallback] = useState(account.recoveryPolicy.fallbackToPublicServer)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [copied, setCopied] = useState<'username' | 'profile' | null>(null)
  const copiedTimer = useRef<number | null>(null)

  useEffect(() => {
    setPlaceId(account.placeId || defaultPlaceId)
    setJobId(account.jobId)
    setAlias(account.alias)
    setDescription(account.description)
    setGameId(account.gameId)
    setCategoryId(account.categoryId)
    setTargetGameId(account.gameId)
    setTargetCategoryId(account.categoryId)
    setFpsEnabled(account.fpsOverride !== null)
    setFpsValue(account.fpsOverride ?? 240)
    setMemorySaver(account.memorySaver)
    setRecoveryEnabled(account.recoveryPolicy.enabled)
    setRecoveryAttempts(account.recoveryPolicy.maxAttempts)
    setRecoveryCooldown(account.recoveryPolicy.cooldownSeconds)
    setRecoveryFallback(account.recoveryPolicy.fallbackToPublicServer)
  }, [account.id, account.placeId, account.jobId, account.alias, account.description, account.gameId, account.categoryId, account.fpsOverride, account.memorySaver, account.recoveryPolicy.enabled, account.recoveryPolicy.maxAttempts, account.recoveryPolicy.cooldownSeconds, account.recoveryPolicy.fallbackToPublicServer, account.hasCredentials, defaultPlaceId])

  useEffect(() => {
    // AccountDetail is keyed by account id at the call site as well, but keep
    // this reset local so a future parent refactor cannot leak a previous
    // account's open modal, task inputs, or transfer state into this profile.
    setShowActions(false)
    setUtility('refresh')
    setUtilityValue('')
    setUtilitySecondaryValue('')
    setUtilityMessage('')
    setUtilityBusy(false)
    setTransferMode('move')
    setTransferBusy(false)
  }, [account.id])

  useEffect(() => () => { if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current) }, [])

  const selectedGame = games.find((game) => game.id === gameId)
  const targetGame = games.find((game) => game.id === targetGameId)
  const targetCategory = targetGame?.categories.find((category) => category.id === targetCategoryId)
  const actionMeta = UTILITY_ACTIONS[utility]
  const canTransfer = Boolean(targetGame && targetCategory && (targetGameId !== account.gameId || targetCategoryId !== account.categoryId))
  const save = () => onUpdate({ alias, description, gameId, categoryId, placeId, jobId })

  const copy = async (kind: 'username' | 'profile') => {
    if (!(await onCopy(kind))) return
    setCopied(kind)
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1800)
  }

  const chooseUtility = (next: UtilityAction) => { setUtility(next); setUtilityValue(''); setUtilitySecondaryValue(''); setUtilityMessage('') }

  const runUtility = async () => {
    if (!account.hasCredentials) return
    setUtilityBusy(true)
    setUtilityMessage('')
    try {
      const result = await onUtility({ accountId: account.id, action: utility, value: utilityValue, secondaryValue: utilitySecondaryValue })
      if (result) setUtilityMessage(result.message)
    } finally {
      setUtilityBusy(false)
    }
  }

  const openActions = () => {
    setTargetGameId(account.gameId)
    setTargetCategoryId(account.categoryId)
    setTransferMode('move')
    setShowActions(true)
  }

  const transferAccount = async () => {
    if (!canTransfer || transferBusy) return
    setTransferBusy(true)
    try {
      const ok = await onTransfer({ accountIds: [account.id], gameId: targetGameId, categoryId: targetCategoryId, mode: transferMode })
      if (ok) setShowActions(false)
    } finally {
      setTransferBusy(false)
    }
  }

  const saveFpsOverride = async () => {
    setFpsBusy(true)
    const value = fpsEnabled ? Math.min(1000, Math.max(15, Math.round(Number.isFinite(fpsValue) ? fpsValue : 240))) : null
    try {
      await onUpdate({ fpsOverride: value })
      setUtilityMessage(value === null ? 'This account will use the Utilities FPS setting.' : 'This account will launch with a ' + value + ' FPS override.')
    } finally {
      setFpsBusy(false)
    }
  }

  const saveMemorySaver = async () => {
    setMemoryBusy(true)
    try {
      await onUpdate({ memorySaver })
      setUtilityMessage(memorySaver ? 'Memory Saver will apply to this account at launch.' : 'Memory Saver is disabled for this account.')
    } finally {
      setMemoryBusy(false)
    }
  }

  const saveRecoveryPolicy = async () => {
    setRecoveryBusy(true)
    const maxAttempts = Math.min(5, Math.max(1, Math.round(Number.isFinite(recoveryAttempts) ? recoveryAttempts : 3)))
    const cooldownSeconds = Math.min(3600, Math.max(0, Math.round(Number.isFinite(recoveryCooldown) ? recoveryCooldown : 30)))
    try {
      await onUpdate({ recoveryPolicy: { enabled: recoveryEnabled, maxAttempts, cooldownSeconds, fallbackToPublicServer: recoveryFallback } })
      setRecoveryAttempts(maxAttempts)
      setRecoveryCooldown(cooldownSeconds)
      setUtilityMessage(recoveryEnabled ? 'Session Guardian will recover this account after an unexpected exit or stale presence.' : 'Auto-recovery is disabled for this account.')
    } finally {
      setRecoveryBusy(false)
    }
  }

  return <div className={'detail-card ' + (showActions ? 'modal-open' : '')}>
    <div className="detail-card-header">
      <div className="detail-avatar">{account.avatarUrl ? <img src={account.avatarUrl} alt={account.username + ' avatar'} /> : <span>{getInitials(account)}</span>}</div>
      <div className="detail-card-identity"><span className="eyebrow">Selected profile</span><h2>{account.alias || account.username}</h2><p>@{account.username}{account.displayName ? ' / ' + account.displayName : ''}</p></div>
      <button type="button" className={'icon-button ' + (showActions ? 'active' : '')} aria-label="Open account actions" aria-expanded={showActions} onClick={openActions}><Icon name="more" size={18} /></button>
    </div>
    <div className="detail-status"><span className={'status-label ' + account.status}><span className="status-dot" />{STATUS_LABELS[account.status]}</span><span>{account.hasCredentials ? 'Secure session' : account.userId ? 'Reconnect required' : 'Not connected'}</span></div>
    <section className="detail-card-section detail-quick-actions"><div className="detail-section-heading"><strong>Quick actions</strong><span>{account.hasCredentials ? 'Account tools' : 'Connect to unlock'}</span></div><div className="detail-actions-row">
      {!account.hasCredentials && <button type="button" className="primary-button compact-button" onClick={() => void onLogin({ gameId: account.gameId, categoryId: account.categoryId })}><Icon name="browser" size={15} /> {account.userId ? 'Reconnect Roblox' : 'Connect Roblox'}</button>}
      <button type="button" className="outline-button compact-button" disabled={!account.hasCredentials} onClick={onOpenBrowser}><Icon name="browser" size={15} /> Open browser</button>
      <button type="button" className={'outline-button compact-button ' + (copied === 'username' ? 'copy-confirmed' : '')} onClick={() => void copy('username')}><Icon name={copied === 'username' ? 'check' : 'copy'} size={15} /> {copied === 'username' ? 'Copied' : 'Copy username'}</button>
      <button type="button" className={'outline-button compact-button ' + (copied === 'profile' ? 'copy-confirmed' : '')} onClick={() => void copy('profile')}><Icon name={copied === 'profile' ? 'check' : 'globe'} size={15} /> {copied === 'profile' ? 'Copied' : 'Profile link'}</button>
    </div></section>
    <section className="detail-card-section detail-launch-section"><div className="detail-section-heading"><strong>Launch target</strong><span>Place, server, or player</span></div><div className="form-stack">
      <label className="field-label">Place ID<input value={placeId} onChange={(event) => setPlaceId(event.target.value)} placeholder="For example 1818" onBlur={save} /></label>
      <label className="field-label">Job ID <span className="muted-label">Optional</span><input value={jobId} onChange={(event) => setJobId(event.target.value)} placeholder="Specific server instance" onBlur={save} /></label>
      <label className="field-label">Follow user ID <span className="muted-label">Optional</span><input value={followUserId} onChange={(event) => setFollowUserId(event.target.value)} placeholder="Join a user's current game" /></label>
      <button type="button" className="outline-button compact-button" disabled={!account.hasCredentials || launching || !followUserId.trim()} onClick={() => onLaunch(placeId, '', undefined, followUserId.trim())}><Icon name="users" size={15} /> Follow user</button>
      <button type="button" className="primary-button launch-button" disabled={!account.hasCredentials || launching} onClick={() => onLaunch(placeId.trim() || selectedGame?.placeId || account.placeId, jobId)}><Icon name={launching ? 'clock' : 'launch'} size={17} /> {launching ? 'Launching...' : 'Launch Roblox'}</button>
    </div></section>
    <section className="detail-card-section detail-profile-section"><div className="detail-section-heading"><strong>Profile details</strong><span>Saved as you edit</span></div><div className="form-stack compact-form">
      <label className="field-label">Game<select value={gameId} onChange={(event) => { setGameId(event.target.value); setCategoryId(games.find((game) => game.id === event.target.value)?.categories[0]?.id ?? '') }} onBlur={save}>{games.map((game) => <option value={game.id} key={game.id}>{game.name}</option>)}</select></label>
      <label className="field-label">Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} onBlur={save}>{(selectedGame?.categories ?? []).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
      <label className="field-label">Alias<input value={alias} onChange={(event) => setAlias(event.target.value)} onBlur={save} /></label>
      <label className="field-label">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} onBlur={save} rows={2} /></label>
    </div></section>
    <div className="detail-actions"><button type="button" className="text-button danger" onClick={onRemove}><Icon name="trash" size={14} /> Remove profile</button></div>
    {showActions && createPortal(
      <div className="action-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowActions(false) }}>
        <section className="action-modal" role="dialog" aria-modal="true" aria-labelledby="account-actions-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="action-modal-header"><div><span className="eyebrow">Profile tools</span><h2 id="account-actions-title">{account.alias || account.username}</h2><p>Actions apply to this account only.</p></div><button type="button" className="icon-button" aria-label="Close account actions" onClick={() => setShowActions(false)}><Icon name="close" size={17} /></button></div>
          <div className="action-modal-body">
            <div className="action-modal-section">
              <div className="action-modal-section-heading"><strong>Account action</strong><span>{account.hasCredentials ? 'Secure session ready' : 'Sign-in required'}</span></div>
              <label className="field-label">Task<select value={utility} onChange={(event) => chooseUtility(event.target.value as UtilityAction)}>{(Object.keys(UTILITY_ACTIONS) as UtilityAction[]).map((action) => <option value={action} key={action}>{UTILITY_ACTIONS[action].label}</option>)}</select></label>
              <p className="action-modal-description">{actionMeta.description}</p>
              {actionMeta.valueLabel && <label className="field-label">{actionMeta.valueLabel}{actionMeta.valueOptions ? <select value={utilityValue || actionMeta.valueOptions[0]} onChange={(event) => setUtilityValue(event.target.value)}>{actionMeta.valueOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select> : <input type={actionMeta.valueType ?? 'text'} value={utilityValue} onChange={(event) => setUtilityValue(event.target.value)} placeholder={actionMeta.valuePlaceholder} />}</label>}
              {actionMeta.secondaryLabel && <label className="field-label">{actionMeta.secondaryLabel}<input type={actionMeta.valueType ?? 'text'} value={utilitySecondaryValue} onChange={(event) => setUtilitySecondaryValue(event.target.value)} placeholder={actionMeta.secondaryPlaceholder} /></label>}
              <button type="button" className="primary-button" disabled={!account.hasCredentials || utilityBusy} onClick={() => void runUtility()}>{utilityBusy ? 'Running...' : actionMeta.label} <Icon name={utilityBusy ? 'clock' : 'arrow'} size={15} /></button>
              {utilityMessage && <span className="action-modal-feedback">{utilityMessage}</span>}
            </div>
            <div className="action-modal-section">
              <div className="action-modal-section-heading"><strong>Move or duplicate</strong><span>{transferMode === 'move' ? 'Remove from current section' : 'Keep original profile'}</span></div>
              <p className="action-modal-description">Choose whether this account should leave its current game collection or be copied into another destination.</p>
              <div className="transfer-choice-grid compact">
                <button type="button" className={'transfer-choice ' + (transferMode === 'move' ? 'selected' : '')} aria-pressed={transferMode === 'move'} onClick={() => setTransferMode('move')}><strong><Icon name="arrow" size={15} /> Move</strong><span>Use the same connected account in the new destination and remove this profile from the current one.</span></button>
                <button type="button" className={'transfer-choice ' + (transferMode === 'duplicate' ? 'selected' : '')} aria-pressed={transferMode === 'duplicate'} onClick={() => setTransferMode('duplicate')}><strong><Icon name="copy" size={15} /> Duplicate</strong><span>Keep this profile where it is and create a matching connected profile in the new destination.</span></button>
              </div>
              <div className="action-modal-two-col">
                <label className="field-label">Destination game<select value={targetGameId} onChange={(event) => { const nextGameId = event.target.value; setTargetGameId(nextGameId); setTargetCategoryId(games.find((game) => game.id === nextGameId)?.categories[0]?.id ?? '') }}>{games.map((game) => <option value={game.id} key={game.id}>{game.name}</option>)}</select></label>
                <label className="field-label">Category<select value={targetCategoryId} onChange={(event) => setTargetCategoryId(event.target.value)}>{(targetGame?.categories ?? []).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
              </div>
              <button type="button" className="primary-button" disabled={!canTransfer || transferBusy} onClick={() => void transferAccount()}>{transferBusy ? 'Transferring...' : transferMode === 'move' ? 'Move account' : 'Duplicate account'} <Icon name={transferBusy ? 'clock' : 'arrow'} size={15} /></button>
              {!canTransfer && <span className="action-modal-note">Choose a different game or category to continue.</span>}
            </div>
            <div className="action-modal-section">
              <div className="action-modal-section-heading"><strong>FPS for this account</strong><span>{account.fpsOverride === null ? 'Uses Utilities default' : account.fpsOverride + ' FPS at launch'}</span></div>
              <p className="action-modal-description">Override the general Utilities FPS setting for this account when its Roblox Player window launches.</p>
              <div className="action-modal-fps"><label className="check-label"><input type="checkbox" checked={fpsEnabled} onChange={(event) => setFpsEnabled(event.target.checked)} /> Use account override</label><label className="field-label">Target FPS<input type="number" min={15} max={1000} value={fpsValue} onChange={(event) => setFpsValue(Number(event.target.value))} /></label></div>
              <button type="button" className="outline-button" disabled={fpsBusy} onClick={() => void saveFpsOverride()}>{fpsBusy ? 'Saving...' : 'Save account FPS'} <Icon name={fpsBusy ? 'clock' : 'check'} size={15} /></button>
            </div>
            <div className="action-modal-section">
              <div className="action-modal-section-heading"><strong>Memory Saver</strong><span>{memorySaver ? 'Low priority at launch' : 'Standard memory behavior'}</span></div>
              <p className="action-modal-description">Applies only to this account’s Roblox process: Windows gives it a lower memory priority and trims its working set once after the game window starts. Windows does not provide a true per-process compression switch, so this may reduce resident RAM temporarily but can increase reload or page-fault stutter.</p>
              <label className="check-label"><input type="checkbox" checked={memorySaver} onChange={(event) => setMemorySaver(event.target.checked)} /> Use Memory Saver for this account</label>
              <button type="button" className="outline-button" disabled={memoryBusy} onClick={() => void saveMemorySaver()}>{memoryBusy ? 'Saving...' : 'Save memory setting'} <Icon name={memoryBusy ? 'clock' : 'check'} size={15} /></button>
            </div>
            <div className="action-modal-section recovery-policy-section">
              <div className="action-modal-section-heading"><strong>Session Guardian recovery</strong><span>{recoveryEnabled ? `${recoveryAttempts} retries enabled` : 'Disabled for this account'}</span></div>
              <p className="action-modal-description">Automatically relaunch this account after a crash, an unexpected client exit, or presence that stays stale. Guardian checks the process identity before closing anything and stops after the retry limit.</p>
              <label className="check-label"><input type="checkbox" checked={recoveryEnabled} onChange={(event) => setRecoveryEnabled(event.target.checked)} /> Recover this account automatically</label>
              <div className="action-modal-two-col">
                <label className="field-label">Retry attempts<input type="number" min={1} max={5} value={recoveryAttempts} onChange={(event) => setRecoveryAttempts(Number(event.target.value))} /></label>
                <label className="field-label">Cooldown seconds<input type="number" min={0} max={3600} value={recoveryCooldown} onChange={(event) => setRecoveryCooldown(Number(event.target.value))} /></label>
              </div>
              <label className="check-label"><input type="checkbox" checked={recoveryFallback} onChange={(event) => setRecoveryFallback(event.target.checked)} /> Fall back to a public server after the first retry</label>
              <button type="button" className="outline-button" disabled={recoveryBusy} onClick={() => void saveRecoveryPolicy()}>{recoveryBusy ? 'Saving...' : 'Save recovery policy'} <Icon name={recoveryBusy ? 'clock' : 'check'} size={15} /></button>
            </div>
          </div>
        </section>
      </div>,
      document.body,
    )}
  </div>
}

function CookieImportPanel({ games, onClose, onImported }: { games: GameCollection[]; onClose: () => void; onImported: () => void }) {
  const [text, setText] = useState('')
  const [format, setFormat] = useState<'cookie' | 'username-password' | 'username-cookie'>('cookie')
  const [gameId, setGameId] = useState(games[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(games[0]?.categories[0]?.id ?? '')
  const selectedGame = games.find((game) => game.id === gameId)
  const [status, setStatus] = useState('')
  const revealRef = useMotionReveal<HTMLElement>()
  const submit = async (event: FormEvent) => { event.preventDefault(); setStatus('Importing securely…'); try { const result = await window.valdor.accounts.bulkImport({ text, format, gameId, categoryId }); setStatus(`${result.imported.length} imported${result.failed.length ? `, ${result.failed.length} failed` : ''}.`); onImported() } catch (caught) { setStatus(caught instanceof Error ? caught.message : 'Import failed.') } }
  return <section ref={revealRef} className="add-profile-panel credential-panel motion-reveal"><div className="add-profile-head"><div><span className="eyebrow">Advanced import</span><h2>Import an existing session</h2></div><button type="button" className="icon-button" aria-label="Close credential import" onClick={onClose}><Icon name="close" size={18} /></button></div><form onSubmit={(event) => void submit(event)}><div className="add-profile-fields"><label className="field-label">Format<select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="cookie">One cookie per line</option><option value="username-cookie">Username | cookie</option><option value="username-password">Username:password</option></select></label><label className="field-label">Game<select value={gameId} onChange={(event) => { setGameId(event.target.value); setCategoryId(games.find((game) => game.id === event.target.value)?.categories[0]?.id ?? '') }}>{games.map((game) => <option value={game.id} key={game.id}>{game.name}</option>)}</select></label><label className="field-label">Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{(selectedGame?.categories ?? []).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label></div><label className="field-label import-textarea">Import lines<textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder={format === 'username-password' ? 'username:password' : '.ROBLOSECURITY value'} /></label><div className="add-profile-actions"><span><Icon name="shield" size={14} /> Stored with Windows secure storage.</span><div><span className="form-status">{status}</span><button type="submit" className="primary-button" disabled={!text.trim()}>Import existing session <Icon name="arrow" size={16} /></button></div></div></form></section>
}

function GamesView({ games, accounts, entitlements, selectedGame: selectedGameProp, onSelect, onUpdate, onCreate, onRemove, onCategoryCreate, onCategoryUpdate, onCategoryRemove }: { games: GameCollection[]; accounts: Account[]; entitlements: PlanEntitlements; selectedGame: GameCollection | null; onSelect: (id: string) => void; onUpdate: (game: GameCollection) => void; onCreate: (input: { name: string; placeId: string; description: string }) => void; onRemove: (id: string) => void; onCategoryCreate: (gameId: string, name: string) => void; onCategoryUpdate: (gameId: string, categoryId: string, input: UpdateCategoryInput) => Promise<boolean>; onCategoryRemove: (gameId: string, categoryId: string) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [placeId, setPlaceId] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [categorySaving, setCategorySaving] = useState(false)
  const [categoryIconOpenId, setCategoryIconOpenId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const selectedGame = selectedGameProp ?? games[0] ?? null
  const gameLimitReached = entitlements.maxGames !== null && games.length >= entitlements.maxGames
  const gameRefreshKey = games.map((game) => game.id + ':' + game.placeId).join('|')
  const revealRef = useMotionReveal<HTMLElement>()

  useEffect(() => { if (!selectedGameProp && games[0]) onSelect(games[0].id) }, [games, onSelect, selectedGameProp])
  useEffect(() => {
    let disposed = false
    let busy = false
    const refresh = async () => {
      if (busy || games.length === 0) return
      busy = true
      setRefreshing(true)
      const updates = await Promise.all(games.map((game) => window.valdor.games.refreshInfo(game.id).catch(() => null)))
      if (!disposed) {
        updates.forEach((updated) => { if (updated) onUpdate(updated) })
        setRefreshing(false)
      }
      busy = false
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 30000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [gameRefreshKey])

  const countFor = (gameId: string, categoryId?: string) => accounts.filter((account) => account.gameId === gameId && (!categoryId || account.categoryId === categoryId)).length
  const thumbnail = (game: GameCollection, size: number) => game.thumbnailUrl ? <img src={game.thumbnailUrl} alt={game.name + ' thumbnail'} /> : <Icon name="game" size={size} />
  const beginCategoryRename = (categoryId: string, categoryName: string) => { setEditingCategoryId(categoryId); setEditingCategoryName(categoryName) }
  const cancelCategoryRename = () => { setEditingCategoryId(null); setEditingCategoryName('') }
  const saveCategoryName = async () => {
    if (!selectedGame || !editingCategoryId) return
    const nextName = editingCategoryName.trim()
    if (!nextName) return
    setCategorySaving(true)
    const saved = await onCategoryUpdate(selectedGame.id, editingCategoryId, { name: nextName })
    setCategorySaving(false)
    if (saved) cancelCategoryRename()
  }
  const saveCategoryIcon = async (categoryId: string, icon: CategoryIcon) => {
    if (!selectedGame) return
    setCategorySaving(true)
    const saved = await onCategoryUpdate(selectedGame.id, categoryId, { icon })
    setCategorySaving(false)
    if (saved) setCategoryIconOpenId(null)
  }

  return <section ref={revealRef} className="games-view motion-reveal"><div className="game-layout"><div className="game-card-list">{games.map((game) => <button type="button" className={'game-card ' + (selectedGame?.id === game.id ? 'selected ' : '') + (game.favorite ? 'favorite' : '')} key={game.id} onClick={() => onSelect(game.id)}><div className="game-card-top"><span className="game-card-identity"><span className="game-thumbnail">{thumbnail(game, 17)}</span></span><span className="game-card-count">{countFor(game.id)} profiles</span></div><h2>{game.name}</h2><p>{game.description}</p>{game.creatorName && <span className="game-live-line">{game.creatorName} · {formatMetric(game.playing)} playing · {formatMetric(game.visits)} visits</span>}<div className="game-card-bottom"><span className="game-place-meta"><span>Place ID</span><code>{game.placeId || 'Not set'}</code></span>{game.favorite && <span className="game-favorite active"><Icon name="star" size={13} filled /><span>Favourited</span></span>}</div></button>)}<button type="button" className={'game-card add-game-card ' + (gameLimitReached ? 'limit-reached' : '')} disabled={gameLimitReached} title={gameLimitReached ? getPlanLimitError(entitlements, 'games') : undefined} onClick={() => setShowForm((current) => !current)}><Icon name={gameLimitReached ? 'shield' : 'plus'} size={22} /><strong>{gameLimitReached ? 'Game limit reached' : 'New game'}</strong><span>{gameLimitReached ? getPlanLimitError(entitlements, 'games') : 'Add a Roblox game ID and the live details will fill in automatically.'}</span></button></div><div className="game-editor">{showForm && <form className="inline-editor" onSubmit={(event) => { event.preventDefault(); onCreate({ name, placeId, description }); setName(''); setPlaceId(''); setDescription(''); setShowForm(false) }}><span className="eyebrow">New collection</span><h2>Make a game shelf</h2><label className="field-label">Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Dungeon Quest Reborn" autoFocus /></label><label className="field-label">Game ID / Place ID<input value={placeId} onChange={(event) => setPlaceId(event.target.value)} placeholder="77649408247578" /></label><label className="field-label">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="What belongs in this game collection?" /></label><button type="submit" className="primary-button" disabled={!name.trim()}>Create game <Icon name="arrow" size={16} /></button></form>}{selectedGame ? <div className="game-editor-card"><div className="game-editor-header"><div className="game-editor-identity"><span className="game-thumbnail large">{thumbnail(selectedGame, 22)}</span><div><span className="eyebrow">Selected game</span><h2>{selectedGame.name}</h2><p className="game-editor-place"><Icon name="game" size={12} /><code>{selectedGame.placeId || 'Add a game ID to unlock live Roblox data.'}</code></p></div></div><button type="button" className={'icon-button favorite-toggle ' + (selectedGame.favorite ? 'active' : '')} title={selectedGame.favorite ? 'Remove game from favourites' : 'Add game to favourites'} aria-label={selectedGame.favorite ? 'Remove game from favorites' : 'Add game to favorites'} aria-pressed={selectedGame.favorite} onClick={() => void window.valdor.games.toggleFavorite(selectedGame.id).then(onUpdate)}><Icon name="star" size={18} filled={selectedGame.favorite} /></button></div><div className="game-live-panel"><div className="game-live-heading"><span><Icon name="globe" size={14} /> <strong>Live game data</strong></span><span className="game-live-updated">{refreshing ? 'Refreshing...' : selectedGame.infoUpdatedAt ? 'Updated ' + formatRelativeTime(selectedGame.infoUpdatedAt) : 'Waiting for first refresh'}</span></div><div className="game-metrics"><span><strong>{selectedGame.creatorName || '—'}</strong><small>Creator</small></span><span><strong>{formatMetric(selectedGame.playing)}</strong><small>Playing now</small></span><span><strong>{formatMetric(selectedGame.visits)}</strong><small>Visits</small></span></div></div><label className="field-label">Game name<input defaultValue={selectedGame.name} onBlur={(event) => void window.valdor.games.update(selectedGame.id, { name: event.target.value }).then(onUpdate)} /></label><label className="field-label">Game ID / Place ID<input defaultValue={selectedGame.placeId} onBlur={(event) => void window.valdor.games.update(selectedGame.id, { placeId: event.target.value }).then(onUpdate)} /></label><label className="field-label">Description<textarea defaultValue={selectedGame.description} rows={2} onBlur={(event) => void window.valdor.games.update(selectedGame.id, { description: event.target.value }).then(onUpdate)} /></label><div className="category-editor"><div className="panel-heading"><span>Sub-categories</span><span>{selectedGame.categories.length}</span></div>{selectedGame.categories.map((item) => <div className={'category-editor-row ' + (categoryIconOpenId === item.id ? 'icon-menu-open' : '')} key={item.id}>{editingCategoryId === item.id ? <div className="category-edit-control"><input value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveCategoryName() } if (event.key === 'Escape') cancelCategoryRename() }} autoFocus /><button type="button" className="icon-button mini-button" aria-label="Save category name" disabled={categorySaving || !editingCategoryName.trim()} onClick={() => void saveCategoryName()}><Icon name={categorySaving ? 'clock' : 'check'} size={13} /></button><button type="button" className="icon-button mini-button" aria-label="Cancel category rename" onClick={cancelCategoryRename}><Icon name="close" size={13} /></button></div> : <><CategoryIconPicker categoryId={item.name} icon={item.icon ?? 'folder'} open={categoryIconOpenId === item.id} busy={categorySaving} onToggle={() => setCategoryIconOpenId((current) => current === item.id ? null : item.id)} onPick={(icon) => void saveCategoryIcon(item.id, icon)} /><span className="category-name">{item.name}</span><span className="category-count">{countFor(selectedGame.id, item.id)}</span><button type="button" className="icon-button mini-button" aria-label={'Rename ' + item.name} onClick={() => beginCategoryRename(item.id, item.name)}><Icon name="edit" size={13} /></button>{selectedGame.categories.length > 1 && <button type="button" className="icon-button mini-button" aria-label={'Remove ' + item.name} onClick={() => onCategoryRemove(selectedGame.id, item.id)}><Icon name="trash" size={13} /></button>}</>}</div>)}<div className="category-add"><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="New category, e.g. Fighters" /><button type="button" className="primary-button" disabled={!category.trim()} onClick={() => { onCategoryCreate(selectedGame.id, category); setCategory('') }}><Icon name="plus" size={15} /> Add</button></div></div><div className="game-editor-footer"><button type="button" className="text-button danger" onClick={() => onRemove(selectedGame.id)}><Icon name="trash" size={14} /> Remove game collection</button></div></div> : <div className="no-selection"><div className="empty-mark"><Icon name="game" size={22} /></div><h2>Choose a game</h2><p>Games replace the old flat groups. Categories keep storage, fighters, and other roles together.</p></div>}</div></div></section>
}

function sessionStatusLabel(session: SessionRecord): string {
  if (session.status === 'running') {
    if (session.presenceState === 'in-game') return 'In game'
    if (session.presenceState === 'in-studio') return 'In studio'
    if (session.presenceState === 'online') return 'Online'
    return 'Running'
  }
  if (session.status === 'launching') return 'Launching'
  if (session.status === 'unresponsive') return 'Unresponsive'
  if (session.status === 'closing') return 'Closing'
  if (session.status === 'crashed') return 'Crashed'
  if (session.status === 'exited') return 'Ended'
  return 'Unknown'
}

function sessionStatusTone(session: SessionRecord): string {
  if (session.status === 'running') return 'running'
  if (session.status === 'launching') return 'launching'
  if (session.status === 'unresponsive') return 'unresponsive'
  if (session.status === 'closing') return 'closing'
  if (session.status === 'crashed') return 'crashed'
  return 'ended'
}

function sessionPresenceLabel(session: SessionRecord): string {
  if (session.presenceState === 'in-game') return 'Roblox says in game'
  if (session.presenceState === 'in-studio') return 'Roblox Studio'
  if (session.presenceState === 'online') return 'Online outside an experience'
  if (session.presenceState === 'offline') return 'Roblox says offline'
  if (session.presenceState === 'stale') return 'Presence is stale'
  if (session.presenceState === 'unavailable') return 'Presence unavailable'
  return 'Presence not checked yet'
}

function SessionList({ sessions, accounts, games, onSelect, onCopy, onStop, compact = false }: { sessions: SessionRecord[]; accounts: Account[]; games: GameCollection[]; onSelect: (id: string) => void; onCopy: (text: string) => Promise<boolean>; onStop: (id: string) => Promise<void>; compact?: boolean }) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copiedTimer = useRef<number | null>(null)
  useEffect(() => () => { if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current) }, [])
  const copyJobId = async (event: ReactMouseEvent<HTMLButtonElement>, sessionId: string, jobId: string) => {
    event.stopPropagation()
    if (!(await onCopy(jobId))) return
    setCopiedId(sessionId)
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopiedId(null), 1800)
  }

  if (sessions.length === 0) return <div className="session-guardian-empty"><span className="empty-mark"><Icon name="window" size={22} /></span><div><strong>No managed Roblox sessions</strong><p>Launch a connected account and Session Guardian will attach to its process automatically.</p></div></div>

  return <div className={`session-guardian-list ${compact ? 'compact' : ''}`}>{sessions.map((session, index) => {
    const account = accounts.find((candidate) => candidate.id === session.accountId)
    const game = account ? games.find((candidate) => candidate.id === account.gameId) : undefined
    const label = account?.alias || account?.username || 'Unknown account'
    const placeId = session.placeId || account?.placeId || ''
    const experienceName = session.experienceName || games.find((candidate) => candidate.placeId === placeId)?.name || game?.name || 'Roblox'
    const checkedAt = session.lastPresenceCheckAt || session.lastProcessCheckAt
    const jobId = session.jobId.trim()
    const statusLabel = sessionStatusLabel(session)
    const statusTone = sessionStatusTone(session)
    return <article className="session-guardian-row motion-item" style={{ '--motion-delay': `${index * 45}ms` } as CSSProperties} key={session.id}>
      <span className="session-avatar">{account?.avatarUrl ? <img src={account.avatarUrl} alt={`${label} avatar`} /> : <span>{account ? getInitials(account) : '?'}</span>}</span>
      <div className="session-guardian-account"><strong>{label}</strong><span>@{account?.username || 'unknown'}</span>{account?.displayName && account.displayName !== account.username && <small>{account.displayName}</small>}</div>
      <div className="session-guardian-experience"><small>Experience</small><strong>{experienceName}</strong><span>Place {placeId || 'not reported'}</span>{session.region !== 'Unknown' && <span>{session.region}</span>}</div>
      <div className="session-guardian-instance"><small>Current server job</small><div className="session-job-value"><strong title={jobId || undefined}>{jobId ? `${jobId.slice(0, 16)}...` : 'Waiting for fresh presence'}</strong>{jobId && <button type="button" className="inline-copy-button" aria-label="Copy server job ID" title="Copy server job ID" onClick={(event) => void copyJobId(event, session.id, jobId)}><Icon name={copiedId === session.id ? 'check' : 'copy'} size={13} /><span>{copiedId === session.id ? 'Copied' : 'Copy ID'}</span></button>}</div>{!jobId && session.targetJobId && <span title={session.targetJobId}>Target {session.targetJobId.slice(0, 16)}...</span>}<span>{checkedAt ? `Checked ${formatRelativeTime(checkedAt)}` : 'Watching process'}</span></div>
      <div className={`session-guardian-state session-runtime-state ${statusTone}`}><span className="status-dot" />{statusLabel}<small>{sessionPresenceLabel(session)}</small>{session.memoryMb !== null && <small>{session.memoryMb.toFixed(1)} MB working set</small>}</div>
      <div className="session-actions"><button type="button" className="outline-button session-open-button" onClick={() => onSelect(session.accountId)}><span>Open account</span><Icon name="arrow" size={15} /></button>{session.status !== 'closing' && <button type="button" className="text-button session-stop-button" onClick={() => void onStop(session.id)} disabled={!session.processId}><Icon name="close" size={14} /> Stop</button>}</div>
    </article>
  })}</div>
}

function recoveryStatusLabel(job: RecoveryJob): string {
  if (job.status === 'launching') return 'Launching retry'
  if (job.status === 'exhausted') return 'Retry limit reached'
  if (job.status === 'cancelled') return 'Cancelled'
  return 'Retry scheduled'
}

function RecoveryQueue({ jobs, accounts, onCancel }: { jobs: RecoveryJob[]; accounts: Account[]; onCancel: (jobId: string) => Promise<void> }) {
  const visibleJobs = jobs.filter((job) => job.status === 'scheduled' || job.status === 'launching')
  if (visibleJobs.length === 0) return null
  return <section className="recovery-queue" aria-labelledby="recovery-queue-title">
    <div className="recovery-queue-heading"><div><span className="eyebrow">Automatic recovery</span><h3 id="recovery-queue-title">Guardian queue</h3></div><span>{formatCount(visibleJobs.length, 'retry')}</span></div>
    <div className="recovery-queue-list">{visibleJobs.map((job) => {
      const account = accounts.find((candidate) => candidate.id === job.accountId)
      const label = account?.alias || account?.username || 'Unknown account'
      return <div className="recovery-queue-row" key={job.id}><div><strong>{label}</strong><span>{job.jobId ? 'Retrying the previous server first' : 'Public server fallback'}</span></div><div><small>{recoveryStatusLabel(job)}</small><span>Attempt {job.attempt + (job.status === 'scheduled' ? 1 : 0)} of {job.maxAttempts}{job.status === 'scheduled' ? ` · ${formatRetryTime(job.scheduledAt)}` : ''}</span></div>{job.status === 'scheduled' && <button type="button" className="text-button danger" onClick={() => void onCancel(job.id)}>Cancel</button>}</div>
    })}</div>
  </section>
}

function SessionsView({ accounts, games, sessions, onSelect, onCopy, onStop, onCancelRecovery }: { accounts: Account[]; games: GameCollection[]; sessions: SessionSnapshot; onSelect: (id: string) => void; onCopy: (text: string) => Promise<boolean>; onStop: (id: string) => Promise<void>; onCancelRecovery: (jobId: string) => Promise<void> }) {
  const revealRef = useMotionReveal<HTMLElement>()
  const activeSessions = sessions.active
  return <section ref={revealRef} className="sessions-view motion-reveal">
    <div className="section-banner session-section-banner"><div className="section-banner-copy"><span className="eyebrow">Session Guardian</span><h2>{activeSessions.length > 0 ? 'Roblox sessions in motion' : 'Nothing is running'}</h2><p>Process identity and Roblox presence are tracked independently. Stale data expires automatically so this board stays trustworthy.</p></div><div className="session-banner-actions"><div className="session-count" aria-label={`${activeSessions.length} active sessions`}>{activeSessions.length.toString().padStart(2, '0')}</div></div></div>
    <SessionList sessions={activeSessions} accounts={accounts} games={games} onSelect={onSelect} onCopy={onCopy} onStop={onStop} />
    <RecoveryQueue jobs={sessions.recoveryJobs} accounts={accounts} onCancel={onCancelRecovery} />
  </section>
}

type ServerPlayerOrder = 'none' | 'highest' | 'lowest'
type ServerPingFilter = 'all' | 'fast' | 'mid' | 'slow' | 'unknown'

function ServersView({ selectedAccount, recentGames, launching, onLaunch, onCopy, onActivity, onError }: { selectedAccount: Account | null; recentGames: Array<{ id: string; name: string; placeId: string; jobId: string }>; launching: boolean; onLaunch: (placeId: string, jobId: string, gameId?: string) => Promise<boolean>; onCopy: (text: string) => Promise<boolean>; onActivity: (message: string, detail: string, tone?: ActivityTone) => void; onError: (message: string) => void }) {
  const [placeId, setPlaceId] = useState(selectedAccount?.placeId ?? '')
  const [servers, setServers] = useState<ServerRecord[]>([])
  const [pageCursor, setPageCursor] = useState<string | undefined>()
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [previousCursor, setPreviousCursor] = useState<string | undefined>()
  const [pageNumber, setPageNumber] = useState(1)
  const [loading, setLoading] = useState(false)
  const [serverFilter, setServerFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('all')
  const [playerOrder, setPlayerOrder] = useState<ServerPlayerOrder>('none')
  const [pingFilter, setPingFilter] = useState<ServerPingFilter>('all')
  const [minPlayers, setMinPlayers] = useState('')
  const [maxPlayers, setMaxPlayers] = useState('')
  const [maxPing, setMaxPing] = useState('')
  const [sortMode, setSortMode] = useState<ServerFilterCriteria['sort']>('default')
  const [excludeVisited, setExcludeVisited] = useState(false)
  const [includeFavoritesOnly, setIncludeFavoritesOnly] = useState(false)
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false)
  const [finderState, setFinderState] = useState<ServerFinderState>({ presets: [], history: [], preferences: [], lastKnown: null })
  const [presetName, setPresetName] = useState('')
  const [joinState, setJoinState] = useState<{ phase: 'idle' | 'launching' | 'launched' | 'failed'; serverId: string; message: string }>({ phase: 'idle', serverId: '', message: '' })
  const [regionLoading, setRegionLoading] = useState<Record<string, boolean>>({})
  const [source, setSource] = useState('')
  const regionRunRef = useRef(0)
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null)
  const copiedJobTimer = useRef<number | null>(null)
  const revealRef = useMotionReveal<HTMLElement>()
  useEffect(() => () => { if (copiedJobTimer.current !== null) window.clearTimeout(copiedJobTimer.current) }, [])

  useEffect(() => {
    regionRunRef.current += 1
    setPlaceId(selectedAccount?.placeId ?? '')
    setPageCursor(undefined)
    setNextCursor(undefined)
    setPreviousCursor(undefined)
    setPageNumber(1)
    setServers([])
    setRegionLoading({})
    setRegionFilter('all')
    setFinderState({ presets: [], history: [], preferences: [], lastKnown: null })
    if (selectedAccount?.gameId && selectedAccount.placeId) void window.valdor.servers.getFinderState({ gameId: selectedAccount.gameId, accountId: selectedAccount.id, placeId: selectedAccount.placeId }).then(setFinderState).catch(() => undefined)
  }, [selectedAccount?.id, selectedAccount?.placeId])

  const criteria = useMemo<ServerFilterCriteria>(() => ({
    minPlayers: minPlayers ? Number(minPlayers) : null,
    maxPlayers: maxPlayers ? Number(maxPlayers) : null,
    minPing: null,
    maxPing: maxPing ? Number(maxPing) : null,
    regionAllowList: regionFilter === 'all' ? [] : [regionFilter],
    regionDenyList: [],
    serverTypes: ['public'],
    jobId: serverFilter,
    maxAgeMinutes: null,
    excludeVisited,
    includeFavoritesOnly,
    sort: sortMode,
  }), [minPlayers, maxPlayers, maxPing, regionFilter, serverFilter, excludeVisited, includeFavoritesOnly, sortMode])

  const applyCriteria = (next: ServerFilterCriteria) => {
    setServerFilter(next.jobId); setRegionFilter(next.regionAllowList[0] ?? 'all'); setMinPlayers(next.minPlayers?.toString() ?? ''); setMaxPlayers(next.maxPlayers?.toString() ?? ''); setMaxPing(next.maxPing?.toString() ?? ''); setExcludeVisited(next.excludeVisited); setIncludeFavoritesOnly(next.includeFavoritesOnly); setSortMode(next.sort)
  }

  const refreshFinderState = async () => {
    if (!selectedAccount?.gameId) return
    setFinderState(await window.valdor.servers.getFinderState({ gameId: selectedAccount.gameId, accountId: selectedAccount.id, placeId }))
  }

  const resolveOneRegion = async (targetPlaceId: string, serverId: string, accountId: string, runId: number): Promise<ServerRecord | null> => {
    setRegionLoading((current) => ({ ...current, [serverId]: true }))
    try {
      const updated = await window.valdor.servers.loadRegion(targetPlaceId, serverId, accountId)
      if (regionRunRef.current === runId) setServers((current) => current.map((item) => item.id === updated.id ? updated : item))
      return updated.region && updated.region !== 'Unknown' ? updated : null
    } catch {
      return null
    } finally {
      setRegionLoading((current) => ({ ...current, [serverId]: false }))
    }
  }

  const refreshRegions = async (targetServers: ServerRecord[], targetPlaceId: string, accountId?: string) => {
    if (!accountId || !selectedAccount?.hasCredentials) return
    const candidates = targetServers.filter((server) => !server.regionLoaded)
    if (candidates.length === 0) return
    const runId = regionRunRef.current + 1
    regionRunRef.current = runId
    let resolved = 0
    for (let index = 0; index < candidates.length; index += 6) {
      if (regionRunRef.current !== runId) return
      const batch = candidates.slice(index, index + 6)
      const results = await Promise.all(batch.map((server) => resolveOneRegion(targetPlaceId, server.id, accountId, runId)))
      resolved += results.filter((result) => result !== null).length
    }
    if (regionRunRef.current === runId) {
      onActivity('Regions refreshed', resolved > 0 ? resolved + ' server locations found' : 'Roblox did not return locations for this page', resolved > 0 ? 'positive' : 'warning')
    }
  }

  const loadPage = async (requestedCursor: string | undefined, direction = 0, requestedCriteria = criteria) => {
    const cleanPlaceId = placeId.trim()
    if (!cleanPlaceId) {
      onError('Enter a Place ID before refreshing servers.')
      return
    }
    setLoading(true)
    setRegionLoading({})
    try {
      const result = await window.valdor.servers.list({ placeId: cleanPlaceId, cursor: requestedCursor, limit: 50, gameId: selectedAccount?.gameId, accountId: selectedAccount?.id, filters: requestedCriteria })
      setServers(result.servers)
      setPageCursor(requestedCursor)
      setNextCursor(result.nextCursor ?? undefined)
      setPreviousCursor(result.previousCursor ?? undefined)
      setPageNumber((current) => direction === 0 ? 1 : Math.max(1, current + direction))
      setSource(result.source === 'roblox' ? 'Live Roblox data' : 'Offline cache')
      if (result.finderState) setFinderState(result.finderState)
      onActivity('Server list refreshed', result.servers.length + ' public servers found', 'positive')
      void refreshRegions(result.servers, cleanPlaceId, selectedAccount?.hasCredentials ? selectedAccount.id : undefined)
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Server list failed.')
    } finally {
      setLoading(false)
    }
  }

  const regions = useMemo(() => [...new Set(servers.map((server) => server.region).filter((region) => region.trim()))].sort((left, right) => left.localeCompare(right)), [servers])
  const filteredServers = useMemo(() => {
    const query = serverFilter.trim().toLowerCase()
    const output = servers.filter((server) => {
      const ping = server.ping > 0 ? server.ping : null
      const matchesJob = !query || server.id.toLowerCase().includes(query)
      const matchesRegion = regionFilter === 'all' || server.region === regionFilter
      const matchesPing = pingFilter === 'all'
        || pingFilter === 'fast' && ping !== null && ping <= 50
        || pingFilter === 'mid' && ping !== null && ping > 50 && ping <= 150
        || pingFilter === 'slow' && ping !== null && ping > 150
        || pingFilter === 'unknown' && ping === null
      return matchesJob && matchesRegion && matchesPing
    })
    if (playerOrder === 'highest') output.sort((left, right) => right.playing - left.playing || left.ping - right.ping)
    if (playerOrder === 'lowest') output.sort((left, right) => left.playing - right.playing || left.ping - right.ping)
    return output
  }, [servers, serverFilter, regionFilter, pingFilter, playerOrder])
  const regionPendingCount = Object.values(regionLoading).filter(Boolean).length
  const filtersActive = Boolean(serverFilter.trim()) || regionFilter !== 'all' || playerOrder !== 'none' || pingFilter !== 'all' || Boolean(minPlayers || maxPlayers || maxPing || excludeVisited || includeFavoritesOnly || sortMode !== 'default')
  const advancedFilterCount = [Boolean(minPlayers), Boolean(maxPlayers), Boolean(maxPing), sortMode !== 'default', excludeVisited, includeFavoritesOnly].filter(Boolean).length
  const copyServerJobId = async (event: ReactMouseEvent<HTMLButtonElement>, serverId: string) => {
    event.stopPropagation()
    if (!(await onCopy(serverId))) return
    setCopiedJobId(serverId)
    if (copiedJobTimer.current !== null) window.clearTimeout(copiedJobTimer.current)
    copiedJobTimer.current = window.setTimeout(() => setCopiedJobId(null), 1800)
  }

  const toggleServerPreference = async (server: ServerRecord, kind: 'favorite' | 'avoid') => {
    if (!selectedAccount?.gameId) return
    try {
      const next = kind === 'favorite'
        ? await window.valdor.servers.toggleFavorite({ placeId, gameId: selectedAccount.gameId, accountId: selectedAccount.id, serverId: server.id, value: !server.isFavorite })
        : await window.valdor.servers.toggleAvoid({ placeId, gameId: selectedAccount.gameId, accountId: selectedAccount.id, serverId: server.id, value: !server.isAvoided })
      setFinderState(next)
      setServers((current) => current.map((item) => item.id === server.id ? { ...item, isFavorite: next.preferences.find((item) => item.serverId === server.id)?.favorite ?? item.isFavorite, isAvoided: next.preferences.find((item) => item.serverId === server.id)?.avoid ?? item.isAvoided } : item))
    } catch (caught) { onError(caught instanceof Error ? caught.message : 'Server preference could not be saved.') }
  }

  const joinTarget = async (serverId: string, targetPlaceId = placeId) => {
    if (!selectedAccount?.hasCredentials || !selectedAccount.gameId) { onError('Select a connected account before joining a server.'); return }
    setJoinState({ phase: 'launching', serverId, message: `Launching as ${selectedAccount.alias || selectedAccount.username}…` })
    const succeeded = await onLaunch(targetPlaceId, serverId, selectedAccount.gameId)
    setJoinState({ phase: succeeded ? 'launched' : 'failed', serverId, message: succeeded ? 'Launch request completed. Session Guardian will confirm the client state.' : 'Launch failed. The account remains selected for another attempt.' })
    if (succeeded) void refreshFinderState().catch(() => undefined)
  }

  const savePreset = async () => {
    if (!selectedAccount?.gameId || !presetName.trim()) { onError('Enter a name for this server preset.'); return }
    try {
      const next = await window.valdor.servers.savePreset({ placeId, preset: { name: presetName, gameId: selectedAccount.gameId, accountId: selectedAccount.id, criteria } })
      setFinderState(next); setPresetName(''); onActivity('Server preset saved', `${next.presets[0]?.name ?? 'Preset'} is ready for one-click use`, 'positive')
    } catch (caught) { onError(caught instanceof Error ? caught.message : 'Server preset could not be saved.') }
  }

  const applyPreset = (preset: ServerFilterPreset) => { applyCriteria(preset.criteria); void loadPage(undefined, 0, preset.criteria) }
  const rejoinLastKnown = () => { const last = finderState.lastKnown; if (last) void joinTarget(last.server.id, last.placeId) }

  return <section ref={revealRef} className="servers-view motion-reveal">
    <article className="server-query-panel">
      <div className="server-query-heading">
        <div><span className="eyebrow">Smart Server Finder</span><h2>Find a trustworthy server</h2></div>
        <span className="server-source">{source || 'Roblox public servers'}{pageCursor ? ' - Page ' + pageNumber : ''}</span>
      </div>
      <div className="server-query-row">
        <div className="server-account-chip"><span className="server-account-avatar">{selectedAccount?.avatarUrl ? <img src={selectedAccount.avatarUrl} alt={selectedAccount.username + ' avatar'} /> : <span>{selectedAccount ? getInitials(selectedAccount) : '?'}</span>}</span><span><small>Joining as</small><strong>{selectedAccount ? selectedAccount.alias || selectedAccount.username : 'No account selected'}</strong></span></div>
        <label className="field-label server-place-field">Place ID<input value={placeId} onChange={(event) => setPlaceId(event.target.value)} placeholder="Experience place id" /></label>
        <button type="button" className="primary-button server-refresh-button" disabled={!placeId.trim() || loading} onClick={() => void loadPage(undefined)}><Icon name="refresh" size={16} /> {loading ? 'Refreshing' : 'Refresh servers'}</button>
      </div>
      <p className="server-query-note">Live observations expire after ten minutes. Unknown ping and region values stay unknown; they are never guessed.</p>
      <div className="server-finder-quick-actions"><button type="button" className="primary-button compact-button" disabled={loading || !selectedAccount?.gameId} onClick={() => { setSortMode('score'); void loadPage(undefined, 0, { ...criteria, sort: 'score' }) }}><Icon name="target" size={14} /> Best Match</button><button type="button" className="outline-button compact-button" disabled={!finderState.lastKnown || !selectedAccount?.hasCredentials || launching} onClick={rejoinLastKnown}><Icon name="clock" size={14} /> Rejoin last known</button><span className="server-selected-context">{selectedAccount ? `${selectedAccount.alias || selectedAccount.username} · ${selectedAccount.displayName || 'selected account'}` : 'No account selected'}</span></div>
    </article>

    <article className="server-filter-panel">
      <div className="server-filter-heading">
        <div><span className="eyebrow">Refine results</span><h2>Server filters</h2></div>
        <div className="server-filter-heading-actions"><span>{regionPendingCount > 0 ? 'Resolving ' + regionPendingCount + ' regions' : selectedAccount?.hasCredentials ? 'Regions refresh with the list' : 'Connect an account for regions'}</span><button type="button" className="text-button" disabled={!filtersActive} onClick={() => { setServerFilter(''); setRegionFilter('all'); setPlayerOrder('none'); setPingFilter('all'); setMinPlayers(''); setMaxPlayers(''); setMaxPing(''); setExcludeVisited(false); setIncludeFavoritesOnly(false); setSortMode('default') }}>Clear filters</button></div>
      </div>
      <div className="server-filter-grid server-filter-quick-grid">
        <label className="field-label">Job ID<input value={serverFilter} onChange={(event) => setServerFilter(event.target.value)} placeholder="Search a server job ID" /></label>
        <label className="field-label">Region<select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option value="all">All regions</option>{regions.map((region) => <option value={region} key={region}>{region}</option>)}</select></label>
        <label className="field-label">Players<select value={playerOrder} onChange={(event) => setPlayerOrder(event.target.value as ServerPlayerOrder)}><option value="none">Default order</option><option value="highest">Highest to lowest</option><option value="lowest">Lowest to highest</option></select></label>
        <label className="field-label">Ping<select value={pingFilter} onChange={(event) => setPingFilter(event.target.value as ServerPingFilter)}><option value="all">Any ping</option><option value="fast">Up to 50 ms</option><option value="mid">51 to 150 ms</option><option value="slow">Over 150 ms</option><option value="unknown">Unknown ping</option></select></label>
      </div>
      <details className="server-filter-advanced" open={advancedFiltersOpen} onToggle={(event) => setAdvancedFiltersOpen(event.currentTarget.open)}>
        <summary><span className="server-filter-advanced-copy"><strong>Advanced filters</strong><small>Optional player, ping, ranking, and preference rules</small></span><span className="server-filter-advanced-count">{advancedFilterCount > 0 ? `${advancedFilterCount} active` : 'Optional'}</span></summary>
        <div className="server-filter-grid server-filter-advanced-grid">
        <label className="field-label">Min players<input type="number" min="0" value={minPlayers} onChange={(event) => setMinPlayers(event.target.value)} placeholder="Any" /></label>
        <label className="field-label">Max players<input type="number" min="0" value={maxPlayers} onChange={(event) => setMaxPlayers(event.target.value)} placeholder="Any" /></label>
        <label className="field-label">Max ping<input type="number" min="0" value={maxPing} onChange={(event) => setMaxPing(event.target.value)} placeholder="Any ms" /></label>
        <label className="field-label">Rank by<select value={sortMode} onChange={(event) => setSortMode(event.target.value as ServerFilterCriteria['sort'])}><option value="default">Roblox order</option><option value="score">Best Match score</option><option value="ping">Lowest ping</option><option value="players">Fewest players</option><option value="newest">Newest seen</option></select></label>
        <label className="check-label"><input type="checkbox" checked={excludeVisited} onChange={(event) => setExcludeVisited(event.target.checked)} /> Exclude visited</label>
        <label className="check-label"><input type="checkbox" checked={includeFavoritesOnly} onChange={(event) => setIncludeFavoritesOnly(event.target.checked)} /> Favourites only</label>
        </div>
      </details>
      <div className="server-filter-summary"><span>{servers.length > 0 ? filteredServers.length + ' of ' + servers.length + ' servers shown' : 'Refresh a place to load filter options'} · {sortMode === 'score' ? 'Scores reward lower ping, lower occupancy, freshness, known region, and favourites.' : 'Use Best Match for explainable ranking.'}</span><button type="button" className="outline-button compact-button server-apply-filters" disabled={!placeId.trim() || loading} onClick={() => void loadPage(undefined, 0, criteria)}><Icon name="refresh" size={13} /> Apply filters</button></div>
    </article>

    <article className="server-finder-tools"><div><span className="eyebrow">Repeatable searches</span><h3>Saved presets</h3><p>{finderState.presets.length > 0 ? 'Apply a named filter for this game and account.' : 'Save a quiet, low-ping, or nearly-empty search for this game.'}</p></div><div className="server-preset-save"><input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Preset name" aria-label="Server preset name" /><button type="button" className="outline-button compact-button" disabled={!presetName.trim() || !selectedAccount?.gameId} onClick={() => void savePreset()}>Save preset</button></div><div className="server-preset-list">{finderState.presets.map((preset) => <div className="server-preset" key={preset.id}><button type="button" className="text-button" onClick={() => applyPreset(preset)}>{preset.name}</button><small>{preset.criteria.sort === 'score' ? 'Best Match' : 'Saved filters'}</small><button type="button" className="text-button danger" onClick={() => void window.valdor.servers.deletePreset({ placeId, gameId: preset.gameId, presetId: preset.id, accountId: preset.accountId }).then(setFinderState).catch((caught: unknown) => onError(caught instanceof Error ? caught.message : 'Preset could not be deleted.'))}>Delete</button></div>)}</div></article>

    <div className="server-list-card"><div className="server-results-heading"><div><span className="eyebrow">Server results</span><h2>{servers.length > 0 ? `${filteredServers.length} matches` : 'Public servers'}</h2></div><span className="server-results-meta">{servers.length > 0 ? `${filteredServers.length} of ${servers.length} shown` : 'Refresh to load live servers'}</span></div><div className="server-list-head"><span>Job ID</span><span>Players</span><span>Ping</span><span>Region</span><span>Action</span></div>{servers.length > 0 && filteredServers.length > 0 ? filteredServers.map((server) => <div className={`server-row ${server.isAvoided ? 'avoided' : ''}`} key={server.id}><span className="server-id" title={server.id}>{server.score !== undefined && <strong className="server-score">{server.score}</strong>}{server.id.length > 18 ? server.id.slice(0, 18) + '...' : server.id}</span><span>{server.playing}/{server.maxPlayers}</span><span>{server.ping > 0 ? server.ping + ' ms' : 'Unknown'}</span><span className={regionLoading[server.id] ? 'server-region pending' : 'server-region'}>{regionLoading[server.id] ? 'Resolving...' : server.region === 'Unknown' ? 'Unknown' : server.region}</span><span className="server-actions"><button type="button" className="outline-button compact-button server-copy-button" title="Copy full Job ID" onClick={(event) => void copyServerJobId(event, server.id)}><Icon name={copiedJobId === server.id ? 'check' : 'copy'} size={13} /> {copiedJobId === server.id ? 'Copied' : 'Copy ID'}</button><button type="button" className={'text-button server-flag-button ' + (server.isFavorite ? 'active' : '')} onClick={() => void toggleServerPreference(server, 'favorite')} title={server.isFavorite ? 'Remove favourite' : 'Favourite server'}>★</button><button type="button" className={'text-button server-flag-button ' + (server.isAvoided ? 'active' : '')} onClick={() => void toggleServerPreference(server, 'avoid')} title={server.isAvoided ? 'Allow server again' : 'Avoid server'}>×</button><button type="button" className="primary-button compact-button join-server-button" disabled={!selectedAccount?.hasCredentials || launching} title={!selectedAccount ? 'Select an account in Accounts first' : !selectedAccount.hasCredentials ? 'Connect this account first' : launching ? 'Roblox is starting' : 'Join this server'} onClick={() => void joinTarget(server.id)}><Icon name={launching ? 'clock' : 'launch'} size={13} /> {launching ? 'Launching…' : 'Join server'}</button></span></div>) : <div className="empty-state compact-empty"><div className="empty-mark"><Icon name="server" size={24} /></div><h2>{servers.length > 0 ? 'No matching servers' : 'Refresh a place'}</h2><p>{servers.length > 0 ? 'Try another Job ID, region, player order, or ping range.' : 'Fetch public servers and join a specific Job ID as the selected account.'}</p></div>}</div>

    <div className="server-pagination"><span>{servers.length > 0 ? filteredServers.length + ' of ' + servers.length + ' shown' : 'No server page loaded'}{source === 'Offline cache' ? ' · expired servers are hidden' : ''}</span><div><button type="button" className="outline-button compact-button" disabled={!previousCursor || loading} onClick={() => void loadPage(previousCursor, -1)}><Icon name="chevron" size={14} /> Previous</button><span className="server-page-number">Page {pageNumber}</span><button type="button" className="outline-button compact-button" disabled={!nextCursor || loading} onClick={() => void loadPage(nextCursor, 1)}>Next <Icon name="chevron" size={14} /></button></div></div>

    {joinState.phase !== 'idle' && <article className={`server-join-status ${joinState.phase}`}><span className="eyebrow">Join status</span><strong>{joinState.phase === 'launching' ? 'Launching selected server' : joinState.phase === 'launched' ? 'Launch request completed' : 'Launch failed'}</strong><span>{joinState.message}</span><small>Account: {selectedAccount?.alias || selectedAccount?.username || 'None'} · Job ID: {joinState.serverId} · Region: {servers.find((server) => server.id === joinState.serverId)?.region || 'Unknown'}</small></article>}
    {finderState.lastKnown && <article className="server-history-card"><div><span className="eyebrow">Last known server</span><h3>{finderState.lastKnown.server.id}</h3><p>{finderState.lastKnown.server.region === 'Unknown' ? 'Region unknown' : finderState.lastKnown.server.region} · Last seen {formatRelativeTime(finderState.lastKnown.lastSeenAt)} · {finderState.lastKnown.lastJoinResult || 'observed'}</p></div><button type="button" className="outline-button compact-button" disabled={!selectedAccount?.hasCredentials || launching} onClick={rejoinLastKnown}>Rejoin as {selectedAccount?.alias || selectedAccount?.username || 'selected account'}</button></article>}

    <div className="recent-row"><div className="panel-heading"><span>Recent games</span><span>{recentGames.length}</span></div><div className="recent-game-list">{recentGames.map((game) => <button type="button" className="recent-game" key={game.id} onClick={() => { setPlaceId(game.placeId); setServerFilter(''); setRegionFilter('all'); setPlayerOrder('none'); setPingFilter('all'); setPageCursor(undefined); setNextCursor(undefined); setPreviousCursor(undefined); setPageNumber(1); if (selectedAccount) void onLaunch(game.placeId, game.jobId, selectedAccount.gameId) }}><Icon name="clock" size={15} /><span>{game.name}</span><small>{game.placeId}</small></button>)}</div></div>
  </section>
}

type UtilityAction = AccountUtilityInput['action']

interface UtilityActionMeta {
  label: string
  description: string
  valueLabel?: string
  secondaryLabel?: string
  valuePlaceholder?: string
  secondaryPlaceholder?: string
  valueType?: 'text' | 'password'
  valueOptions?: string[]
}

const UTILITY_ACTIONS: Record<UtilityAction, UtilityActionMeta> = {
  refresh: { label: 'Refresh profile', description: 'Pull the current username, display name, avatar, and presence into this workspace.' },
  'get-robux': { label: 'Check Robux balance', description: 'Read the current Robux balance for the selected account.' },
  'get-email': { label: 'Check email status', description: 'Read the email address and verification state available to Roblox.' },
  'logout-sessions': { label: 'Sign out other sessions', description: 'End other Roblox sessions and keep this account session available when Roblox returns a replacement cookie.' },
  'set-follow-privacy': { label: 'Set follow privacy', description: 'Choose who can follow this account.', valueLabel: 'Privacy value', valueOptions: ['Friends', 'All', 'Followers', 'Following', 'NoOne'] },
  'change-password': { label: 'Change password', description: 'Change the account password. The current password and the new password are both required.', valueLabel: 'Current password', secondaryLabel: 'New password', valuePlaceholder: 'Current password', secondaryPlaceholder: 'New password', valueType: 'password' },
  'change-email': { label: 'Change email', description: 'Request an email change using the account password and the new email address.', valueLabel: 'Account password', secondaryLabel: 'New email', valuePlaceholder: 'Account password', secondaryPlaceholder: 'name@example.com', valueType: 'password' },
  'set-display-name': { label: 'Set display name', description: 'Change the selected account display name. Usernames stay unchanged.', valueLabel: 'Display name', valuePlaceholder: 'New display name' },
  'send-friend-request': { label: 'Send friend request', description: 'Find a Roblox username and send a friend request from the selected account.', valueLabel: 'Username', valuePlaceholder: 'Roblox username' },
  'toggle-block': { label: 'Block or unblock player', description: 'Find a username and switch its blocked state for the selected account.', valueLabel: 'Username', valuePlaceholder: 'Roblox username' },
  'unblock-everyone': { label: 'Unblock everyone', description: 'Remove every currently blocked user from the selected account.' },
  'join-group': { label: 'Join group', description: 'Send a group join request using a group ID or Roblox group link.', valueLabel: 'Group ID or link', valuePlaceholder: 'Group ID or group URL' },
}

function UtilitiesView({ selectedAccount, onImport, onExport, onCookieImport, onOpenAccounts, onAccountUtility, onError, onActivity }: { selectedAccount: Account | null; onImport: () => void; onExport: () => void; onCookieImport: () => void; onOpenAccounts: () => void; onAccountUtility: (input: AccountUtilityInput) => Promise<AccountUtilityResult | null>; onError: (message: string) => void; onActivity: (message: string, detail: string, tone?: ActivityTone) => void }) {
  const [quickCode, setQuickCode] = useState('')
  const [browserUrl, setBrowserUrl] = useState('https://www.roblox.com/home')
  const [browserScript, setBrowserScript] = useState('')
  const [utilityAction, setUtilityAction] = useState<UtilityAction>('refresh')
  const [utilityValue, setUtilityValue] = useState('')
  const [utilitySecondaryValue, setUtilitySecondaryValue] = useState('')
  const [utilityMessage, setUtilityMessage] = useState('')
  const [utilityBusy, setUtilityBusy] = useState(false)
  const [gameQuery, setGameQuery] = useState('')
  const [games, setGames] = useState<GameSearchResult[]>([])
  const [gameBusy, setGameBusy] = useState(false)
  const [gameSearched, setGameSearched] = useState(false)
  const [playerQuery, setPlayerQuery] = useState('')
  const [players, setPlayers] = useState<PlayerLookup[]>([])
  const [playerBusy, setPlayerBusy] = useState(false)
  const [playerSearched, setPlayerSearched] = useState(false)
  const [outfit, setOutfit] = useState<OutfitPreview | null>(null)
  const [outfitPlayer, setOutfitPlayer] = useState('')
  const [outfitBusy, setOutfitBusy] = useState(false)
  const [universe, setUniverse] = useState<UniverseInfo | null>(null)
  const [universeBusy, setUniverseBusy] = useState(false)
  const [placeSearched, setPlaceSearched] = useState(false)
  const [placeId, setPlaceId] = useState(selectedAccount?.placeId ?? '')
  const revealRef = useMotionReveal<HTMLElement>()

  useEffect(() => {
    if (selectedAccount?.placeId) setPlaceId(selectedAccount.placeId)
    setQuickCode('')
    setUtilityAction('refresh')
    setUtilityValue('')
    setUtilitySecondaryValue('')
    setUtilityMessage('')
  }, [selectedAccount?.id, selectedAccount?.placeId])

  const actionMeta = UTILITY_ACTIONS[utilityAction]
  const requiresUtilityValue = Boolean(actionMeta.valueLabel && !actionMeta.valueOptions && !utilityValue.trim()) || Boolean(actionMeta.secondaryLabel && !utilitySecondaryValue.trim())
  const utilityAccountState = selectedAccount ? (selectedAccount.hasCredentials ? 'Ready to run' : selectedAccount.userId ? 'Reconnect required' : 'Connect account') : 'Choose an account'

  const chooseUtility = (next: UtilityAction) => {
    const nextMeta = UTILITY_ACTIONS[next]
    setUtilityAction(next)
    setUtilityValue(nextMeta.valueOptions?.[0] ?? '')
    setUtilitySecondaryValue('')
    setUtilityMessage('')
  }

  const runAccountUtility = async () => {
    if (!selectedAccount?.hasCredentials || requiresUtilityValue || utilityBusy) return
    setUtilityBusy(true)
    setUtilityMessage('')
    try {
      const result = await onAccountUtility({ accountId: selectedAccount.id, action: utilityAction, value: utilityValue, secondaryValue: utilitySecondaryValue })
      if (result) setUtilityMessage(result.message)
    } finally {
      setUtilityBusy(false)
    }
  }

  const searchGames = async (event: FormEvent) => {
    event.preventDefault()
    setGameSearched(true)
    if (!gameQuery.trim()) {
      setGames([])
      return
    }
    setGameBusy(true)
    try {
      setGames(await window.valdor.games.search(gameQuery.trim()))
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Game search failed.')
    } finally {
      setGameBusy(false)
    }
  }

  const searchPlayers = async (event: FormEvent) => {
    event.preventDefault()
    setPlayerSearched(true)
    if (!playerQuery.trim()) {
      setPlayers([])
      return
    }
    setPlayerBusy(true)
    try {
      const result = await window.valdor.tools.searchPlayer(playerQuery.trim())
      setPlayers(result.players)
      setOutfit(null)
      setOutfitPlayer('')
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Player search failed.')
    } finally {
      setPlayerBusy(false)
    }
  }

  const inspectUniverse = async (event: FormEvent) => {
    event.preventDefault()
    setPlaceSearched(true)
    if (!placeId.trim()) {
      setUniverse(null)
      return
    }
    setUniverseBusy(true)
    try {
      const result = await window.valdor.tools.getUniverse(placeId.trim())
      setUniverse(result.universe)
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Universe lookup failed.')
    } finally {
      setUniverseBusy(false)
    }
  }

  const inspectOutfit = async (player: PlayerLookup) => {
    setOutfitBusy(true)
    try {
      setOutfit(await window.valdor.tools.getOutfit(player.id))
      setOutfitPlayer(player.username)
      onActivity('Outfit loaded', player.username, 'positive')
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Outfit lookup failed.')
    } finally {
      setOutfitBusy(false)
    }
  }

  return <section ref={revealRef} className="utilities-view motion-reveal">
    <div className="utility-overview">
      <div className="utility-overview-copy"><span className="eyebrow">Toolbox</span><h2>Make the next Roblox task obvious.</h2><p>Run account commands, inspect live Roblox data, and move workspace files without leaving this tab.</p></div>
      <div className={`utility-account-context ${selectedAccount ? '' : 'is-empty'}`}>
        <span className="utility-context-label">Working account</span>
        {selectedAccount ? <div className="utility-account-summary"><span className="utility-context-avatar">{selectedAccount.avatarUrl ? <img src={selectedAccount.avatarUrl} alt={`${selectedAccount.username} avatar`} /> : getInitials(selectedAccount)}</span><span className="utility-account-name"><strong>{selectedAccount.alias || selectedAccount.username}</strong><small>@{selectedAccount.username}</small></span><span className="utility-account-health"><span className={`status-dot ${selectedAccount.status}`} /><strong>{utilityAccountState}</strong><small>{selectedAccount.hasCredentials ? 'Secure session available' : 'Open Accounts to connect'}</small></span></div> : <div className="utility-empty-account"><strong>No account selected</strong><span>Choose a profile to unlock account actions and custom browser access.</span><button type="button" className="text-button" onClick={onOpenAccounts}>Choose an account <Icon name="arrow" size={14} /></button></div>}
      </div>
    </div>

    <article className="utility-command-panel" aria-labelledby="utility-command-title">
      <div className="utility-command-heading"><div><span className="eyebrow">Account actions</span><h2 id="utility-command-title">Run a task on the selected account.</h2><p>Refresh identity, read account signals, or make a targeted Roblox change. The scope stays visible before anything runs.</p></div><div className={`utility-account-state ${selectedAccount?.hasCredentials ? '' : 'needs-login'}`}><span className={`status-dot ${selectedAccount?.hasCredentials ? 'ready' : 'idle'}`} />{utilityAccountState}</div></div>
      <div className="utility-command-form">
        <label className="field-label utility-command-task">Task<select value={utilityAction} disabled={!selectedAccount || utilityBusy} onChange={(event) => chooseUtility(event.target.value as UtilityAction)}>{(Object.keys(UTILITY_ACTIONS) as UtilityAction[]).map((action) => <option value={action} key={action}>{UTILITY_ACTIONS[action].label}</option>)}</select></label>
        {actionMeta.valueLabel && <label className="field-label utility-command-field">{actionMeta.valueLabel}{actionMeta.valueOptions ? <select value={utilityValue || actionMeta.valueOptions[0]} disabled={utilityBusy} onChange={(event) => setUtilityValue(event.target.value)}>{actionMeta.valueOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select> : <input type={actionMeta.valueType ?? 'text'} value={utilityValue} disabled={utilityBusy} onChange={(event) => setUtilityValue(event.target.value)} placeholder={actionMeta.valuePlaceholder} />}</label>}
        {actionMeta.secondaryLabel && <label className="field-label utility-command-field">{actionMeta.secondaryLabel}<input type={actionMeta.valueType ?? 'text'} value={utilitySecondaryValue} disabled={utilityBusy} onChange={(event) => setUtilitySecondaryValue(event.target.value)} placeholder={actionMeta.secondaryPlaceholder} /></label>}
        <div className="utility-command-description"><strong>{actionMeta.label}</strong><p>{actionMeta.description}</p></div>
        <button type="button" className="primary-button utility-run-button" disabled={!selectedAccount?.hasCredentials || requiresUtilityValue || utilityBusy} onClick={() => void runAccountUtility()}>{utilityBusy ? 'Running...' : actionMeta.label} <Icon name={utilityBusy ? 'clock' : 'arrow'} size={15} /></button>
      </div>
      {utilityMessage && <div className="utility-command-feedback" role="status"><Icon name="check" size={15} /><span>{utilityMessage}</span></div>}
    </article>

    <div className="utility-section-heading"><div><span className="eyebrow">Explore tools</span><h2>Search, inspect, and organize</h2></div><span>Results stay in place while you work.</span></div>

    <div className="utility-grid">
      <article className="utility-card utility-card-wide utility-session-card" aria-labelledby="utility-session-title">
        <div className="utility-card-heading"><span className="utility-icon coral"><Icon name="browser" size={19} /></span><div><span className="eyebrow">Sessions</span><h2 id="utility-session-title">Open or import a session</h2></div></div>
        <p>Use the isolated Roblox browser for a normal account session. Import is for a cookie or credential set you already have.</p>
        <div className="utility-session-actions"><button type="button" className="outline-button" onClick={onCookieImport}><Icon name="import" size={16} /> Import existing session</button>{selectedAccount?.hasCredentials ? <div className="quick-login"><input value={quickCode} onChange={(event) => setQuickCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Six-digit Quick Login" inputMode="numeric" maxLength={6} aria-label="Six-digit Quick Login" /><button type="button" className="text-button" disabled={quickCode.length !== 6} onClick={() => void window.valdor.accounts.quickLogin({ accountId: selectedAccount.id, code: quickCode }).then((result) => onActivity(result.message, 'Quick Login completed', 'positive')).catch((caught: unknown) => onError(caught instanceof Error ? caught.message : 'Quick Login failed.'))}>Validate <Icon name="arrow" size={15} /></button></div> : <span className="utility-session-hint">Connect an account to validate Quick Login codes.</span>}</div>
        <div className="utility-browser-form"><label className="field-label">Roblox URL<input value={browserUrl} onChange={(event) => setBrowserUrl(event.target.value)} placeholder="https://www.roblox.com/home" /></label><label className="field-label">Page script <span className="muted-label">Optional</span><textarea rows={2} value={browserScript} onChange={(event) => setBrowserScript(event.target.value)} placeholder="Runs after the Roblox page loads" /></label><button type="button" className="outline-button" disabled={!selectedAccount?.hasCredentials} title={!selectedAccount?.hasCredentials ? 'Connect an account first' : undefined} onClick={() => void window.valdor.accounts.openBrowser(selectedAccount!.id, { url: browserUrl, javascript: browserScript }).then((result) => onActivity('Custom browser opened', result.message, 'positive')).catch((caught: unknown) => onError(caught instanceof Error ? caught.message : 'Custom browser failed.'))}><Icon name="browser" size={15} /> Open custom browser</button></div>
      </article>

      <article className="utility-card utility-lookup-card" aria-labelledby="utility-games-title">
        <div className="utility-card-heading"><span className="utility-icon"><Icon name="game" size={19} /></span><div><span className="eyebrow">Games</span><h2 id="utility-games-title">Find a game</h2></div></div>
        <p>Search by name, then send a result straight to the place inspector.</p>
        <form className="utility-search-form" onSubmit={(event) => void searchGames(event)}><input value={gameQuery} onChange={(event) => setGameQuery(event.target.value)} placeholder="Search games" aria-label="Search Roblox games" /><button type="submit" className="icon-button" aria-label="Search Roblox games" disabled={gameBusy}><Icon name={gameBusy ? 'clock' : 'search'} size={16} /></button></form>
        <div className="utility-results">{gameBusy ? <div className="utility-loading-state" role="status"><span className="utility-loading-mark" /><span>Searching Roblox games</span></div> : games.length > 0 ? games.slice(0, 3).map((game) => <div className="result-row" key={game.placeId}><span><strong>{game.name}</strong><small>{game.creatorName} · {game.playing.toLocaleString()} playing · {game.visits.toLocaleString()} visits</small></span><button type="button" className="text-button utility-result-action" aria-label={'Use ' + game.name + ' place ID'} onClick={() => { setPlaceId(game.placeId); setUniverse(null); setPlaceSearched(false) }}>Use <Icon name="arrow" size={14} /></button></div>) : <div className="utility-empty-result"><span className="utility-empty-mark"><Icon name="search" size={15} /></span><span>{gameSearched ? 'No games matched that search.' : 'Search a title to see creator, player, and visit data.'}</span></div>}</div>
      </article>

      <article className="utility-card utility-lookup-card" aria-labelledby="utility-players-title">
        <div className="utility-card-heading"><span className="utility-icon"><Icon name="users" size={19} /></span><div><span className="eyebrow">Players</span><h2 id="utility-players-title">Find a player</h2></div></div>
        <p>Check a username's display name, presence, and current outfit.</p>
        <form className="utility-search-form" onSubmit={(event) => void searchPlayers(event)}><input value={playerQuery} onChange={(event) => setPlayerQuery(event.target.value)} placeholder="Player username" aria-label="Search Roblox players" /><button type="submit" className="icon-button" aria-label="Search Roblox players" disabled={playerBusy}><Icon name={playerBusy ? 'clock' : 'search'} size={16} /></button></form>
        <div className="utility-results">{playerBusy ? <div className="utility-loading-state" role="status"><span className="utility-loading-mark" /><span>Searching Roblox players</span></div> : players.length > 0 ? players.slice(0, 2).map((player) => <div className="result-row" key={player.id}><span><strong>{player.displayName} <small>@{player.username}</small></strong><small><span className={`status-dot ${player.presence?.type === 'in-game' ? 'running' : player.presence?.type === 'offline' ? 'offline' : 'ready'}`} /> {player.presence?.lastLocation || 'Offline'}</small></span><button type="button" className="text-button utility-result-action" disabled={outfitBusy} aria-label={'Inspect ' + player.username + ' outfit'} onClick={() => void inspectOutfit(player)}>Outfit <Icon name={outfitBusy ? 'clock' : 'shirt'} size={14} /></button></div>) : <div className="utility-empty-result"><span className="utility-empty-mark"><Icon name="users" size={15} /></span><span>{playerSearched ? 'No players matched that username.' : 'Search a username to inspect presence and outfit details.'}</span></div>}</div>
        {outfit && <div className="utility-outfit-result"><span className="utility-outfit-avatar">{outfit.avatarUrl ? <img src={outfit.avatarUrl} alt={`${outfitPlayer} outfit`} /> : <Icon name="shirt" size={17} />}</span><span><strong>{outfitPlayer}'s outfit</strong><small>{outfit.assets.length} visible assets · {outfit.assets.slice(0, 3).join(' · ')}</small></span></div>}
      </article>

      <article className="utility-card utility-lookup-card" aria-labelledby="utility-place-title">
        <div className="utility-card-heading"><span className="utility-icon"><Icon name="globe" size={19} /></span><div><span className="eyebrow">Places</span><h2 id="utility-place-title">Inspect a universe</h2></div></div>
        <p>Read a place's creator, visits, player count, and playability.</p>
        <form className="utility-search-form" onSubmit={(event) => void inspectUniverse(event)}><input value={placeId} onChange={(event) => setPlaceId(event.target.value)} placeholder="Place ID" aria-label="Place ID for universe lookup" inputMode="numeric" /><button type="submit" className="icon-button" aria-label="Inspect universe" disabled={universeBusy}><Icon name={universeBusy ? 'clock' : 'search'} size={16} /></button></form>
        <div className="utility-results">{universeBusy ? <div className="utility-loading-state" role="status"><span className="utility-loading-mark" /><span>Inspecting place data</span></div> : universe ? <div className="universe-result"><div className="universe-result-main"><strong>{universe.name}</strong><span>By {universe.creatorName}</span></div><div className="universe-metrics"><span><strong>{universe.playing.toLocaleString()}</strong><small>playing</small></span><span><strong>{universe.visits.toLocaleString()}</strong><small>visits</small></span><span className={universe.isPlayable ? 'is-playable' : 'is-unplayable'}><strong>{universe.isPlayable ? 'Yes' : 'No'}</strong><small>playable</small></span></div></div> : <div className="utility-empty-result"><span className="utility-empty-mark"><Icon name="globe" size={15} /></span><span>{placeSearched ? 'No universe data returned for that place.' : 'Paste a place ID or use a game result to inspect it.'}</span></div>}</div>
      </article>

      <article className="utility-card utility-storage-card" aria-labelledby="utility-storage-title">
        <div className="utility-card-heading"><span className="utility-icon"><Icon name="archive" size={19} /></span><div><span className="eyebrow">Storage</span><h2 id="utility-storage-title">Move local data</h2></div></div>
        <p>Back up profile metadata, restore a workspace, or open the folder used by this installation.</p>
        <div className="utility-button-stack"><button type="button" className="outline-button" onClick={onImport}><Icon name="import" size={16} /> Import JSON</button><button type="button" className="primary-button" onClick={onExport}><Icon name="download" size={16} /> Export JSON</button><button type="button" className="text-button" onClick={() => void window.valdor.app.openDataFolder().then(() => onActivity('Data folder opened', 'Local workspace files are ready to browse', 'positive')).catch((caught: unknown) => onError(caught instanceof Error ? caught.message : 'Data folder could not be opened.'))}><Icon name="folder" size={15} /> Open data folder</button></div>
        <span className="utility-storage-note"><Icon name="shield" size={13} /> Data stays local until you choose to export it.</span>
      </article>
    </div>
  </section>
}

interface ControlViewProps {
  accounts: ControlAccount[]
  settings: AppSettings | null
  entitlements: PlanEntitlements
  onSettings: (input: Partial<AppSettings>, announce?: boolean) => Promise<void>
  onError: (message: string) => void
  onActivity: (message: string, detail: string, tone?: ActivityTone) => void
}

function ControlView({ accounts, settings, entitlements, onSettings, onError, onActivity }: ControlViewProps) {
  const [background, setBackground] = useState<BackgroundInputSnapshot | null>(null)
  const [protectedStatus, setProtectedStatus] = useState<ProtectedSessionStatus | null>(null)
  const [sessionAction, setSessionAction] = useState<'setup' | 'start' | 'stop' | null>(null)
  const [loadError, setLoadError] = useState('')
  const [autoHotkey, setAutoHotkey] = useState<AutoHotkeySnapshot | null>(null)
  const [ahkSelectedId, setAhkSelectedId] = useState<string | null>(null)
  const [ahkSelectionInitialized, setAhkSelectionInitialized] = useState(false)
  const ahkEditorRef = useRef<HTMLDivElement | null>(null)
  const [ahkName, setAhkName] = useState('Keep alt active')
  const [ahkContent, setAhkContent] = useState('SetTimer KeepAltActive, 52500\n\nKeepAltActive() {\n  if WinExist("ahk_exe RobloxPlayerBeta.exe") {\n    WinActivate\n    Send "{e}"\n  }\n}\n')
  const [ahkBusy, setAhkBusy] = useState<string | null>(null)
  const [ahkAi, setAhkAi] = useState<AhkAiStatus | null>(null)
  const [ahkAiPrompt, setAhkAiPrompt] = useState('')
  const [ahkAiResult, setAhkAiResult] = useState<AhkAiGenerationResult | null>(null)
  const [ahkAiError, setAhkAiError] = useState('')
  const proAccess = entitlements.isolatedWorkerInput

  useEffect(() => {
    if (ahkSelectionInitialized || !autoHotkey?.scripts.length) return
    const first = autoHotkey.scripts[0]!
    setAhkSelectedId(first.id)
    setAhkName(first.name)
    setAhkContent(first.content)
    setAhkSelectionInitialized(true)
  }, [ahkSelectionInitialized, autoHotkey?.scripts])

  useEffect(() => {
    if (!proAccess) {
      setBackground(null)
      return
    }
    let active = true
    let loadInFlight = false
    const load = async () => {
      if (!active || loadInFlight) return
      loadInFlight = true
      try {
        const status = await window.valdor.protectedSession.getStatus()
        if (!active) return
        setProtectedStatus(status)

        const ahkSnapshot = await window.valdor.autoHotkey.getSnapshot()
        if (!active) return
        setAutoHotkey(ahkSnapshot)
        const aiStatus = await window.valdor.autoHotkey.getAiStatus()
        if (!active) return
        setAhkAi(aiStatus)

        if (status.phase !== 'ready') {
          setLoadError(status.phase === 'error' ? status.message : '')
          return
        }

        try {
          const snapshot = await window.valdor.backgroundInput.getSessions()
          if (!active) return
          setBackground(snapshot)
          setLoadError('')
        } catch (caught) {
          if (active) setLoadError(caught instanceof Error ? caught.message : 'Active Roblox sessions could not be read.')
        }
      } catch (caught) {
        if (active) setLoadError(caught instanceof Error ? caught.message : 'Active Roblox sessions could not be read.')
      } finally {
        loadInFlight = false
      }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, ahkAi?.generating ? 250 : 3000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [proAccess, settings?.backgroundInputMainAccountId, ahkAi?.generating])

  const runSessionAction = async (action: 'setup' | 'start' | 'stop') => {
    setSessionAction(action)
    try {
      const status = action === 'setup'
        ? (await window.valdor.protectedSession.setup()).status
        : action === 'start'
          ? await window.valdor.protectedSession.start()
          : await window.valdor.protectedSession.stop()
      setProtectedStatus(status)
      const snapshot = await window.valdor.backgroundInput.getSessions()
      setBackground(snapshot)
      onActivity(
        status.phase === 'ready' ? 'Protected Session ready' : 'Protected Session stopped',
        status.message,
        status.phase === 'ready' ? 'positive' : 'normal',
      )
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Protected Session could not be updated.')
      const status = await window.valdor.protectedSession.getStatus().catch(() => null)
      if (status) setProtectedStatus(status)
    } finally {
      setSessionAction(null)
    }
  }

  const protectMain = async (accountId: string) => {
    try {
      await onSettings({ backgroundInputMainAccountId: accountId }, false)
      const snapshot = await window.valdor.backgroundInput.getSessions()
      setBackground(snapshot)
      onActivity('Main account protected', snapshot.sessions.find((session) => session.accountId === accountId)?.accountLabel ?? 'Valdor will exclude this account from alt automation.', 'positive')
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Main account protection could not be saved.')
    }
  }

  const selectAhkScript = (id: string) => {
    const script = autoHotkey?.scripts.find((candidate) => candidate.id === id)
    if (!script) return
    setAhkSelectedId(script.id)
    setAhkName(script.name)
    setAhkContent(script.content)
    setAhkSelectionInitialized(true)
  }

  const newAhkScript = () => {
    setAhkSelectionInitialized(true)
    setAhkSelectedId(null)
    setAhkName('New automation')
    setAhkContent('#Requires AutoHotkey v2.0\n\n; This script runs inside Valdor\'s protected alt desktop.\n')
  }

  const saveAhkScript = async () => {
    setAhkBusy('save')
    try {
      const snapshot = await window.valdor.autoHotkey.save({ id: ahkSelectedId ?? undefined, name: ahkName, content: ahkContent })
      setAutoHotkey(snapshot)
      const saved = snapshot.scripts.find((script) => script.id === ahkSelectedId) ?? snapshot.scripts.at(-1)
      if (saved) { setAhkSelectedId(saved.id); setAhkName(saved.name); setAhkContent(saved.content) }
      onActivity('AutoHotkey script saved', ahkName.trim(), 'positive')
    } catch (caught) { onError(caught instanceof Error ? caught.message : 'The AutoHotkey script could not be saved.') }
    finally { setAhkBusy(null) }
  }

  const runAhkScript = async () => {
    if (!ahkSelectedId) return onError('Save the script before running it.')
    setAhkBusy('run')
    try {
      const snapshot = await window.valdor.autoHotkey.run(ahkSelectedId)
      setAutoHotkey(snapshot)
      onActivity('AutoHotkey script running', ahkName, 'positive')
    } catch (caught) { onError(caught instanceof Error ? caught.message : 'The AutoHotkey script could not be started.') }
    finally { setAhkBusy(null) }
  }

  const stopAhkScript = async () => {
    if (!ahkSelectedId) return
    setAhkBusy('stop')
    try {
      const snapshot = await window.valdor.autoHotkey.stop(ahkSelectedId)
      setAutoHotkey(snapshot)
      onActivity('AutoHotkey script stopped', ahkName, 'normal')
    } catch (caught) { onError(caught instanceof Error ? caught.message : 'The AutoHotkey script could not be stopped.') }
    finally { setAhkBusy(null) }
  }

  const removeAhkScript = async () => {
    if (!ahkSelectedId || !window.confirm(`Delete “${ahkName}”?`)) return
    setAhkBusy('remove')
    try {
      const snapshot = await window.valdor.autoHotkey.remove(ahkSelectedId)
      setAutoHotkey(snapshot)
      newAhkScript()
      onActivity('AutoHotkey script deleted', ahkName, 'normal')
    } catch (caught) { onError(caught instanceof Error ? caught.message : 'The AutoHotkey script could not be deleted.') }
    finally { setAhkBusy(null) }
  }

  const downloadAhkAi = async () => {
    setAhkAiError('')
    try { setAhkAi(await window.valdor.autoHotkey.downloadAiModel()) }
    catch (caught) { setAhkAiError(caught instanceof Error ? caught.message : 'The local AI model could not be downloaded.') }
  }

  const generateAhkScript = async () => {
    setAhkAiError('')
    setAhkAiResult(null)
    setAhkAi((current) => current ? { ...current, generating: true, runtimeActive: true, generationStage: 'loading-model', generationDetail: 'Starting local generation.', generationTrace: [] } : current)
    try {
      const result = await window.valdor.autoHotkey.generateAiScript(ahkAiPrompt)
      setAhkAiResult(result)
      setAhkAi(await window.valdor.autoHotkey.getAiStatus())
    } catch (caught) { setAhkAiError(caught instanceof Error ? caught.message : 'The local assistant could not generate a script.') }
  }

  const cancelAhkAi = async () => {
    setAhkAi(await window.valdor.autoHotkey.cancelAi())
    setAhkAiError('The local AI request was cancelled.')
  }

  const useGeneratedAhk = () => {
    if (!ahkAiResult) return
    setAhkSelectionInitialized(true)
    setAhkSelectedId(null)
    setAhkName('AI generated automation')
    setAhkContent(ahkAiResult.script)
    onActivity('Generated script opened', 'Review it, give it a name, then save it when ready.', 'positive')
    window.requestAnimationFrame(() => ahkEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  const sessions = background?.sessions ?? []
  const readySessions = sessions.filter((session) => session.state === 'ready')
  const mainAccount = accounts.find((account) => account.accountId === background?.protectedAccountId)
  const sessionReady = protectedStatus?.phase === 'ready'
  const aiStage = ahkAi?.generationStage ?? 'loading-model'
  const aiStageOrder: NonNullable<AhkAiStatus['generationStage']>[] = ['loading-model', 'reading-request', 'planning-script', 'writing-script', 'validating', 'unloading']
  const aiStageDisplay: Record<NonNullable<AhkAiStatus['generationStage']>, { label: string; detail: string; summary: string; orb: OrbState; variants: string[] }> = {
    'loading-model': { label: 'Waking the local model', detail: 'Loading only what this request needs.', summary: 'The assistant stays off until you ask it to generate.', orb: 'connecting', variants: ['Opening a short-lived local worker.', 'Allocating the selected model for this request.', 'Keeping the rest of Valdor idle.'] },
    'reading-request': { label: 'Reading your brief', detail: 'Identifying triggers, targets, and timing.', summary: 'Pulling the action, target window, and constraints from your description.', orb: 'searching', variants: ['Finding the action you want automated.', 'Separating hotkeys from repeated actions.', 'Checking which app should receive the input.'] },
    'planning-script': { label: 'Planning the flow', detail: 'Choosing hotkeys, timers, and window guards.', summary: 'Turning the request into a small, reviewable AutoHotkey v2 plan.', orb: 'composing', variants: ['Choosing a clear trigger and stop path.', 'Adding a Roblox window guard where it fits.', 'Keeping the script focused on the requested behavior.'] },
    'writing-script': { label: 'Writing AutoHotkey v2', detail: 'Composing the script around those constraints.', summary: 'Generating runnable code with the bundled AutoHotkey v2 guidance.', orb: 'weaving', variants: ['Composing the functions and hotkeys.', 'Writing the timing logic in v2 syntax.', 'Keeping the generated file ready for review.'] },
    validating: { label: 'Checking the result', detail: 'Scanning syntax, risky operations, and Roblox targeting.', summary: 'Running local validation and a safety scan before showing the script.', orb: 'solving', variants: ['Checking for AutoHotkey v2 syntax issues.', 'Scanning for risky system operations.', 'Preparing a clear review summary.'] },
    unloading: { label: 'Releasing the model', detail: 'Closing the worker and returning memory to Windows.', summary: 'The local model is being unloaded after this request.', orb: 'shaping', variants: ['Closing the temporary AI worker.', 'Releasing model memory now.', 'Leaving no assistant process running in the background.'] },
  }
  const aiStageCopy = aiStageDisplay[aiStage]
  const aiStageIndex = Math.max(0, aiStageOrder.indexOf(aiStage))
  const aiThinkingCopy = ahkAi?.generationDetail ?? aiStageCopy.detail
  const ahkValidationFailed = ahkAiResult?.validationMessage.startsWith('AutoHotkey v2 validation failed') ?? false
  const revealRef = useMotionReveal<HTMLElement>()

  return <section ref={revealRef} className="control-view motion-reveal">
    <div className="control-header background-control-header">
      <div><span className="eyebrow">Protected controls</span><h2>Play on your main. Automate your alts.</h2><p>Valdor opens alt clients on a separate Windows desktop where your AutoHotkey scripts can run. Your main game keeps focus on this desktop.</p></div>
    </div>

    {!proAccess ? <div className="background-upgrade-card"><div><strong>Protected Session is included with Valdor Pro</strong><p>Keep alt automation on a separate Windows desktop while your main game remains uninterrupted.</p></div><button type="button" className="primary-button" onClick={() => void window.valdor.app.openExternal(PRICING_URL)}>View Pro <Icon name="arrow" size={15} /></button></div> : <>
      {!protectedStatus || protectedStatus.phase !== 'ready' ? <div className={`protected-session-gate ${protectedStatus?.phase === 'error' || protectedStatus?.phase === 'unavailable' ? 'warning' : ''}`}>
        <span className="protected-session-gate-icon"><Icon name={protectedStatus?.phase === 'error' || protectedStatus?.phase === 'unavailable' ? 'warning' : 'shield'} size={22} /></span>
        <div><strong>{protectedStatus?.phase === 'starting' ? 'Opening your alt desktop…' : protectedStatus?.phase === 'error' ? 'Protected Session needs attention' : protectedStatus?.phase === 'unavailable' ? 'Protected Session is unavailable' : protectedStatus?.configured ? 'Your alt desktop is ready to start' : 'Set up once. Use it every day.'}</strong><p>{protectedStatus?.message ?? 'Checking this Windows installation…'}</p></div>
        {protectedStatus?.phase !== 'unavailable' && <button type="button" className="primary-button" disabled={sessionAction !== null || protectedStatus?.phase === 'starting'} onClick={() => void runSessionAction(protectedStatus?.configured ? 'start' : 'setup')}>{sessionAction === 'setup' ? 'Setting up…' : sessionAction === 'start' || protectedStatus?.phase === 'starting' ? 'Starting…' : protectedStatus?.configured ? 'Start session' : 'Set up Protected Session'} <Icon name="arrow" size={15} /></button>}
      </div> : <div className="protected-session-live">
        <span className="background-protection-icon"><Icon name="shield" size={19} /></span>
        <div><strong>Alt desktop active</strong><p>Windows session {protectedStatus.childSessionId ?? 'ready'} is isolated from the desktop where you play. Open it when an alt needs hands-on interaction.</p></div>
        <div className="protected-session-live-actions"><button type="button" className="outline-button compact-button" onClick={() => void window.valdor.protectedSession.showViewer().then(() => onActivity('Alt desktop shown', 'The protected desktop is now visible for hands-on interaction.', 'positive')).catch((caught: unknown) => onError(caught instanceof Error ? caught.message : 'The child-session viewer could not be shown.'))}><Icon name="browser" size={14} /> Show alt desktop</button><button type="button" className="text-button danger" disabled={sessionAction !== null} onClick={() => void runSessionAction('stop')}><Icon name="trash" size={14} /> {sessionAction === 'stop' ? 'Stopping…' : 'Stop session'}</button></div>
      </div>}

      <div className={`background-protection-bar ${background?.protectedAccountId ? 'protected' : ''}`}>
        <span className="background-protection-icon"><Icon name="users" size={19} /></span>
        <div><strong>{background?.protectedAccountId ? `${mainAccount?.username ?? 'Main account'} stays on this desktop` : 'Choose the account you will play'}</strong><p>Every other account you launch while Protected Session is active opens on the alt desktop.</p></div>
        <label className="protected-main-select"><span>Main account</span><select value={background?.protectedAccountId ?? ''} onChange={(event) => void protectMain(event.target.value)}><option value="" disabled>Choose account</option>{accounts.map((account) => <option value={account.accountId} key={account.accountId}>{account.username}</option>)}</select></label>
      </div>

      {loadError && <div className="background-inline-error" role="alert"><Icon name="warning" size={15} /> {loadError}</div>}

      <div className="control-section-heading control-session-heading">
        <div><span className="eyebrow">Live alt sessions</span><h3>Know what is ready</h3><p>Protected Roblox clients appear here. AutoHotkey scripts run inside the active alt desktop without manual targeting.</p></div>
        <span className="control-section-status">{formatCount(readySessions.length, 'ready alt')} · {formatCount(sessions.length, 'total alt')}</span>
      </div>

      <article className="background-session-card control-session-overview">
        <div className="panel-heading"><span>Alt clients</span><span>{formatCount(sessions.length, 'client')}</span></div>
        <div className="background-session-list">{sessions.length === 0 ? <div className="worker-empty"><strong>{sessionReady ? 'No alts running yet' : 'Protected Session is optional'}</strong><span>{sessionReady ? 'Launch any account except your main. It will appear here automatically.' : 'Launch alts normally from Accounts, or start Protected Session to route them to a separate desktop with protected controls.'}</span></div> : sessions.map((session) => {
          const ready = session.state === 'ready'
          return <div className={`background-session-row ${session.state}`} key={session.id}>
            <div className="control-session-identity"><span className={`control-session-dot ${ready ? 'ready' : session.state}`} aria-hidden="true" /><span><strong>{session.accountLabel}</strong><small>{session.experienceName} · {session.windowTitle || 'Waiting for window'}</small></span></div>
            <span className={`worker-session-status ${ready ? 'ready' : session.state}`}>{ready ? 'Ready' : 'Starting'}</span>
          </div>
        })}</div>
      </article>

      <div className="control-section-heading control-ahk-heading">
        <div><span className="eyebrow">Custom automation</span><h3>Build with AutoHotkey</h3><p>Write, review, and run scripts inside the protected alt desktop when you need more control.</p></div>
        <span className="control-section-status">{autoHotkey?.installed ? 'Ready to edit' : 'Install required'}</span>
      </div>

      <article className="ahk-card">
        <div className="panel-heading"><span>Script workspace</span><span>{autoHotkey?.installed ? `v${autoHotkey.version || '2'} installed` : 'AutoHotkey v2 required'}</span></div>
        {ahkAi && <section className="ahk-ai-panel">
          <div className="ahk-ai-heading"><div><span className="eyebrow">Local AHK assistant</span><strong>Describe it. Generate it. Review it.</strong><p>Runs privately on this PC only when you press Generate, then fully exits and releases its memory.</p></div></div>
          <div className="ahk-ai-model"><div><strong>{ahkAi.modelName}</strong><span>{ahkAi.totalRamGb} GB system RAM · automatically selected {ahkAi.modelTier === 'standard' ? 'for 8 GB+' : 'for under 8 GB'}</span></div><span>{Math.round(ahkAi.modelSizeBytes / 1024 / 1024)} MB</span></div>
          {!ahkAi.installed ? <div className="ahk-ai-download"><div><strong>{ahkAi.downloading ? `Downloading… ${ahkAi.progressPercent}%` : 'Download once, use offline'}</strong><p>The model is stored locally. It never starts with Windows or Valdor.</p>{ahkAi.downloading && <div className="ahk-ai-progress"><i style={{ width: `${ahkAi.progressPercent}%` }} /></div>}</div><button type="button" className="primary-button" disabled={ahkAi.downloading} onClick={() => void downloadAhkAi()}>{ahkAi.downloading ? 'Downloading…' : 'Download local model'}</button>{ahkAi.downloading && <button type="button" className="text-button danger" onClick={() => void cancelAhkAi()}>Cancel</button>}</div> : <>
            <label className="field-label ahk-ai-request">What should the script do?<textarea value={ahkAiPrompt} maxLength={4000} placeholder="Example: While Roblox is active, press E every 52.5 seconds. Add Ctrl+Alt+P to pause and show a small status message." onChange={(event) => setAhkAiPrompt(event.target.value)} /></label>
             {ahkAi.generating && <div className="ahk-thinking-stack">
               <div className="ahk-thinking-bubble" data-stage={aiStage} role="status" aria-live="polite"><span className="ahk-thinking-orb"><ThinkingOrb state={aiStageCopy.orb} size={64} theme="light" aria-label={aiStageCopy.label} /></span><div><span>Valdor is thinking · {aiStageIndex + 1}/{aiStageOrder.length}</span><strong>{aiStageCopy.label}</strong><p key={aiThinkingCopy}>{aiThinkingCopy}</p></div><i aria-hidden="true" /></div>
               <div className="ahk-thinking-trace">
                 <div className="ahk-thinking-trace-heading"><div><span className="eyebrow">Generation trace</span><strong>What the assistant is doing</strong></div><span>{aiStageIndex + 1} of {aiStageOrder.length}</span></div>
                 <div className="ahk-thinking-steps">{aiStageOrder.map((stage, index) => <div className={`ahk-thinking-step ${index < aiStageIndex ? 'complete' : ''} ${stage === aiStage ? 'current' : ''}`} key={stage}><span className="ahk-thinking-step-index">{index < aiStageIndex ? <Icon name="check" size={11} /> : index + 1}</span><span><strong>{aiStageDisplay[stage].label}</strong><small>{aiStageDisplay[stage].summary}</small></span></div>)}</div>
                 {ahkAi.generationTrace && ahkAi.generationTrace.length > 0 && <div className="ahk-thinking-notes" aria-label="Live planning notes">{ahkAi.generationTrace.map((note) => <p key={note}>{note}</p>)}</div>}
               </div>
             </div>}
            <div className="ahk-ai-actions">{ahkAi.generating ? <button type="button" className="outline-button" onClick={() => void cancelAhkAi()}>Cancel generation</button> : <button type="button" className="primary-button" disabled={!ahkAiPrompt.trim()} onClick={() => void generateAhkScript()}><Icon name="spark" size={15} /> Generate locally</button>}<button type="button" className="text-button danger" disabled={ahkAi.generating} onClick={() => void window.valdor.autoHotkey.removeAiModel().then(setAhkAi).catch((caught: unknown) => setAhkAiError(caught instanceof Error ? caught.message : 'The model could not be removed.'))}><Icon name="trash" size={14} /> Remove model</button></div>
          </>}
          {ahkAiError && <div className="background-inline-error" role="alert"><Icon name="warning" size={15} /> {ahkAiError}</div>}
           {ahkAiResult && <AhkAiResultCard result={ahkAiResult} validationFailed={ahkValidationFailed} onReview={useGeneratedAhk} />}
        </section>}
        {!autoHotkey?.installed ? <div className="ahk-install"><div><strong>Install AutoHotkey v2 to unlock custom automation</strong><p>Create full keyboard, mouse, timing, and window-control scripts that run inside the protected alt desktop.</p></div><button type="button" className="primary-button" onClick={() => void window.valdor.autoHotkey.openDownload()}>Download AutoHotkey <Icon name="arrow" size={15} /></button></div> : <div className="ahk-workspace">
          <aside className="ahk-script-list"><button type="button" className="outline-button" onClick={newAhkScript}><Icon name="plus" size={14} /> New script</button>{autoHotkey.scripts.length === 0 ? <p>No saved scripts yet.</p> : autoHotkey.scripts.map((script) => <button type="button" key={script.id} className={`ahk-script-row ${script.id === ahkSelectedId ? 'selected' : ''}`} onClick={() => selectAhkScript(script.id)}><span><strong>{script.name}</strong><small>{script.running ? 'Running in alt session' : `Edited ${formatRelativeTime(script.updatedAt)}`}</small></span>{script.running && <i>Live</i>}</button>)}</aside>
          <div className="ahk-editor" ref={ahkEditorRef}><label className="field-label">Script name<input value={ahkName} maxLength={60} onChange={(event) => setAhkName(event.target.value)} /></label><label className="field-label">AutoHotkey v2 code<textarea spellCheck={false} value={ahkContent} onChange={(event) => setAhkContent(event.target.value)} /></label><div className="ahk-editor-actions"><button type="button" className="outline-button" disabled={ahkBusy !== null} onClick={() => void saveAhkScript()}>{ahkBusy === 'save' ? 'Saving…' : 'Save script'}</button>{ahkSelectedId && autoHotkey.scripts.find((script) => script.id === ahkSelectedId)?.running ? <button type="button" className="primary-button" disabled={ahkBusy !== null} onClick={() => void stopAhkScript()}><Icon name="square" size={14} /> {ahkBusy === 'stop' ? 'Stopping…' : 'Stop'}</button> : <button type="button" className="primary-button" disabled={ahkBusy !== null || !sessionReady || !ahkSelectedId} onClick={() => void runAhkScript()}><Icon name="play" size={14} /> {ahkBusy === 'run' ? 'Starting…' : 'Run in alt session'}</button>}{ahkSelectedId && <button type="button" className="text-button danger" disabled={ahkBusy !== null} onClick={() => void removeAhkScript()}><Icon name="trash" size={14} /> Delete</button>}</div><p>Scripts run only while Protected Session is active. Review scripts before running them; AutoHotkey can control apps and files available to your Windows account.</p></div>
        </div>}
      </article>

    </>}

  </section>
}

function AhkAiResultCard({ result, validationFailed, onReview }: { result: AhkAiGenerationResult; validationFailed: boolean; onReview: () => void }) {
  const hasWarnings = result.warnings.length > 0
  const modelLabel = result.modelTier === 'standard' ? 'Standard local model' : 'Low-memory local model'

  return <>
    <article className={`ahk-ai-result ${validationFailed ? 'needs-review' : ''}`} aria-live="polite" aria-labelledby="ahk-ai-result-title">
      <div className="ahk-ai-result-top">
        <div className="ahk-ai-result-status">
          <span className={`ahk-ai-result-icon ${validationFailed ? 'needs-review' : 'complete'}`}><Icon name={validationFailed ? 'warning' : 'check'} size={17} /></span>
          <div>
            <span className="eyebrow">Generation complete</span>
            <strong id="ahk-ai-result-title">{validationFailed ? 'Script needs review' : 'Script ready for review'}</strong>
            <p>{result.explanation}</p>
          </div>
        </div>
        <button type="button" className="primary-button ahk-ai-review-button" onClick={onReview}>Review script <Icon name="arrow" size={14} /></button>
      </div>
      <div className="ahk-ai-result-facts" aria-label="Generation checks">
        <div className={`ahk-ai-result-fact ${validationFailed ? 'needs-review' : ''}`}>
          <span className="ahk-ai-fact-icon"><Icon name={validationFailed ? 'warning' : 'check'} size={13} /></span>
          <span><small>Validation</small><strong>{validationFailed ? 'Needs review' : 'Syntax passed'}</strong><small className="ahk-ai-result-fact-detail">{result.validationMessage}</small></span>
        </div>
        <div className="ahk-ai-result-fact">
          <span className="ahk-ai-fact-icon"><Icon name="spark" size={13} /></span>
          <span><small>Model</small><strong>{modelLabel}</strong><small className="ahk-ai-result-fact-detail">{result.modelName}</small></span>
        </div>
        <div className={`ahk-ai-result-fact ${hasWarnings ? 'has-warning' : ''}`}>
          <span className="ahk-ai-fact-icon"><Icon name={hasWarnings ? 'warning' : 'shield'} size={13} /></span>
          <span><small>Safety scan</small><strong>{hasWarnings ? formatCount(result.warnings.length, 'review note') : 'Clear'}</strong><small className="ahk-ai-result-fact-detail">{hasWarnings ? 'Review the note below.' : 'No risky operations detected.'}</small></span>
        </div>
      </div>
      {validationFailed && <div className="ahk-ai-result-warning"><Icon name="warning" size={14} /><span>{result.validationMessage}</span></div>}
      {hasWarnings && <div className="ahk-ai-result-warning"><Icon name="warning" size={14} /><span>{result.warnings.join(' ')}</span></div>}
    </article>
    {result.generationTrace.length > 0 && <details className="ahk-ai-trace-copy">
      <summary>
        <span className="ahk-ai-trace-summary-copy"><span className="eyebrow">Generation notes</span><strong>See how the local assistant approached it</strong></span>
        <span className="ahk-ai-trace-summary-action">{formatCount(result.generationTrace.length, 'note')} <Icon name="chevron" size={14} /></span>
      </summary>
      <div className="ahk-ai-trace-content">
        <div className="ahk-ai-trace-list">{result.generationTrace.map((note) => <p key={note}><i aria-hidden="true" />{note}</p>)}</div>
        <small>These are concise notes returned by the local model, not hidden chain-of-thought.</small>
      </div>
    </details>}
  </>
}

const SETTING_HELP: Record<string, string> = {
  'Async launching': 'Requests all selected launches together. Windows still starts each Roblox Player process through the manager queue.',
  'Run on Windows startup': 'Opens the manager automatically when you sign in to Windows.',
  'Multiple Roblox sessions': 'Opt in to multiple official Roblox clients. Close all Roblox clients before enabling it; the manager verifies RobloxPlayerBeta.exe, never modifies the client, and releases its guard when no clients remain. Roblox does not officially document this mode.',
  'Refresh stale session cookies': 'When an account session is older than seven days, asks Roblox to rotate it by signing out other sessions. Leave this off if you do not want automatic session changes.',
  'Show live presence': 'Refreshes account online, in-game, place, and server information in the background.',
  'Enable Roblox watcher': 'Lets the lightweight watcher inspect Roblox windows and apply the close rules below.',
  'Close when Roblox is unreachable': 'Checks whether www.roblox.com can be reached and can close managed Roblox Player clients when it cannot.',
  'Close low-memory clients': 'Closes a Roblox client when its memory usage drops below the configured floor.',
  'Close unexpected window titles': 'Closes windows whose title does not match the expected Roblox title.',
  'Enable Web API': 'Starts the local HTTP API used by trusted integrations.',
  'Require password': 'Requires the configured API password before protected Web API routes respond.',
  'Allow account listing': 'Allows integrations to read the local account list through the Web API.',
  'Allow launch route': 'Allows integrations to request Roblox launches through the Web API.',
  'Allow cookie route': 'Allows integrations to request secure cookie data. Keep this off unless required.',
  'Allow account editing': 'Allows integrations to change local profile metadata through the Web API.',
  'Allow external API clients': 'Binds the Web API beyond localhost. Only enable this on a trusted network.',
  'Enable isolated worker input': 'Exposes bounded input controls for managed Roblox clients on this installation. Only enable this inside a VM or secondary Windows PC dedicated to alt clients.',
}

function SettingsCardHeading({ label, description, icon }: { label: string; description: string; icon: IconName }) {
  return <div className="panel-heading settings-card-heading"><div className="settings-card-heading-copy"><strong>{label}</strong><span>{description}</span></div><Icon name={icon} size={16} /></div>
}

function SettingsView({ settings, client, webApi, watcher, control, entitlements, accountCount, gameCount, onSettings, onClientUpdate, onWebApiUpdate, onControl, onMultiInstanceChange, onError, onActivity }: { settings: AppSettings | null; client?: AppSnapshot['client']; webApi?: WebApiSettings; watcher?: WatcherSettings; control?: ControlSettings; entitlements: PlanEntitlements; accountCount: number; gameCount: number; onSettings: (input: Partial<AppSettings>) => void; onClientUpdate: (client: AppSnapshot['client']) => void; onWebApiUpdate: (webApi: WebApiSettings) => void; onControl: (input: Partial<ControlSettings>) => void; onMultiInstanceChange: (enabled: boolean) => Promise<MultiInstanceChangeResult>; onError: (message: string) => void; onActivity: (message: string, detail: string, tone?: ActivityTone) => void }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('features')
  const [multiInstanceIssue, setMultiInstanceIssue] = useState<'clients' | 'guard' | null>(null)
  const [closingRoblox, setClosingRoblox] = useState(false)
  const multiInstanceRecovery = false
  const revealRef = useMotionReveal<HTMLElement>()
  const activeTabContent = SETTINGS_TAB_CONTENT[activeTab]
  const toggle = (key: 'asyncJoin' | 'runOnStartup' | 'autoCookieRefresh' | 'showPresence', value: boolean) => onSettings({ [key]: value })
  const updateWatcher = (input: WatcherUpdateInput) => void window.valdor.watcher.update(input).catch((caught: unknown) => onError(caught instanceof Error ? caught.message : 'Watcher settings could not be saved.'))
  const changeMultiInstance = async (value: boolean) => {
    setMultiInstanceIssue(null)
    const result = await onMultiInstanceChange(value)
    if (value && !result.ok) setMultiInstanceIssue(result.requiresClientShutdown ? 'clients' : 'guard')
  }
  const closeRobloxAndEnable = async () => {
    setClosingRoblox(true)
    try {
      const processResult = await window.valdor.accounts.killAllRoblox()
      onActivity('Roblox Player clients checked', processResult.message, processResult.closed > 0 ? 'warning' : 'normal')
      const result = await onMultiInstanceChange(true)
      setMultiInstanceIssue(result.ok ? null : result.requiresClientShutdown ? 'clients' : 'guard')
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Roblox Player clients could not be closed.')
    } finally {
      setClosingRoblox(false)
    }
  }

  return <section ref={revealRef} className="settings-view motion-reveal">
    <header className="settings-page-intro">
      <div className="settings-page-intro-copy">
        <span className="eyebrow">Settings / {SETTINGS_TABS.find((tab) => tab.id === activeTab)?.label}</span>
        <h2>{activeTabContent.title}</h2>
        <p>{activeTabContent.description}</p>
      </div>
      <div className="settings-save-note"><span className="status-dot running" /> Changes save automatically</div>
    </header>
    <div className="settings-navigation-layout">
      <nav className="settings-navigation" aria-label="Settings sections">
        <div className="settings-navigation-plan"><span>Current plan</span><strong>{entitlements.displayName}</strong><small>{accountCount} profiles · {gameCount} collections</small></div>
        <div className="settings-tabs" role="tablist" aria-orientation="vertical">
          {SETTINGS_TABS.map((tab) => <button type="button" key={tab.id} id={`settings-tab-${tab.id}`} className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`} role="tab" aria-selected={activeTab === tab.id} aria-controls={`settings-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)}><span className="settings-tab-icon"><Icon name={tab.icon} size={16} /></span><span><strong>{tab.label}</strong><small>{tab.description}</small></span><Icon name="arrow" size={14} /></button>)}
        </div>
      </nav>

      <div id={`settings-panel-${activeTab}`} className="settings-tab-content" role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`}>
      {activeTab === 'features' && <>
        <div className="settings-grid">
          <article className="settings-card settings-card-general">
            <SettingsCardHeading label="Workspace defaults" description="Decide how launches, sessions, and presence behave." icon="settings" />
            <div className="settings-card-section">
              <div className="settings-section-intro"><strong>Launch behavior</strong><span>These choices apply to every new launch unless a profile overrides them.</span></div>
              <SettingToggle label="Async launching" checked={settings?.asyncJoin ?? false} onChange={(value) => toggle('asyncJoin', value)} />
              <SettingToggle label="Run on Windows startup" checked={settings?.runOnStartup ?? false} onChange={(value) => toggle('runOnStartup', value)} />
              <SettingToggle label="Multiple Roblox sessions" checked={settings?.multiInstance ?? false} onChange={(value) => void changeMultiInstance(value)} />
              {multiInstanceIssue && <div className="setting-recovery" role="alert"><strong>{multiInstanceIssue === 'clients' ? 'Close Roblox before enabling this' : 'Multi-session guard needs attention'}</strong><span>{multiInstanceIssue === 'clients' ? 'Roblox Player is still holding its single-session guard. This action closes RobloxPlayerBeta.exe only; it does not close Studio, but unsaved game progress will be lost.' : 'No Roblox Player clients were detected, but the helper did not become ready. Try enabling the setting again; if it continues, restart the manager and try once more.'}</span><button type="button" className="primary-button" disabled={closingRoblox} onClick={() => multiInstanceIssue === 'clients' ? void closeRobloxAndEnable() : void changeMultiInstance(true)}><Icon name={multiInstanceIssue === 'clients' ? 'trash' : 'refresh'} size={15} /> {multiInstanceIssue === 'clients' ? closingRoblox ? 'Closing Roblox clients…' : 'Close all Roblox clients and enable' : 'Retry enabling multiple sessions'}</button></div>}
              {multiInstanceRecovery && <div className="setting-recovery" role="alert"><strong>Close Roblox before enabling this</strong><span>Multiple sessions needs the Roblox Player guard to be free. This action force-closes RobloxPlayerBeta.exe only; it does not close Studio, but unsaved game progress will be lost.</span><button type="button" className="primary-button" disabled={closingRoblox} onClick={() => void closeRobloxAndEnable()}><Icon name="trash" size={15} /> {closingRoblox ? 'Closing Roblox clients…' : 'Close all Roblox clients and enable'}</button></div>}
            </div>
            <div className="settings-card-section">
              <div className="settings-section-intro"><strong>Refresh and history</strong><span>Balance fresh presence data with the amount of local shortcut history you keep.</span></div>
              <SettingToggle label="Refresh stale session cookies" checked={settings?.autoCookieRefresh ?? false} onChange={(value) => toggle('autoCookieRefresh', value)} />
              <SettingToggle label="Show live presence" checked={settings?.showPresence ?? true} onChange={(value) => toggle('showPresence', value)} />
              <SettingField label="Launch delay" description="Wait time between sequential account launches." suffix="sec"><input type="number" min="0" max="60" value={settings?.launchDelay ?? 8} onChange={(event) => onSettings({ launchDelay: Number(event.target.value) })} /></SettingField>
              <SettingField label="Recent games" description="Controls how many recent game shortcuts are retained." suffix="items"><input type="number" min="1" max="50" value={settings?.maxRecentGames ?? 8} onChange={(event) => onSettings({ maxRecentGames: Number(event.target.value) })} /></SettingField>
              <SettingField label="Presence refresh" description="Controls how often the automatic watcher asks Roblox for presence updates." suffix="sec"><input type="number" min="1" max="300" value={settings?.presenceUpdateRate ?? 30} onChange={(event) => onSettings({ presenceUpdateRate: Number(event.target.value) })} /></SettingField>
            </div>
          </article>

          <article className="settings-card settings-card-watcher">
            <SettingsCardHeading label="Roblox watcher" description="Apply safety rules to managed Roblox windows in the background." icon="watch" />
            <div className="settings-card-section">
              <div className="settings-section-intro"><strong>Safety rules</strong><span>Turn on the checks you want the watcher to enforce while Roblox is running.</span></div>
              <SettingToggle label="Enable Roblox watcher" checked={watcher?.enabled ?? false} onChange={(value) => updateWatcher({ enabled: value })} />
              <SettingToggle label="Close when Roblox is unreachable" checked={watcher?.closeIfNoConnection ?? false} onChange={(value) => updateWatcher({ closeIfNoConnection: value })} />
              <SettingToggle label="Close low-memory clients" checked={watcher?.closeIfMemoryLow ?? false} onChange={(value) => updateWatcher({ closeIfMemoryLow: value })} />
              <SettingToggle label="Close unexpected window titles" checked={watcher?.closeIfWindowTitle ?? false} onChange={(value) => updateWatcher({ closeIfWindowTitle: value })} />
            </div>
            <div className="settings-card-section">
              <div className="settings-section-intro"><strong>Detection thresholds</strong><span>Tell the watcher what a healthy Roblox window looks like.</span></div>
              <SettingField label="Expected title" description="Title text the watcher uses when deciding whether a Roblox window is expected."><input value={watcher?.expectedWindowTitle ?? 'Roblox'} onChange={(event) => updateWatcher({ expectedWindowTitle: event.target.value })} /></SettingField>
              <SettingField label="Memory floor" description="Minimum Roblox process memory in megabytes before the low-memory rule can close it." suffix="MB"><input type="number" min="32" max="4096" value={watcher?.memoryLowMb ?? 200} onChange={(event) => updateWatcher({ memoryLowMb: Number(event.target.value) })} /></SettingField>
              <button type="button" className="outline-button settings-check-button" onClick={() => void window.valdor.watcher.check().then((result) => onActivity('Watcher checked', result.message, result.closed > 0 ? 'warning' : 'positive')).catch((caught: unknown) => onError(caught instanceof Error ? caught.message : 'Watcher failed.'))}><Icon name="refresh" size={15} /> Check now</button>
            </div>
          </article>

          <ClientPerformanceSettings client={client} onClientUpdate={onClientUpdate} onError={onError} onActivity={onActivity} />
        </div>
        <ThemePicker settings={settings ?? undefined} onChange={onSettings} />
        <ControlSettingsPanel control={control} onChange={onControl} />
      </>}

        {activeTab === 'privacy' && <WebApiSettingsCard webApi={webApi} isolatedWorkerAllowed={entitlements.isolatedWorkerInput} onUpdate={onWebApiUpdate} onError={onError} onActivity={onActivity} />}

        {activeTab === 'billing' && <BillingSettingsPanel entitlements={entitlements} accountCount={accountCount} gameCount={gameCount} onError={onError} />}
      </div>
    </div>
  </section>
}

function WebApiSettingsCard({ webApi, isolatedWorkerAllowed, onUpdate, onError, onActivity }: { webApi?: WebApiSettings; isolatedWorkerAllowed: boolean; onUpdate: (webApi: WebApiSettings) => void; onError: (message: string) => void; onActivity: (message: string, detail: string, tone?: ActivityTone) => void }) {
  const [password, setPassword] = useState('')
  const updateWebApi = async (input: WebApiUpdateInput) => {
    try {
      onUpdate(await window.valdor.webApi.update(input))
      onError('')
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Web API settings could not be saved.')
    }
  }
  const toggleWorker = (enabled: boolean) => {
    if (enabled && !isolatedWorkerAllowed) return onError('Isolated worker controls are available with Valdor Pro.')
    if (enabled && (!webApi?.requirePassword || !webApi.passwordSet)) return onError('Save an API password and enable Require password before turning on isolated worker input.')
    void updateWebApi({ allowSessionInput: enabled })
  }
  const savePassword = async () => {
    if (!password.trim()) return onError('Enter a Web API password before saving it.')
    if (password.trim().length < 12) return onError('Use at least 12 characters for an isolated worker password.')
    await updateWebApi({ password })
    setPassword('')
    onActivity('Web API password saved', 'The password is stored in Windows credential encryption.', 'positive')
  }
  return <article className="settings-card settings-card-wide settings-privacy-card">
    <SettingsCardHeading label="Local Web API" description="Keep integrations local by default. Only expose routes that a trusted tool needs." icon="globe" />
    <div className="settings-card-section">
      <div className="settings-section-intro"><strong>API access</strong><span>Control which local routes are available to trusted tools.</span></div>
      <SettingToggle label="Enable Web API" checked={webApi?.enabled ?? false} onChange={(value) => void updateWebApi({ enabled: value })} />
      <SettingToggle label="Require password" checked={webApi?.requirePassword ?? false} onChange={(value) => void updateWebApi({ requirePassword: value })} />
      <SettingToggle label="Allow account listing" checked={webApi?.allowGetAccounts ?? true} onChange={(value) => void updateWebApi({ allowGetAccounts: value })} />
      <SettingToggle label="Allow launch route" checked={webApi?.allowLaunchAccount ?? false} onChange={(value) => void updateWebApi({ allowLaunchAccount: value })} />
      <SettingToggle label="Allow cookie route" checked={webApi?.allowGetCookie ?? false} onChange={(value) => void updateWebApi({ allowGetCookie: value })} />
      <SettingToggle label="Allow account editing" checked={webApi?.allowAccountEditing ?? false} onChange={(value) => void updateWebApi({ allowAccountEditing: value })} />
    </div>
    <div className="settings-card-section">
      <div className="settings-section-intro"><strong>Network boundary</strong><span>Keep the service on this computer unless a trusted device needs access.</span></div>
      <SettingToggle label="Allow external API clients" checked={webApi?.allowExternalConnections ?? false} onChange={(value) => void updateWebApi({ allowExternalConnections: value })} />
      <SettingToggle label="Enable isolated worker input" checked={webApi?.allowSessionInput ?? false} onChange={toggleWorker} />
      <SettingField label="Port" description="Local port used by the Web API. It must stay between 1024 and 65535."><input type="number" min="1024" max="65535" value={webApi?.port ?? 7963} onChange={(event) => void updateWebApi({ port: Number(event.target.value) })} /></SettingField>
    </div>
    <div className="settings-card-section settings-credentials-section">
      <div className="settings-section-intro"><strong>Credentials</strong><span>Passwords are stored using Windows credential encryption.</span></div>
      <SettingField className="settings-api-password-field" label="API password" description={webApi?.passwordSet ? 'A password is saved. Enter a replacement only when you want to change it.' : 'Use at least 12 characters before enabling isolated worker input.'}><div className="web-api-password-control"><input type="password" value={password} placeholder={webApi?.passwordSet ? 'Password saved' : 'At least 12 characters'} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="outline-button" disabled={!password.trim()} onClick={() => void savePassword()}>Save password</button></div></SettingField>
    </div>
    <div className="web-api-actions">{webApi?.enabled ? <><span className="web-api-running"><span className="status-dot running" /> Running on {webApi.allowExternalConnections ? 'private network' : 'localhost'}:{webApi.port}</span><button type="button" className="text-button danger" onClick={() => void window.valdor.webApi.stop().then((updated) => { onUpdate(updated); onActivity('Web API stopped', 'Local integrations are paused.', 'warning') }).catch((caught: unknown) => onError(caught instanceof Error ? caught.message : 'Web API could not be stopped.'))}>Stop API</button></> : <button type="button" className="outline-button" onClick={() => void window.valdor.webApi.start().then((updated) => { onUpdate(updated); onActivity('Web API started', `${updated.allowExternalConnections ? 'Network' : 'Localhost'}:${updated.port}`, 'positive') }).catch((caught: unknown) => onError(caught instanceof Error ? caught.message : 'Web API failed.'))}><Icon name="play" size={15} /> Start API</button>}</div>
  </article>
}

function PlanUsageMeter({ label, singular, icon, current, maximum }: { label: string; singular: string; icon: IconName; current: number; maximum: number | null }) {
  const usageMaximum = maximum ?? Math.max(current, 1)
  const percentage = maximum === null ? 100 : Math.min(100, Math.round((current / Math.max(usageMaximum, 1)) * 100))
  const usageLabel = maximum === null ? `${current} used` : `${current} of ${maximum} used`
  const remainingLabel = maximum === null ? 'Unlimited capacity' : `${Math.max(maximum - current, 0)} ${singular}${maximum - current === 1 ? '' : 's'} remaining`

  return <div className="settings-usage-row">
    <div className="settings-usage-row-head">
      <span className="settings-usage-label"><span className="settings-usage-icon"><Icon name={icon} size={15} /></span><strong>{label}</strong></span>
      <span className="settings-usage-value">{usageLabel}</span>
    </div>
    <div className="settings-usage-progress" role="progressbar" aria-label={`${label} usage`} aria-valuemin={0} aria-valuemax={maximum ?? undefined} aria-valuenow={maximum === null ? undefined : Math.min(current, maximum)} aria-valuetext={usageLabel}>
      <span style={{ width: `${percentage}%` }} />
    </div>
    <div className="settings-usage-foot"><span>Plan capacity</span><strong>{remainingLabel}</strong></div>
  </div>
}

function BillingSettingsPanel({ entitlements, accountCount, gameCount, onError }: { entitlements: PlanEntitlements; accountCount: number; gameCount: number; onError: (message: string) => void }) {
  const isPro = entitlements.planKey === 'pro'
  const openPricing = () => {
    void window.valdor.app.openExternal(PRICING_URL).catch((caught: unknown) => onError(caught instanceof Error ? caught.message : 'The pricing page could not be opened.'))
  }

  return <div className="settings-billing-layout">
    <article className={`settings-card settings-billing-current settings-billing-overview ${isPro ? 'settings-billing-current-full' : ''}`}>
      <div className="settings-billing-heading">
        <span className="eyebrow">Current plan</span>
        <h2>{entitlements.displayName}</h2>
        <p className="settings-copy">{isPro ? 'Unlimited workspace access is active on this installation.' : 'Core workspace access for local account management.'}</p>
      </div>
      <div className="settings-billing-section settings-billing-capacity">
        <div className="settings-section-heading"><span>Workspace capacity</span><small>What you get and what you have used</small></div>
        <div className="settings-usage-list">
          <PlanUsageMeter label="Roblox accounts" singular="account" icon="users" current={accountCount} maximum={entitlements.maxAccounts} />
          <PlanUsageMeter label="Game collections" singular="game" icon="game" current={gameCount} maximum={entitlements.maxGames} />
        </div>
      </div>
      <div className="settings-billing-section settings-billing-includes">
        <div className="settings-section-heading"><span>Included with {isPro ? 'Valdor Pro' : 'Free'}</span></div>
        <ul className="settings-included-list">
          {isPro ? <>
            <li><Icon name="check" size={14} /> Unlimited Roblox account slots</li>
            <li><Icon name="check" size={14} /> Unlimited game collection slots</li>
            <li><Icon name="check" size={14} /> Bulk launch and isolated worker input</li>
            <li><Icon name="check" size={14} /> Local encrypted storage and organization</li>
          </> : <>
            <li><Icon name="check" size={14} /> Local encrypted storage</li>
            <li><Icon name="check" size={14} /> Account and game organization</li>
            <li><Icon name="check" size={14} /> Single-account launches</li>
            <li><Icon name="check" size={14} /> Basic server browsing and filters</li>
          </>}
        </ul>
      </div>
    </article>
    {!isPro && <article className="settings-card settings-billing-upgrade">
      <div className="settings-billing-upgrade-heading"><div><span className="eyebrow">Want to upgrade?</span><h2>Valdor Pro</h2></div><Icon name="gem" size={20} /></div>
      <p className="settings-copy">Unlock unlimited account and game slots, bulk launch, and isolated worker input.</p>
      <div className="settings-billing-pro-list">
        <div><Icon name="check" size={14} /> <span>Unlimited workspace capacity</span></div>
        <div><Icon name="check" size={14} /> <span>Bulk workflows for alt clients</span></div>
        <div><Icon name="check" size={14} /> <span>Worker input from your main PC</span></div>
      </div>
      <button type="button" className="primary-button" onClick={openPricing}>Compare Pro plans <Icon name="arrow" size={15} /></button>
    </article>}
  </div>
}

function ClientPerformanceSettings({ client, onClientUpdate, onError, onActivity }: { client?: AppSnapshot['client']; onClientUpdate: (client: AppSnapshot['client']) => void; onError: (message: string) => void; onActivity: (message: string, detail: string, tone?: ActivityTone) => void }) {
  const [fps, setFps] = useState(client?.maxFps ?? 240)
  const [fpsEnabled, setFpsEnabled] = useState(client?.unlockFps ?? false)
  const [customSettingsPath, setCustomSettingsPath] = useState(client?.customSettingsPath ?? '')
  const [customSettingsEnabled, setCustomSettingsEnabled] = useState(client?.customSettingsEnabled ?? false)
  useEffect(() => {
    setFps(client?.maxFps ?? 240)
    setFpsEnabled(client?.unlockFps ?? false)
    setCustomSettingsPath(client?.customSettingsPath ?? '')
    setCustomSettingsEnabled(client?.customSettingsEnabled ?? false)
  }, [client?.maxFps, client?.unlockFps, client?.customSettingsPath, client?.customSettingsEnabled])

  const applyFps = async (unlockFps = fpsEnabled) => {
    const nextFps = Math.min(1000, Math.max(15, Math.round(Number.isFinite(fps) ? fps : 240)))
    try {
      const updated = await window.valdor.tools.applyFpsSettings({ unlockFps, maxFps: nextFps })
      onClientUpdate(updated)
      setFps(updated.maxFps)
      setFpsEnabled(updated.unlockFps)
      onActivity(updated.unlockFps ? 'FPS override applied' : 'FPS override disabled', updated.unlockFps ? `${updated.maxFps} target FPS for new Roblox clients` : 'Roblox will use its default frame pacing', 'positive')
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'FPS settings failed.')
    }
  }

  const applyCustom = async () => {
    try {
      const updated = await window.valdor.tools.applyFpsSettings({ customSettingsPath, customSettingsEnabled })
      onClientUpdate(updated)
      setCustomSettingsPath(updated.customSettingsPath)
      setCustomSettingsEnabled(updated.customSettingsEnabled)
      onActivity('Client settings applied', updated.customSettingsEnabled ? 'Custom ClientAppSettings.json synced for future launches' : 'Custom ClientAppSettings.json disabled', 'positive')
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Custom client settings failed.')
    }
  }

  return <article className="settings-card settings-card-wide settings-performance-card">
    <SettingsCardHeading label="Roblox client performance" description="Set defaults for new Roblox Player launches. Account-level overrides still take precedence." icon="settings" />
    <div className="settings-performance-sections">
      <div className="settings-performance-section">
        <div className="settings-performance-section-heading"><strong>Frame rate</strong><span>Choose the default cap for new clients.</span></div>
        <div className="settings-performance-controls settings-fps-controls">
          <SettingToggle label="Enable FPS override" description="Sets the default frame-rate cap for new Roblox Player launches." checked={fpsEnabled} onChange={(value) => { setFpsEnabled(value); void applyFps(value) }} />
          <SettingField label="Target FPS" description="Default frame-rate cap for new Roblox clients. Values from 15 to 1000 FPS are accepted." suffix="FPS"><input type="number" min={15} max={1000} value={fps} onChange={(event) => setFps(Number(event.target.value))} /></SettingField>
          <button type="button" className="primary-button" onClick={() => void applyFps()}><Icon name="check" size={15} /> Apply FPS</button>
        </div>
      </div>
      <div className="settings-performance-section">
        <div className="settings-performance-section-heading"><strong>Custom client settings</strong><span>Sync a ClientAppSettings.json file before launching.</span></div>
        <div className="settings-performance-controls settings-custom-controls">
          <SettingField className="settings-path-field" label="Settings file" description="Optional path to a ClientAppSettings.json file that should be synced before launching Roblox."><input value={customSettingsPath} onChange={(event) => setCustomSettingsPath(event.target.value)} placeholder="C:\\path\\ClientAppSettings.json" /></SettingField>
          <SettingToggle label="Use custom JSON" description="Copies the selected custom ClientAppSettings.json into the Roblox client settings folder before launch." checked={customSettingsEnabled} onChange={setCustomSettingsEnabled} />
          <button type="button" className="outline-button" onClick={() => void applyCustom()}><Icon name="check" size={15} /> Apply custom</button>
        </div>
      </div>
    </div>
  </article>
}

function SettingToggle({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (checked: boolean) => void; description?: string }) {
  const explanation = description ?? SETTING_HELP[label] ?? 'Explains what this setting changes.'
  return <label className="setting-row"><span className="setting-row-label"><span className="setting-row-copy"><strong>{label}</strong><small>{explanation}</small></span></span><input type="checkbox" aria-label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="toggle-ui" aria-hidden="true"><span /></span></label>
}

function SettingField({ label, description, suffix, className = '', children }: { label: string; description: string; suffix?: string; className?: string; children: ReactNode }) {
  return <label className={`setting-field field-label ${className}`.trim()}><span className="setting-field-label"><span className="setting-field-copy"><strong>{label}</strong><small>{description}</small></span></span><span className={`setting-field-control ${suffix ? 'has-suffix' : ''}`}>{children}{suffix && <span>{suffix}</span>}</span></label>
}
const THEME_HELP: Record<AppSettings['theme'], string> = {
  neo: 'The signature Valdor palette: cream grid, coral actions, yellow accents, and hard ink shadows.',
  light: 'A brighter neutral palette that keeps the same layouts and controls.',
  dark: 'A low-light palette for evening use with the same Neo-Brutalist structure.',
}

function ThemePicker({ settings, onChange }: { settings?: AppSettings; onChange: (input: Partial<AppSettings>) => void }) {
  const revealRef = useMotionReveal<HTMLElement>(80)
  return <section ref={revealRef} className="theme-picker motion-reveal">
    <div><span className="eyebrow">Themes</span><h2>Choose your workspace tone</h2><p>Change the surface palette without changing how the manager works.</p></div>
    <div className="theme-options">{(['neo', 'light', 'dark'] as const).map((theme) => <button type="button" className={'theme-option ' + (settings?.theme === theme ? 'active' : '')} key={theme} data-tooltip={THEME_HELP[theme]} aria-label={theme + ' theme. ' + THEME_HELP[theme]} onClick={() => onChange({ theme })}><span className={'theme-swatch ' + theme} /><strong>{theme === 'neo' ? 'Neo-brutalist' : theme[0]?.toUpperCase() + theme.slice(1)}</strong><small>{settings?.theme === theme ? 'Selected' : 'Use theme'}</small></button>)}</div>
  </section>
}

function ControlSettingsPanel({ control, onChange }: { control?: ControlSettings; onChange: (input: Partial<ControlSettings>) => void }) {
  const revealRef = useMotionReveal<HTMLElement>(140)
  return <section ref={revealRef} className="control-settings-panel motion-reveal">
    <div><span className="eyebrow">Account control</span><h2>Control bridge settings</h2><p>Keep the control socket on localhost by default; enable LAN access only when a trusted client needs it.</p></div>
    <div className="control-settings-fields">
      <SettingField label="WebSocket port" description="Port used by the local control bridge to communicate with connected Roblox clients."><input type="number" min={1024} max={65535} value={control?.port ?? 5242} onChange={(event) => onChange({ port: Number(event.target.value) })} /></SettingField>
      <SettingToggle label="Allow LAN clients" description="Allows trusted devices on your network to connect to the bridge instead of limiting it to this computer." checked={control?.allowExternalConnections ?? false} onChange={(value) => onChange({ allowExternalConnections: value })} />
      <SettingToggle label="Start bridge on launch" description="Starts the control bridge automatically when the manager opens." checked={control?.autoStart ?? false} onChange={(value) => onChange({ autoStart: value })} />
    </div>
  </section>
}

function EmptyState({ hasSearch, hasScope, onReset, onResetScope, onAdd }: { hasSearch: boolean; hasScope: boolean; onReset: () => void; onResetScope: () => void; onAdd: () => void }) { return <div className="empty-state"><div className="empty-mark"><Icon name={hasSearch ? 'search' : hasScope ? 'folder' : 'users'} size={26} /></div><h2>{hasSearch ? 'No profiles match' : hasScope ? 'No profiles in this view' : 'Account desk is empty'}</h2><p>{hasSearch ? 'Try another search or choose a different game group.' : hasScope ? 'This game or category is empty. Choose another group or add a profile here.' : 'Log in to Roblox to add your first connected account.'}</p>{hasSearch ? <button type="button" className="outline-button" onClick={onReset}>Clear search</button> : hasScope ? <button type="button" className="outline-button" onClick={onResetScope}>View all profiles</button> : <button type="button" className="primary-button" onClick={onAdd}><Icon name="plus" size={17} /> Add Account</button>}</div> }

function sessionEventTone(event: SessionEvent): ActivityTone {
  if (event.severity === 'success') return 'positive'
  if (event.severity === 'warning' || event.severity === 'error') return 'warning'
  return 'normal'
}

type ActivityCentreTab = 'timeline' | 'history'
type SessionHistoryStatusFilter = 'all' | 'exited' | 'crashed'
type SessionHistoryDateFilter = 'all' | 'today' | '7d' | '30d'

function formatSessionTimestamp(value: string | null | undefined): string {
  if (!value) return 'Time unavailable'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'Time unavailable'
  return new Date(timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatSessionDuration(session: SessionRecord): string {
  const startedAt = Date.parse(session.startedAt)
  const endedAt = Date.parse(session.endedAt ?? '')
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return 'Duration unavailable'
  const totalSeconds = Math.max(0, Math.round((endedAt - startedAt) / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function sessionHistoryStatus(session: SessionRecord): string {
  if (session.status === 'crashed') return 'Crashed'
  if (session.status === 'exited') return 'Ended'
  if (session.status === 'unresponsive') return 'Unresponsive'
  return sessionStatusLabel(session)
}

function sessionHistoryTone(session: SessionRecord): ActivityTone {
  return session.status === 'crashed' || session.status === 'unresponsive' ? 'warning' : session.status === 'exited' ? 'normal' : 'positive'
}

function sessionHistoryReason(session: SessionRecord): string {
  return session.closeReason?.trim() || session.error?.trim() || (session.status === 'crashed' ? 'Roblox stopped unexpectedly.' : 'Session ended without a recorded reason.')
}

function SessionHistoryRow({ session, account, game, onSelect, onCopy, onRejoin }: { session: SessionRecord; account?: Account; game?: GameCollection; onSelect: (id: string) => void; onCopy: (text: string) => Promise<boolean>; onRejoin: (session: SessionRecord) => Promise<void> }) {
  const [rejoining, setRejoining] = useState(false)
  const label = account?.alias || account?.username || 'Unknown account'
  const placeId = session.placeId || account?.placeId || ''
  const experienceName = session.experienceName || game?.name || 'Roblox'
  const jobId = session.jobId.trim() || session.targetJobId.trim()
  const tone = sessionHistoryTone(session)
  const canRejoin = Boolean(account?.hasCredentials && placeId)
  const handleRejoin = async () => {
    if (!canRejoin) return
    setRejoining(true)
    try { await onRejoin(session) } finally { setRejoining(false) }
  }

  return <article className={`session-history-row ${tone}`}>
    <div className="session-history-row-head">
      <div className="session-history-identity"><span className="session-avatar">{account?.avatarUrl ? <img src={account.avatarUrl} alt={`${label} avatar`} /> : <span>{account ? getInitials(account) : '?'}</span>}</span><div><strong>{label}</strong><span>@{account?.username || 'unknown'}</span></div></div>
      <span className={`session-history-status ${tone}`}><span className={`activity-dot ${tone}`} />{sessionHistoryStatus(session)}</span>
    </div>
    <div className="session-history-details">
      <div><span className="session-history-label">Experience</span><strong>{experienceName}</strong><span>Place {placeId || 'not reported'}{session.region !== 'Unknown' ? ` · ${session.region}` : ''}</span></div>
      <div><span className="session-history-label">Duration</span><strong>{formatSessionDuration(session)}</strong><span>Started {formatSessionTimestamp(session.startedAt)}{session.endedAt ? ` · Ended ${formatSessionTimestamp(session.endedAt)}` : ''}</span></div>
      <div className="session-history-server"><span className="session-history-label">Last server</span><strong title={jobId || undefined}>{jobId ? `${jobId.slice(0, 18)}...` : 'No Job ID recorded'}</strong><span>{sessionHistoryReason(session)}</span></div>
    </div>
    <div className="session-history-actions"><button type="button" className="outline-button compact-button" disabled={!account} title={!account ? 'This account is no longer in the workspace' : undefined} onClick={() => { if (account) onSelect(session.accountId) }}><Icon name="users" size={13} /> {account ? 'Open account' : 'Account unavailable'}</button>{jobId && <button type="button" className="text-button" onClick={() => void onCopy(jobId)}><Icon name="copy" size={13} /> Copy ID</button>}<button type="button" className="primary-button compact-button" disabled={!canRejoin || rejoining} title={!account ? 'The account is no longer in this workspace' : !account.hasCredentials ? 'Connect this account before rejoining' : !placeId ? 'This session has no Place ID' : 'Launch this account into the last known server'} onClick={() => void handleRejoin()}><Icon name={rejoining ? 'clock' : 'launch'} size={13} /> {rejoining ? 'Launching...' : jobId ? 'Rejoin server' : 'Launch again'}</button></div>
  </article>
}

function SessionHistoryPanel({ sessions, accounts, games, onSelect, onCopy, onRejoin, onAdd, onOpenAccounts }: { sessions: SessionSnapshot; accounts: Account[]; games: GameCollection[]; onSelect: (id: string) => void; onCopy: (text: string) => Promise<boolean>; onRejoin: (session: SessionRecord) => Promise<void>; onAdd: () => void; onOpenAccounts: () => void }) {
  const [query, setQuery] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')
  const [gameFilter, setGameFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<SessionHistoryStatusFilter>('all')
  const [dateFilter, setDateFilter] = useState<SessionHistoryDateFilter>('all')
  const history = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const now = Date.now()
    const dateWindow = dateFilter === 'today' ? 24 * 60 * 60 * 1000 : dateFilter === '7d' ? 7 * 24 * 60 * 60 * 1000 : dateFilter === '30d' ? 30 * 24 * 60 * 60 * 1000 : 0
    return sessions.history.filter((session) => {
      const account = accounts.find((candidate) => candidate.id === session.accountId)
      const game = account ? games.find((candidate) => candidate.id === account.gameId) : undefined
      const searchable = [account?.alias, account?.username, game?.name, session.experienceName, session.placeId, session.jobId, session.targetJobId, session.closeReason, session.error].filter(Boolean).join(' ').toLowerCase()
      const sessionTime = Date.parse(session.endedAt ?? session.startedAt)
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery)
      const matchesAccount = accountFilter === 'all' || session.accountId === accountFilter
      const matchesGame = gameFilter === 'all' || account?.gameId === gameFilter
      const matchesStatus = statusFilter === 'all' || session.status === statusFilter
      const matchesDate = dateWindow === 0 || (Number.isFinite(sessionTime) && now - sessionTime <= dateWindow)
      return matchesQuery && matchesAccount && matchesGame && matchesStatus && matchesDate
    })
  }, [accounts, accountFilter, dateFilter, gameFilter, games, query, sessions.history, statusFilter])
  const hasFilters = Boolean(query.trim()) || accountFilter !== 'all' || gameFilter !== 'all' || statusFilter !== 'all' || dateFilter !== 'all'
  const hasSavedHistory = sessions.history.length > 0
  const emptyActionLabel = accounts.length > 0 ? 'Open accounts' : 'Add account'
  const emptyAction = accounts.length > 0 ? onOpenAccounts : onAdd
  const clearFilters = () => { setQuery(''); setAccountFilter('all'); setGameFilter('all'); setStatusFilter('all'); setDateFilter('all') }
  const exportHistory = () => {
    const exportedSessions = sessions.history.map((session) => {
      const account = accounts.find((candidate) => candidate.id === session.accountId)
      const game = account ? games.find((candidate) => candidate.id === account.gameId) : undefined
      return {
        sessionId: session.id,
        account: account?.alias || account?.username || null,
        username: account?.username || null,
        game: session.experienceName || game?.name || null,
        placeId: session.placeId || account?.placeId || null,
        jobId: session.jobId || session.targetJobId || null,
        region: session.region,
        status: sessionHistoryStatus(session),
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        duration: formatSessionDuration(session),
        reason: sessionHistoryReason(session),
      }
    })
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), sessions: exportedSessions }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'valdor-session-history.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return <section className="session-history-panel" aria-labelledby="session-history-title">
    <div className="session-history-heading"><div><span className="eyebrow">Persisted locally</span><h3 id="session-history-title">Session history</h3><p>Completed Roblox sessions remain available after the window closes, including their last known server and close reason.</p></div>{hasSavedHistory && <div className="session-history-heading-actions"><span className="session-history-count" aria-live="polite">{history.length} of {sessions.history.length} shown</span><button type="button" className="outline-button compact-button" onClick={exportHistory}><Icon name="download" size={13} /> Export JSON</button></div>}</div>
    {hasSavedHistory && <div className="session-history-toolbar"><label className="field-label">Search history<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Account, game, Job ID, or reason" /></label><label className="field-label">Account<select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}><option value="all">All accounts</option>{accounts.filter((account) => sessions.history.some((session) => session.accountId === account.id)).map((account) => <option value={account.id} key={account.id}>{account.alias || account.username}</option>)}</select></label><label className="field-label">Game<select value={gameFilter} onChange={(event) => setGameFilter(event.target.value)}><option value="all">All games</option>{games.filter((game) => sessions.history.some((session) => accounts.find((account) => account.id === session.accountId)?.gameId === game.id)).map((game) => <option value={game.id} key={game.id}>{game.name}</option>)}</select></label><label className="field-label">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as SessionHistoryStatusFilter)}><option value="all">All outcomes</option><option value="exited">Ended normally</option><option value="crashed">Crashed</option></select></label><label className="field-label">When<select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as SessionHistoryDateFilter)}><option value="all">All time</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label><button type="button" className="text-button" disabled={!hasFilters} onClick={clearFilters}>Clear filters</button></div>}
    {history.length > 0 ? <div className="session-history-list">{history.map((session) => { const account = accounts.find((candidate) => candidate.id === session.accountId); const game = account ? games.find((candidate) => candidate.id === account.gameId) : undefined; return <SessionHistoryRow key={session.id} session={session} account={account} game={game} onSelect={onSelect} onCopy={onCopy} onRejoin={onRejoin} /> })}</div> : <div className="session-history-empty"><span className="empty-mark"><Icon name="clock" size={22} /></span><div><strong>{hasSavedHistory ? 'No sessions match these filters' : 'No completed sessions yet'}</strong><p>{hasSavedHistory ? 'Clear one or more filters to see the saved session records.' : 'Once a managed Roblox client closes, its outcome and duration will appear here.'}</p></div>{hasSavedHistory ? hasFilters && <button type="button" className="outline-button" onClick={clearFilters}>Clear filters</button> : <button type="button" className="primary-button" onClick={emptyAction}><Icon name={accounts.length > 0 ? 'users' : 'plus'} size={14} /> {emptyActionLabel}</button>}</div>}
  </section>
}

type AnalyticsTab = 'overview' | 'history'

function analyticsDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function analyticsDateFrom(value: string | number | null | undefined): Date | null {
  const timestamp = typeof value === 'number' ? value : value ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) ? new Date(timestamp) : null
}

function AnalyticsView({ activity, sessions, accounts, games, onSelect, onCopy, onRejoin, onAdd, onOpenAccounts }: { activity: ActivityItem[]; sessions: SessionSnapshot; accounts: Account[]; games: GameCollection[]; onSelect: (id: string) => void; onCopy: (text: string) => Promise<boolean>; onRejoin: (session: SessionRecord) => Promise<void>; onAdd: () => void; onOpenAccounts: () => void }) {
  const revealRef = useMotionReveal<HTMLElement>()
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview')
  const workspaceAccounts = useMemo(() => uniqueAccounts(accounts), [accounts])
  const favouriteAccounts = useMemo(() => workspaceAccounts.filter((account) => account.favorite), [workspaceAccounts])
  const recentAccounts = useMemo(() => workspaceAccounts.filter((account) => isAccountRecentlyUsed(account)), [workspaceAccounts])
  const activeAccountIds = useMemo(() => new Set(sessions.active.map((session) => session.accountId)), [sessions.active])
  const totalLaunches = useMemo(() => workspaceAccounts.reduce((total, account) => total + Math.max(0, account.sessions), 0), [workspaceAccounts])
  const sessionCount = sessions.history.length + sessions.active.length
  const crashedCount = sessions.history.filter((session) => session.status === 'crashed' || session.status === 'unresponsive').length
  const cleanSessionRate = sessionCount > 0 ? `${Math.max(0, Math.round(((sessionCount - crashedCount) / sessionCount) * 100))}%` : '—'
  const gameUsage = useMemo(() => games.map((game) => {
    const gameAccounts = workspaceAccounts.filter((account) => account.gameId === game.id)
    return { game, profiles: gameAccounts.length, launches: gameAccounts.reduce((total, account) => total + Math.max(0, account.sessions), 0) }
  }).filter((item) => item.launches > 0).sort((a, b) => b.launches - a.launches || b.profiles - a.profiles || a.game.name.localeCompare(b.game.name)), [games, workspaceAccounts])
  const categoryUsage = useMemo(() => {
    const usage = new Map<string, { gameName: string; categoryName: string; profiles: number; launches: number }>()
    workspaceAccounts.forEach((account) => {
      const game = games.find((candidate) => candidate.id === account.gameId)
      const category = game?.categories.find((candidate) => candidate.id === account.categoryId)
      if (!game || !category) return
      const key = `${game.id}:${category.id}`
      const current = usage.get(key) ?? { gameName: game.name, categoryName: category.name, profiles: 0, launches: 0 }
      current.profiles += 1
      current.launches += Math.max(0, account.sessions)
      usage.set(key, current)
    })
    return [...usage.values()].filter((item) => item.launches > 0).sort((a, b) => b.launches - a.launches || b.profiles - a.profiles || a.categoryName.localeCompare(b.categoryName))
  }, [games, workspaceAccounts])
  const topAccounts = useMemo(() => workspaceAccounts.filter((account) => account.sessions > 0).sort((a, b) => b.sessions - a.sessions || (b.lastUsed ? Date.parse(b.lastUsed) : 0) - (a.lastUsed ? Date.parse(a.lastUsed) : 0) || (a.alias || a.username).localeCompare(b.alias || b.username)), [workspaceAccounts])
  const heatmapWeeks = useMemo(() => {
    const counts = new Map<string, number>()
    const addSignal = (value: string | number | null | undefined) => {
      const date = analyticsDateFrom(value)
      if (!date) return
      const key = analyticsDateKey(date)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    sessions.history.forEach((session) => addSignal(session.startedAt))
    sessions.events.forEach((event) => addSignal(event.createdAt))
    activity.forEach((item) => { if (item.id > 1000000000) addSignal(item.id) })
    workspaceAccounts.forEach((account) => { if (account.sessions > 0) addSignal(account.lastUsed) })

    const weekStart = new Date()
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() - (26 - 1) * 7)
    return Array.from({ length: 26 }, (_, weekIndex) => Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + weekIndex * 7 + dayIndex)
      return { date, key: analyticsDateKey(date), count: counts.get(analyticsDateKey(date)) ?? 0 }
    }))
  }, [activity, sessions.events, sessions.history, workspaceAccounts])
  const heatmapMax = heatmapWeeks.reduce((maximum, week) => Math.max(maximum, ...week.map((cell) => cell.count)), 0)
  const heatmapTotal = heatmapWeeks.reduce((total, week) => total + week.reduce((weekTotal, cell) => weekTotal + cell.count, 0), 0)
  const topGame = gameUsage[0]
  const topCategory = categoryUsage[0]
  const isEmptyOverview = workspaceAccounts.length === 0
  const hasRecordedActivity = heatmapTotal > 0
  const activitySummary = hasRecordedActivity ? `${formatCount(heatmapTotal, 'activity signal')} recorded in the last 6 months.` : 'No activity recorded in the last 6 months.'
  const tabs = <div className="analytics-tabs" role="tablist" aria-label="Analytics sections"><button type="button" id="analytics-tab-overview" role="tab" aria-selected={activeTab === 'overview'} aria-controls="analytics-overview-panel" tabIndex={activeTab === 'overview' ? 0 : -1} className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')} onKeyDown={(event) => { if (event.key === 'ArrowRight') { event.preventDefault(); setActiveTab('history') } if (event.key === 'ArrowLeft') { event.preventDefault(); setActiveTab('history') } }}><Icon name="chart" size={14} /> Overview</button><button type="button" id="analytics-tab-history" role="tab" aria-selected={activeTab === 'history'} aria-controls="analytics-history-panel" tabIndex={activeTab === 'history' ? 0 : -1} className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')} onKeyDown={(event) => { if (event.key === 'ArrowRight') { event.preventDefault(); setActiveTab('overview') } if (event.key === 'ArrowLeft') { event.preventDefault(); setActiveTab('overview') } }}><Icon name="clock" size={14} /> Workspace history <span>{activity.length + sessions.history.length}</span></button></div>

  const overviewContent = isEmptyOverview ? <section className="analytics-setup-panel" aria-labelledby="analytics-setup-title"><span className="analytics-setup-mark" aria-hidden="true"><Icon name="users" size={25} /></span><div className="analytics-setup-copy"><span className="eyebrow">Start here</span><h3 id="analytics-setup-title">Add a Roblox profile to start tracking usage.</h3><p>Your launches, recent activity, and session health will appear here as soon as the workspace has something to measure.</p></div><button type="button" className="primary-button" onClick={onAdd}><Icon name="plus" size={15} /> Add account</button></section> : <>
    <section className={`analytics-panel analytics-heatmap-panel ${hasRecordedActivity ? '' : 'is-empty'}`} aria-labelledby="analytics-activity-title"><div className="analytics-panel-heading"><div><span className="eyebrow">Recorded activity</span><h3 id="analytics-activity-title">Usage rhythm</h3></div><span className="analytics-panel-period">Last 6 months</span></div>{hasRecordedActivity ? <><div className="analytics-heatmap"><div className="analytics-weekday-labels" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div><div className="analytics-heatmap-body"><div className="analytics-month-labels" aria-hidden="true">{heatmapWeeks.map((week, index) => { const firstCell = week[0]!; const previous = heatmapWeeks[index - 1]?.[0]; const showLabel = index === 0 || firstCell.date.getMonth() !== previous?.date.getMonth(); return <span key={firstCell.key}>{showLabel ? firstCell.date.toLocaleDateString([], { month: 'short' }) : ''}</span> })}</div><div className="analytics-week-grid" role="img" aria-label={activitySummary}>{heatmapWeeks.map((week) => { const firstCell = week[0]!; return <div className="analytics-heat-week" key={firstCell.key}>{week.map((cell) => { const level = cell.count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((cell.count / Math.max(1, heatmapMax)) * 4))); return <span className={`analytics-heat-cell level-${level}`} key={cell.key} title={`${cell.count} recorded ${cell.count === 1 ? 'activity' : 'activities'} · ${cell.date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`} /> })}</div> })}</div></div></div><div className="analytics-heatmap-footer"><span>{activitySummary}</span><span className="analytics-legend"><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <i className={`analytics-heat-cell level-${level}`} key={level} />)}<span>More</span></span></div></> : <div className="analytics-activity-empty"><span className="analytics-empty-mark" aria-hidden="true"><Icon name="chart" size={21} /></span><div><strong>No activity recorded yet.</strong><p>Launch a profile from Accounts and this surface will start showing your usage pattern.</p></div><button type="button" className="outline-button compact-button" onClick={onOpenAccounts}>Open accounts <Icon name="arrow" size={14} /></button></div>}</section>
    <div className="analytics-insight-grid"><section className="analytics-panel analytics-insights-panel"><div className="analytics-panel-heading"><div><span className="eyebrow">At a glance</span><h3>Workspace signals</h3></div><span className="analytics-panel-period">{formatCount(workspaceAccounts.length, 'profile')}</span></div><div className="analytics-insight-list"><div className="analytics-insight-row"><span>Most used game</span><div className="analytics-insight-value"><strong title={topGame?.game.name}>{topGame?.game.name ?? 'No launches yet'}</strong><small>{topGame ? `${formatCount(topGame.launches, 'launch', 'launches')} · ${formatCount(topGame.profiles, 'profile')}` : 'Launch a profile to build this insight'}</small></div></div><div className="analytics-insight-row"><span>Most used category</span><div className="analytics-insight-value"><strong title={topCategory ? `${topCategory.gameName} / ${topCategory.categoryName}` : undefined}>{topCategory?.categoryName ?? 'No category activity yet'}</strong><small>{topCategory ? `${topCategory.gameName} · ${formatCount(topCategory.profiles, 'profile')}` : 'Your category mix will appear here'}</small></div></div><div className="analytics-insight-row"><span>Session health</span><div className="analytics-insight-value"><strong>{cleanSessionRate === '—' ? 'No history yet' : `${cleanSessionRate} clean`}</strong><small>{sessionCount > 0 ? `${formatCount(sessionCount, 'managed session')} recorded` : 'Session outcomes will be tracked here'}</small></div></div><div className="analytics-insight-row"><span>Connected profiles</span><div className="analytics-insight-value"><strong>{formatMetric(workspaceAccounts.filter((account) => account.hasCredentials).length)} / {formatMetric(workspaceAccounts.length)}</strong><small>Ready to launch or reconnect</small></div></div></div></section><section className="analytics-panel analytics-leaderboard"><div className="analytics-panel-heading"><div><span className="eyebrow">By launch count</span><h3>Most used profiles</h3></div><span className="analytics-panel-period">{topAccounts.length > 0 ? `Top ${Math.min(5, topAccounts.length)}` : 'Awaiting launches'}</span></div><div className="analytics-account-list">{topAccounts.length > 0 ? topAccounts.slice(0, 5).map((account) => <button type="button" className="analytics-account-row" key={account.id} onClick={() => onSelect(account.id)}><span className="analytics-account-avatar">{account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : getInitials(account)}</span><span className="analytics-account-name"><strong>{account.alias || account.username}</strong><small>@{account.username}</small></span><span className="analytics-account-count"><strong>{formatMetric(account.sessions)}</strong><small>{account.sessions === 1 ? 'launch' : 'launches'}</small></span><Icon name="arrow" size={14} /></button>) : <div className="analytics-empty"><span className="analytics-empty-mark" aria-hidden="true"><Icon name="launch" size={18} /></span><div><strong>No launches yet</strong><span>Launch a profile to see it ranked here.</span></div><button type="button" className="text-button" onClick={onOpenAccounts}>Open accounts <Icon name="arrow" size={13} /></button></div>}</div></section></div>
  </>

  return <section ref={revealRef} className="analytics-page motion-reveal">
    <div className="analytics-page-top"><div><span className="eyebrow">Usage overview</span><h2>{activeTab === 'overview' ? (isEmptyOverview ? 'Your overview starts with one profile.' : 'A clearer read on your workspace.') : 'Live events. Saved sessions.'}</h2><p>{activeTab === 'overview' ? (isEmptyOverview ? 'Add a Roblox profile and this page will turn launches, usage rhythm, and session health into a useful read.' : 'Launch totals, usage rhythm, and the profiles your workspace reaches for most.') : 'Watch workspace actions as they happen, then inspect the account, server, and close reason after a session ends.'}</p></div>{tabs}</div>
    {activeTab === 'overview' ? <div id="analytics-overview-panel" className="analytics-overview" role="tabpanel" aria-labelledby="analytics-tab-overview" tabIndex={-1}>
      <div className="analytics-stat-strip">
        <div className="analytics-stat primary"><span>Total launches</span><strong>{formatMetric(totalLaunches)}</strong><small>{isEmptyOverview ? 'Add a profile to begin' : 'Across saved profiles'}</small></div>
        <div className="analytics-stat"><span>Active now</span><strong>{formatMetric(activeAccountIds.size)}</strong><small>{isEmptyOverview ? 'Appears after a launch' : activeAccountIds.size === 1 ? 'managed session' : 'managed sessions'}</small></div>
        <div className="analytics-stat"><span>Favourites</span><strong>{formatMetric(favouriteAccounts.length)}</strong><small>{isEmptyOverview ? 'Keep priority profiles close' : 'Priority profiles'}</small></div>
        <div className="analytics-stat"><span>Used in 2h</span><strong>{formatMetric(recentAccounts.length)}</strong><small>{isEmptyOverview ? 'Updated from recent use' : 'Recent profiles'}</small></div>
      </div>
      {overviewContent}
    </div> : <div id="analytics-history-panel" role="tabpanel" aria-labelledby="analytics-tab-history" tabIndex={-1}><ActivityCentreView activity={activity} sessions={sessions} accounts={accounts} games={games} onSelect={onSelect} onCopy={onCopy} onRejoin={onRejoin} onAdd={onAdd} onOpenAccounts={onOpenAccounts} /></div>}
  </section>
}

function ActivityCentreView({ activity, sessions, accounts, games, onSelect, onCopy, onRejoin, onAdd, onOpenAccounts }: { activity: ActivityItem[]; sessions: SessionSnapshot; accounts: Account[]; games: GameCollection[]; onSelect: (id: string) => void; onCopy: (text: string) => Promise<boolean>; onRejoin: (session: SessionRecord) => Promise<void>; onAdd: () => void; onOpenAccounts: () => void }) {
  const revealRef = useMotionReveal<HTMLElement>()
  const [activeTab, setActiveTab] = useState<ActivityCentreTab>('timeline')
  const positiveCount = activity.filter((item) => item.tone === 'positive').length
  const warningCount = activity.filter((item) => item.tone === 'warning').length
  const crashedCount = sessions.history.filter((session) => session.status === 'crashed').length
  const hasTimelineData = activity.length > 0 || sessions.events.length > 0
  const timelineActionLabel = accounts.length > 0 ? 'Open accounts' : 'Add account'
  const timelineAction = accounts.length > 0 ? onOpenAccounts : onAdd
  const isHistory = activeTab === 'history'
  return <section ref={revealRef} className="activity-centre motion-reveal">
    <div className="activity-centre-intro"><div><span className="eyebrow">{isHistory ? 'Persisted sessions' : 'Live workspace log'}</span><h2>{isHistory ? 'Review completed sessions with context.' : 'See every workspace event in order.'}</h2><p>{isHistory ? 'Find the account, server, and close reason behind each session, then launch again when it is safe.' : 'Sign-ins, launches, watcher checks, and saved changes land here as they happen.'}</p></div><div className="activity-centre-count"><strong>{formatMetric(isHistory ? sessions.history.length : activity.length)}</strong><span>{isHistory ? 'sessions saved' : 'events recorded'}</span></div></div>
    <div className="activity-centre-tabs" role="tablist" aria-label="Activity centre sections"><button type="button" id="activity-tab-timeline" role="tab" aria-selected={!isHistory} aria-controls="activity-timeline-panel" tabIndex={!isHistory ? 0 : -1} className={`activity-centre-tab ${!isHistory ? 'active' : ''}`} onClick={() => setActiveTab('timeline')} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); setActiveTab('history'); requestAnimationFrame(() => document.getElementById('activity-tab-history')?.focus()) } }}><Icon name="clock" size={15} /> Live timeline <span>{activity.length}</span></button><button type="button" id="activity-tab-history" role="tab" aria-selected={isHistory} aria-controls="activity-history-panel" tabIndex={isHistory ? 0 : -1} className={`activity-centre-tab ${isHistory ? 'active' : ''}`} onClick={() => setActiveTab('history')} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); setActiveTab('timeline'); requestAnimationFrame(() => document.getElementById('activity-tab-timeline')?.focus()) } }}><Icon name="window" size={15} /> Session history <span>{sessions.history.length}</span></button></div>
    {isHistory ? <div id="activity-history-panel" role="tabpanel" aria-labelledby="activity-tab-history" tabIndex={-1}><SessionHistoryPanel sessions={sessions} accounts={accounts} games={games} onSelect={onSelect} onCopy={onCopy} onRejoin={onRejoin} onAdd={onAdd} onOpenAccounts={onOpenAccounts} /></div> : <div id="activity-timeline-panel" role="tabpanel" aria-labelledby="activity-tab-timeline" tabIndex={-1}>{hasTimelineData ? <><div className="activity-summary-grid"><div className="positive"><strong>{positiveCount}</strong><span>completed</span></div><div className="normal"><strong>{activity.length - positiveCount - warningCount}</strong><span>informational</span></div><div className="warning"><strong>{warningCount}</strong><span>needs attention</span></div></div>{sessions.events.length > 0 && <div className="activity-guardian-events"><div className="panel-heading"><span>Guardian timeline</span><span className="panel-heading-note">Persisted locally</span></div>{sessions.events.slice(0, 12).map((event) => <article className={`session-event-row ${sessionEventTone(event)}`} key={event.id}><span className="activity-dot" /><div><strong>{event.title}</strong><p>{event.detail}</p></div><time>{formatRelativeTime(event.createdAt)}</time></article>)}</div>}{activity.length > 0 && <div className="activity-centre-list">{activity.map((item, index) => <article className={`activity-centre-item ${item.tone}`} key={`${item.id}-${index}`}><span className="activity-centre-marker"><span className={`activity-dot ${item.tone}`} /></span><div className="activity-centre-content"><div><strong>{item.message}</strong><time>{item.id > 1000000000 ? new Date(item.id).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Session start'}</time></div><p>{item.detail}</p></div></article>)}</div>}</> : <div className="activity-centre-empty"><span className="empty-mark" aria-hidden="true"><Icon name={accounts.length > 0 ? 'clock' : 'users'} size={22} /></span><div><strong>{accounts.length > 0 ? 'No timeline events yet' : 'Your timeline starts with a profile'}</strong><p>{accounts.length > 0 ? 'Workspace actions will appear here as soon as you sign in, launch, or update a profile.' : 'Add a Roblox profile to start capturing launches, checks, and workspace changes.'}</p></div><button type="button" className="primary-button" onClick={timelineAction}><Icon name={accounts.length > 0 ? 'users' : 'plus'} size={14} /> {timelineActionLabel}</button></div>}</div>}
    {isHistory && sessions.history.length > 0 && <div className="session-history-footnote"><span className="activity-dot warning" /><span>{crashedCount > 0 ? `${crashedCount} session${crashedCount === 1 ? '' : 's'} ended unexpectedly. Open its account or rejoin after checking the close reason.` : 'Session outcomes are stored locally and remain available after restarting Valdor.'}</span></div>}
  </section>
}

function ActivityPanel({ activity }: { activity: ActivityItem[] }) { const visible = activity.slice(0, 6); return <div className="activity-panel" aria-label="Recent workspace activity"><div className="activity-panel-header"><div><span className="eyebrow">Workspace log</span><h2>Recent activity</h2></div></div><div className="activity-list">{visible.map((item, index) => <article className={`activity-row ${item.tone}`} key={`${item.id}-${index}`}><span className="activity-row-marker"><span className={`activity-dot ${item.tone}`} /></span><div><div className="activity-row-top"><strong>{item.message}</strong><time>{item.id > 1000000000 ? new Date(item.id).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ready'}</time></div><span className="activity-detail">{item.detail}</span></div></article>)}</div></div> }

export default App
