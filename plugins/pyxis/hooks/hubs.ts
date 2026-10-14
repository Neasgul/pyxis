// Project hubs: `<hubs>/<Folder>/<folder in lowercase>.md`, with optional `repos:` and
// `triggers:`. Ported from hub-inject.py (spec 2026-09-28-hub-inject-design).
import type { EngineInterface } from 'claude-code'

import { expandHome, folder, isWithin } from './conventions'
import type { Kit } from './conventions'
import { bareField, isUnclosed, listField } from './frontmatter'

export type Hub = {
  /** The folder's name in lowercase: `parcels`. */
  name: string
  /** Absolute. */
  path: string
  text: string
  /** Absolute, `~` expanded. */
  repos: string[]
  triggers: string[]
}

/** Characters injected with one message, at most. */
export const HUB_BUDGET = 9000

// A task notification or a system reminder starts with a tag: not the user's words.
const TAG = /^<[a-z][a-z0-9_-]*[ >]/

export const isNotification = (message: string) => TAG.test(message.trimStart())

/** A hub, or null when archived; `problems` names what was ignored in it. */
export function parseHub(name: string, path: string, text: string, home: string): { hub: Hub | null; problems: string[] } {
  const problems: string[] = []
  if (isUnclosed(text)) {
    // Served on its name alone, as hub-inject did.
    problems.push(`${path}: frontmatter not closed`)
  }
  if (bareField(text, 'status') === 'archived') {
    return { hub: null, problems }
  }
  const repos: string[] = []
  for (const repo of listField(text, 'repos')) {
    const expanded = expandHome(repo, home)
    if (expanded.startsWith('/')) {
      repos.push(expanded.length > 1 ? expanded.replace(/\/+$/, '') : expanded)
    } else {
      problems.push(`${path}: repo ignored, not an absolute path: '${repo}'`)
    }
  }

  return { hub: { name, path, text, repos, triggers: listField(text, 'triggers') }, problems }
}

/** Lowercase, accents removed, split on anything that is neither a letter nor a digit. */
export const words = (text: string): string[] =>
  text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').match(/[a-z0-9]+/g) ?? []

/** Where `pattern` first starts in `sequence`, or -1. */
function firstIndex(sequence: string[], pattern: string[]): number {
  for (let i = 0; pattern.length > 0 && i + pattern.length <= sequence.length; i++) {
    if (pattern.every((w, j) => sequence[i + j] === w)) {
      return i
    }
  }

  return -1
}

/** Hubs whose name or a trigger is in the message: most triggers found first, then the first cited. */
export function citedHubs(hubs: Hub[], message: string): Hub[] {
  if (isNotification(message)) {
    return []
  }
  const sequence = words(message)
  const cited: { found: number; first: number; hub: Hub }[] = []
  for (const hub of hubs) {
    const patterns = new Map([hub.name, ...hub.triggers].map(t => [words(t).join(' '), words(t)]))
    const found = [...patterns.values()].map(p => firstIndex(sequence, p)).filter(i => i !== -1)
    if (found.length > 0) {
      cited.push({ found: found.length, first: Math.min(...found), hub })
    }
  }

  return cited
    .sort((a, b) => b.found - a.found || a.first - b.first || (a.hub.name < b.hub.name ? -1 : 1))
    .map(c => c.hub)
}

/** Hubs one of whose repositories holds one of the session's roots. */
export const hubsForRoots = (hubs: Hub[], roots: string[]) =>
  hubs.filter(h => h.repos.some(repo => roots.some(root => isWithin(root, repo))))

const header = (hub: Hub) => `Hub \`${hub.name}\` (\`${hub.path}\`), injected by pyxis: source of truth, it counts as read.`
const pointer = (hub: Hub) =>
  `Also relevant, not injected (context budget): \`${hub.path}\`. Read it if the question concerns ${hub.name}.`
const truncated = (hub: Hub) => `[Truncated to fit the context budget. Full hub: \`${hub.path}\`.]`

/**
 * The text to inject, at most HUB_BUDGET characters, and the hubs it serves. A hub that fits goes
 * in whole and is served; otherwise it becomes a pointer, not served. The first hub, if it is
 * over the budget on its own, is cut and served.
 */
export function composeHubs(hubs: Hub[]): { text: string; served: string[] } {
  const blocks: string[] = []
  const served: string[] = []
  const fits = (block: string) => [...blocks, block].join('\n\n').length <= HUB_BUDGET

  for (const hub of hubs) {
    const block = `${header(hub)}\n\n${hub.text.trimEnd()}`
    if (fits(block)) {
      blocks.push(block)
      served.push(hub.name)
    } else if (blocks.length === 0) {
      const tail = `\n${truncated(hub)}`
      blocks.push(block.slice(0, HUB_BUDGET - tail.length) + tail)
      served.push(hub.name)
    } else if (fits(pointer(hub))) {
      blocks.push(pointer(hub))
    }
  }

  return { text: blocks.join('\n\n'), served }
}

/** Every hub of the vault, by folder name, archived ones left out. */
export async function loadHubs($: EngineInterface, kit: Kit): Promise<{ hubs: Hub[]; problems: string[] }> {
  const root = folder(kit, 'hubs')
  if (root === null) {
    return { hubs: [], problems: [] }
  }
  const entries = (await $.fs.list(root).catch(() => []))
    .filter(e => e.kind === 'dir')
    .sort((a, b) => (a.name < b.name ? -1 : 1))
  const hubs: Hub[] = []
  const problems: string[] = []
  for (const entry of entries) {
    const name = entry.name.toLowerCase()
    const path = `${root}/${entry.name}/${name}.md`
    const text = await $.fs.read(path).catch(() => null)
    if (text === null) {
      continue
    }
    const parsed = parseHub(name, path, text, kit.home)
    problems.push(...parsed.problems)
    if (parsed.hub) {
      hubs.push(parsed.hub)
    }
  }

  return { hubs, problems }
}

/** The root of the main checkout of the git repository holding `cwd`: a worktree counts for its repository. */
export async function repoRoot($: EngineInterface, cwd: string): Promise<string | undefined> {
  const r = await $.process
    .run(['git', '-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'])
    .catch(() => null)
  const common = r?.exitCode === 0 ? r.stdout.trim() : ''

  return common ? common.replace(/\/[^/]+\/?$/, '') : undefined
}
