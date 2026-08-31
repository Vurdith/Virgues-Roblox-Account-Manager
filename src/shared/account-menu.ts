import type { HTMLAttributes } from 'react'

export type AccountMenuEventName = 'account-menu-toggle' | 'account-menu-settings' | 'account-menu-signout'

const ACCOUNT_MENU_STYLES = `
:host {
  --account-menu-ink: var(--ink, #171717);
  --account-menu-muted: var(--ink-muted, var(--muted, #625f57));
  --account-menu-line: var(--line, #bcb8ad);
  --account-menu-panel: var(--panel-strong, var(--panel, #fffdf8));
  --account-menu-surface: var(--panel, #f7f5ef);
  --account-menu-accent: var(--accent, var(--coral, #fa6d60));
  --account-menu-yellow: var(--yellow, #efc870);
  --account-menu-shadow: var(--shadow-small, 3px 3px 0 var(--account-menu-ink));
  --account-menu-shadow-heavy: var(--shadow, 5px 5px 0 var(--account-menu-ink));
  display: inline-block;
  position: relative;
  z-index: 5;
  color: var(--account-menu-ink);
  font-family: inherit;
  -webkit-app-region: no-drag;
}

* { box-sizing: border-box; }
button, a { font: inherit; -webkit-tap-highlight-color: transparent; }
button { color: inherit; }
[hidden] { display: none !important; }

.account-menu { position: relative; }
.account-menu-trigger {
  display: inline-flex;
  min-width: 184px;
  min-height: 46px;
  align-items: center;
  gap: 9px;
  padding: 4px 10px 4px 5px;
  border: 3px solid var(--account-menu-ink);
  background: var(--account-menu-panel);
  box-shadow: var(--account-menu-shadow);
  color: var(--account-menu-ink);
  cursor: pointer;
  text-align: left;
  transition: transform 240ms cubic-bezier(.22, 1.15, .36, 1), box-shadow 240ms cubic-bezier(.2, .8, .2, 1), background 240ms cubic-bezier(.2, .8, .2, 1);
}
.account-menu-trigger:hover { background: var(--account-menu-yellow); transform: translate(-1px, -1px); box-shadow: var(--account-menu-shadow-heavy); }
.account-menu-trigger:active { transform: translateY(1px); }
.account-menu-trigger.open { background: var(--account-menu-accent); }
.account-menu-trigger:focus-visible,
.account-menu-item:focus-visible,
.account-menu-signout:focus-visible { outline: 3px solid var(--account-menu-accent); outline-offset: 2px; }
.account-menu-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  flex: none;
  place-items: center;
  border: 2px solid var(--account-menu-ink);
  background: var(--account-menu-yellow);
  color: var(--account-menu-ink);
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -.04em;
}
.account-menu-copy { display: grid; min-width: 0; flex: 1; gap: 2px; }
.account-menu-label { color: var(--account-menu-muted); font-size: 9px; font-weight: 800; letter-spacing: .1em; line-height: 1; text-transform: uppercase; }
.account-menu-copy strong { overflow: hidden; font-size: 12px; line-height: 1.1; text-overflow: ellipsis; white-space: nowrap; }
.account-menu-trigger.open .account-menu-label { color: #57312c; }
.account-menu-chevron { flex: none; transition: transform 240ms cubic-bezier(.22, 1.15, .36, 1); }
.account-menu-chevron.open { transform: rotate(180deg); }

.account-menu-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 30;
  display: grid;
  width: 302px;
  gap: 12px;
  padding: 14px;
  border: 3px solid var(--account-menu-ink);
  background: var(--account-menu-panel);
  box-shadow: var(--account-menu-shadow-heavy);
  animation: account-menu-pop-in 220ms cubic-bezier(.22, 1.15, .36, 1) both;
}
.account-menu-summary { display: grid; gap: 8px; padding: 2px 2px 13px; border-bottom: 2px solid var(--account-menu-line); }
.account-menu-summary-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.account-menu-eyebrow { color: var(--account-menu-muted); font-size: 9px; font-weight: 800; letter-spacing: .1em; line-height: 1; text-transform: uppercase; }
.account-menu-summary > strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.account-menu-plan { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 10px; border: 2px solid var(--account-menu-ink); background: var(--account-menu-yellow); }
.account-menu-plan span { color: var(--account-menu-muted); font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.account-menu-plan strong { font-size: 12px; }
.account-menu-signed-out-summary { display: grid; gap: 8px; padding: 2px 2px 13px; border-bottom: 2px solid var(--account-menu-line); }
.account-menu-signed-out-summary strong { font-size: 14px; letter-spacing: -.035em; line-height: 1.15; }
.account-menu-signed-out-summary p { margin: 0; color: var(--account-menu-muted); font-size: 11px; line-height: 1.35; }
.account-menu-actions { display: grid; gap: 8px; }
.account-menu-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 44px;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 9px;
  border: 2px solid var(--account-menu-line);
  background: var(--account-menu-surface);
  color: var(--account-menu-ink);
  cursor: pointer;
  text-align: left;
  text-decoration: none;
  transition: background 240ms cubic-bezier(.2, .8, .2, 1), border-color 240ms cubic-bezier(.2, .8, .2, 1), transform 140ms cubic-bezier(.34, 1.56, .64, 1);
}
.account-menu-item:hover { border-color: var(--account-menu-ink); background: var(--account-menu-yellow); transform: translateY(-1px); }
.account-menu-item-icon { display: grid; width: 25px; height: 25px; place-items: center; border: 2px solid var(--account-menu-ink); background: var(--account-menu-panel); }
.account-menu-item > strong { min-width: 0; font-size: 11px; }
.account-menu-item svg, .account-menu-signout svg { display: block; flex: none; }
.account-menu-signout { display: inline-flex; width: 100%; min-height: 36px; align-items: center; justify-content: center; gap: 8px; padding: 0 10px; border: 3px solid var(--account-menu-ink); background: var(--account-menu-panel); box-shadow: var(--account-menu-shadow); color: var(--account-menu-ink); cursor: pointer; font-size: 12px; font-weight: 700; transition: transform 240ms cubic-bezier(.22, 1.15, .36, 1), box-shadow 240ms cubic-bezier(.2, .8, .2, 1), background 240ms cubic-bezier(.2, .8, .2, 1); }
.account-menu-signout:hover { background: var(--account-menu-accent); transform: translate(-1px, -1px); box-shadow: var(--account-menu-shadow-heavy); }
.account-menu-signout:active { transform: translateY(1px); }
.account-menu-signout:disabled { cursor: wait; opacity: .55; transform: none; }

@keyframes account-menu-pop-in { from { opacity: 0; transform: translateY(7px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }

@media (max-width: 760px) {
  .account-menu-trigger { width: 42px; min-width: 42px; justify-content: center; padding: 2px; }
  .account-menu-copy, .account-menu-chevron { display: none; }
  .account-menu-popover { width: min(302px, calc(100vw - 30px)); }
}
`

let accountMenuInstanceCount = 0

function iconMarkup(name: 'arrow' | 'chevron' | 'close' | 'settings', size: number): string {
  const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"`
  if (name === 'arrow') return `<svg ${common}><path d="M5 12h13"/><path d="m13 6 6 6-6 6"/></svg>`
  if (name === 'chevron') return `<svg ${common}><path d="m7 10 5 5 5-5"/></svg>`
  if (name === 'close') return `<svg ${common}><path d="m6 6 12 12M18 6 6 18"/></svg>`
  return `<svg ${common}><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/></svg>`
}

export class VirgueAccountMenuElement extends HTMLElement {
  static observedAttributes = ['name', 'email', 'plan', 'signed-in', 'busy', 'open']

  private accountName = ''
  private accountEmail = ''
  private accountPlan = 'Free plan'
  private signedIn = false
  private busy = false
  private isOpen = false

  connectedCallback(): void {
    this.accountName = this.getAttribute('name') ?? this.accountName
    this.accountEmail = this.getAttribute('email') ?? this.accountEmail
    this.accountPlan = this.getAttribute('plan') ?? this.accountPlan
    this.signedIn = this.hasAttribute('signed-in')
    this.busy = this.hasAttribute('busy')
    this.isOpen = this.hasAttribute('open')
    const shadowRoot = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    shadowRoot.addEventListener('click', this.handleClick)
    shadowRoot.addEventListener('keydown', this.handleKeyDown)
    document.addEventListener('pointerdown', this.handleDocumentPointerDown)
    this.render()
  }

  disconnectedCallback(): void {
    this.shadowRoot?.removeEventListener('click', this.handleClick)
    this.shadowRoot?.removeEventListener('keydown', this.handleKeyDown)
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown)
  }

  attributeChangedCallback(attribute: string, _oldValue: string | null, newValue: string | null): void {
    if (!this.isConnected) return
    if (attribute === 'name') this.accountName = newValue ?? ''
    if (attribute === 'email') this.accountEmail = newValue ?? ''
    if (attribute === 'plan') this.accountPlan = newValue || 'Free plan'
    if (attribute === 'signed-in') this.signedIn = newValue !== null
    if (attribute === 'busy') this.busy = newValue !== null
    if (attribute === 'open') this.isOpen = newValue !== null
    this.render()
  }

  get name(): string { return this.accountName }
  set name(value: string) { this.accountName = value; this.render() }

  get email(): string { return this.accountEmail }
  set email(value: string) { this.accountEmail = value; this.render() }

  get plan(): string { return this.accountPlan }
  set plan(value: string) { this.accountPlan = value || 'Free plan'; this.render() }

  get signedInState(): boolean { return this.signedIn }
  set signedInState(value: boolean) { this.signedIn = value; this.render() }

  get open(): boolean { return this.isOpen }
  set open(value: boolean) { this.isOpen = value; this.render() }

  get busyState(): boolean { return this.busy }
  set busyState(value: boolean) { this.busy = value; this.render() }

  private handleClick = (event: Event): void => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-account-action]') : null
    const action = target?.dataset.accountAction
    if (!action) return

    if (action === 'toggle') {
      this.isOpen = !this.isOpen
      this.render()
      this.emit('account-menu-toggle')
      return
    }
    if (action === 'settings') {
      this.isOpen = false
      this.render()
      this.emit('account-menu-settings')
      return
    }
    if (action === 'signout' && !this.busy) {
      this.busy = true
      this.isOpen = false
      this.render()
      this.emit('account-menu-signout')
    }
  }

  private handleKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) return
    const target = event.target instanceof HTMLElement ? event.target : null
    if (!target) return
    if (event.key === 'Escape' && this.isOpen) {
      event.preventDefault()
      this.isOpen = false
      this.render()
      this.shadowRoot?.querySelector<HTMLButtonElement>('[data-account-action="toggle"]')?.focus()
      return
    }
    if (target.dataset.accountAction === 'toggle' && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      this.isOpen = true
      this.render()
      this.focusFirstItem()
      this.emit('account-menu-toggle')
      return
    }
    if (!this.isOpen || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
    const menuItems = this.visibleMenuItems()
    const currentIndex = menuItems.indexOf(target)
    if (currentIndex < 0 || menuItems.length === 0) return
    event.preventDefault()
    const nextIndex = event.key === 'ArrowDown'
      ? (currentIndex + 1) % menuItems.length
      : (currentIndex - 1 + menuItems.length) % menuItems.length
    menuItems[nextIndex]?.focus()
  }

  private handleDocumentPointerDown = (event: PointerEvent): void => {
    if (this.isOpen && !event.composedPath().includes(this)) {
      this.isOpen = false
      this.render()
    }
  }

  private visibleMenuItems(): HTMLElement[] {
    return Array.from(this.shadowRoot?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []).filter((item) => !item.hidden)
  }

  private focusFirstItem(): void {
    this.visibleMenuItems()[0]?.focus()
  }

  private emit(name: AccountMenuEventName): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: { open: this.isOpen } }))
  }

  private render(): void {
    const shadowRoot = this.shadowRoot
    if (!shadowRoot) return
    if (!shadowRoot.querySelector('[data-account-menu-root]')) {
      const panelId = `virgue-account-menu-panel-${++accountMenuInstanceCount}`
      shadowRoot.innerHTML = `<style>${ACCOUNT_MENU_STYLES}</style><div class="account-menu" data-account-menu-root><button type="button" class="account-menu-trigger" data-account-action="toggle" aria-haspopup="menu" aria-expanded="false" aria-controls="${panelId}"><span class="account-menu-avatar" aria-hidden="true"></span><span class="account-menu-copy"><span class="account-menu-label"></span><strong data-account-name></strong></span><span class="account-menu-chevron" aria-hidden="true">${iconMarkup('chevron', 16)}</span></button><div class="account-menu-popover" id="${panelId}" role="menu" hidden><div class="account-menu-summary" data-signed-in-summary><div class="account-menu-summary-top"><span class="account-menu-eyebrow">Account</span></div><strong data-account-email></strong><div class="account-menu-plan"><span>Plan</span><strong data-account-plan></strong></div></div><div class="account-menu-signed-out-summary" data-signed-out-summary hidden><span class="account-menu-eyebrow">Welcome back</span><strong>Sign in to your workspace</strong><p>Manage your plan and download the app.</p></div><div class="account-menu-actions" data-signed-in-actions><button type="button" class="account-menu-item" data-account-action="settings" role="menuitem"><span class="account-menu-item-icon">${iconMarkup('settings', 15)}</span><strong>Settings</strong>${iconMarkup('arrow', 14)}</button><button type="button" class="account-menu-signout" data-account-action="signout" role="menuitem"><span>${iconMarkup('close', 15)}</span><span data-signout-label>Sign out</span></button></div><div class="account-menu-actions" data-signed-out-actions hidden><a class="account-menu-item" data-account-action="signin" role="menuitem" href="./account.html"><strong>Sign in</strong>${iconMarkup('arrow', 14)}</a><a class="account-menu-item" data-account-action="signup" role="menuitem" href="./account.html?mode=signup"><strong>Create account</strong>${iconMarkup('arrow', 14)}</a></div></div></div>`
    }

    const displayName = this.accountName.trim() || this.accountEmail.trim().split('@')[0] || 'Account'
    const initial = (this.accountName.trim() || this.accountEmail.trim() || 'V').slice(0, 1).toUpperCase()
    const trigger = shadowRoot.querySelector<HTMLButtonElement>('[data-account-action="toggle"]')
    const avatar = shadowRoot.querySelector<HTMLElement>('.account-menu-avatar')
    const label = shadowRoot.querySelector<HTMLElement>('.account-menu-label')
    const accountName = shadowRoot.querySelector<HTMLElement>('[data-account-name]')
    const panel = shadowRoot.querySelector<HTMLElement>('.account-menu-popover')
    const chevron = shadowRoot.querySelector<HTMLElement>('.account-menu-chevron')
    const signedInSummary = shadowRoot.querySelector<HTMLElement>('[data-signed-in-summary]')
    const signedOutSummary = shadowRoot.querySelector<HTMLElement>('[data-signed-out-summary]')
    const signedInActions = shadowRoot.querySelector<HTMLElement>('[data-signed-in-actions]')
    const signedOutActions = shadowRoot.querySelector<HTMLElement>('[data-signed-out-actions]')
    const email = shadowRoot.querySelector<HTMLElement>('[data-account-email]')
    const plan = shadowRoot.querySelector<HTMLElement>('[data-account-plan]')
    const signOutButton = shadowRoot.querySelector<HTMLButtonElement>('[data-account-action="signout"]')
    const signOutLabel = shadowRoot.querySelector<HTMLElement>('[data-signout-label]')
    if (!trigger || !avatar || !label || !accountName || !panel || !chevron || !signedInSummary || !signedOutSummary || !signedInActions || !signedOutActions || !email || !plan || !signOutButton || !signOutLabel) return

    avatar.textContent = initial
    label.textContent = this.signedIn ? 'Account' : 'Sign in'
    accountName.textContent = displayName
    accountName.hidden = !this.signedIn
    trigger.classList.toggle('open', this.isOpen)
    trigger.setAttribute('aria-expanded', String(this.isOpen))
    trigger.setAttribute('aria-label', this.signedIn ? `Open the account menu for ${displayName}` : 'Open the sign-in menu')
    panel.hidden = !this.isOpen
    chevron.classList.toggle('open', this.isOpen)
    signedInSummary.hidden = !this.signedIn
    signedOutSummary.hidden = this.signedIn
    signedInActions.hidden = !this.signedIn
    signedOutActions.hidden = this.signedIn
    email.textContent = this.accountEmail
    plan.textContent = this.accountPlan
    signOutButton.disabled = this.busy
    signOutLabel.textContent = this.busy ? 'Signing out...' : 'Sign out'
  }
}

export function registerAccountMenuElement(): void {
  if (!customElements.get('virgue-account-menu')) customElements.define('virgue-account-menu', VirgueAccountMenuElement)
}

declare global {
  interface HTMLElementTagNameMap {
    'virgue-account-menu': VirgueAccountMenuElement
  }

  namespace JSX {
    interface IntrinsicElements {
      'virgue-account-menu': HTMLAttributes<VirgueAccountMenuElement>
    }
  }
}
