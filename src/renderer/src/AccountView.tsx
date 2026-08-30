import { useState, type FormEvent } from 'react'
import type { AuthCredentialsInput, AuthSignUpInput } from '@shared/types'
import { Icon } from './components/Icons'

interface AccountViewProps {
  busy: boolean
  error: string
  onSignIn: (input: AuthCredentialsInput) => Promise<void>
  onSignUp: (input: AuthSignUpInput) => Promise<void>
}

type AuthMode = 'sign-in' | 'sign-up'

export default function AccountView({ busy, error, onSignIn, onSignUp }: AccountViewProps) {
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

  return <section className="account-view" aria-labelledby="account-gate-title">
    <div className="account-auth-layout">
      <div className="account-auth-intro">
        <h1 id="account-gate-title">Your Roblox workspace starts here.</h1>
        <p>Sign in or create an account to continue.</p>
      </div>

      <form className="account-auth-card" onSubmit={(event) => void submit(event)}>
        <div className="account-auth-heading"><span className="eyebrow">{mode === 'sign-in' ? 'Welcome back' : 'Create your access'}</span><h2>{mode === 'sign-in' ? 'Sign in' : 'Create account'}</h2></div>
        {(error || localError) && <div className="account-auth-error" role="alert">{localError || error}</div>}
        {mode === 'sign-up' && <label className="field-label">Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" required /></label>}
        <label className="field-label">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
        <label className="field-label">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={8} required /></label>
        {mode === 'sign-up' && <label className="field-label">Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" autoComplete="new-password" minLength={8} required /></label>}
        <button type="submit" className="primary-button account-submit" disabled={busy}>{busy ? 'Connecting...' : mode === 'sign-in' ? 'Open workspace' : 'Create account'} <Icon name="arrow" size={16} /></button>
        <button type="button" className="text-button account-mode-button" disabled={busy} onClick={() => { setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in'); setLocalError('') }}>{mode === 'sign-in' ? 'Need an account? Create one' : 'Already have an account? Sign in'}</button>
      </form>
    </div>
  </section>
}
