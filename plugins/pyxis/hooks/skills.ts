// The facts block that goes with a `/pyxis:<skill>` message: the vault, the date, the folders
// the conventions resolve, the skill's template and the lists it works from. The skills read
// this text, so it is fixed: change a line here and the SKILL.md files that name it with it.
import type { EngineInterface } from 'claude-code'

import { ROLES, folder, onDisk } from './conventions'
import type { Kit, Role } from './conventions'
import { collect, errorLogs } from './dashboard'
import { listField } from './frontmatter'
import { hubsForRoots, loadHubs, repoRoot } from './hubs'
import type { Hub } from './hubs'
import { daysBetween, text } from './i18n'
import { currentMemory } from './memory'
import { openPassations, passationsDir } from './passations'

export const SKILLS = ['capture', 'inbox', 'daily', 'morning', 'todos', 'wrapup', 'decision', 'hub', 'passation'] as const

export type Skill = (typeof SKILLS)[number]

export type SkillFacts = {
  skill: Skill
  vault: string
  /** `2026-10-13`. */
  today: string
  /** `Tuesday`. */
  weekday: string
  sessionId: string
  /** Set and on disk, relative to the vault. */
  folders: { role: string; path: string }[]
  /** null: the skill has a template but the vault has no templates folder. */
  template: { path: string; isPresent: boolean } | null
  /** The roles the skill needs and the vault lacks. */
  missing: string[]
  /** Each line without its `- `. */
  lists: { title: string; lines: string[] }[]
}

type Needed = Role | 'passations'

/** The folders a skill cannot work without; `todos` is handled apart. */
const REQUIRED: Record<Skill, Needed[]> = {
  capture: ['inbox'],
  inbox: ['inbox'],
  daily: ['daily'],
  morning: ['daily'],
  todos: [],
  wrapup: ['sessions'],
  decision: ['hubs'],
  hub: ['hubs'],
  passation: ['passations'],
}

/** The model a skill follows, a file of the templates folder. */
const TEMPLATE: Partial<Record<Skill, string>> = {
  daily: 'daily.md',
  morning: 'daily.md',
  wrapup: 'session.md',
  decision: 'decision.md',
  hub: 'hub.md',
  passation: 'passation.md',
}

type ListTitle =
  | 'Hubs'
  | "This session's hubs"
  | "This session's repository"
  | 'Inbox, oldest first'
  | "Today's daily note"
  | 'Previous daily note'
  | 'Session notes of today'
  | 'Newest session note'
  | 'Open todos'
  | 'Repositories of the hubs'
  | 'Error logs'
  | 'Write it in'
  | 'Open passations there'

const DAILY: ListTitle[] = ["Today's daily note", 'Previous daily note', 'Session notes of today']

const LISTS: Record<Skill, ListTitle[]> = {
  capture: ['Hubs'],
  inbox: ['Inbox, oldest first', 'Hubs'],
  daily: DAILY,
  morning: [...DAILY, 'Newest session note', 'Open todos', 'Repositories of the hubs', 'Inbox, oldest first'],
  todos: ['Open todos'],
  wrapup: ['Hubs', "This session's hubs", 'Error logs'],
  decision: ['Hubs', "This session's hubs"],
  hub: ['Hubs', "This session's repository"],
  passation: ['Write it in', 'Open passations there'],
}

/** A list shows this many lines, then how many more. */
const MAX_LINES = 30

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const COMMAND = new RegExp(`^/pyxis:(${SKILLS.join('|')})(?=\\s|$)`)

/** The skill a message runs: `/pyxis:<skill>` at its start, and nothing that only looks like one. */
export function skillOf(message: string): Skill | null {
  const name = COMMAND.exec(message.trimStart())?.[1]

  return SKILLS.find(skill => skill === name) ?? null
}

function listText(list: { title: string; lines: string[] }): string[] {
  const shown = list.lines.slice(0, MAX_LINES).map(line => `- ${line}`)
  if (list.lines.length > MAX_LINES) {
    shown.push(`- … and ${list.lines.length - MAX_LINES} more`)
  }

  return [`${list.title}:`, ...(shown.length > 0 ? shown : ['- none'])]
}

function templateLine(f: SkillFacts): string[] {
  if (TEMPLATE[f.skill] === undefined) {
    return []
  }
  if (f.template === null) {
    return ["Template: none: use the skill's default format."]
  }

  return [
    f.template.isPresent
      ? `Template: \`${f.template.path}\`, follow it.`
      : `Template: none (\`${f.template.path}\` absent): use the skill's default format.`,
  ]
}

/** The block, as the skills read it. */
export function factsBlock(f: SkillFacts): string {
  const folders = f.folders.map(x => `${x.role} \`${x.path}\``).join(', ') || 'none'

  return [
    `pyxis, for \`/pyxis:${f.skill}\`: vault \`${f.vault}\`, today ${f.weekday} ${f.today}, session id \`${f.sessionId}\`.`,
    `Folders, relative to the vault: ${folders}.`,
    ...templateLine(f),
    ...f.missing.map(role => `Missing: the ${role} folder is turned off or absent: say so in one line and stop.`),
    ...f.lists.flatMap(listText),
  ].join('\n')
}

/** What the lists are built from. */
type Context = {
  kit: Kit
  /** The kit with the folders absent from disk turned off. */
  disk: Kit
  today: string
  now: number
  hubs: Hub[]
  /** The names of the hubs this session works with. */
  active: string[]
  repo: string | undefined
}

const relative = (kit: Kit, path: string) => path.slice(kit.vault.length + 1)

function hubLine(c: Context, hub: Hub): string {
  const tags = listField(hub.text, 'tags')

  return `\`${relative(c.kit, hub.path)}\`${tags.length > 0 ? ` (tags: ${tags.join(', ')})` : ''}`
}

/** The role's folder, relative to the vault, and the files in it; empty when it is off. */
async function files($: EngineInterface, c: Context, role: Role): Promise<{ root: string; names: string[] }> {
  const root = c.disk.folders[role]
  if (root === null) {
    return { root: '', names: [] }
  }
  const entries = await $.fs.list(`${c.kit.vault}/${root}`).catch(() => [])

  return { root, names: entries.filter(e => e.kind === 'file').map(e => e.name).sort() }
}

async function inboxLines($: EngineInterface, c: Context): Promise<string[]> {
  const root = c.disk.folders.inbox
  if (root === null) {
    return []
  }
  const entries = await $.fs.list(`${c.kit.vault}/${root}`).catch(() => [])

  return entries
    .filter(e => e.kind === 'file' && e.name.endsWith('.md'))
    .sort((a, b) => a.mtimeMs - b.mtimeMs)
    .map(e => `\`${root}/${e.name}\` (${daysBetween(e.mtimeMs, c.now)} days)`)
}

async function todoLines($: EngineInterface, c: Context): Promise<string[]> {
  const { todos = [] } = await collect($, c.kit)

  return todos.map(t => {
    const suffix = t.isLate ? ` (overdue, 📅 ${t.due})` : t.due ? ` (📅 ${t.due})` : ''

    return `${t.text} — \`${t.file}\`:${t.line}${suffix}`
  })
}

async function repositoryLines($: EngineInterface, c: Context): Promise<string[]> {
  const lines: string[] = []
  for (const hub of c.hubs) {
    for (const repo of hub.repos) {
      const branch = await $.process.run(['git', '-C', repo, 'branch', '--show-current']).catch(() => null)
      const status = await $.process.run(['git', '-C', repo, 'status', '--porcelain']).catch(() => null)
      if (!branch || !status || branch.exitCode !== 0 || status.exitCode !== 0) {
        continue
      }
      const changes = status.stdout.split('\n').filter(l => l !== '').length
      lines.push(`${hub.name}: \`${repo}\` on ${branch.stdout.trim() || '(detached)'}, ${changes} uncommitted`)
    }
  }

  return lines
}

async function errorLines($: EngineInterface, c: Context): Promise<string[]> {
  const root = c.disk.folders.logs
  if (root === null) {
    return []
  }
  const rows = await errorLogs($, c.kit, root)

  // The row's detail is `<lines> · <last message>`.
  return rows.map(row => {
    const [, count = '?', message = ''] = /^(\d+) · (.*)$/s.exec(row.detail) ?? []

    return `\`${row.file}\` (${count} lines): ${message}`
  })
}

async function openLines($: EngineInterface, c: Context): Promise<string[]> {
  const root = folder(c.kit, 'passations')
  const open = await openPassations($, c.kit, c.repo === undefined, c.repo ? [c.repo] : [])
  const age = text('en').age

  return open.map(p => `\`${root}/${p.folder}/${p.file}\` (${age(daysBetween(p.mtimeMs, c.now))}): ${p.description}`)
}

async function listLines($: EngineInterface, c: Context, title: ListTitle): Promise<string[]> {
  switch (title) {
    case 'Hubs':
      return c.hubs.map(hub => hubLine(c, hub))
    case "This session's hubs":
      return c.hubs.filter(hub => c.active.includes(hub.name)).map(hub => hubLine(c, hub))
    case "This session's repository":
      return c.repo === undefined ? [] : [`\`${c.repo}\``]
    case 'Inbox, oldest first':
      return inboxLines($, c)
    case "Today's daily note": {
      const { root, names } = await files($, c, 'daily')

      return [`\`${root}/${c.today}.md\` (${names.includes(`${c.today}.md`) ? 'exists' : 'absent'})`]
    }
    case 'Previous daily note': {
      const { root, names } = await files($, c, 'daily')
      const previous = names.filter(n => /^\d{4}-\d{2}-\d{2}\.md$/.test(n) && n < `${c.today}.md`).at(-1)

      return previous === undefined ? [] : [`\`${root}/${previous}\``]
    }
    case 'Session notes of today': {
      const { root, names } = await files($, c, 'sessions')

      return names.filter(n => n.startsWith(c.today)).map(n => `\`${root}/${n}\``)
    }
    case 'Newest session note': {
      const { root, names } = await files($, c, 'sessions')
      const newest = names.filter(n => /^\d{4}-\d{2}-\d{2}/.test(n)).at(-1)

      return newest === undefined ? [] : [`\`${root}/${newest}\``]
    }
    case 'Open todos':
      return todoLines($, c)
    case 'Repositories of the hubs':
      return repositoryLines($, c)
    case 'Error logs':
      return errorLines($, c)
    case 'Write it in': {
      const dir = passationsDir(c.kit, c.repo)

      return dir === null ? [] : [`\`${dir}\``]
    }
    case 'Open passations there':
      return openLines($, c)
  }
}

/** The roles the skill needs that the vault turns off or lacks. */
function missingRoles(skill: Skill, disk: Kit): string[] {
  const isOff = (role: Needed) => (role === 'passations' ? disk.passations.folder === null : disk.folders[role] === null)
  if (skill === 'todos') {
    return isOff('daily') && isOff('hubs') ? ['daily', 'hubs'] : []
  }

  return REQUIRED[skill].filter(isOff)
}

/** The facts for `skill`, read now from the vault: the date, the folders, the template and the lists. */
export async function skillFacts($: EngineInterface, kit: Kit, skill: Skill, cwd: string): Promise<SkillFacts> {
  const disk = await onDisk($, kit)
  const date = (await $.process.run(['date', '+%Y-%m-%d %u'])).stdout.trim()
  const [today = '', day = ''] = date.split(' ')
  const weekday = WEEKDAYS[Number(day) - 1]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || weekday === undefined) {
    throw new Error(`unreadable date: '${date}'`)
  }
  const memory = await currentMemory($)

  const folders: SkillFacts['folders'] = []
  for (const role of ROLES) {
    const path = disk.folders[role]
    if (path !== null) {
      folders.push({ role, path })
    }
  }
  if (disk.passations.folder !== null) {
    folders.push({ role: 'passations', path: disk.passations.folder })
  }

  let template: SkillFacts['template'] = null
  const name = TEMPLATE[skill]
  if (name !== undefined && disk.folders.templates !== null) {
    const path = `${disk.folders.templates}/${name}`
    template = { path, isPresent: (await $.fs.stat(`${kit.vault}/${path}`).catch(() => null))?.kind === 'file' }
  }

  const missing = missingRoles(skill, disk)
  const lists: SkillFacts['lists'] = []
  if (missing.length === 0) {
    const repo = await repoRoot($, cwd)
    const { hubs } = await loadHubs($, kit)
    const active = [...memory.active, ...hubsForRoots(hubs, repo ? [cwd, repo] : [cwd]).map(h => h.name)]
    const context: Context = { kit, disk, today, now: await $.clock.now(), hubs, active, repo }
    for (const title of LISTS[skill]) {
      lists.push({ title, lines: await listLines($, context, title) })
    }
  }

  return { skill, vault: kit.vault, today, weekday, sessionId: memory.id, folders, template, missing, lists }
}
