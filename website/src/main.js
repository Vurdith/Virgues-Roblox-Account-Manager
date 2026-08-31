import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import '@fontsource/outfit/700.css'
import '@fontsource/outfit/800.css'
import './styles.css'
import { registerAccountMenuElement } from '../../src/shared/account-menu.ts'

const AUTH_URL = (import.meta.env.VITE_NEON_AUTH_URL || 'https://ep-morning-frost-zagg2ox8.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth').replace(/\/$/, '')
const configuredBillingApiUrl = (import.meta.env.VITE_VIRGUE_BILLING_API_URL || '').trim()
const sameOriginBillingApiUrl = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
  ? `${window.location.origin}/api`
  : ''
const BILLING_API_URL = (configuredBillingApiUrl || sameOriginBillingApiUrl).replace(/\/$/, '')
const PUBLISHED_DOWNLOAD_URL = 'https://github.com/Vurdith/Virgues-Roblox-Account-Manager/releases/download/v1.0.0/Virgues-Roblox-Account-Manager-Setup-1.0.0.exe'
const DOWNLOAD_URL = (import.meta.env.VITE_VIRGUE_DOWNLOAD_URL || PUBLISHED_DOWNLOAD_URL).trim()
const SITE_BASE = import.meta.env.BASE_URL
const currentPage = document.body.dataset.page || 'home'
let accountSessionHandler = null
let accountMenuPlan = 'Free plan'
let accountMenuPlanRequest = 0

registerAccountMenuElement()

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
    header.innerHTML = '<header class="site-header"><a class="site-brand" href="' + SITE_BASE + '" aria-label="Virgue\'s Roblox Account Manager home"><img class="site-brand-mark" src="' + SITE_BASE + 'virgue-icon.png" alt="" /><span class="site-brand-copy"><strong>Virgue\'s</strong><small>Roblox Account Manager</small></span></a><nav class="site-nav" aria-label="Main navigation">' + navigation + '<div class="site-account-menu"><virgue-account-menu></virgue-account-menu></div></nav></header>'
  }
  if (footer) {
    footer.innerHTML = '<footer class="site-footer section-shell"><a class="site-brand" href="' + SITE_BASE + '" aria-label="Virgue\'s Roblox Account Manager home"><img class="site-brand-mark" src="' + SITE_BASE + 'virgue-icon.png" alt="" /><span class="site-brand-copy"><strong>Virgue\'s</strong><small>Roblox Account Manager</small></span></a><nav class="footer-links" aria-label="Footer navigation"><a href="' + SITE_BASE + 'product.html">Product</a><a href="' + SITE_BASE + 'pricing.html">Pricing</a><a href="' + SITE_BASE + 'download.html">Download</a></nav></footer>'
  }
}

function updateAccountNavigation(session) {
  const accountMenu = document.querySelector('virgue-account-menu')
  if (!accountMenu) return
  const fullName = session?.user?.name?.trim() || ''
  const email = session?.user?.email?.trim() || ''
  accountMenu.name = fullName || email.split('@')[0] || 'Account'
  accountMenu.email = email
  accountMenu.plan = accountMenuPlan
  accountMenu.signedInState = Boolean(session)
  accountMenu.busyState = false
}

function initializeAccountMenu() {
  const accountMenu = document.querySelector('virgue-account-menu')
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
  accountMenuPlan = session && BILLING_API_URL ? 'Checking plan' : 'Free plan'
  updateAccountNavigation(session)
  if (session && BILLING_API_URL) {
    void billingRequest('/billing/me', session).then((payload) => {
      if (requestId !== accountMenuPlanRequest) return
      const data = asRecord(unwrap(payload))
      accountMenuPlan = data.planName || data.displayName || data.planKey || 'Free plan'
      updateAccountNavigation(session)
    }).catch(() => {
      if (requestId !== accountMenuPlanRequest) return
      accountMenuPlan = 'Plan unavailable'
      updateAccountNavigation(session)
    })
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
    throw new Error('Virgue could not reach the account service. Check your connection and try again.')
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
    if (error instanceof Error && error.message.startsWith('Virgue could not reach')) throw error
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
    throw new Error('Virgue could not reach billing. Try again in a moment.')
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
  return endDate ? `Active · renews ${endDate}` : "You're all set with Virgue Pro"
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
    document.getElementById('account-name').textContent = session.user.name || session.user.email?.split('@')[0] || 'Virgue account'
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
      document.getElementById('account-plan').textContent = data.planName || data.displayName || data.planKey || 'Free plan'
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

mountSiteChrome()
initializeAccountMenu()
configureDownload()
initializeAccount()
initializePricing()
if (!document.getElementById('auth-form') && !document.querySelector('[data-start-checkout]') && AUTH_URL) void getSession().then(applySiteSession)
