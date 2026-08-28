import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { safeStorage, type App } from 'electron'

interface SecretFile {
  [accountId: string]: string
}

export class SecretStore {
  private readonly filePath: string
  private secrets: SecretFile = {}

  constructor(private readonly electronApp: App) {
    this.filePath = join(electronApp.getPath('userData'), 'credentials.bin')
  }

  async initialize(): Promise<void> {
    await mkdir(this.electronApp.getPath('userData'), { recursive: true })
    try {
      const contents = await readFile(this.filePath, 'utf8')
      const parsed: unknown = JSON.parse(contents)
      if (typeof parsed === 'object' && parsed !== null) this.secrets = parsed as SecretFile
    } catch {
      this.secrets = {}
    }
  }

  has(accountId: string): boolean {
    return typeof this.secrets[accountId] === 'string' && this.secrets[accountId]!.length > 0
  }

  get(accountId: string): string | null {
    const encoded = this.secrets[accountId]
    if (!encoded) return null
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure credential storage is unavailable.')
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
  }

  async set(accountId: string, value: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure credential storage is unavailable.')
    if (!value) throw new Error('Credential value cannot be empty.')
    // Passwords are valid opaque values; do not trim them before encryption.
    // Cookie inputs are normalized by the caller before they reach this store.
    this.secrets[accountId] = safeStorage.encryptString(value).toString('base64')
    await this.persist()
  }

  async copy(sourceAccountId: string, targetAccountId: string): Promise<void> {
    const value = this.get(sourceAccountId)
    if (value) await this.set(targetAccountId, value)
  }

  async remove(accountId: string): Promise<void> {
    delete this.secrets[accountId]
    await this.persist()
  }

  private async persist(): Promise<void> {
    await writeFile(this.filePath, `${JSON.stringify(this.secrets, null, 2)}\n`, 'utf8')
  }
}
