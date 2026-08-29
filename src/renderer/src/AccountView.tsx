import { useState, type FormEvent } from 'react'
import type { AuthCredentialsInput, AuthSignUpInput, VirgueAuthSession } from '@shared/types'
import { Icon } from './components/Icons'

interface AccountViewProps {
  session: VirgueAuthSession | null
  busy: boolean
  error: string
  onSignIn: (input: AuthCredentialsInput) => Promise<void>
  onSignUp: (input: AuthSignUpInput) => Promise<void>
  onSignOut: () => Promise<void>
}

type AuthMode = 'sign-in' | 'sign-up'

function formatExpiry(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'your active session' : `session expires ${date.toLocaleDateString()}`
}

export default function AccountView({ session, busy, error, onSignIn, onSignUp, onSignOut }: AccountViewProps) {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLocalError('')
    if (mode === 'sign-up' && password !== confirmPassword) {
      setLocalError('The passwords do not match.')
      return
    }

    if (mode === 'sign-up') await onSignUp({ name, email, password })
    else await onSignIn({ email, password })
  }

  if (session) {
    return <section className="account-view">
      <div className="account-hero">
        <div className="account-hero-copy">
          <span className="eyebrow">Virgue account</span>
          <h2>Your workspace identity is connected.</h2>
          <p>Subscriptions and future cloud features will follow this Virgue account. Your Roblox profiles and credentials remain in the local Windows workspace.</p>
        </div>
        <div className="account-avatar"><span>{session.user.name.slice(0, 1).toUpperCase()}</span></div>
      </div>

      <div className="account-panel-grid">
        <article className="account-panel account-profile-panel">
          <span className="eyebrow">Signed in as</span>
          <h3>{session.user.name}</h3>
          <p>{session.user.email}</p>
          <span className="account-session-status"><span className="status-dot ready" /> {formatExpiry(session.expiresAt)}</span>
          <button type="button" className="outline-button" disabled={busy} onClick={() => void onSignOut()}><Icon name="close" size={15} /> Sign out</button>
        </article>
        <article className="account-panel account-safety-panel">
          <span className="eyebrow">Security boundary</span>
          <h3>Two separate account types</h3>
          <p>Your Virgue login is only for the app, trials, and subscriptions. Roblox cookies and passwords continue to use the app’s Windows-encrypted local storage.</p>
          <span className="account-safety-line"><Icon name="shield" size={15} /> No Roblox password is sent to Neon Auth.</span>
        </article>
      </div>
    </section>
  }

  return <section className="account-view">
    <div className="account-auth-layout">
      <div className="account-auth-intro">
        <span className="eyebrow">Virgue account</span>
        <h2>{mode === 'sign-in' ? 'Sign in to your Virgue workspace.' : 'Create your Virgue account.'}</h2>
        <p>Use one account for your subscription and future cloud features. The local Roblox workspace stays available while you are signed out.</p>
        <div className="account-trust-list"><span><Icon name="shield" size={15} /> Roblox credentials stay local</span><span><Icon name="check" size={15} /> Trial length is controlled by Virgue</span><span><Icon name="key" size={15} /> Passwords are handled by Neon Auth</span></div>
      </div>

      <form className="account-auth-card" onSubmit={(event) => void submit(event)}>
        <div className="account-auth-heading"><span className="eyebrow">{mode === 'sign-in' ? 'Welcome back' : 'Get started'}</span><h3>{mode === 'sign-in' ? 'Sign in' : 'Create account'}</h3></div>
        {(error || localError) && <div className="account-auth-error" role="alert">{localError || error}</div>}
        {mode === 'sign-up' && <label className="field-label">Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" required /></label>}
        <label className="field-label">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
        <label className="field-label">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={8} required /></label>
        {mode === 'sign-up' && <label className="field-label">Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" autoComplete="new-password" minLength={8} required /></label>}
        <button type="submit" className="primary-button account-submit" disabled={busy}>{busy ? 'Connecting...' : mode === 'sign-in' ? 'Sign in' : 'Create account'} <Icon name="arrow" size={16} /></button>
        <button type="button" className="text-button account-mode-button" disabled={busy} onClick={() => { setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in'); setLocalError('') }}>{mode === 'sign-in' ? 'Need an account? Create one' : 'Already have an account? Sign in'}</button>
      </form>
    </div>
  </section>
}
