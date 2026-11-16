// The facts block that goes with a `/pyxis:<skill>` message: the vault, the date, the folders
// the conventions resolve, the skill's template and the lists it works from. The skills read
// this text, so it is fixed: change a line here and the SKILL.md files that name it with it.
import type { EngineInterface } from 'claude-code'

import { ROLES, folder, onDisk } from './conventions'
import type { Kit, Role } from './conventions'
import { repoRoot } from './git'
import { daysBetween, text } from './i18n'
import { errorLogs } from './logs'
import { currentMemory } from './memory'
import { openPassations, passationsDir } from './passations'

export const SKILLS = ['wrapup', 'passation'] as const

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
  /** null: the vault has no templates folder. */
  template: { path: string; isPresent: boolean } | null
  /** The roles the skill needs and the vault lacks; `path` is where it is expected, null when turned off. */
  missing: { role: string; path: string | null }[]
  /** Each line without its `- `. */
  lists: { title: string; lines: string[] }[]
}

type Needed = Role | 'passations'

/** The folders a skill cannot work without. */
const REQUIRED: Record<Skill, Needed[]> = {
  wrapup: ['sessions'],
  passation: ['passations'],
}

/** The template a skill follows, a file of the templates folder. */
const TEMPLATE: Record<Skill, string> = {
  wrapup: 'session.md',
  passation: 'passation.md',
}

type ListTitle = 'Error logs' | 'Write it in' | 'Open passations there'

const LISTS: Record<Skill, ListTitle[]> = {
  wrapup: ['Error logs'],
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

/** The skill a submission runs: the engine's command name (`pyxis:<skill>`) first, the message's text as a fallback. */
export function skillOfSubmission(e: { text: string; command?: { name: string; args?: string } }): Skill | null {
  const name = /^pyxis:(.+)$/.exec(e.command?.name ?? '')?.[1]

  return SKILLS.find(skill => skill === name) ?? skillOf(e.text)
}

function listText(list: { title: string; lines: string[] }): string[] {
  const shown = list.lines.slice(0, MAX_LINES).map(line => `- ${line}`)
  if (list.lines.length > MAX_LINES) {
    shown.push(`- … and ${list.lines.length - MAX_LINES} more`)
  }

  return [`${list.title}:`, ...(shown.length > 0 ? shown : ['- none'])]
}

const CONFIG = '`.claude/pyxis.json`'

function missingLine({ role, path }: SkillFacts['missing'][number]): string {
  return path === null
    ? `Missing: the ${role} folder is turned off in ${CONFIG}: say so in one line and stop.`
    : `Missing: the ${role} folder (\`${path}\`) is absent: create it or change it in ${CONFIG}; say so in one line and stop.`
}

function templateLine(f: SkillFacts): string {
  if (f.template === null) {
    return "Template: none: use the skill's default format."
  }

  return f.template.isPresent
    ? `Template: \`${f.template.path}\`, follow it.`
    : `Template: none (\`${f.template.path}\` absent): use the skill's default format.`
}

/** The block, as the skills read it. */
export function factsBlock(f: SkillFacts): string {
  const folders = f.folders.map(x => `${x.role} \`${x.path}\``).join(', ') || 'none'

  return [
    `pyxis, for \`/pyxis:${f.skill}\`: vault \`${f.vault}\`, today ${f.weekday} ${f.today}, session id \`${f.sessionId}\`.`,
    `Folders, relative to the vault: ${folders}.`,
    templateLine(f),
    ...f.missing.map(missingLine),
    ...f.lists.flatMap(listText),
  ].join('\n')
}

/** What the lists are built from. */
type Context = {
  kit: Kit
  /** The kit with the folders absent from disk turned off. */
  disk: Kit
  now: number
  repo: string | undefined
}

async function errorLines($: EngineInterface, c: Context): Promise<string[]> {
  const root = c.disk.folders.logs
  if (root === null) {
    return []
  }
  return (await errorLogs($, c.kit, root)).map(l => `\`${l.file}\` (${l.count} lines): ${l.message}`)
}

async function openLines($: EngineInterface, c: Context): Promise<string[]> {
  const root = folder(c.kit, 'passations')
  const open = await openPassations($, c.kit, c.repo === undefined, c.repo ? [c.repo] : [])
  const age = text('en').age

  return open.map(p => `\`${root}/${p.folder}/${p.file}\` (${age(daysBetween(p.mtimeMs, c.now))}): ${p.description}`)
}

async function listLines($: EngineInterface, c: Context, title: ListTitle): Promise<string[]> {
  switch (title) {
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

/** The roles the skill needs that the vault turns off or lacks, with the path the conventions expect. */
function missingRoles(skill: Skill, kit: Kit, disk: Kit): SkillFacts['missing'] {
  const isOff = (role: Needed) => (role === 'passations' ? disk.passations.folder === null : disk.folders[role] === null)
  const expected = (role: Needed) => (role === 'passations' ? kit.passations.folder : kit.folders[role])

  return REQUIRED[skill].filter(isOff).map(role => ({ role, path: expected(role) }))
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
  if (disk.folders.templates !== null) {
    const path = `${disk.folders.templates}/${TEMPLATE[skill]}`
    template = { path, isPresent: (await $.fs.stat(`${kit.vault}/${path}`).catch(() => null))?.kind === 'file' }
  }

  const missing = missingRoles(skill, kit, disk)
  const lists: SkillFacts['lists'] = []
  if (missing.length === 0) {
    const context: Context = { kit, disk, now: await $.clock.now(), repo: await repoRoot($, cwd) }
    for (const title of LISTS[skill]) {
      lists.push({ title, lines: await listLines($, context, title) })
    }
  }

  return { skill, vault: kit.vault, today, weekday, sessionId: memory.id, folders, template, missing, lists }
}
