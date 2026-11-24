import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { listEntries } from './conventions'
import type { Kit } from './conventions'

/** How often the count is read again, in milliseconds. */
export const REFRESH_MS = 30_000

/** `inbox 4`, or nothing when the inbox is empty or unknown. */
export const inboxLabel = (count: number | undefined) => (count === undefined || count === 0 ? undefined : `inbox ${count}`)

/** The notes waiting in `<wiki>/inbox`; undefined without a wiki or when the folder cannot be read. */
async function countNotes($: EngineInterface, kit: Kit): Promise<number | undefined> {
  if (!kit.isWikiFound) {
    return undefined
  }
  try {
    const entries = await listEntries($, `${kit.wiki}/inbox`)

    return entries.filter(entry => entry.kind === 'file' && entry.name.endsWith('.md')).length
  } catch {
    return undefined
  }
}

// Whether this session's status line shows a count of ours: an emptied inbox clears it, and a session that never showed one never touches the line.
const isInboxShown = atom({ plugin: 'pyxis', key: 'isInboxShown' } as const, false)

/** Puts the inbox count in the status line, or clears it once the inbox is empty. Never rejects. */
export async function refreshInbox($: EngineInterface, kit: Kit): Promise<void> {
  const label = inboxLabel(await countNotes($, kit))
  const isShown = await read($, isInboxShown)
  if (label === undefined && !isShown) {
    return
  }
  if (isShown !== (label !== undefined)) {
    await update($, isInboxShown, () => label !== undefined)
  }
  await $.ui.status(label)
}
