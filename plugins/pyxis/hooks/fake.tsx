// The engine under pyxis in tests: a vault and repositories in memory, what the plugin runs,
// submits and shows, recorded. Imported by the tests only.
import type { FsEntry, On } from 'claude-code'

export const NOW = Date.UTC(2026, 9, 13, 10)
export const DAY = 86_400_000
export const HOME = '/home/ada'
export const VAULT = `${HOME}/vault`

type Note = { text: string; mtimeMs: number }

export type Fake = {
  /** Absolute path → note. A key ending in `/` is an empty folder. */
  files: Map<string, Note>
  commands: string[][]
  prompts: { text: string; context: readonly string[] }[]
  toasts: string[]
  panes: string[]
  session: { cwd: string; id: string }
}

/** `[text, days ago]` for an older note. */
export type Notes = Record<string, string | [string, number]>

const isWithin = (path: string, parent: string) => path === parent || path.startsWith(`${parent}/`)

const done = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

/**
 * `repos` maps a folder (a repository or one of its worktrees) to its main checkout, as
 * `git rev-parse --git-common-dir` finds it.
 */
export function fakeEngine(on: On, notes: Notes, repos: Record<string, string> = {}): Fake {
  const files = new Map<string, Note>(
    Object.entries(notes).map(([path, v]) =>
      typeof v === 'string' ? [path, { text: v, mtimeMs: NOW }] : [path, { text: v[0], mtimeMs: NOW - v[1] * DAY }],
    ),
  )
  const fake: Fake = { files, commands: [], prompts: [], toasts: [], panes: [], session: { cwd: VAULT, id: 'S1' } }
  const isDir = (path: string) => [...files.keys()].some(k => k.startsWith(`${path}/`))
  const entries = (path: string): FsEntry[] => {
    const found = new Map<string, FsEntry>()
    for (const [key, note] of files) {
      if (!key.startsWith(`${path}/`)) {
        continue
      }
      const [name = '', ...rest] = key.slice(path.length + 1).split('/')
      if (name && !found.has(name)) {
        const kind = rest.length > 0 ? 'dir' : 'file'
        found.set(name, { name, kind, size: kind === 'file' ? note.text.length : 0, mtimeMs: note.mtimeMs, isLink: false })
      }
    }

    return [...found.values()]
  }
  const grep = (argv: string[], cwd: string) => {
    const pattern = argv[argv.indexOf('-e') + 1] ?? ''
    const folders = argv.slice(argv.indexOf('-e') + 2)
    const lines: string[] = []
    for (const [key, note] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const relative = key.slice(cwd.length + 1)
      if (!key.endsWith('.md') || !folders.some(f => isWithin(relative, f))) {
        continue
      }
      note.text.split('\n').forEach((line, i) => {
        if (line.includes(pattern)) {
          lines.push(`${relative}:${i + 1}:${line}`)
        }
      })
    }

    return done(lines.join('\n'), lines.length > 0 ? 0 : 1)
  }

  on('session.start', (_$, e) => {
    fake.session.cwd = e.cwd
    return { cwd: e.cwd }
  })
  on('session.cwd', () => ({ value: fake.session.cwd }))
  on('session.id', () => ({ value: fake.session.id }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.compact', (_$, e) => ({ messages: e.messages }))
  on('session.attach', (_$, e) => ({ clientId: e.clientId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  on('clock.now', () => ({ value: NOW }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('fs.stat', (_$, e) => {
    const note = files.get(e.path)
    if (note) {
      return { value: { kind: 'file', size: note.text.length, mtimeMs: note.mtimeMs, isLink: false } }
    }
    return isDir(e.path) ? { value: { kind: 'dir', size: 0, mtimeMs: NOW, isLink: false } } : { deny: `ENOENT: ${e.path}` }
  })
  on('fs.list', (_$, e) => (isDir(e.path ?? '') ? { value: entries(e.path ?? '') } : { deny: `ENOENT: ${e.path}` }))
  on('fs.read', (_$, e) => {
    const note = files.get(e.path)
    return note ? { value: note.text } : { deny: `ENOENT: ${e.path}` }
  })
  on('fs.write', (_$, e) => {
    files.set(e.path, { text: e.text, mtimeMs: NOW })
    return { value: undefined }
  })
  on('fs.exists', (_$, e) => ({ value: files.has(e.path) || isDir(e.path) }))
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    if (argv[0] === 'git') {
      const folder = Object.keys(repos)
        .filter(f => isWithin(argv[2] ?? '', f))
        .sort((a, b) => b.length - a.length)[0]
      return folder ? done(`${repos[folder]}/.git\n`) : done('', 128)
    }
    fake.commands.push(argv)
    if (argv[0] === 'grep') {
      return grep(argv, e.init?.cwd ?? fake.session.cwd)
    }
    if (argv[0] === 'date') {
      return done('2026-10-13 10:42\n')
    }
    if (argv[0] === 'uname') {
      return done('Darwin\n')
    }
    if (argv[0] === 'mv') {
      const note = files.get(argv[1] ?? '')
      if (!note) {
        return done('', 1)
      }
      files.delete(argv[1] ?? '')
      files.set(argv[2] ?? '', note)
    }
    return done('')
  })
  on('prompt.submit', (_$, e) => {
    fake.prompts.push({ text: e.text, context: e.context ?? [] })
    return { text: e.text }
  })
  on('ui.toast', (_$, e) => {
    fake.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.open', (_$, e) => {
    fake.panes.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({
    value: fake.panes.map(id => ({ id, title: 'Vault', isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })

  return fake
}

export const startIn = (cwd: string) => ({ cwd, surface: 'desktop' as const, isInteractive: true })

export const measured = (tokens: number) => ({
  context: { tokens, window: 1_000_000 },
  rateLimits: [],
  changed: ['context' as const],
})

/** The input of a manual `/compact` over a one-message conversation. */
export const COMPACT = {
  trigger: 'manual' as const,
  messages: [{ role: 'user' as const, text: 'earlier', toolUses: [] }],
}

export const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

export const PANE_PROPS = {
  component: 'Pane',
  requestId: 'pyxis-vault',
  props: { title: 'Vault', isFocused: false, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

/** The context the model read with the last prompt, joined. */
export const lastContext = (fake: Fake) => (fake.prompts.at(-1)?.context ?? []).join('\n\n')
