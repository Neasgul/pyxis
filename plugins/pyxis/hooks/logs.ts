// The hooks' error logs, `*-errors.log` in the logs folder.
import type { EngineInterface } from 'claude-code'

import { listEntries } from './conventions'
import type { Kit } from './conventions'

/** An error log of the logs folder: its path relative to the vault, how many lines, the last message. */
export type ErrorLog = { file: string; count: number; message: string }

/** Error logs only (`*-errors.log`): the logs folder holds other output too. */
export async function errorLogs($: EngineInterface, kit: Kit, root: string): Promise<ErrorLog[]> {
  const logs: ErrorLog[] = []
  for (const f of await listEntries($, `${kit.vault}/${root}`)) {
    if (f.kind !== 'file' || f.size === 0 || !f.name.endsWith('-errors.log')) {
      continue
    }
    const lines = (await $.fs.read(`${kit.vault}/${root}/${f.name}`).catch(() => '')).split('\n').filter(l => l.trim())
    // `date<TAB>where<TAB>message`: the last field is the message.
    const message = (lines.at(-1) ?? '').split('\t').at(-1) ?? ''
    logs.push({ file: `${root}/${f.name}`, count: lines.length, message })
  }

  return logs
}
