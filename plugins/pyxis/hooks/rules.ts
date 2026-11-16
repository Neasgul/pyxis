// The block that goes with the first message of a session: the notes folder, its folders and
// the passation rule, with the folders resolved.
import { ROLES } from './conventions'
import type { Kit } from './conventions'

/** Where the passation skill's text is, for the model to read: skills are the user's to invoke. */
export const passationSkill = (pluginRoot: string) => `${pluginRoot}/skills/passation/SKILL.md`

/** The block that goes with the first message of a session, and with the first after a compaction. */
export function rulesBlock(kit: Kit, sessionId: string, pluginRoot: string): string {
  const { folders, passations } = kit
  const set = ROLES.filter(role => folders[role] !== null).map(role => `${role} \`${folders[role]}\``)
  if (passations.folder !== null) {
    set.push(`passations \`${passations.folder}\` (outside a repository: \`${passations.outsideRepo}\`, resumed: \`${passations.resumed}\`)`)
  }
  const lines = [`pyxis: notes folder \`${kit.vault}\`. Session id: \`${sessionId}\`.`, `Folders, relative to it: ${set.join(', ') || 'none'}.`]
  if (passations.folder !== null) {
    lines.push(
      `Passation (handoff): when the user says "passation" or pyxis says the context is past its threshold, finish the current request, then write it as \`${passationSkill(pluginRoot)}\` says.`,
    )
  }

  return lines.join('\n')
}
