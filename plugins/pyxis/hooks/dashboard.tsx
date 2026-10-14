// The vault dashboard, a pane: todos, latest daily note, inbox, notes to verify, active
// handoffs, error logs. Replaces tableau-vault. Each section needs its folder.
import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { Dashboard, DashboardRow, DashboardTodo } from '../types'
import { folder, loadKit } from './conventions'
import type { Kit, Role, Settings } from './conventions'
import { bareField, field } from './frontmatter'
import { daysBetween, text } from './i18n'

// The session's values, declared in ../types: they survive a reload of the module.
const dashboard = atom({ plugin: 'pyxis', key: 'dashboard' } as const, null)

export const PANE = 'pyxis-vault'
const TITLE = 'Vault'
const MAX_TODOS = 15
const DUE = /\s*📅\s*(\d{4}-\d{2}-\d{2})/u
const DAY = 86_400_000

/** The lines of `grep -rn`: `Daily/2026-09-29.md:9:- [ ] …`. */
export function grepLines(output: string): { file: string; line: number; text: string }[] {
  return output
    .split('\n')
    .map(l => /^([^:]+):(\d+):(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => ({ file: m[1] ?? '', line: Number(m[2]), text: m[3] ?? '' }))
}

export function todo(file: string, line: number, raw: string, today: string): DashboardTodo {
  const due = DUE.exec(raw)?.[1] ?? null
  const rest = raw.replace(/^\s*- \[ \]\s*/, '').replace(DUE, '').trim()

  return { file, line, text: rest, due, isLate: due !== null && due < today }
}

/** Overdue first, then by due date, then those without one, in file order. */
export function sortTodos(todos: DashboardTodo[]): DashboardTodo[] {
  const rank = (t: DashboardTodo) => (t.isLate ? 0 : t.due ? 1 : 2)

  return [...todos].sort((a, b) => rank(a) - rank(b) || (a.due ?? '').localeCompare(b.due ?? ''))
}

export function countByFile(lines: { file: string }[]): { file: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const { file } of lines) {
    counts.set(file, (counts.get(file) ?? 0) + 1)
  }

  return [...counts].map(([file, count]) => ({ file, count })).sort((a, b) => b.count - a.count)
}

/** Days between two `YYYY-MM-DD` dates. */
export const daysBetweenDates = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY)

export const shorten = (value: string, width: number) =>
  value.length <= width ? value : `${value.slice(0, Math.max(1, width - 1))}…`

const isNote = (name: string) => name.endsWith('.md')
const shortName = (file: string) => file.replace(/^.*\//, '').replace(/\.md$/, '')

/** The role's folder, relative to the vault, when it is set and on disk. */
async function present($: EngineInterface, kit: Kit, role: Role | 'passations'): Promise<string | null> {
  const path = folder(kit, role)
  const stat = path === null ? null : await $.fs.stat(path).catch(() => null)

  return stat?.kind === 'dir' && path !== null ? path.slice(kit.vault.length + 1) : null
}

async function grep($: EngineInterface, kit: Kit, pattern: string, folders: (string | null)[]) {
  const existing = folders.filter((f): f is string => f !== null)
  if (existing.length === 0) {
    return []
  }
  // Exit code 1: no line. 2: a folder is missing, the others are read anyway.
  const r = await $.process.run(['grep', '-rnF', '--include=*.md', '-e', pattern, ...existing], { cwd: kit.vault })

  return grepLines(r.stdout)
}

async function list($: EngineInterface, kit: Kit, relative: string) {
  return $.fs.list(`${kit.vault}/${relative}`).catch(() => [])
}

async function activePassations($: EngineInterface, kit: Kit, root: string) {
  const found: NonNullable<Dashboard['passations']> = []
  for (const repo of (await list($, kit, root)).filter(d => d.kind === 'dir')) {
    for (const note of await list($, kit, `${root}/${repo.name}`)) {
      if (note.kind !== 'file' || !isNote(note.name)) {
        continue
      }
      const file = `${root}/${repo.name}/${note.name}`
      const content = await $.fs.read(`${kit.vault}/${file}`).catch(() => '')
      if (bareField(content, 'status') === 'active') {
        found.push({ file, title: `${repo.name}/${shortName(note.name)}`, description: field(content, 'description'), mtimeMs: note.mtimeMs })
      }
    }
  }

  return found.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/** Error logs only (`*-errors.log`): the logs folder holds other output too. */
async function errorLogs($: EngineInterface, kit: Kit, root: string): Promise<DashboardRow[]> {
  const rows: DashboardRow[] = []
  for (const f of await list($, kit, root)) {
    if (f.kind !== 'file' || f.size === 0 || !f.name.endsWith('-errors.log')) {
      continue
    }
    const lines = (await $.fs.read(`${kit.vault}/${root}/${f.name}`).catch(() => '')).split('\n').filter(l => l.trim())
    // `date<TAB>where<TAB>message`: the last field is the message.
    const message = (lines.at(-1) ?? '').split('\t').at(-1) ?? ''
    rows.push({ file: `${root}/${f.name}`, detail: `${lines.length} · ${message}` })
  }

  return rows
}

export async function collect($: EngineInterface, kit: Kit): Promise<Dashboard> {
  const date = await $.process.run(['date', '+%Y-%m-%d %H:%M'])
  const [today = '', time = ''] = date.stdout.trim().split(' ')
  const now = await $.clock.now()
  const t = text(kit.language)
  const [daily, hubs, inbox, logs, passationsRoot] = [
    await present($, kit, 'daily'),
    await present($, kit, 'hubs'),
    await present($, kit, 'inbox'),
    await present($, kit, 'logs'),
    await present($, kit, 'passations'),
  ]
  const result: Dashboard = { today, time }

  if (daily !== null || hubs !== null) {
    const lines = await grep($, kit, '- [ ]', [daily, hubs])
    result.todos = sortTodos(lines.map(l => todo(l.file, l.line, l.text, today)))
  }
  if (daily !== null) {
    const latest = (await list($, kit, daily))
      .map(f => f.name)
      .filter(n => /^\d{4}-\d{2}-\d{2}\.md$/.test(n))
      .sort()
      .at(-1)
    result.latestDaily = latest ? { file: `${daily}/${latest}`, days: daysBetweenDates(latest.slice(0, 10), today) } : null
  }
  if (inbox !== null) {
    result.inbox = (await list($, kit, inbox))
      .filter(f => f.kind === 'file' && isNote(f.name))
      .sort((a, b) => a.mtimeMs - b.mtimeMs)
      .map(f => ({ file: `${inbox}/${f.name}`, detail: t.age(daysBetween(f.mtimeMs, now)) }))
  }
  if (kit.verifyTag !== null && (hubs !== null || inbox !== null)) {
    result.toVerify = { tag: kit.verifyTag, notes: countByFile(await grep($, kit, kit.verifyTag, [hubs, inbox])) }
  }
  if (passationsRoot !== null) {
    result.passations = await activePassations($, kit, passationsRoot)
  }
  if (logs !== null) {
    result.errors = await errorLogs($, kit, logs)
  }

  return result
}

export async function refresh($: EngineInterface, kit: Kit) {
  const collected = await collect($, kit)
  await update($, dashboard, () => collected)
}

/** Opens the pane, its content read first; resolves whether a surface places it. */
export async function openDashboard($: EngineInterface, kit: Kit): Promise<boolean> {
  await refresh($, kit)
  const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE })

  return isPlaced
}

export async function isDashboardOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(p => p.id === PANE)
}

async function openNote($: EngineInterface, s: Settings, file: string) {
  const kit = await loadKit($, s)
  const system = await $.process.run(['uname', '-s']).catch(() => null)
  const opener = system?.stdout.trim() === 'Darwin' ? 'open' : 'xdg-open'
  const r = await $.process
    .run([opener, `obsidian://open?path=${encodeURIComponent(`${kit.vault}/${file}`)}`])
    .catch(() => null)
  if (r?.exitCode !== 0) {
    $.ui.toast(text(s.language).openFailed(file))
  }
}

export async function renderDashboard($: EngineInterface, e: RenderInput<'Pane'>, s: Settings): Promise<RenderElement> {
  const { Box, Button, Text } = $.ui.resolve(e)
  const d = await read($, dashboard)
  const t = text(s.language)

  if (d === null) {
    return <Text dimColor>{t.reading}</Text>
  }

  const width = Math.max(30, e.props.bodyColumns)
  const title = (value: string) => <Text bold>{value}</Text>
  const empty = (value: string, color?: Color) =>
    color ? <Text color={color}>{`  ${value}`}</Text> : <Text dimColor>{`  ${value}`}</Text>
  // A Button takes one text: the marker carries the color, the detail follows apart.
  const row = (key: string, file: string, label: string, detail: string, color?: Color) => {
    const after = shorten(detail, Math.floor(width / 2))
    const short = shorten(label, width - after.length - 4)

    return (
      <Box key={`row:${key}`} gap={1}>
        {color ? <Text color={color}>●</Text> : <Text dimColor>·</Text>}
        <Button key={key} label={short} plain onPress={() => openNote($, s, file)} />
        <Text dimColor wrap="truncate-end">
          {after}
        </Text>
      </Box>
    )
  }
  const late = (d.todos ?? []).filter(x => x.isLate).length
  const now = await $.clock.now()

  return (
    <Box flexDirection="column" gap={1}>
      <Box justifyContent="space-between">
        <Text dimColor>{t.readAt(d.today, d.time)}</Text>
        <Button key="refresh" label={t.refresh} onPress={async () => refresh($, await loadKit($, s))} />
      </Box>

      {d.todos && (
        <Box key="section:todos" flexDirection="column">
          {title(t.todos(d.todos.length, late))}
          {d.todos.length === 0 && empty(t.none)}
          {d.todos.slice(0, MAX_TODOS).map(x =>
            row(`todo:${x.file}:${x.line}`, x.file, `${x.due ? `${x.due} ` : ''}${x.text}`, shortName(x.file), x.isLate ? 'error' : undefined),
          )}
          {d.todos.length > MAX_TODOS && empty(t.more(d.todos.length - MAX_TODOS))}
        </Box>
      )}

      {d.latestDaily !== undefined && (
        <Box key="section:daily" flexDirection="column">
          {title(t.daily)}
          {d.latestDaily
            ? row('daily', d.latestDaily.file, t.latest(shortName(d.latestDaily.file)), t.age(d.latestDaily.days), d.latestDaily.days > 3 ? 'warning' : undefined)
            : empty(t.none)}
        </Box>
      )}

      {d.inbox && (
        <Box key="section:inbox" flexDirection="column">
          {title(t.inbox(d.inbox.length))}
          {d.inbox.length === 0 && empty(t.empty)}
          {d.inbox.map(x => row(`inbox:${x.file}`, x.file, shortName(x.file), x.detail))}
        </Box>
      )}

      {d.toVerify && (
        <Box key="section:verify" flexDirection="column">
          {title(t.toVerify(d.toVerify.notes.reduce((n, x) => n + x.count, 0), d.toVerify.tag))}
          {d.toVerify.notes.length === 0 && empty(t.none)}
          {d.toVerify.notes.map(x => row(`verify:${x.file}`, x.file, shortName(x.file), `${x.count}`))}
        </Box>
      )}

      {d.passations && (
        <Box key="section:passations" flexDirection="column">
          {title(t.passations(d.passations.length))}
          {d.passations.length === 0 && empty(t.none)}
          {d.passations.map(p => (
            <Box key={p.file} flexDirection="column">
              {row(`passation:${p.file}`, p.file, p.title, t.age(daysBetween(p.mtimeMs, now)))}
              {p.description && (
                <Text dimColor wrap="truncate-end">
                  {'  '}
                  {p.description}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      {d.errors && (
        <Box key="section:errors" flexDirection="column">
          {title(t.errors)}
          {d.errors.length === 0 && empty(t.none, 'success')}
          {d.errors.map(x => row(`error:${x.file}`, x.file, shortName(x.file), x.detail, 'error'))}
        </Box>
      )}
    </Box>
  )
}
