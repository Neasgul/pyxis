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

  return memory?.id === id ? memory : { id, isPrimed: false, served: [], active: [] }
}

export async function saveMemory($: EngineInterface, memory: SessionMemory) {
  await update($, session, () => memory)
}
