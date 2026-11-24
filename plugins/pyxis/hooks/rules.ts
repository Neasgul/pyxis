// The block that goes with the first message of a session: the notes folder, its folders, the
// passation rule and, when a wiki is set, the wiki rule, with the folders resolved.
import { ROLES } from './conventions'
import type { Kit } from './conventions'

/** Where the passation skill's text is, for the model to read: skills are the user's to invoke. */
export const passationSkill = (pluginRoot: string) => `${pluginRoot}/skills/passation/SKILL.md`

/** The wiki rule, its `<wiki>` placeholders replaced by the wiki's absolute path. */
const WIKI_RULE = `Wiki: \`<wiki>\` (its contract: \`<wiki>/AGENTS.md\`). A wiki page injected into the conversation counts as read. If the wiki says nothing on a point, say so rather than filling the gap. When this session settles a durable fact within the wiki's subject (as its AGENTS.md defines it), write it to \`<wiki>/inbox/YYYY-MM-DD-<subject>.md\` in the format AGENTS.md gives, with the page you propose as \`target:\` and what lets someone check the fact, and tell the user in one line. Never edit a wiki page on your own: nothing enters a page without the user's agreement. Inbox notes are not validated: never cite them as true.`

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
  if (kit.isWikiFound) {
    lines.push(WIKI_RULE.split('<wiki>').join(kit.wiki))
  }

  return lines.join('\n')
}
