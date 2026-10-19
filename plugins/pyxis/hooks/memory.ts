import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { SessionMemory } from '../types'

const session = atom({ plugin: 'pyxis', key: 'session' } as const, null)

/**
 * What pyxis remembers of the current session. A `/clear` fires no `session.start` but changes
 * the session id: a new id starts the memory over.
 */
export async function currentMemory($: EngineInterface): Promise<SessionMemory> {
  const id = await $.session.id()
  const memory = await read($, session)

  return memory?.id === id ? memory : { id, isPrimed: false, served: [], active: [], transcript: 0 }
}

/**
 * The memory with the conversation's length now. Where an organisation manages Claude Code,
 * `session.compact` does not reach a user plugin: a shorter conversation tells the compaction
 * (or a rewind), and the start block and the hubs go again. The API form, as the model reads
 * it: the rows keep the messages from before a compaction (seen 2026-10-19).
 */
export async function measureTranscript($: EngineInterface, memory: SessionMemory): Promise<SessionMemory> {
  const messages = await $.session.messages({ as: 'api' })
  const transcript = Array.isArray(messages) ? messages.length : memory.transcript

  return transcript < memory.transcript ? { ...memory, isPrimed: false, served: [], transcript } : { ...memory, transcript }
}

export async function saveMemory($: EngineInterface, memory: SessionMemory) {
  await update($, session, () => memory)
}
