import { afterAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { renderIndex } from './index'
import { lintWiki } from './lint'
import { loadPages } from './pages'

const dirs: string[] = []

afterAll(async () => {
  await Promise.all(dirs.map(dir => rm(dir, { recursive: true })))
})

const page = (body = '', frontmatter = 'summary: S\ntriggers: [t]\nsources: [s]\nupdated: 2026-11-15\n') =>
  `---\n${frontmatter}---\n\n${body}\n`

/** A wiki with the given files and an up-to-date index, unless the files hold one. */
async function wiki(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wiki-lint-'))
  dirs.push(dir)
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await Bun.write(join(dir, path), content)
  }
  if (!('index.md' in files)) {
    await Bun.write(join(dir, 'index.md'), renderIndex(await loadPages(dir)))
  }

  return dir
}

const lint = async (files: Record<string, string>) =>
  (await lintWiki(await wiki(files))).map(f => `${f.level} ${f.path}: ${f.message}`)

// Two pages that link to each other: nothing to report.
const clean = {
  'billing/overview.md': page('See [deploy](deploy.md).'),
  'billing/deploy.md': page('Back to [overview](overview.md).'),
}

test('a clean wiki has no finding, an empty wiki neither', async () => {
  expect(await lint(clean)).toEqual([])
  expect(await lint({})).toEqual([])
})

test('page problems are errors', async () => {
  expect(await lint({ ...clean, 'billing/bare.md': '# Bare\n', 'index.md': 'x' })).toContain(
    'error billing/bare.md: no frontmatter',
  )
})

test('a relative link to a missing file is an error, resolved from the page folder', async () => {
  const findings = await lint({
    ...clean,
    'billing/deploy.md': page('[overview](overview.md) [gone](gone.md) [raw](../raw/billing/note.md) [up](../auth/x.md)'),
    'raw/billing/note.md': 'a note',
  })

  expect(findings).toContain('error billing/deploy.md: broken link: gone.md')
  expect(findings).toContain('error billing/deploy.md: broken link: ../auth/x.md')
  expect(findings.filter(f => f.includes('broken link'))).toHaveLength(2)
})

test('anchors, URLs and links inside code are not broken links; page.md#section is checked on page.md', async () => {
  const body = [
    '[a](#section) [b](https://example.com/x.md) [c](mailto:x@example.com) [d](overview.md#stack) [e](gone.md#x)',
    '```',
    '[f](in-code.md)',
    '```',
    'and `[g](inline-code.md)`',
  ].join('\n')
  const findings = await lint({ ...clean, 'billing/deploy.md': page(body) })

  expect(findings.filter(f => f.includes('broken link'))).toEqual(['error billing/deploy.md: broken link: gone.md#x'])
})

test('a possible secret is an error, in a page and in an inbox note; ordinary words are not', async () => {
  const findings = await lint({
    ...clean,
    'billing/deploy.md': page('[o](overview.md)\nSet `GALLERY_S3_BUCKET`. The token is opaque.\n```\npassword = "hunter2hunter2"\n```'),
    'inbox/2026-11-15-key.md': '---\ncreated: 2026-11-15\n---\n\nAKIAABCDEFGHIJKLMNOP\n',
  })

  expect(findings).toContain('error billing/deploy.md: possible secret: line 11')
  expect(findings).toContain('error inbox/2026-11-15-key.md: possible secret: line 5')
  expect(findings.filter(f => f.includes('possible secret'))).toHaveLength(2)
})

test('secrets in their common forms are caught', async () => {
  const forms = [
    'DJANGO_SECRET_KEY=aB3dEfGhIjKlMnOp',
    'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG',
    '"password": "hunter2hunter2"',
    'password = "p@ssw0rd!Long#2026"',
    'password = `hunter2hunter2`',
    '**Password**: hunter2hunter2',
    'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload',
    'use glpat-AbCdEfGhIjKlMnOpQrSt here',
    'postgres://billing:s3cretPass@db.internal/billing',
  ]
  const findings = await lint({ ...clean, 'billing/deploy.md': page(['[o](overview.md)', ...forms].join('\n')) })

  expect(findings.filter(f => f.includes('possible secret'))).toEqual(
    forms.map((_, i) => `error billing/deploy.md: possible secret: line ${9 + i}`),
  )
})

test('names, paths and prose around the word secret or token are not secrets', async () => {
  const prose = [
    'The secret: billing/staging/django-settings',
    'secret: billing-staging-django',
    'token = /api/v1/auth/token/refresh/',
    'Set `GALLERY_S3_BUCKET`. The token is opaque, 6 months.',
    'password: typed at the prompt',
    'see https://example.com/docs and postgres://db.internal/billing',
    'Le refresh token vit dans un cookie `refresh_token` : `HttpOnly`, `SameSite=Strict`.',
  ]
  const findings = await lint({ ...clean, 'billing/deploy.md': page(['[o](overview.md)', ...prose].join('\n')) })

  expect(findings).toEqual([])
})

test('a secret in a text file of raw/ is an error too', async () => {
  const findings = await lint({ ...clean, 'raw/billing/leak.md': 'password = "hunter2hunter2"\n', 'raw/billing/doc.pdf': 'password = "hunter2hunter2"' })

  expect(findings).toEqual(['error raw/billing/leak.md: possible secret: line 1'])
})

test('broken links are caught with a title, angle brackets, a reference definition and a wrong case', async () => {
  const body = [
    '[a](gone-title.md "Title") [b](<gone angle.md>) [c][ref] [d](Overview.md) [e](overview.md "Fine") [f](<with space.md>)',
    '',
    '[ref]: gone-ref.md',
  ].join('\n')
  const findings = await lint({ ...clean, 'billing/deploy.md': page(body), 'billing/with space.md': page('[o](overview.md)') })

  expect(findings.filter(f => f.includes('broken link'))).toEqual([
    'error billing/deploy.md: broken link: gone angle.md',
    'error billing/deploy.md: broken link: gone-ref.md',
    'error billing/deploy.md: broken link: gone-title.md',
    'error billing/deploy.md: broken link: Overview.md',
  ])
})

test('a link to an existing folder, or with %20, is not broken', async () => {
  const findings = await lint({
    ...clean,
    'billing/deploy.md': page('[o](overview.md) [dir](../raw/billing/) [sp](../raw/billing/my%20note.md)'),
    'raw/billing/my note.md': 'x',
  })

  expect(findings).toEqual([])
})

test('a source under raw/ that does not exist is an error; other sources are not checked', async () => {
  const fm = 'summary: S\ntriggers: [t]\nsources: [raw/billing/missing.md, raw/billing/here.md, ~/Projects/x/Makefile]\nupdated: 2026-11-15\n'
  const findings = await lint({ ...clean, 'billing/deploy.md': page('[o](overview.md)', fm), 'raw/billing/here.md': 'x' })

  expect(findings).toEqual(['error billing/deploy.md: missing source: raw/billing/missing.md'])
})

test('a stale or missing index is an error', async () => {
  expect(await lint({ ...clean, 'index.md': 'stale\n' })).toContain('error index.md: index.md is out of date')
})

test('a page nothing links to is a warning, except an overview', async () => {
  const findings = await lint({ ...clean, 'billing/alone.md': page('[o](overview.md)') })

  expect(findings).toEqual(['warning billing/alone.md: no inbound link'])
})

test('missing triggers, sources or updated are warnings', async () => {
  const findings = await lint({ ...clean, 'billing/deploy.md': page('[o](overview.md)', 'summary: S\n') })

  expect(findings).toEqual([
    'warning billing/deploy.md: no sources',
    'warning billing/deploy.md: no triggers',
    'warning billing/deploy.md: no updated',
  ])
})

test('each TODO(verify) outside code is a warning with its line', async () => {
  const findings = await lint({ ...clean, 'billing/deploy.md': page('[o](overview.md)\nUnsure. TODO(verify)\n```\nTODO(verify)\n```') })

  expect(findings).toEqual(['warning billing/deploy.md: TODO(verify): line 9'])
})

test('inbox notes are listed as pending, with or without frontmatter, comment removed from target', async () => {
  const findings = await lint({
    ...clean,
    'inbox/2026-11-15-a.md': '---\ncreated: 2026-11-15\ntarget: billing/cd.md  # proposed\n---\n\nA fact.\n',
    'inbox/b.md': 'A bare fact.\n',
    'inbox/.gitkeep': '',
  })

  expect(findings).toEqual([
    'warning inbox/2026-11-15-a.md: pending since 2026-11-15, target billing/cd.md',
    'warning inbox/b.md: pending since ?, target ?',
  ])
})

test('errors come first, then by path', async () => {
  const findings = await lint({ ...clean, 'billing/alone.md': page('[gone](gone.md)') })

  expect(findings).toEqual(['error billing/alone.md: broken link: gone.md', 'warning billing/alone.md: no inbound link'])
})

test('the command prints the findings and a total, and exits 1 on an error', async () => {
  const run = async (dir: string) => {
    const proc = Bun.spawn(['bun', join(import.meta.dir, 'lint.ts'), dir], { stdout: 'pipe', stderr: 'pipe' })

    return { out: await new Response(proc.stdout).text(), code: await proc.exited }
  }
  const warned = await run(await wiki({ ...clean, 'billing/alone.md': page('[o](overview.md)') }))
  const failed = await run(await wiki({ ...clean, 'billing/alone.md': page('[gone](gone.md)') }))

  expect(warned.code).toBe(0)
  expect(warned.out).toBe('warning billing/alone.md: no inbound link\n0 errors, 1 warnings\n')
  expect(failed.code).toBe(1)
  expect(failed.out).toContain('1 errors, 1 warnings')
})

test('a colon right after the name still marks a secret, in backticks too', async () => {
  const findings = await lint({ ...clean, 'billing/deploy.md': page(['[o](overview.md)', '`api_token`: `aB3dEfGhIjKl`'].join('\n')) })

  expect(findings).toEqual(['error billing/deploy.md: possible secret: line 9'])
})

test('the command without a wiki folder prints a usage and exits 2', async () => {
  const proc = Bun.spawn(['bun', join(import.meta.dir, 'lint.ts')], { stdout: 'pipe', stderr: 'pipe' })
  const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited])

  expect(code).toBe(2)
  expect(err).toContain('usage:')
})
