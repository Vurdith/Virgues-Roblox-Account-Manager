import { createServer } from 'node:http'
import { createPublicKey, verify } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import Stripe from 'stripe'
import { neon } from '@neondatabase/serverless'

const BRAND_NAME = 'Valdor'
const PRO_PLAN_NAME = `${BRAND_NAME} Pro`
const FREE_PLAN_NAME = 'Free plan'

function readEnvironmentVariable(name) {
  const keys = [`VALDOR_${name}`, `VIRGUE_${name}`, name]
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

// VALDOR_* is canonical. VIRGUE_* and the original unprefixed names remain
// readable during the migration so existing deployments can be rotated safely.
const billingEnv = {
  WEBSITE_ORIGINS: readEnvironmentVariable('WEBSITE_ORIGINS'),
  DATABASE_URL: readEnvironmentVariable('DATABASE_URL'),
  STRIPE_SECRET_KEY: readEnvironmentVariable('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: readEnvironmentVariable('STRIPE_WEBHOOK_SECRET'),
  NEON_AUTH_URL: readEnvironmentVariable('NEON_AUTH_URL'),
  NEON_AUTH_JWKS_URL: readEnvironmentVariable('NEON_AUTH_JWKS_URL'),
  NEON_AUTH_JWT_ISSUER: readEnvironmentVariable('NEON_AUTH_JWT_ISSUER'),
  NEON_AUTH_JWT_AUDIENCE: readEnvironmentVariable('NEON_AUTH_JWT_AUDIENCE'),
  STRIPE_PRO_PRICE_ID: readEnvironmentVariable('STRIPE_PRO_PRICE_ID'),
  PUBLIC_SITE_URL: readEnvironmentVariable('PUBLIC_SITE_URL'),
  PORT: readEnvironmentVariable('PORT'),
}

const required = ['DATABASE_URL', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'NEON_AUTH_URL', 'STRIPE_PRO_PRICE_ID', 'PUBLIC_SITE_URL']
const missing = required.filter((key) => !billingEnv[key]).map((key) => `VALDOR_${key}`)
if (missing.length) throw new Error(`Missing billing configuration: ${missing.join(', ')}`)

const database = neon(billingEnv.DATABASE_URL)
const stripe = new Stripe(billingEnv.STRIPE_SECRET_KEY)
const authUrl = billingEnv.NEON_AUTH_URL.replace(/\/$/, '')
const authJwksUrl = (billingEnv.NEON_AUTH_JWKS_URL || `${authUrl}/.well-known/jwks.json`).replace(/\/$/, '')
const expectedJwtIssuer = billingEnv.NEON_AUTH_JWT_ISSUER.trim()
const expectedJwtAudience = billingEnv.NEON_AUTH_JWT_AUDIENCE.trim()
const publicSiteUrl = billingEnv.PUBLIC_SITE_URL.replace(/\/$/, '')
const allowedOrigins = new Set((billingEnv.WEBSITE_ORIGINS || publicSiteUrl).split(',').map((value) => value.trim()).filter(Boolean))
const port = Number(billingEnv.PORT || 8787)
const jwtClockSkewSeconds = 30
const jwksCacheTtlMs = 5 * 60 * 1000

let cachedJwks = null
let cachedJwksExpiresAt = 0
let jwksRequest = null

class BillingRequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function send(response, status, payload, origin) {
  const body = JSON.stringify(payload)
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  }
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    headers.Vary = 'Origin'
  }
  response.writeHead(status, headers)
  response.end(body)
}

function error(response, status, message, origin) {
  send(response, status, { error: { message } }, origin)
}

async function readBody(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > 1024 * 1024) throw new Error('Request body is too large.')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function parseJson(body) {
  if (!body.length) return {}
  try { return JSON.parse(body.toString('utf8')) } catch { throw new Error('Request body must be valid JSON.') }
}

function requestUrl(request) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  // Vercel functions receive the mounted /api prefix; the local server does not.
  if (url.pathname === '/api') url.pathname = '/'
  else if (url.pathname.startsWith('/api/')) url.pathname = url.pathname.slice('/api'.length)
  return url
}

function unwrap(payload) {
  return payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object' ? payload.data : payload
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function decodeJwtJson(segment) {
  return asRecord(JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')))
}

function parseJwt(token) {
  if (token.length > 16 * 1024) throw new Error('JWT is too large.')
  const segments = token.split('.')
  if (segments.length !== 3 || segments.some((segment) => !segment)) throw new Error('JWT has an invalid shape.')
  const header = decodeJwtJson(segments[0])
  const payload = decodeJwtJson(segments[1])
  if (header.alg !== 'EdDSA' || typeof header.kid !== 'string' || !header.kid) throw new Error('JWT signing method is not supported.')
  return { header, payload, signingInput: `${segments[0]}.${segments[1]}`, signature: Buffer.from(segments[2], 'base64url') }
}

async function getJwks(forceRefresh = false) {
  if (!forceRefresh && cachedJwks && cachedJwksExpiresAt > Date.now()) return cachedJwks
  if (jwksRequest) return jwksRequest

  jwksRequest = (async () => {
    const response = await fetch(authJwksUrl, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`JWKS endpoint returned HTTP ${response.status}.`)
    const payload = asRecord(await response.json())
    const keys = Array.isArray(payload.keys) ? payload.keys.filter((key) => asRecord(key).kid) : []
    if (!keys.length) throw new Error('JWKS endpoint returned no signing keys.')
    cachedJwks = keys
    cachedJwksExpiresAt = Date.now() + jwksCacheTtlMs
    return keys
  })().finally(() => { jwksRequest = null })

  return jwksRequest
}

function matchingJwk(keys, kid) {
  return keys.find((key) => {
    const jwk = asRecord(key)
    return jwk.kid === kid && jwk.kty === 'OKP' && jwk.crv === 'Ed25519' && (!jwk.alg || jwk.alg === 'EdDSA')
  }) || null
}

function claimString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || null
}

function metadataValue(metadata, key) {
  const values = asRecord(metadata)
  return claimString(values[`valdor_${key}`], values[`virgue_${key}`])
}

function metadataUserId(metadata) {
  return metadataValue(metadata, 'user_id')
}

function planDisplayName(planKey, fallback = FREE_PLAN_NAME) {
  return planKey === 'pro' ? PRO_PLAN_NAME : fallback || FREE_PLAN_NAME
}

function audienceMatches(value, expected) {
  return value === expected || (Array.isArray(value) && value.includes(expected))
}

function userFromJwtPayload(payload) {
  const nestedUser = asRecord(payload.user)
  const id = claimString(payload.id, payload.sub, payload.user_id, payload.userId, nestedUser.id)
  const email = claimString(payload.email, nestedUser.email)
  if (!id || !email) throw new Error('JWT does not identify a user.')
  return { id, email, name: claimString(payload.name, payload.full_name, nestedUser.name) || '' }
}

export async function verifyNeonAuthToken(token) {
  const parsed = parseJwt(token)
  let keys = await getJwks()
  let jwk = matchingJwk(keys, parsed.header.kid)
  if (!jwk) {
    keys = await getJwks(true)
    jwk = matchingJwk(keys, parsed.header.kid)
  }
  if (!jwk) throw new Error('JWT signing key was not found.')

  const publicKey = createPublicKey({ key: jwk, format: 'jwk' })
  if (!verify(null, Buffer.from(parsed.signingInput), publicKey, parsed.signature)) throw new Error('JWT signature is invalid.')

  const now = Math.floor(Date.now() / 1000)
  if (typeof parsed.payload.exp !== 'number' || parsed.payload.exp <= now - jwtClockSkewSeconds) throw new Error('JWT has expired.')
  if (typeof parsed.payload.nbf === 'number' && parsed.payload.nbf > now + jwtClockSkewSeconds) throw new Error('JWT is not active yet.')
  if (expectedJwtIssuer && parsed.payload.iss !== expectedJwtIssuer) throw new Error('JWT issuer is invalid.')
  if (expectedJwtAudience && !audienceMatches(parsed.payload.aud, expectedJwtAudience)) throw new Error('JWT audience is invalid.')
  return userFromJwtPayload(parsed.payload)
}

async function requireUser(request) {
  const authorization = request.headers.authorization
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
  if (!token) throw new BillingRequestError(401, 'Sign in before managing billing.')
  try {
    return await verifyNeonAuthToken(token)
  } catch {
    throw new BillingRequestError(401, 'Your sign-in could not be verified.')
  }
}

async function requireAdmin(request) {
  const user = await requireUser(request)
  const rows = await database.query(
    'SELECT 1 FROM public.virgue_admins WHERE user_id = $1 LIMIT 1',
    [user.id],
  )
  if (!rows[0]) throw new BillingRequestError(403, 'Admin access is required.')
  return user
}

function adminEmail(value) {
  if (typeof value !== 'string') throw new BillingRequestError(400, 'Enter a customer email address.')
  const email = value.trim().toLowerCase()
  if (!email || email.length > 320 || !email.includes('@')) throw new BillingRequestError(400, 'Enter a valid customer email address.')
  return email
}

const TRIAL_UNIT_SECONDS = Object.freeze({
  minute: 60,
  hour: 60 * 60,
  day: 24 * 60 * 60,
  week: 7 * 24 * 60 * 60,
})
const MAX_TRIAL_SECONDS = 90 * TRIAL_UNIT_SECONDS.day

function trialDuration(value, unit) {
  const amount = Number(value)
  const normalizedUnit = typeof unit === 'string' ? unit.trim().toLowerCase().replace(/s$/, '') : ''
  const secondsPerUnit = Object.prototype.hasOwnProperty.call(TRIAL_UNIT_SECONDS, normalizedUnit)
    ? TRIAL_UNIT_SECONDS[normalizedUnit]
    : 0
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new BillingRequestError(400, 'Trial duration must be a whole number of at least 1.')
  }
  if (!secondsPerUnit) {
    throw new BillingRequestError(400, 'Choose minutes, hours, days, or weeks for the trial unit.')
  }
  const seconds = amount * secondsPerUnit
  if (seconds > MAX_TRIAL_SECONDS) {
    throw new BillingRequestError(400, 'Trial length cannot exceed 90 days.')
  }
  return {
    value: amount,
    unit: normalizedUnit,
    seconds,
    days: Math.ceil(seconds / TRIAL_UNIT_SECONDS.day),
  }
}

function trialDurationFromPayload(body) {
  if (body.durationValue !== undefined || body.durationUnit !== undefined) {
    return trialDuration(body.durationValue, body.durationUnit)
  }
  // Keep the original API shape working for older admin pages and scripts.
  return trialDuration(body.days, 'day')
}

function trialNote(value) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string' || value.trim().length > 280) throw new BillingRequestError(400, 'The trial note must be 280 characters or fewer.')
  return value.trim()
}

function trialHistoryValue(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function adminCustomer(row) {
  const planKey = row.plan_key || 'free'
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    planKey,
    planName: planDisplayName(planKey, row.plan_name),
    entitlementStatus: row.entitlement_status || 'free',
    subscriptionStatus: row.subscription_status || null,
    currentPeriodEnd: row.current_period_end || null,
    trialEndsAt: row.trial_ends_at || null,
    trialCount: Number(row.trial_count || 0),
    trialHistory: trialHistoryValue(row.trial_history),
    hasTrialGrant: Boolean(row.has_trial_grant),
  }
}

async function adminCustomers(search) {
  const query = search.trim().toLowerCase()
  if (!query) return []
  if (query.length < 2) throw new BillingRequestError(400, 'Enter at least 2 characters to search.')
  if (query.length > 120) throw new BillingRequestError(400, 'Search text is too long.')
  const rows = await database.query(
    `SELECT u.id, u.email, u.name,
            ent.plan_key, ent.plan_name, ent.entitlement_status,
            ent.subscription_status, ent.current_period_end, ent.trial_ends_at,
            trial_count.trial_count,
            trial_history.trial_history,
            EXISTS (
              SELECT 1
              FROM public.virgue_trial_grants grant_row
              WHERE grant_row.user_id = u.id
            ) AS has_trial_grant
     FROM neon_auth."user" u
     LEFT JOIN public.virgue_current_entitlements ent ON ent.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT count(*)::integer AS trial_count
       FROM public.virgue_trial_grants grant_row
       WHERE grant_row.user_id = u.id
     ) trial_count ON true
     LEFT JOIN LATERAL (
       SELECT COALESCE(
         json_agg(json_build_object(
           'id', grant_row.id,
           'startedAt', grant_row.started_at,
           'endsAt', grant_row.ends_at,
           'durationDays', grant_row.duration_days,
           'durationValue', grant_row.duration_value,
           'durationUnit', grant_row.duration_unit,
           'source', grant_row.source,
           'note', grant_row.note
         ) ORDER BY grant_row.started_at DESC),
         '[]'::json
       ) AS trial_history
       FROM (
         SELECT id, started_at, ends_at, duration_days, duration_value, duration_unit, source, note
         FROM public.virgue_trial_grants
         WHERE user_id = u.id
         ORDER BY started_at DESC
         LIMIT 20
       ) grant_row
     ) trial_history ON true
     WHERE position($1 in lower(u.email)) > 0
        OR position($1 in lower(coalesce(u.name, ''))) > 0
     ORDER BY lower(u.email)
     LIMIT 50`,
    [query],
  )
  return Promise.all(rows.map(async (row) => {
    if (row.plan_key !== 'pro') return adminCustomer(row)
    const entitlement = await entitlementFor(row.id)
    return adminCustomer({
      ...row,
      plan_key: entitlement.planKey,
      plan_name: entitlement.planName,
      entitlement_status: entitlement.entitlementStatus,
      subscription_status: entitlement.subscriptionStatus,
      current_period_end: entitlement.currentPeriodEnd,
      trial_ends_at: entitlement.trialEndsAt,
    })
  }))
}

async function grantTrial(admin, payload) {
  const body = asRecord(payload)
  const email = adminEmail(body.email)
  const duration = trialDurationFromPayload(body)
  const note = trialNote(body.note)
  const users = await database.query(
    'SELECT id, email, name FROM neon_auth."user" WHERE lower(email) = $1 LIMIT 1',
    [email],
  )
  const user = users[0]
  if (!user) throw new BillingRequestError(404, `No ${BRAND_NAME} account was found for that email.`)

  const current = await entitlementFor(user.id)
  if (current.planKey === 'pro' && current.entitlementStatus !== 'trial') {
    throw new BillingRequestError(409, `That account already has paid ${PRO_PLAN_NAME} access.`)
  }

  const inserted = await database.query(
    `WITH locked AS (
       SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0)) AS acquired
     ), schedule AS (
       SELECT GREATEST(
         now(),
         COALESCE(MAX(grant_row.ends_at) FILTER (WHERE grant_row.ends_at > now()), now())
       ) AS starts_at
       FROM public.virgue_trial_grants grant_row
       CROSS JOIN locked
       WHERE grant_row.user_id = $1::uuid
     )
     INSERT INTO public.virgue_trial_grants
       (id, user_id, started_at, ends_at, duration_days, duration_value, duration_unit, source, granted_by, note)
     SELECT gen_random_uuid(), $1::uuid, schedule.starts_at,
            schedule.starts_at + ($3 * interval '1 second'),
            CEIL($3 / 86400.0)::integer, $2, $4, 'manual', $5, $6
     FROM schedule
     RETURNING id, started_at, ends_at, duration_days, duration_value, duration_unit, source, note`,
    [user.id, duration.value, duration.seconds, duration.unit, admin.id, note],
  )
  if (!inserted[0]) throw new BillingRequestError(500, `The ${PRO_PLAN_NAME} trial could not be created.`)
  return {
    id: inserted[0].id,
    userId: user.id,
    email: user.email,
    name: user.name || '',
    startedAt: inserted[0].started_at,
    endsAt: inserted[0].ends_at,
    durationDays: inserted[0].duration_days,
    durationValue: inserted[0].duration_value,
    durationUnit: inserted[0].duration_unit,
    source: inserted[0].source,
    note: inserted[0].note || '',
  }
}

async function customerFor(user) {
  const existing = await database.query('SELECT stripe_customer_id FROM public.virgue_billing_customers WHERE user_id = $1', [user.id])
  const existingCustomerId = existing[0]?.stripe_customer_id
  if (existingCustomerId) {
    try {
      // Test and live Stripe accounts use different customer namespaces. Verify
      // the stored ID before reusing it so a mode switch can self-heal.
      const customer = await stripe.customers.retrieve(existingCustomerId)
      if (customer && !customer.deleted) return customer.id
    } catch (caught) {
      const isMissingCustomer = caught?.code === 'resource_missing' || caught?.statusCode === 404
      if (!isMissingCustomer) throw caught
    }
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { valdor_user_id: user.id },
  })
  const inserted = await database.query(
    `INSERT INTO public.virgue_billing_customers (user_id, stripe_customer_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id, updated_at = now()
     RETURNING stripe_customer_id`,
    [user.id, customer.id],
  )
  return inserted[0].stripe_customer_id
}

async function hasLiveSubscription(entitlement, providerCustomerId) {
  const stripeSubscriptionId = entitlement.provider_subscription_id
  if (entitlement.plan_key !== 'pro' || entitlement.entitlement_status === 'trial' || !stripeSubscriptionId || !providerCustomerId) return false

  try {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
    const customerMatches = customerId === providerCustomerId
    const statusAllowed = ['active', 'trialing', 'past_due'].includes(subscription.status)
    const priceMatches = subscription.items.data.some((item) => item.price?.id === billingEnv.STRIPE_PRO_PRICE_ID)
    return customerMatches && statusAllowed && priceMatches
  } catch (caught) {
    const isMissingCustomer = caught?.code === 'resource_missing' || caught?.statusCode === 404
    if (isMissingCustomer) return false
    throw caught
  }
}

async function entitlementFor(userId) {
  const rows = await database.query(
    `SELECT ent.plan_key, ent.plan_name, ent.features, ent.entitlement_status,
            ent.trial_started_at, ent.trial_ends_at,
            ent.subscription_id, ent.subscription_status, ent.current_period_end,
            subscription.provider_customer_id, subscription.provider_subscription_id
     FROM public.virgue_current_entitlements ent
     LEFT JOIN public.virgue_subscriptions subscription
       ON subscription.id = ent.subscription_id
     WHERE ent.user_id = $1`,
    [userId],
  )
  const customer = await database.query('SELECT stripe_customer_id FROM public.virgue_billing_customers WHERE user_id = $1', [userId])
  const hasBillingCustomer = Boolean(customer[0]?.stripe_customer_id)
  if (!rows[0]) return { planKey: 'free', planName: FREE_PLAN_NAME, entitlementStatus: 'free', subscriptionStatus: null, currentPeriodEnd: null, features: {}, hasBillingCustomer }
  const row = rows[0]
  const hasActiveManualTrial = row.trial_ends_at && new Date(row.trial_ends_at).getTime() > Date.now()
  const hasValidPaidSubscription = row.plan_key === 'pro'
    && row.entitlement_status !== 'trial'
    && await hasLiveSubscription(row, row.provider_customer_id)
  if (row.plan_key === 'pro' && row.entitlement_status !== 'trial' && !hasValidPaidSubscription && !hasActiveManualTrial) {
    return { planKey: 'free', planName: FREE_PLAN_NAME, entitlementStatus: 'free', subscriptionStatus: null, currentPeriodEnd: null, features: {}, hasBillingCustomer }
  }
  if (hasActiveManualTrial && !hasValidPaidSubscription) {
    return {
      planKey: 'pro',
      planName: PRO_PLAN_NAME,
      entitlementStatus: 'trial',
      subscriptionStatus: null,
      currentPeriodEnd: null,
      trialStartedAt: row.trial_started_at,
      trialEndsAt: row.trial_ends_at,
      features: row.features || {},
      hasBillingCustomer,
    }
  }
  const planKey = row.plan_key || 'free'
  return {
    planKey,
    planName: planDisplayName(planKey, row.plan_name),
    entitlementStatus: row.entitlement_status,
    subscriptionStatus: row.subscription_status,
    currentPeriodEnd: row.current_period_end,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    features: row.features || {},
    hasBillingCustomer,
  }
}

async function planForPrice(priceId) {
  if (priceId === billingEnv.STRIPE_PRO_PRICE_ID) return 'pro'
  const rows = await database.query('SELECT plan_key FROM public.virgue_plans WHERE stripe_price_id = $1 AND active = true', [priceId])
  return rows[0]?.plan_key || null
}

async function userForCustomer(customerId) {
  const rows = await database.query('SELECT user_id FROM public.virgue_billing_customers WHERE stripe_customer_id = $1', [customerId])
  if (rows[0]?.user_id) return rows[0].user_id

  // A subscription created in the Stripe Dashboard may not inherit the
  // metadata that Checkout adds. Reconcile it by the verified customer email
  // so a mode switch or an operator-created trial cannot strand an entitlement.
  let customer
  try {
    customer = await stripe.customers.retrieve(customerId)
  } catch (caught) {
    const isMissingCustomer = caught?.code === 'resource_missing' || caught?.statusCode === 404
    if (isMissingCustomer) return null
    throw caught
  }
  if (!customer || customer.deleted || typeof customer.email !== 'string' || !customer.email.trim()) return null

  const users = await database.query(
    'SELECT id FROM neon_auth."user" WHERE lower(email) = lower($1) LIMIT 1',
    [customer.email.trim()],
  )
  const userId = users[0]?.id || null
  if (!userId) return null

  await database.query(
    `INSERT INTO public.virgue_billing_customers (user_id, stripe_customer_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id, updated_at = now()` ,
    [userId, customerId],
  )
  return userId
}

function subscriptionIdForInvoice(invoice) {
  const directSubscription = typeof invoice.subscription === 'string' ? invoice.subscription : null
  if (directSubscription) return directSubscription

  const nestedSubscription = invoice.parent?.subscription_details?.subscription
  return typeof nestedSubscription === 'string' && nestedSubscription.trim() ? nestedSubscription : null
}

async function syncSubscription(subscription, userIdHint = null) {
  const subscriptionItem = subscription.items?.data?.[0]
  const priceId = subscriptionItem?.price?.id
  const planKey = priceId ? await planForPrice(priceId) : null
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  const userId = userIdHint || metadataUserId(subscription.metadata) || await userForCustomer(customerId)
  if (!planKey || !userId) throw new Error(`Subscription could not be mapped to a ${BRAND_NAME} plan and account.`)
  const currentPeriodStart = subscription.current_period_start ?? subscriptionItem?.current_period_start ?? null
  const currentPeriodEnd = subscription.current_period_end ?? subscriptionItem?.current_period_end ?? null

  const values = [
    userId, planKey, customerId, subscription.id, subscription.status,
    subscription.trial_start || null, subscription.trial_end || null,
    currentPeriodStart, currentPeriodEnd,
    subscription.cancel_at_period_end, subscription.canceled_at || null,
    JSON.stringify(subscription.metadata || {}),
  ]
  const upsert = `INSERT INTO public.virgue_subscriptions (
       user_id, plan_key, provider, provider_customer_id, provider_subscription_id, status,
       trial_started_at, trial_ends_at, current_period_start, current_period_end,
       cancel_at_period_end, canceled_at, metadata, updated_at
     ) VALUES ($1, $2, 'stripe', $3, $4, $5, to_timestamp($6), to_timestamp($7), to_timestamp($8), to_timestamp($9), $10, to_timestamp($11), $12::jsonb, now())
     ON CONFLICT (provider_subscription_id) DO UPDATE SET
       plan_key = EXCLUDED.plan_key, provider_customer_id = EXCLUDED.provider_customer_id,
       status = EXCLUDED.status,
       trial_started_at = EXCLUDED.trial_started_at, trial_ends_at = EXCLUDED.trial_ends_at,
       current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end, canceled_at = EXCLUDED.canceled_at,
       metadata = EXCLUDED.metadata, updated_at = now()`

  try {
    await database.query(upsert, values)
  } catch (caught) {
    // Older databases created by migration 001 had a unique customer ID.
    // Reuse a historical terminal row until migration 004 removes that
    // obsolete constraint, so a customer can subscribe again after canceling.
    const isLegacyCustomerConstraint = caught?.code === '23505'
      && (caught?.constraint === 'virgue_subscriptions_provider_customer_id_key'
        || String(caught?.message || '').includes('virgue_subscriptions_provider_customer_id_key'))
    if (!isLegacyCustomerConstraint) throw caught

    const existing = await database.query(
      `SELECT id, status
       FROM public.virgue_subscriptions
       WHERE provider_customer_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [customerId],
    )
    if (!existing[0] || !['canceled', 'incomplete_expired', 'unpaid', 'paused'].includes(existing[0].status)) throw caught

    await database.query(
      `UPDATE public.virgue_subscriptions
       SET user_id = $2, plan_key = $3, provider_subscription_id = $4, status = $5,
           trial_started_at = to_timestamp($6), trial_ends_at = to_timestamp($7),
           current_period_start = to_timestamp($8), current_period_end = to_timestamp($9),
           cancel_at_period_end = $10, canceled_at = to_timestamp($11),
           metadata = $12::jsonb, updated_at = now()
       WHERE id = $1`,
      [existing[0].id, ...values.slice(0, 2), ...values.slice(3)],
    )
  }
}

async function processWebhook(event) {
  if (event.type === 'checkout.session.completed') {
    const checkout = event.data.object
    if (checkout.mode !== 'subscription' || !checkout.subscription) return
    const subscription = await stripe.subscriptions.retrieve(String(checkout.subscription))
    await syncSubscription(subscription, metadataUserId(checkout.metadata) || checkout.client_reference_id || null)
    return
  }
  if (event.type.startsWith('customer.subscription.')) {
    const subscription = event.data.object
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
    const userId = metadataUserId(subscription.metadata) || (customerId ? await userForCustomer(customerId) : null)
    if (!userId) return
    await syncSubscription(subscription, userId)
    return
  }
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const invoice = event.data.object
    const subscriptionId = subscriptionIdForInvoice(invoice)
    if (!subscriptionId) return
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
    const userId = metadataUserId(subscription.metadata) || (customerId ? await userForCustomer(customerId) : null)
    if (!userId) return
    await syncSubscription(subscription, userId)
  }
}

async function handleWebhook(request, response) {
  const signature = request.headers['stripe-signature']
  if (typeof signature !== 'string') return error(response, 400, 'Missing Stripe signature.')
  let event
  try {
    event = stripe.webhooks.constructEvent(await readBody(request), signature, billingEnv.STRIPE_WEBHOOK_SECRET)
  } catch {
    return error(response, 400, 'Invalid Stripe signature.')
  }

  const eventRows = await database.query(
    `INSERT INTO public.virgue_billing_events (event_id, event_type, status)
     VALUES ($1, $2, 'received')
     ON CONFLICT (event_id) DO UPDATE SET
       status = CASE WHEN public.virgue_billing_events.status = 'processed' THEN 'processed' ELSE 'received' END,
       error_message = CASE WHEN public.virgue_billing_events.status = 'processed' THEN public.virgue_billing_events.error_message ELSE NULL END
     RETURNING status`,
    [event.id, event.type],
  )
  if (eventRows[0]?.status === 'processed') return send(response, 200, { received: true })

  try {
    await processWebhook(event)
    await database.query("UPDATE public.virgue_billing_events SET status = 'processed', processed_at = now(), error_message = NULL WHERE event_id = $1", [event.id])
    send(response, 200, { received: true })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message.slice(0, 1000) : 'Webhook processing failed.'
    await database.query("UPDATE public.virgue_billing_events SET status = 'failed', error_message = $2 WHERE event_id = $1", [event.id, message])
    throw caught
  }
}

async function handleApi(request, response, origin) {
  if (request.method === 'OPTIONS') return send(response, 204, {}, origin)
  if (origin && !allowedOrigins.has(origin)) return error(response, 403, 'This website origin is not allowed to use billing.', origin)
  const url = requestUrl(request)
  if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ok: true }, origin)

  if (url.pathname.startsWith('/admin/')) {
    const admin = await requireAdmin(request)
    if (request.method === 'GET' && url.pathname === '/admin/me') return send(response, 200, { admin: true, email: admin.email }, origin)
    if (request.method === 'GET' && url.pathname === '/admin/customers') {
      return send(response, 200, { customers: await adminCustomers(url.searchParams.get('q') || '') }, origin)
    }
    if (request.method === 'POST' && url.pathname === '/admin/trials') {
      const trial = await grantTrial(admin, parseJson(await readBody(request)))
      return send(response, 201, { trial }, origin)
    }
    return error(response, 404, 'Admin endpoint not found.', origin)
  }

  const user = await requireUser(request)
  if (request.method === 'GET' && url.pathname === '/billing/me') return send(response, 200, await entitlementFor(user.id), origin)

  if (request.method === 'POST' && url.pathname === '/billing/checkout') {
    const body = parseJson(await readBody(request))
    if (body.planKey !== 'pro') return error(response, 400, `That plan is not available for ${PRO_PLAN_NAME} checkout.`, origin)
    const customer = await customerFor(user)
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription', customer,
      line_items: [{ price: billingEnv.STRIPE_PRO_PRICE_ID, quantity: 1 }],
      // The Price contains fixed USD, GBP, and EUR currency options. Stripe
      // selects the matching option from the customer's location at Checkout.
      // Managed Payments requires a product tax code. Keep standard Stripe
      // Checkout enabled until the product's tax treatment is configured.
      managed_payments: { enabled: false },
      custom_text: {
        submit: { message: `Subscribe to ${PRO_PLAN_NAME}` },
        after_submit: { message: `${PRO_PLAN_NAME} is being activated. You will return to your account shortly.` },
      },
      success_url: `${publicSiteUrl}/account.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicSiteUrl}/pricing.html?checkout=canceled`,
      allow_promotion_codes: true,
      client_reference_id: user.id,
      metadata: { valdor_user_id: user.id, valdor_plan_key: 'pro' },
      subscription_data: { metadata: { valdor_user_id: user.id, valdor_plan_key: 'pro' } },
    })
    if (!checkout.url) throw new Error('Stripe did not return a checkout URL.')
    return send(response, 200, { url: checkout.url }, origin)
  }

  if (request.method === 'POST' && url.pathname === '/billing/portal') {
    const customer = await customerFor(user)
    const portal = await stripe.billingPortal.sessions.create({ customer, return_url: `${publicSiteUrl}/account.html` })
    return send(response, 200, { url: portal.url }, origin)
  }
  return error(response, 404, 'Billing endpoint not found.', origin)
}

export async function handleBillingRequest(request, response) {
  const origin = request.headers.origin
  try {
    if (requestUrl(request).pathname === '/webhooks/stripe') {
      if (request.method !== 'POST') return error(response, 405, 'Method not allowed.')
      return await handleWebhook(request, response)
    }
    return await handleApi(request, response, origin)
  } catch (caught) {
    console.error('Billing API request failed', caught)
    if (caught instanceof BillingRequestError) return error(response, caught.status, caught.message, origin)
    return error(response, 500, 'Billing is temporarily unavailable.', origin)
  }
}

const server = createServer((request, response) => { void handleBillingRequest(request, response) })
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) server.listen(port, () => console.log(`${BRAND_NAME} billing API listening on :${port}`))
