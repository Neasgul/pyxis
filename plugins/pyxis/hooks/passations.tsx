// Handoffs between sessions: one note per task in `<passations>/<repository>/`, listed at
// start, resumed from the banner, asked for past the threshold. Replaces passation.py and
// the passations-vault and jauge-contexte banners.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { Passation } from '../types'
import { folder, isWithin, listEntries, loadKit, logLine } from './conventions'
import type { Kit, Settings } from './conventions'
import { bareField, field, markDone } from './frontmatter'
import { repoRoot } from './hubs'
import { daysBetween, text } from './i18n'
import { passationSkill } from './rules'

// The session's values, declared in ../types: they survive a reload of the module.
const passations = atom({ plugin: 'pyxis', key: 'passations' } as const, [])
const isBannerHidden = atom({ plugin: 'pyxis', key: 'isBannerHidden' } as const, false)
const tokens = atom({ plugin: 'pyxis', key: 'tokens' } as const, null)
const isThresholdHidden = atom({ plugin: 'pyxis', key: 'isThresholdHidden' } as const, false)
const isThresholdNoticed = atom({ plugin: 'pyxis', key: 'isThresholdNoticed' } as const, false)

/**
 * The context size last measured in this session, and the threshold for the model's window;
 * null before a measurement, after a `/clear` or an unsized compaction.
 */
export async function contextSize($: EngineInterface): Promise<{ size: number; threshold: number } | null> {
  const measured = await read($, tokens)

  return measured !== null && measured.id === (await $.session.id()) ? measured : null
}

/** The threshold of the last measurement in this session, else the option's. */
export async function lastThreshold($: EngineInterface, option: number): Promise<number> {
  return (await contextSize($))?.threshold ?? option
}

/** Keeps a measurement (null: unknown). Below the threshold, the warning and the notice are armed for the next crossing. */
export async function recordSize($: EngineInterface, size: number | null, threshold: number) {
  const id = await $.session.id()
  await update($, tokens, () => (size === null ? null : { id, size, threshold }))
  if (size === null || size < threshold) {
    if (await read($, isThresholdHidden)) {
      await update($, isThresholdHidden, () => false)
    }
    if (await read($, isThresholdNoticed)) {
      await update($, isThresholdNoticed, () => false)
    }
  }
}

/** True once per crossing, unless the warning was hidden: the notice then goes with this message. */
export async function claimNotice($: EngineInterface, size: number, threshold: number): Promise<boolean> {
  if (size < threshold || (await read($, isThresholdHidden)) || (await read($, isThresholdNoticed))) {
    return false
  }
  await update($, isThresholdNoticed, () => true)

  return true
}

/** At most this many handoffs are listed for the model. */
const MODEL_LIST = 10

const inK = (n: number) => `${Math.round(n / 1000)}k`

/** A repository's folder name in the passations folder: the main checkout's own name. */
export const repoFolder = (repo: string) => repo.split('/').filter(Boolean).at(-1) ?? repo

/** Where this session's handoffs go: its repository's folder, or `outsideRepo`; null without a passations folder. */
export function passationsDir(kit: Kit, repo: string | undefined): string | null {
  const root = folder(kit, 'passations')

  return root === null ? null : `${root}/${repo ? repoFolder(repo) : kit.passations.outsideRepo}`
}

/** The list the model reads with the first message, and what to do with it. */
export function modelList(list: Passation[], kit: Kit, now: number): string {
  const root = folder(kit, 'passations') ?? ''
  const lines = list.slice(0, MODEL_LIST).map(p => {
    const days = daysBetween(p.mtimeMs, now)
    const age = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`

    return `- \`${root}/${p.folder}/${p.file}\` (${age}): ${p.description}`
  })

  return [
    'Open passations, left by earlier sessions:',
    ...lines,
    '',
    `If this message resumes one of them, read it in full, then set \`status: done\` and move it to \`${kit.passations.resumed}/\` next to it. If it is ambiguous between two, ask which. Otherwise, say nothing about them.`,
  ].join('\n')
}

/** What the model reads with each message once the context is past the threshold. */
export const thresholdNotice = (size: number, threshold: number, dir: string, sessionId: string, pluginRoot: string) =>
  `Session context: ${inK(size)} tokens, past the threshold of ${inK(threshold)}. Handle the request, then write the passation without asking, in \`${dir}/<task-slug>.md\` (session \`${sessionId}\`), as \`${passationSkill(pluginRoot)}\` says, and end the message with one line inviting the user to resume in a new session.`

/** The `status: active` notes of one folder of the passations folder. */
async function readFolder($: EngineInterface, kit: Kit, name: string, repo: string | undefined): Promise<Passation[]> {
  const dir = `${folder(kit, 'passations')}/${name}`
  const found: Passation[] = []
  for (const note of await listEntries($, dir)) {
    if (note.kind !== 'file' || !note.name.endsWith('.md')) {
      continue
    }
    const content = await $.fs.read(`${dir}/${note.name}`).catch(() => '')
    if (bareField(content, 'status') !== 'active') {
      continue
    }
    found.push({
      folder: name,
      file: note.name,
      name: note.name.replace(/\.md$/, ''),
      description: field(content, 'description'),
      mtimeMs: note.mtimeMs,
      ...(repo ? { repo } : {}),
    })
  }

  return found
}

/** The open handoffs of `outsideRepo` (when asked) and of these repositories, newest first. */
export async function openPassations(
  $: EngineInterface,
  kit: Kit,
  withOutsideRepo: boolean,
  repos: string[],
): Promise<Passation[]> {
  if (folder(kit, 'passations') === null) {
    return []
  }
  const sources = new Map<string, string | undefined>()
  if (withOutsideRepo) {
    sources.set(kit.passations.outsideRepo, undefined)
  }
  for (const repo of repos) {
    if (!sources.has(repoFolder(repo))) {
      sources.set(repoFolder(repo), repo)
    }
  }
  const found: Passation[] = []
  for (const [name, repo] of sources) {
    found.push(...(await readFolder($, kit, name, repo)))
  }

  return found.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/** Marks the note done, moves it to `resumed`, then submits the prompt that resumes it. */
async function resume($: EngineInterface, s: Settings, p: Passation) {
  const kit = await loadKit($, s)
  const t = text(s.language)
  const dir = `${folder(kit, 'passations')}/${p.folder}`
  const source = `${dir}/${p.file}`
  const resumedDir = `${dir}/${kit.passations.resumed}`
  const target = (await $.fs.exists(`${resumedDir}/${p.file}`))
    ? `${resumedDir}/${p.name}-${await $.clock.now()}.md`
    : `${resumedDir}/${p.file}`

  try {
    await $.fs.write(source, markDone(await $.fs.read(source)))
  } catch (error) {
    // Moved or deleted since the banner listed it: say so, and leave the banner up.
    const message = error instanceof Error ? error.message : String(error)
    $.ui.toast(t.resumeFailed(p.file, message))
    await logLine($, kit, 'resume', message)
    return
  }
  await update($, isBannerHidden, () => true)
  await $.process.run(['mkdir', '-p', resumedDir])
  const moved = await $.process.run(['mv', source, target])

  const cwd = await $.session.cwd()
  const root = await repoRoot($, cwd)
  const repo = p.repo
  const isElsewhere = repo !== undefined && ![cwd, ...(root ? [root] : [])].some(r => isWithin(r, repo))
  const elsewhere = isElsewhere ? ` ${t.elsewhere(repo)}` : ''

  if (moved.exitCode === 0) {
    void $.prompt.submit({ text: t.resumeMoved(target, kit.passations.resumed) + elsewhere })
  } else {
    $.ui.toast(t.moveFailed(moved.stderr.trim()))
    void $.prompt.submit({ text: t.resumeNotMoved(source, kit.passations.resumed) + elsewhere })
  }
}

/** The band above the prompt: past the threshold, a warning; at start, the open handoffs. */
export async function renderBanner(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  s: Settings,
): Promise<RenderElement | undefined> {
  const measured = await contextSize($)
  const isOver = measured !== null && measured.size >= measured.threshold && !(await read($, isThresholdHidden))
  const list = (await read($, isBannerHidden)) ? [] : await read($, passations)
  if (e.props.hasSurvey || (!isOver && list.length === 0)) {
    return undefined
  }

  const t = text(s.language)
  const now = await $.clock.now()
  const { Box, Button, Text } = $.ui.resolve(e)

  return (
    <Box flexDirection="column">
      {isOver && measured !== null && (
        <Box key="threshold" flexDirection="column">
          <Text color="warning" wrap="truncate-end">
            {t.over(inK(measured.size), inK(measured.threshold))}
          </Text>
          <Box gap={1}>
            <Button
              key="write-passation"
              label={t.writePassation}
              variant="primary"
              onPress={() => void $.prompt.submit({ text: 'passation' })}
            />
            <Button key="hide-threshold" label={t.hide} onPress={() => update($, isThresholdHidden, () => true)} />
          </Box>
        </Box>
      )}
      {list.length > 0 && (
        <Box key="passations" flexDirection="column">
          <Text bold>{t.passationsTitle}</Text>
          {list.map(p => (
            <Box key={`${p.folder}/${p.file}`} gap={1}>
              <Button key={`resume:${p.folder}/${p.file}`} label={t.resume} onPress={() => resume($, s, p)} />
              <Text wrap="truncate-end">
                {p.folder}/{p.name}{' '}
                <Text dimColor>
                  · {t.age(daysBetween(p.mtimeMs, now))} · {p.description}
                </Text>
              </Text>
            </Box>
          ))}
          <Box>
            <Button key="hide-passations" label={t.hide} onPress={() => update($, isBannerHidden, () => true)} />
          </Box>
        </Box>
      )}
    </Box>
  )
}
