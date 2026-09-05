import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import '@fontsource/outfit/700.css'
import '@fontsource/outfit/800.css'
import './styles.css'
import { registerAccountMenuElement } from '../../src/shared/account-menu.ts'

const AUTH_URL = (import.meta.env.VITE_NEON_AUTH_URL || 'https://ep-morning-frost-zagg2ox8.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth').replace(/\/$/, '')
const configuredBillingApiUrl = (import.meta.env.VITE_VALDOR_BILLING_API_URL || '').trim()
const sameOriginBillingApiUrl = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
  ? `${window.location.origin}/api`
  : ''
const BILLING_API_URL = (configuredBillingApiUrl || sameOriginBillingApiUrl).replace(/\/$/, '')
const PUBLISHED_DOWNLOAD_URL = 'https://github.com/Vurdith/Valdor/releases/download/v1.0.5/Valdor-Roblox-Account-Manager-Setup-1.0.5.exe'
const DOWNLOAD_URL = (import.meta.env.VITE_VALDOR_DOWNLOAD_URL || PUBLISHED_DOWNLOAD_URL).trim()
const SITE_BASE = import.meta.env.BASE_URL
const REGIONAL_PRICES = Object.freeze({
  GBP: { amount: '£10', period: '/ month' },
  USD: { amount: '$10', period: '/ month' },
  EUR: { amount: '€10', period: '/ month' },
})
const EUROPEAN_COUNTRIES = new Set([
  'AD', 'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT',
  'LT', 'LU', 'LV', 'MC', 'MT', 'NL', 'PT', 'SI', 'SK', 'SM', 'VA',
])
const currentPage = document.body.dataset.page || 'home'
let accountSessionHandler = null
let accountMenuPlan = 'Free plan'
let accountMenuPlanRequest = 0
let accountIsAdmin = false
let accountAdminRequest = 0

const TRIAL_UNIT_SECONDS = Object.freeze({ minute: 60, hour: 60 * 60, day: 24 * 60 * 60, week: 7 * 24 * 60 * 60 })
const MAX_TRIAL_SECONDS = 90 * TRIAL_UNIT_SECONDS.day

registerAccountMenuElement()
const ACCOUNT_MENU_TAG = 'valdor-account-menu'
const ACCOUNT_MENU_MARKUP = '<' + ACCOUNT_MENU_TAG + '></' + ACCOUNT_MENU_TAG + '>'

const pageLinks = [
  { key: 'product', label: 'Product', href: '/product.html' },
  { key: 'pricing', label: 'Pricing', href: '/pricing.html' },
  { key: 'download', label: 'Download', href: '/download.html' },
  { key: 'account', label: 'Sign in', href: '/account.html', className: 'site-nav-account' },
]

function mountSiteChrome() {
  const header = document.querySelector('[data-site-header]')
  const footer = document.querySelector('[data-site-footer]')
  if (header) {
    const navigation = pageLinks.filter((link) => link.key !== 'account').map((link) => {
      const activeClass = currentPage === link.key ? ' is-active' : ''
      const currentAttribute = currentPage === link.key ? ' aria-current="page"' : ''
      const className = 'site-nav-link' + (link.className ? ' ' + link.className : '') + activeClass
      return '<a class="' + className + '" href="' + SITE_BASE + link.href.slice(1) + '"' + currentAttribute + '>' + link.label + '</a>'
    }).join('')
    header.innerHTML = '<header class="site-header"><a class="site-brand" href="' + SITE_BASE + '" aria-label="Valdor — Roblox Account Manager home"><img class="site-brand-mark" src="' + SITE_BASE + 'valdor-icon.png" alt="" /><span class="site-brand-copy"><strong>Valdor</strong><small>Roblox Account Manager</small></span></a><nav class="site-nav" aria-label="Main navigation">' + navigation + '<div class="site-account-menu">' + ACCOUNT_MENU_MARKUP + '</div></nav></header>'
  }
  if (footer) {
    footer.innerHTML = '<footer class="site-footer section-shell"><a class="site-brand" href="' + SITE_BASE + '" aria-label="Valdor — Roblox Account Manager home"><img class="site-brand-mark" src="' + SITE_BASE + 'valdor-icon.png" alt="" /><span class="site-brand-copy"><strong>Valdor</strong><small>Roblox Account Manager</small></span></a><div class="footer-navigation"><nav class="footer-links" aria-label="Product navigation"><a href="' + SITE_BASE + 'product.html">Product</a><a href="' + SITE_BASE + 'pricing.html">Pricing</a><a href="' + SITE_BASE + 'download.html">Download</a></nav><nav class="footer-links footer-legal-links" aria-label="Legal and support"><a href="' + SITE_BASE + 'privacy.html">Privacy</a><a href="' + SITE_BASE + 'terms.html">Terms</a><a href="' + SITE_BASE + 'refunds.html">Refunds</a><a href="' + SITE_BASE + 'support.html">Support</a></nav></div></footer>'
  }
}

function updateAccountNavigation(session) {
  const accountMenu = document.querySelector(ACCOUNT_MENU_TAG)
  if (!accountMenu) return
  const fullName = session?.user?.name?.trim() || ''
  const email = session?.user?.email?.trim() || ''
  accountMenu.name = fullName || email.split('@')[0] || 'Account'
  accountMenu.email = email
  accountMenu.plan = accountMenuPlan
  accountMenu.signedInState = Boolean(session)
  accountMenu.adminState = accountIsAdmin
  accountMenu.adminHref = `${SITE_BASE}admin.html`
  accountMenu.busyState = false
}

function initializeAccountMenu() {
  const accountMenu = document.querySelector(ACCOUNT_MENU_TAG)
  if (!accountMenu) return
  accountMenu.addEventListener('account-menu-settings', () => {
    if (currentPage === 'account') {
      document.getElementById('account-signed-in')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      window.location.assign(SITE_BASE + 'account.html')
    }
  })
  accountMenu.addEventListener('account-menu-signout', async () => {
    accountMenu.busyState = true
    try {
      if (AUTH_URL) await authRequest('/sign-out', { method: 'POST' })
    } catch {
      // Clear the local view even if the remote session is already gone.
    } finally {
      accountMenu.busyState = false
      accountMenu.open = false
      applySiteSession(null)
    }
  })
}

function applySiteSession(session) {
  const requestId = ++accountMenuPlanRequest
  const adminRequestId = ++accountAdminRequest
  accountIsAdmin = false
  accountMenuPlan = session && BILLING_API_URL ? 'Checking plan' : 'Free plan'
  updateAccountNavigation(session)
  if (session && BILLING_API_URL) {
    void billingRequest('/billing/me', session).then((payload) => {
      if (requestId !== accountMenuPlanRequest) return
      const data = asRecord(unwrap(payload))
      accountMenuPlan = displayPlanName(data.planName || data.displayName || data.planKey)
      updateAccountNavigation(session)
    }).catch(() => {
      if (requestId !== accountMenuPlanRequest) return
      accountMenuPlan = 'Plan unavailable'
      updateAccountNavigation(session)
    })
    if (!document.getElementById('admin-page')) {
      void billingRequest('/admin/me', session).then(() => {
        if (adminRequestId !== accountAdminRequest) return
        accountIsAdmin = true
        updateAccountNavigation(session)
      }).catch(() => {
        if (adminRequestId !== accountAdminRequest) return
        accountIsAdmin = false
        updateAccountNavigation(session)
      })
    }
  }
  if (accountSessionHandler) accountSessionHandler(session)
}

function asRecord(value) {
  return value && typeof value === 'object' ? value : {}
}

function unwrap(payload) {
  const outer = asRecord(payload)
  return outer.data && typeof outer.data === 'object' ? outer.data : payload
}

function errorMessage(payload, status) {
  const outer = asRecord(payload)
  const nested = asRecord(outer.error)
  const message = outer.message || nested.message || (typeof outer.error === 'string' ? outer.error : '')
  if (message) return message
  if (status === 401) return 'The email or password is incorrect.'
  if (status === 409) return 'An account with that email already exists.'
  if (status === 429) return 'Too many attempts. Wait a moment and try again.'
  return `The account service returned HTTP ${status}.`
}

async function readResponse(response) {
  const text = await response.text()
  let payload = null
  if (text) {
    try { payload = JSON.parse(text) } catch { payload = { message: text } }
  }
  if (!response.ok) throw new Error(errorMessage(payload, response.status))
  return payload
}

async function authRequest(path, init = {}) {
  if (!AUTH_URL) throw new Error('The account service is not configured for this website yet.')
  let response
  try {
    response = await fetch(`${AUTH_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    })
  } catch {
    throw new Error('Valdor could not reach the account service. Check your connection and try again.')
  }
  return readResponse(response)
}

function sessionFromPayload(payload) {
  const envelope = asRecord(unwrap(payload))
  const user = asRecord(envelope.user)
  const session = asRecord(envelope.session)
  if (!user.email || !session.expiresAt) return null
  return { user, session }
}

async function billingToken(session) {
  if (!session) throw new Error('Sign in before managing billing.')
  let payload
  try {
    payload = await authRequest('/token')
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Valdor could not reach')) throw error
    throw new Error('Your sign-in has expired. Sign in again to continue.')
  }
  const token = asRecord(unwrap(payload)).token
  if (typeof token !== 'string' || token.length === 0) throw new Error('Your sign-in could not be verified. Sign in again to continue.')
  return token
}

async function billingRequest(path, session, init = {}) {
  if (!BILLING_API_URL) throw new Error('Billing is not configured yet.')
  const token = await billingToken(session)
  let response
  try {
    response = await fetch(`${BILLING_API_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    })
  } catch {
    throw new Error('Valdor could not reach billing. Try again in a moment.')
  }
  return readResponse(response)
}

async function getSession() {
  try {
    return sessionFromPayload(await authRequest('/get-session'))
  } catch {
    return null
  }
}

function setStatus(element, message = '', tone = '') {
  if (!element) return
  element.textContent = message
  element.className = `site-status${tone ? ` ${tone}` : ''}`
}

function formatBillingDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function displayPlanName(value) {
  const name = String(value ?? '').trim()
  return name || 'Free plan'
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

function trialDurationFromForm(value, unit) {
  const amount = Number(value)
  const secondsPerUnit = Object.prototype.hasOwnProperty.call(TRIAL_UNIT_SECONDS, unit) ? TRIAL_UNIT_SECONDS[unit] : 0
  if (!Number.isSafeInteger(amount) || amount < 1 || !secondsPerUnit) return null
  const seconds = amount * secondsPerUnit
  if (seconds > MAX_TRIAL_SECONDS) return null
  return { value: amount, unit, seconds }
}

function formatTrialDuration(value, unit) {
  const labels = { minute: 'minute', hour: 'hour', day: 'day', week: 'week' }
  const label = labels[unit] || 'day'
  return `${value} ${label}${value === 1 ? '' : 's'}`
}

function billingStatusText(data) {
  const planKey = String(data.planKey || '').toLowerCase()
  const subscriptionStatus = String(data.subscriptionStatus || '').toLowerCase()
  const entitlementStatus = String(data.entitlementStatus || '').toLowerCase()
  const endDate = formatBillingDate(data.currentPeriodEnd || data.trialEndsAt)

  if (planKey !== 'pro') {
    if (subscriptionStatus === 'past_due' || subscriptionStatus === 'unpaid') return 'Payment needs attention'
    return 'No active subscription'
  }
  if (entitlementStatus === 'trial' || subscriptionStatus === 'trialing') return endDate ? `Trial · ends ${endDate}` : 'Trial access'
  if (entitlementStatus === 'grace' || subscriptionStatus === 'past_due') return endDate ? `Payment needs attention · access through ${endDate}` : 'Payment needs attention'
  if (subscriptionStatus === 'canceled' || subscriptionStatus === 'cancelled') return endDate ? `Subscription ends ${endDate}` : 'Subscription ending'
  return endDate ? `Active · renews ${endDate}` : "You're all set with Valdor Pro"
}

function configureDownload() {
  const link = document.getElementById('download-link')
  if (!link) return
  const status = document.getElementById('download-status')
  if (DOWNLOAD_URL) {
    link.href = DOWNLOAD_URL
    link.target = '_blank'
    link.rel = 'noreferrer'
    setStatus(status)
    return
  }
  link.hidden = true
  setStatus(status, 'The Windows installer is not published yet.')
}

function initializeAccount() {
  const signedOut = document.getElementById('account-signed-out')
  const signedIn = document.getElementById('account-signed-in')
  const authPanel = document.getElementById('account-auth-panel')
  const authForm = document.getElementById('auth-form')
  if (!signedOut || !signedIn || !authPanel || !authForm) return

  const authNameField = document.getElementById('auth-name-field')
  const authName = document.getElementById('auth-name')
  const authEmail = document.getElementById('auth-email')
  const authPassword = document.getElementById('auth-password')
  const authConfirmPasswordField = document.getElementById('auth-confirm-password-field')
  const authConfirmPassword = document.getElementById('auth-confirm-password')
  const authEyebrow = document.getElementById('auth-eyebrow')
  const authHeading = document.getElementById('auth-heading')
  const authSubmit = document.getElementById('auth-submit')
  const authSwitchCopy = document.getElementById('auth-switch-copy')
  const authSwitch = document.getElementById('auth-switch')
  const authStatus = document.getElementById('auth-status')
  const billingAction = document.getElementById('billing-action')
  const plansLink = document.getElementById('account-plans-link')
  const billingStatus = document.getElementById('billing-status')
  const state = { mode: 'signin', busy: false, session: null }

  function setBusy(busy) {
    state.busy = busy
    authSubmit.disabled = busy
    authSubmit.classList.toggle('is-busy', busy)
    authSubmit.innerHTML = busy ? 'Working…' : state.mode === 'signin' ? 'Open workspace <span aria-hidden="true">→</span>' : 'Create account <span aria-hidden="true">→</span>'
  }

  function setMode(mode) {
    state.mode = mode
    const signingUp = mode === 'signup'
    authNameField.hidden = !signingUp
    authName.required = signingUp
    authConfirmPasswordField.hidden = !signingUp
    authConfirmPassword.required = signingUp
    authPassword.autocomplete = signingUp ? 'new-password' : 'current-password'
    authEyebrow.textContent = signingUp ? 'Create your access' : 'Welcome back'
    authHeading.textContent = signingUp ? 'Create account' : 'Sign in'
    authSwitchCopy.textContent = signingUp ? 'Already have an account?' : 'Need an account?'
    authSwitch.textContent = signingUp ? 'Sign in' : 'Create one'
    setStatus(authStatus)
    setBusy(false)
  }

  function renderSignedOut() {
    state.session = null
    document.body.classList.remove('has-account-session')
    updateAccountNavigation(null)
    authPanel.hidden = false
    signedOut.hidden = false
    signedIn.hidden = true
    authForm.reset()
    setMode(state.mode)
    setStatus(billingStatus)
  }

  function renderSignedIn(session) {
    state.session = session
    document.body.classList.add('has-account-session')
    updateAccountNavigation(session)
    authPanel.hidden = true
    signedOut.hidden = true
    signedIn.hidden = false
    document.getElementById('account-name').textContent = session.user.name || session.user.email?.split('@')[0] || 'Valdor account'
    document.getElementById('account-email').textContent = session.user.email || ''
    document.getElementById('account-plan').textContent = BILLING_API_URL ? 'Checking your plan' : 'Free plan'
    document.getElementById('account-subscription').textContent = BILLING_API_URL ? 'Loading billing details' : 'No active subscription'
    billingAction.hidden = true
    if (plansLink) plansLink.hidden = false
    setStatus(billingStatus)
    const checkoutState = new URLSearchParams(window.location.search).get('checkout')
    if (checkoutState === 'success') setStatus(billingStatus, 'Payment received. Your Pro access will appear after Stripe confirms the subscription.')
    if (checkoutState === 'canceled') setStatus(billingStatus, 'Checkout canceled. No changes were made.')
    void loadBilling()
  }

  async function loadBilling() {
    if (!BILLING_API_URL) return
    try {
      const payload = await billingRequest('/billing/me', state.session)
      const data = asRecord(unwrap(payload))
      document.getElementById('account-plan').textContent = displayPlanName(data.planName || data.displayName || data.planKey)
      document.getElementById('account-subscription').textContent = billingStatusText(data)
      billingAction.hidden = !data.hasBillingCustomer
      if (plansLink) plansLink.hidden = data.planKey === 'pro'
    } catch (error) {
      document.getElementById('account-plan').textContent = 'Plan unavailable'
      document.getElementById('account-subscription').textContent = 'Could not load billing'
      if (plansLink) plansLink.hidden = false
      billingAction.hidden = true
      setStatus(billingStatus, error instanceof Error ? error.message : 'Could not load billing details.', 'is-error')
    }
  }

  window.setInterval(() => {
    if (state.session && !document.hidden) void loadBilling()
  }, 30_000)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.session) void loadBilling()
  })

  async function handleSubmit(event) {
    event.preventDefault()
    if (state.busy || !authForm.reportValidity()) return
    if (state.mode === 'signup' && authPassword.value !== authConfirmPassword.value) {
      setStatus(authStatus, 'Passwords do not match.', 'is-error')
      return
    }
    setBusy(true)
    setStatus(authStatus, state.mode === 'signin' ? 'Signing in…' : 'Creating your account…')
    try {
      const body = state.mode === 'signin'
        ? { email: authEmail.value.trim().toLowerCase(), password: authPassword.value }
        : { name: authName.value.trim(), email: authEmail.value.trim().toLowerCase(), password: authPassword.value }
      await authRequest(state.mode === 'signin' ? '/sign-in/email' : '/sign-up/email', { method: 'POST', body: JSON.stringify(body) })
      const session = await getSession()
      if (!session) {
        setBusy(false)
        setStatus(authStatus, state.mode === 'signup' ? 'Account created. Check your inbox if email verification is required, then sign in.' : 'Sign-in completed, but no browser session was returned.', 'is-error')
        return
      }
      setBusy(false)
      applySiteSession(session)
    } catch (error) {
      setBusy(false)
      setStatus(authStatus, error instanceof Error ? error.message : 'Something went wrong. Try again.', 'is-error')
    }
  }

  async function handleSignOut() {
    document.getElementById('sign-out').disabled = true
    try {
      if (AUTH_URL) await authRequest('/sign-out', { method: 'POST' })
    } catch {
      // Clear the local view even if the remote session is already gone.
    } finally {
      document.getElementById('sign-out').disabled = false
      applySiteSession(null)
    }
  }

  async function handleBillingAction() {
    if (!BILLING_API_URL) {
      setStatus(billingStatus, 'The billing service will be connected here before paid launch.')
      return
    }
    const button = document.getElementById('billing-action')
    button.disabled = true
    setStatus(billingStatus, 'Opening billing…')
    try {
      const payload = await billingRequest('/billing/portal', state.session, { method: 'POST' })
      const data = asRecord(unwrap(payload))
      if (!data.url || typeof data.url !== 'string') throw new Error('The billing service did not return a portal link.')
      window.location.assign(data.url)
    } catch (error) {
      setStatus(billingStatus, error instanceof Error ? error.message : 'Could not open billing.', 'is-error')
    } finally {
      button.disabled = false
    }
  }

  authSwitch.addEventListener('click', () => setMode(state.mode === 'signin' ? 'signup' : 'signin'))
  authForm.addEventListener('submit', handleSubmit)
  document.getElementById('sign-out').addEventListener('click', handleSignOut)
  document.getElementById('billing-action').addEventListener('click', handleBillingAction)
  accountSessionHandler = (session) => session ? renderSignedIn(session) : renderSignedOut()
  const requestedMode = new URLSearchParams(window.location.search).get('mode')
  setMode(requestedMode === 'signup' ? 'signup' : 'signin')

  if (AUTH_URL) {
    void getSession().then((session) => {
      if (session) applySiteSession(session)
    })
  }
}

function initializePricing() {
  initializeRegionalPrice()
  const checkoutLink = document.querySelector('[data-start-checkout]')
  if (!checkoutLink) return
  const checkoutStatus = document.getElementById('pricing-status')
  let checkoutMode = 'loading'
  const setCheckoutCta = (label, href, mode) => {
    checkoutLink.textContent = label
    checkoutLink.href = href
    checkoutMode = mode
  }

  checkoutLink.addEventListener('click', async (event) => {
    if (checkoutMode !== 'checkout') return
    event.preventDefault()
    if (!BILLING_API_URL) {
      window.location.assign(`${SITE_BASE}account.html`)
      return
    }
    checkoutLink.classList.add('is-busy')
    checkoutLink.setAttribute('aria-busy', 'true')
    checkoutLink.textContent = 'Opening checkout…'
    setStatus(checkoutStatus)
    try {
      const session = await getSession()
      if (!session) throw new Error('Sign in again to continue.')
      const payload = await billingRequest('/billing/checkout', session, { method: 'POST', body: JSON.stringify({ planKey: 'pro' }) })
      const data = asRecord(unwrap(payload))
      if (typeof data.url !== 'string') throw new Error('Billing did not return a checkout link.')
      window.location.assign(data.url)
    } catch (error) {
      setCheckoutCta('Try again', '#checkout', 'checkout')
      setStatus(checkoutStatus, error instanceof Error ? error.message : 'Could not open checkout.', 'is-error')
    } finally {
      checkoutLink.classList.remove('is-busy')
      checkoutLink.removeAttribute('aria-busy')
    }
  })

  void getSession().then(async (session) => {
    applySiteSession(session)
    if (!session) {
      setCheckoutCta('Sign in to upgrade', `${SITE_BASE}account.html`, 'account')
      return
    }
    if (!BILLING_API_URL) {
      setCheckoutCta('View your account', `${SITE_BASE}account.html`, 'account')
      return
    }
    checkoutLink.textContent = 'Checking plan…'
    checkoutLink.setAttribute('aria-busy', 'true')
    try {
      const payload = await billingRequest('/billing/me', session)
      const data = asRecord(unwrap(payload))
      if (data.planKey === 'pro') {
        setCheckoutCta('Manage billing', `${SITE_BASE}account.html`, 'account')
        setStatus(checkoutStatus)
      } else {
        setCheckoutCta('Upgrade to Pro', '#checkout', 'checkout')
        setStatus(checkoutStatus)
      }
    } catch (error) {
      setCheckoutCta('Check your account', `${SITE_BASE}account.html`, 'account')
      setStatus(checkoutStatus, error instanceof Error ? error.message : 'We could not verify your plan.', 'is-error')
    } finally {
      checkoutLink.removeAttribute('aria-busy')
    }
  })
}

function currencyForCountry(countryCode) {
  const country = String(countryCode || '').trim().toUpperCase()
  if (country === 'GB') return 'GBP'
  if (EUROPEAN_COUNTRIES.has(country)) return 'EUR'
  return 'USD'
}

function browserCountryCode() {
  const locales = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language]

  for (const locale of locales) {
    if (!locale) continue
    try {
      const region = new Intl.Locale(locale).region
      if (region) return region
    } catch {
      const match = String(locale).match(/[-_]([A-Za-z]{2})$/)
      if (match) return match[1]
    }
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  if (timeZone === 'Europe/London') return 'GB'
  if (timeZone.startsWith('Europe/')) return 'DE'
  return ''
}

async function vercelCountryCode() {
  try {
    const response = await fetch('/api/region', { headers: { Accept: 'application/json' } })
    if (!response.ok) return ''
    const payload = await response.json()
    return typeof payload.country === 'string' ? payload.country : ''
  } catch {
    return ''
  }
}

function initializeRegionalPrice() {
  const amount = document.querySelector('[data-regional-price]')
  const period = document.querySelector('[data-regional-price-period]')
  if (!amount || !period) return

  const applyPrice = (countryCode) => {
    const price = REGIONAL_PRICES[currencyForCountry(countryCode)]
    amount.textContent = price.amount
    period.textContent = price.period
  }

  applyPrice(browserCountryCode())
  void vercelCountryCode().then((countryCode) => {
    if (countryCode) applyPrice(countryCode)
  })
}

function initializeAdmin() {
  const adminPage = document.getElementById('admin-page')
  if (!adminPage) return

  const accessPanel = document.getElementById('admin-access-panel')
  const dashboard = document.getElementById('admin-dashboard')
  const accessHeading = document.getElementById('admin-access-heading')
  const accessCopy = document.getElementById('admin-access-copy')
  const accessStatus = document.getElementById('admin-access-status')
  const searchForm = document.getElementById('admin-search-form')
  const searchInput = document.getElementById('admin-search')
  const searchSubmit = document.getElementById('admin-search-submit')
  const searchStatus = document.getElementById('admin-search-status')
  const resultCount = document.getElementById('admin-result-count')
  const results = document.getElementById('admin-results')
  const trialPanel = document.getElementById('admin-trial-panel')
  const trialForm = document.getElementById('admin-trial-form')
  const trialName = document.getElementById('admin-trial-name')
  const trialEmail = document.getElementById('admin-trial-email')
  const trialDetails = document.getElementById('admin-trial-details')
  const trialClose = document.getElementById('admin-trial-close')
  const trialValueInput = document.getElementById('admin-trial-value')
  const trialUnitInput = document.getElementById('admin-trial-unit')
  const trialNoteInput = document.getElementById('admin-trial-note')
  const trialStatus = document.getElementById('admin-trial-status')
  const operator = document.getElementById('admin-operator')

  if (!accessPanel || !dashboard || !accessHeading || !accessCopy || !accessStatus || !searchForm || !searchInput || !searchSubmit || !searchStatus || !resultCount || !results || !trialPanel || !trialForm || !trialName || !trialEmail || !trialDetails || !trialClose || !trialValueInput || !trialUnitInput || !trialNoteInput || !trialStatus || !operator) return

  const state = {
    session: null,
    customers: [],
    selectedCustomer: null,
    searchBusy: false,
    trialBusy: false,
  }

  const canGrantTrial = (customer) => customer.planKey !== 'pro' || customer.entitlementStatus === 'trial'

  const customerStatus = (customer) => {
    const entitlementStatus = String(customer.entitlementStatus || '').toLowerCase()
    const subscriptionStatus = String(customer.subscriptionStatus || '').toLowerCase()
    if (customer.planKey === 'pro') {
      if (entitlementStatus === 'trial') {
        const endDate = formatBillingDate(customer.trialEndsAt)
        return endDate ? `Trial · ends ${endDate}` : 'Pro trial'
      }
      if (entitlementStatus === 'grace' || subscriptionStatus === 'past_due') return 'Payment needs attention'
      if (subscriptionStatus === 'canceled' || subscriptionStatus === 'cancelled') return 'Subscription ending'
      return 'Valdor Pro'
    }
    const latestTrial = customer.trialHistory?.[0]
    if (latestTrial?.startedAt && new Date(latestTrial.startedAt).getTime() > Date.now()) {
      const startDate = formatBillingDate(latestTrial.startedAt)
      return startDate ? `Trial scheduled · starts ${startDate}` : 'Trial scheduled'
    }
    if (customer.trialCount) {
      const endDate = formatBillingDate(latestTrial?.endsAt)
      return endDate ? `Free plan · last trial ended ${endDate}` : 'Free plan · trial history'
    }
    return 'Free plan'
  }

  const customerName = (customer) => customer.name?.trim() || customer.email?.split('@')[0] || 'Unnamed account'

  const renderResults = () => {
    resultCount.textContent = state.customers.length ? `${state.customers.length} account${state.customers.length === 1 ? '' : 's'}` : ''
    if (!state.customers.length) {
      results.innerHTML = '<p class="admin-empty-state">Search for a customer by email or name.</p>'
      return
    }

    results.innerHTML = state.customers.map((customer) => {
      const grantable = canGrantTrial(customer)
      const actionLabel = customer.planKey === 'pro'
        ? customer.entitlementStatus === 'trial' ? 'Extend trial' : 'Already Pro'
        : customer.trialCount ? 'Grant again' : 'Grant trial'
      const disabled = grantable ? '' : ' disabled'
      const accessLabel = customer.planKey === 'pro'
        ? customer.entitlementStatus === 'trial'
          ? `${customer.trialCount || 0} trial grant${customer.trialCount === 1 ? '' : 's'} · current access`
          : 'Current access'
        : customer.trialCount
          ? `${customer.trialCount} previous trial${customer.trialCount === 1 ? '' : 's'}`
          : 'No trial grant'
      return `<article class="admin-customer-row"><div class="admin-customer-identity"><strong>${escapeHtml(customerName(customer))}</strong><small>${escapeHtml(customer.email)}</small></div><div class="admin-customer-state"><strong>${escapeHtml(customerStatus(customer))}</strong><small>${accessLabel}</small></div><div class="admin-customer-actions"><button class="button button-light" type="button" data-customer-id="${escapeHtml(customer.id)}"${disabled}>${actionLabel}</button></div></article>`
    }).join('')
  }

  const showAccess = (heading, copy, status = '', tone = '') => {
    accessPanel.hidden = false
    dashboard.hidden = true
    accessHeading.textContent = heading
    accessCopy.textContent = copy
    setStatus(accessStatus, status, tone)
  }

  const renderTrialDetails = (customer) => {
    const history = Array.isArray(customer.trialHistory) ? customer.trialHistory.slice(0, 20) : []
    if (!history.length) {
      trialDetails.innerHTML = '<h3>Trial history</h3><p class="admin-trial-details-empty">No previous trials.</p>'
      return
    }

    const now = Date.now()
    const historyItems = history.map((trial) => {
      const start = trial.startedAt ? new Date(trial.startedAt) : null
      const end = trial.endsAt ? new Date(trial.endsAt) : null
      const isScheduled = start && !Number.isNaN(start.getTime()) && start.getTime() > now
      const isActive = !isScheduled && end && !Number.isNaN(end.getTime()) && end.getTime() > now
      const stateLabel = isScheduled ? 'Scheduled' : isActive ? 'Active now' : 'Ended'
      const duration = trial.durationValue && trial.durationUnit
        ? formatTrialDuration(trial.durationValue, trial.durationUnit)
        : `${trial.durationDays || 'Unknown'} days`
      const startDate = formatBillingDate(trial.startedAt)
      const endDate = formatBillingDate(trial.endsAt)
      const timeline = startDate && endDate
        ? `${isScheduled ? 'Starts' : 'Started'} ${startDate} · ${isActive ? 'ends' : isScheduled ? 'ends' : 'ended'} ${endDate}`
        : endDate
          ? `${isActive ? 'Ends' : 'Ended'} ${endDate}`
          : 'No end date recorded'
      const note = typeof trial.note === 'string' && trial.note.trim()
        ? `<small>Note: ${escapeHtml(trial.note)}</small>`
        : ''
      return `<article class="admin-trial-history-item"><strong>${escapeHtml(duration)} <em>${stateLabel}</em></strong><small>${timeline}</small>${note}</article>`
    }).join('')

    const count = Number(customer.trialCount || history.length)
    const countLabel = `${count} grant${count === 1 ? '' : 's'}`
    trialDetails.innerHTML = `<h3>Trial history · ${countLabel}</h3><div class="admin-trial-history">${historyItems}</div>`
  }

  const showTrialPanel = (customer) => {
    state.selectedCustomer = customer
    trialName.textContent = customerName(customer)
    trialEmail.textContent = customer.email
    renderTrialDetails(customer)
    trialValueInput.value = '14'
    trialUnitInput.value = 'day'
    trialNoteInput.value = ''
    setStatus(trialStatus)
    trialPanel.hidden = false
    trialClose.focus()
  }

  const closeTrialPanel = (force = false) => {
    if (state.trialBusy && !force) return
    state.selectedCustomer = null
    trialPanel.hidden = true
    setStatus(trialStatus)
  }

  const searchCustomers = async (event) => {
    event.preventDefault()
    if (!state.session || state.searchBusy || state.trialBusy) return
    const query = searchInput.value.trim()
    if (query.length < 2) {
      state.customers = []
      renderResults()
      setStatus(searchStatus, 'Enter at least 2 characters to search.', 'is-error')
      return
    }

    state.searchBusy = true
    searchSubmit.disabled = true
    searchSubmit.textContent = 'Searching…'
    setStatus(searchStatus, 'Searching…')
    try {
      const payload = await billingRequest(`/admin/customers?q=${encodeURIComponent(query)}`, state.session)
      const data = asRecord(unwrap(payload))
      state.customers = Array.isArray(data.customers) ? data.customers : []
      renderResults()
      setStatus(searchStatus, state.customers.length ? `${state.customers.length} matching account${state.customers.length === 1 ? '' : 's'}.` : 'No matching accounts.')
    } catch (error) {
      state.customers = []
      renderResults()
      setStatus(searchStatus, error instanceof Error ? error.message : 'Could not search accounts.', 'is-error')
    } finally {
      state.searchBusy = false
      searchSubmit.disabled = false
      searchSubmit.textContent = 'Search'
    }
  }

  const selectCustomer = (event) => {
    if (!(event.target instanceof Element) || state.searchBusy || state.trialBusy) return
    const button = event.target.closest('[data-customer-id]')
    if (!(button instanceof HTMLButtonElement) || button.disabled) return
    const customer = state.customers.find((item) => item.id === button.dataset.customerId)
    if (customer && canGrantTrial(customer)) showTrialPanel(customer)
  }

  const grantTrial = async (event) => {
    event.preventDefault()
    const customer = state.selectedCustomer
    if (!state.session || !customer || state.trialBusy) return

    const duration = trialDurationFromForm(trialValueInput.value, trialUnitInput.value)
    if (!duration) {
      setStatus(trialStatus, 'Use a whole-number duration between 1 minute and 90 days.', 'is-error')
      return
    }

    state.trialBusy = true
    const submit = trialForm.querySelector('button[type="submit"]')
    if (submit) {
      submit.disabled = true
      submit.textContent = 'Granting…'
    }
    setStatus(trialStatus, 'Granting Pro trial…')
    try {
      const payload = await billingRequest('/admin/trials', state.session, {
        method: 'POST',
        body: JSON.stringify({
          email: customer.email,
          durationValue: duration.value,
          durationUnit: duration.unit,
          note: trialNoteInput.value.trim(),
        }),
      })
      const data = asRecord(unwrap(payload))
      const trial = asRecord(data.trial)
      const updated = state.customers.find((item) => item.id === customer.id)
      if (updated) {
        const startsAt = trial.startedAt ? new Date(trial.startedAt).getTime() : Date.now()
        const isScheduled = Number.isFinite(startsAt) && startsAt > Date.now()
        const existingActiveTrial = customer.planKey === 'pro' && customer.entitlementStatus === 'trial'
        const hasCurrentTrial = existingActiveTrial || !isScheduled
        updated.planKey = hasCurrentTrial ? 'pro' : 'free'
        updated.planName = hasCurrentTrial ? 'Valdor Pro' : 'Free plan'
        updated.entitlementStatus = hasCurrentTrial ? 'trial' : 'free'
        updated.trialEndsAt = hasCurrentTrial
          ? isScheduled ? customer.trialEndsAt || null : trial.endsAt || null
          : null
        updated.trialCount = Number(updated.trialCount || 0) + 1
        updated.trialHistory = [trial, ...(Array.isArray(updated.trialHistory) ? updated.trialHistory : [])].slice(0, 20)
        updated.hasTrialGrant = true
      }
      closeTrialPanel(true)
      renderResults()
      const grantedDuration = trial.durationValue && trial.durationUnit
        ? ` for ${formatTrialDuration(trial.durationValue, trial.durationUnit)}`
        : ''
      setStatus(searchStatus, `Pro trial granted to ${customer.email}${grantedDuration}.`)
    } catch (error) {
      setStatus(trialStatus, error instanceof Error ? error.message : 'Could not grant the trial.', 'is-error')
    } finally {
      state.trialBusy = false
      if (submit) {
        submit.disabled = false
        submit.innerHTML = 'Grant Pro trial <span aria-hidden="true">→</span>'
      }
    }
  }

  searchForm.addEventListener('submit', searchCustomers)
  results.addEventListener('click', selectCustomer)
  trialForm.addEventListener('submit', grantTrial)
  trialClose.addEventListener('click', closeTrialPanel)
  renderResults()

  const loadAdmin = async () => {
    const session = await getSession()
    applySiteSession(session)
    if (!session) {
      showAccess('Sign in to continue', 'Admin access is limited to approved operators.')
      return
    }

    try {
      await billingRequest('/admin/me', session)
      state.session = session
      accountIsAdmin = true
      updateAccountNavigation(session)
      operator.textContent = `Signed in as ${session.user.email}`
      accessPanel.hidden = true
      dashboard.hidden = false
      searchInput.focus()
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message === 'Admin access is required.') {
        showAccess('Admin access required', 'This account is not on the administrator list.')
      } else {
        showAccess('Could not verify access', 'The administrator service could not confirm this account.', message || 'Try again in a moment.', 'is-error')
      }
    }
  }

  void loadAdmin()
}

mountSiteChrome()
initializeAccountMenu()
configureDownload()
initializeAccount()
initializePricing()
initializeAdmin()
if (!document.getElementById('auth-form') && !document.querySelector('[data-start-checkout]') && !document.getElementById('admin-page') && AUTH_URL) void getSession().then(applySiteSession)
