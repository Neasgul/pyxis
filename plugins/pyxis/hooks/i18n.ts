// Interface text, in English and French. What the model reads stays in English.

export type Language = 'en' | 'fr'

const DAY = 86_400_000

const EN = {
  age: (days: number) => (days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`),
  vaultMissing: (path: string) =>
    `pyxis: vault folder not found (${path}). Set the vault option in /config, or with \`claude plugin configure pyxis@pyxis\`.`,
  wikiMissing: (path: string) =>
    `pyxis: wiki folder not found (${path}). Set the wiki option in /config, or with \`claude plugin configure pyxis@pyxis\`.`,
  conventionsProblem: (file: string, key: string) => `pyxis: ${file}: ${key} ignored, default used.`,
  moveFailed: (error: string) => `pyxis: the handoff could not be moved (${error}).`,
  resumeFailed: (file: string, error: string) => `pyxis: the handoff ${file} could not be resumed (${error}).`,
  passationsCommand: 'Show the open handoffs again: outside repositories and this session\'s repository',
  outsideRepo: 'outside repositories',
  passationsTitle: 'Open handoffs',
  resume: 'Resume',
  resumeMoved: (path: string, resumed: string) =>
    `Resume the passation \`${path}\`. It is already \`status: done\` and moved to \`${resumed}/\`: read it in full, then carry on.`,
  resumeNotMoved: (path: string, resumed: string) =>
    `Resume the passation \`${path}\`. It is \`status: done\` but could not be moved to \`${resumed}/\`: move it, read it in full, then carry on.`,
  hide: 'Hide',
  nonePassations: (scope: string) => `No open handoff (${scope}).`,
  somePassations: (n: number, scope: string) => `${n} open handoff(s) (${scope}), above the prompt.`,
  over: (tokens: string, threshold: string) => `Context at ${tokens}, past the handoff threshold (${threshold}).`,
  writePassation: 'Write the handoff',
}

export type Text = typeof EN

const FR: Text = {
  age: days => (days <= 0 ? "aujourd'hui" : days === 1 ? 'hier' : `il y a ${days} j`),
  vaultMissing: path =>
    `pyxis : dossier du vault introuvable (${path}). Réglez l'option vault dans /config, ou par \`claude plugin configure pyxis@pyxis\`.`,
  wikiMissing: path =>
    `pyxis : dossier du wiki introuvable (${path}). Réglez l'option wiki dans /config, ou par \`claude plugin configure pyxis@pyxis\`.`,
  conventionsProblem: (file, key) => `pyxis : ${file} : ${key} ignoré, valeur par défaut.`,
  moveFailed: error => `pyxis : la passation n'a pas pu être déplacée (${error}).`,
  resumeFailed: (file, error) => `pyxis : la passation ${file} n'a pas pu être reprise (${error}).`,
  passationsCommand: 'Réaffiche les passations en cours : hors dépôt et dépôt de la session',
  outsideRepo: 'hors dépôt',
  passationsTitle: 'Passations en cours',
  resume: 'Reprendre',
  resumeMoved: (path, resumed) =>
    `Reprends la passation \`${path}\`. Elle est déjà en \`status: done\` et rangée dans \`${resumed}/\` : lis-la en entier, puis continue.`,
  resumeNotMoved: (path, resumed) =>
    `Reprends la passation \`${path}\`. Elle est en \`status: done\` mais n'a pas pu être rangée dans \`${resumed}/\` : range-la, lis-la en entier, puis continue.`,
  hide: 'Masquer',
  nonePassations: scope => `Aucune passation en cours (${scope}).`,
  somePassations: (n, scope) => `${n} passation(s) en cours (${scope}), au-dessus de la zone de saisie.`,
  over: (tokens, threshold) => `Contexte à ${tokens}, au-delà du seuil de passation (${threshold}).`,
  writePassation: 'Écrire la passation',
}

export const text = (language: Language): Text => (language === 'fr' ? FR : EN)

/** Whole days between two instants, floored: `0` is less than a day. */
export const daysBetween = (from: number, to: number) => Math.floor((to - from) / DAY)
