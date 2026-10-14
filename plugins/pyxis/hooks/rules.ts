// The rules that used to be copied into each CLAUDE.md, with the vault's folders resolved.
import { ROLES } from './conventions'
import type { Kit } from './conventions'

/** Where the passation skill's text is, for the model to read: skills are the user's to invoke. */
export const passationSkill = (pluginRoot: string) => `${pluginRoot}/skills/passation/SKILL.md`

/** The block that goes with the first message of a session, and with the first after a compaction. */
export function rulesBlock(kit: Kit, isVaultSession: boolean, sessionId: string, pluginRoot: string): string {
  const { folders, passations, verifyTag } = kit
  const set = ROLES.filter(role => folders[role] !== null).map(role => `${role} \`${folders[role]}\``)
  if (passations.folder !== null) {
    set.push(`passations \`${passations.folder}\` (outside a repository: \`${passations.outsideRepo}\`, resumed: \`${passations.resumed}\`)`)
  }
  const lines = [
    `pyxis: the user's second brain is the Obsidian vault \`${kit.vault}\`. Session id: \`${sessionId}\`.`,
    `Folders, relative to the vault: ${set.join(', ')}.`,
  ]
  if (folders.hubs !== null) {
    lines.push(
      `Each project has a hub, \`${folders.hubs}/<Folder>/<folder in lowercase>.md\`. Before answering anything about a project, read its hub: \`${folders.hubs}\` is the source of truth.` +
        (folders.archive !== null
          ? ` \`${folders.archive}\` may inform your questions, never your answers: state nothing as current on its strength alone.`
          : '') +
        ' If the hub says nothing on the point, say so rather than filling the gap. A hub injected by pyxis counts as read.',
    )
  }
  if (passations.folder !== null) {
    lines.push(
      `Passation (handoff): when the user says "passation" or pyxis says the context is past its threshold, finish the current request, then write it as \`${passationSkill(pluginRoot)}\` says.`,
    )
  }
  if (isVaultSession) {
    lines.push(
      'Working rules in this vault:',
      '1. Search before you write: extend or link an existing note rather than creating a near-duplicate.',
      "2. Add, don't rewrite: append or insert; don't restyle, reorder or reformat the user's notes unless asked.",
      folders.archive !== null
        ? `3. Never delete a note: move it to \`${folders.archive}\` and set \`status: archived\`, or ask.`
        : '3. Never delete a note: ask.',
      '4. Ask before moving or renaming a note, and update every [[link]] to it in the same pass.',
      verifyTag !== null
        ? `5. Flag, don't guess: write \`${verifyTag}\` rather than asserting what you are unsure of.`
        : "5. Flag, don't guess: say what you are unsure of rather than asserting it.",
      '6. One change at a time: no vault-wide refactor, bulk retagging or mass frontmatter edit unless asked.',
    )
  }
  lines.push("Where the vault's CLAUDE.md says otherwise, it wins over this block.")

  return lines.join('\n')
}
