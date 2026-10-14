import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions } from 'claude-code'

import { text } from './i18n'
import type { Language } from './i18n'

// The session's values, declared in ../types: they survive a reload of the module.
const reported = atom({ plugin: 'pyxis', key: 'reported' } as const, [])
const toasted = atom({ plugin: 'pyxis', key: 'toasted' } as const, [])

export type Role = 'inbox' | 'hubs' | 'archive' | 'daily' | 'templates' | 'sessions' | 'logs'

export const ROLES: readonly Role[] = ['inbox', 'hubs', 'archive', 'daily', 'templates', 'sessions', 'logs']

/** The vault's folders by role, relative to the vault; null turns off what depends on one. */
export type Conventions = {
  folders: Record<Role, string | null>
  passations: { folder: string | null; outsideRepo: string; resumed: string }
  verifyTag: string | null
}

export const DEFAULT_CONVENTIONS: Conventions = {
  folders: {
    inbox: 'Inbox',
    hubs: 'Projects',
    archive: 'Archive',
    daily: 'Daily',
    templates: 'Templates',
    sessions: 'AI/sessions',
    logs: 'AI/logs',
  },
  passations: { folder: 'AI/passations', outsideRepo: 'no-repo', resumed: 'resumed' },
  verifyTag: '#todo/verify',
}

/** Relative to the vault. */
export const CONVENTIONS_FILE = '.claude/pyxis.json'

const LOG_FILE = 'pyxis-errors.log'

// Same default as `userConfig.threshold` in plugin.json.
export const DEFAULT_THRESHOLD = 300_000

// Below this, a value was most likely typed in thousands (`300` for 300k), as in context-gauge.
const MIN_THRESHOLD = 1_000

export type Settings = { vault: string; language: Language; threshold: number }

/** The plugin's options, validated: a bad threshold falls back to the default, an unknown language to English. */
export function settings(options: PluginOptions): Settings {
  const { threshold, vault } = options
  const isValid = typeof threshold === 'number' && Number.isFinite(threshold) && threshold >= MIN_THRESHOLD

  return {
    vault: typeof vault === 'string' ? vault : '',
    language: options.language === 'fr' ? 'fr' : 'en',
    threshold: isValid ? threshold : DEFAULT_THRESHOLD,
  }
}

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
// A folder is a path inside the vault: relative, without `..`.
const isFolder = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== '' && !/^[/~]/.test(v) && !v.split('/').includes('..')
// A single folder name: `hors-depot`, `reprises`.
const isName = (v: unknown): v is string => typeof v === 'string' && /^[^/]+$/.test(v) && v !== '.' && v !== '..'
const isTag = (v: unknown): v is string => typeof v === 'string' && /^\S+$/.test(v)
const trimSlash = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path)

/**
 * The conventions file read over the defaults, key by key: a key that is absent, of the wrong
 * type or unknown keeps its default; `problems` names the keys that were not taken.
 */
export function parseConventions(raw: string | null): { conventions: Conventions; problems: string[] } {
  const problems: string[] = []
  if (raw === null) {
    return { conventions: DEFAULT_CONVENTIONS, problems }
  }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { conventions: DEFAULT_CONVENTIONS, problems: ['JSON'] }
  }
  if (!isObject(data)) {
    return { conventions: DEFAULT_CONVENTIONS, problems: ['JSON'] }
  }
  const json: Json = data

  // The value under `key` if it passes `isValid`, else the default and a problem.
  const take = <T>(source: Json, key: string, path: string, isValid: (v: unknown) => boolean, fallback: T): T => {
    if (!(key in source)) {
      return fallback
    }
    if (isValid(source[key])) {
      return source[key] as T
    }
    problems.push(path)

    return fallback
  }
  const section = (key: string, known: readonly string[]): Json => {
    const value = json[key]
    if (value === undefined) {
      return {}
    }
    if (!isObject(value)) {
      problems.push(key)
      return {}
    }
    problems.push(...Object.keys(value).filter(k => !known.includes(k)).map(k => `${key}.${k}`))

    return value
  }

  problems.push(...Object.keys(json).filter(k => !['folders', 'passations', 'verifyTag'].includes(k)))
  const folders = section('folders', ROLES)
  const passations = section('passations', ['folder', 'outsideRepo', 'resumed'])
  const folderOrNull = (v: unknown) => v === null || isFolder(v)
  const clean = (v: string | null) => (v === null ? null : trimSlash(v))
  const defaults = DEFAULT_CONVENTIONS

  return {
    conventions: {
      folders: Object.fromEntries(
        ROLES.map(role => [role, clean(take(folders, role, `folders.${role}`, folderOrNull, defaults.folders[role]))]),
      ) as Record<Role, string | null>,
      passations: {
        folder: clean(take(passations, 'folder', 'passations.folder', folderOrNull, defaults.passations.folder)),
        outsideRepo: take(passations, 'outsideRepo', 'passations.outsideRepo', isName, defaults.passations.outsideRepo),
        resumed: take(passations, 'resumed', 'passations.resumed', isName, defaults.passations.resumed),
      },
      verifyTag: take(json, 'verifyTag', 'verifyTag', v => v === null || isTag(v), defaults.verifyTag),
    },
    problems,
  }
}

/** Everything a hook needs: the options, the conventions and whether the vault is there. */
export type Kit = Settings &
  Conventions & {
    home: string
    isVaultFound: boolean
    /** What to tell the user once, in the interface language. */
    problems: string[]
  }

export const isWithin = (path: string, parent: string) => path === parent || path.startsWith(`${parent}/`)

export const expandHome = (path: string, home: string) => path.replace(/^~(?=\/|$)/, home)

/** A role's folder, absolute; null when the conventions turn it off. */
export function folder(kit: Kit, role: Role | 'passations'): string | null {
  const relative = role === 'passations' ? kit.passations.folder : kit.folders[role]

  return relative === null ? null : `${kit.vault}/${relative}`
}

/** Folders read, never written by pyxis: absent from disk, the model is not told of them. */
const READ_ONLY: readonly Role[] = ['inbox', 'hubs', 'archive', 'daily', 'templates']

/** The kit with the read-only folders absent from disk turned off; sessions and logs are made on first write. */
export async function onDisk($: EngineInterface, kit: Kit): Promise<Kit> {
  const folders = { ...kit.folders }
  for (const role of READ_ONLY) {
    const path = folder(kit, role)
    if (path !== null && (await $.fs.stat(path).catch(() => null))?.kind !== 'dir') {
      folders[role] = null
    }
  }

  return { ...kit, folders }
}

/** Reads the options, the vault and its conventions file. Never rejects. */
export async function loadKit($: EngineInterface, s: Settings): Promise<Kit> {
  const home = (await $.env.get('HOME').catch(() => undefined)) ?? ''
  const vault = trimSlash(expandHome(s.vault, home))
  const stat = vault ? await $.fs.stat(vault).catch(() => null) : null
  const t = text(s.language)

  if (stat?.kind !== 'dir') {
    return { ...s, ...DEFAULT_CONVENTIONS, vault, home, isVaultFound: false, problems: [t.vaultMissing(vault)] }
  }
  const raw = await $.fs.read(`${vault}/${CONVENTIONS_FILE}`).catch(() => null)
  const { conventions, problems } = parseConventions(raw)

  return {
    ...s,
    ...conventions,
    vault,
    home,
    isVaultFound: true,
    problems: problems.map(key => t.conventionsProblem(CONVENTIONS_FILE, key)),
  }
}

/** Adds a line to `<logs>/pyxis-errors.log`; does nothing without a logs folder. Never rejects. */
export async function logLine($: EngineInterface, kit: Kit, where: string, message: string) {
  const logs = kit.isVaultFound ? folder(kit, 'logs') : null
  if (logs === null) {
    return
  }
  const path = `${logs}/${LOG_FILE}`
  const before = await $.fs.read(path).catch(() => '')
  const at = new Date(await $.clock.now()).toISOString().slice(0, 19)
  await $.fs.write(path, `${before}${at}\t${where}\t${message.replace(/\s+/g, ' ')}\n`).catch(() => undefined)
}

/** Logs each message once per session; when asked, shows the ones not yet seen in one toast. */
export async function report($: EngineInterface, kit: Kit, where: string, messages: string[], isToasted: boolean) {
  const unique = [...new Set(messages)]
  const logged = await read($, reported)
  const fresh = unique.filter(m => !logged.includes(m))
  if (fresh.length > 0) {
    await update($, reported, before => [...before, ...fresh])
    for (const message of fresh) {
      await logLine($, kit, where, message)
    }
  }
  if (!isToasted) {
    return
  }
  const shown = await read($, toasted)
  const unseen = unique.filter(m => !shown.includes(m))
  // The desktop app attaches after session.start: until a surface does, a toast has nowhere to show.
  if (unseen.length === 0 || (await $.session.surfaces()).length === 0) {
    return
  }
  await update($, toasted, before => [...before, ...unseen])
  $.ui.toast(unseen.join('\n'))
}
