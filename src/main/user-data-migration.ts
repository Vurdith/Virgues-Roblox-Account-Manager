import { access, cp, mkdir, readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join, resolve } from 'node:path'
import type { App } from 'electron'

const LEGACY_USER_DATA_DIRECTORY_NAMES = [
  "Virgue's Roblox Account Manager",
  'Virgues Roblox Account Manager',
  'virgues-roblox-account-manager',
] as const

const PRESERVED_FILE_NAMES = [
  'accounts.json',
  'credentials.bin',
  'session-history.json',
] as const
const LEGACY_GLOBAL_SETTINGS_BACKUP_NAME = 'virgue-global-settings-backup.xml'
const CURRENT_GLOBAL_SETTINGS_BACKUP_NAME = 'valdor-global-settings-backup.xml'

const PRESERVED_DIRECTORY_NAMES = ['Partitions', 'Local Storage'] as const

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function copyIfMissing(source: string, target: string): Promise<void> {
  if (!(await exists(source)) || (await exists(target))) return
  try {
    await cp(source, target, { recursive: true, force: false, errorOnExist: true })
  } catch (error) {
    // Migration is best effort: a locked Chromium file must not prevent the
    // account workspace from opening. The next launch can retry the entry.
    if (!(await exists(target))) console.warn('Valdor could not migrate one legacy workspace entry.', error)
  }
}

async function copyDirectoryContents(source: string, target: string): Promise<void> {
  if (!(await exists(source))) return
  await mkdir(target, { recursive: true })
  let entries: Dirent<string>[]
  try {
    entries = await readdir(source, { encoding: 'utf8', withFileTypes: true })
  } catch (error) {
    console.warn('Valdor could not inspect one legacy workspace directory.', error)
    return
  }
  for (const entry of entries) {
    await copyIfMissing(join(source, entry.name), join(target, entry.name))
  }
}

async function copyLegacyPartitions(source: string, target: string): Promise<void> {
  const sourcePartitions = join(source, 'Partitions')
  const targetPartitions = join(target, 'Partitions')
  if (!(await exists(sourcePartitions))) return
  await mkdir(targetPartitions, { recursive: true })
  let entries: Dirent<string>[]
  try {
    entries = await readdir(sourcePartitions, { encoding: 'utf8', withFileTypes: true })
  } catch (error) {
    console.warn('Valdor could not inspect legacy Roblox account partitions.', error)
    return
  }
  for (const entry of entries) {
    const sourcePath = join(sourcePartitions, entry.name)
    await copyIfMissing(sourcePath, join(targetPartitions, entry.name))
    if (entry.isDirectory() && entry.name.startsWith('virgue-account-')) {
      await copyIfMissing(sourcePath, join(targetPartitions, 'valdor-account-' + entry.name.slice('virgue-account-'.length)))
    }
  }
}

export async function migrateLegacyUserData(electronApp: App): Promise<void> {
  const target = resolve(electronApp.getPath('userData'))
  const appData = electronApp.getPath('appData')
  for (const directoryName of LEGACY_USER_DATA_DIRECTORY_NAMES) {
    const source = resolve(join(appData, directoryName))
    if (source === target || !(await exists(source))) continue

    await mkdir(target, { recursive: true })
    for (const fileName of PRESERVED_FILE_NAMES) {
      await copyIfMissing(join(source, fileName), join(target, fileName))
    }
    await copyIfMissing(
      join(source, LEGACY_GLOBAL_SETTINGS_BACKUP_NAME),
      join(target, CURRENT_GLOBAL_SETTINGS_BACKUP_NAME),
    )
    for (const directoryName of PRESERVED_DIRECTORY_NAMES) {
      await copyDirectoryContents(join(source, directoryName), join(target, directoryName))
    }
    await copyLegacyPartitions(source, target)
    console.info('Valdor migrated legacy workspace data into the current user-data directory.')
    return
  }
}
