// Interface text, in English and French. What the model reads stays in English.

export type Language = 'en' | 'fr'

const DAY = 86_400_000

const EN = {
  age: (days: number) => (days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`),
  vaultMissing: (path: string) =>
    `pyxis: vault folder not found (${path}). Set the vault option in /config, or with \`claude plugin configure pyxis@pyxis\`.`,
  conventionsProblem: (file: string, key: string) => `pyxis: ${file}: ${key} ignored, default used.`,
  moveFailed: (error: string) => `pyxis: the handoff could not be moved (${error}).`,
  openFailed: (file: string) => `pyxis: Obsidian did not open ${file}.`,
  passationsCommand: 'Show the open handoffs again: outside repositories, this session\'s repository and the active hubs\' repositories',
  vaultCommand: 'Vault dashboard: todos, daily note, inbox, notes to verify, handoffs, errors',
  outsideRepo: 'outside repositories',
  passationsTitle: 'Open handoffs',
  resume: 'Resume',
  resumeMoved: (path: string, resumed: string) =>
    `Resume the passation \`${path}\`. It is already \`status: done\` and moved to \`${resumed}/\`: read it in full, then carry on.`,
  resumeNotMoved: (path: string, resumed: string) =>
    `Resume the passation \`${path}\`. It is \`status: done\` but could not be moved to \`${resumed}/\`: move it, read it in full, then carry on.`,
  elsewhere: (repo: string) => `It concerns the repository \`${repo}\`, not this session's folder.`,
  hide: 'Hide',
  nonePassations: (scope: string) => `No open handoff (${scope}).`,
  somePassations: (n: number, scope: string) => `${n} open handoff(s) (${scope}), above the prompt.`,
  over: (tokens: string, threshold: string) => `Context at ${tokens}, past the handoff threshold (${threshold}).`,
  writePassation: 'Write the handoff',
  dashboardOpened: 'Vault dashboard open.',
  reading: 'Reading the vault…',
  readAt: (date: string, time: string) => `${date} · read at ${time}`,
  refresh: 'Refresh',
  todos: (n: number, late: number) => `Todos · ${n} open${late ? `, ${late} overdue` : ''}`,
  more: (n: number) => `+ ${n} more`,
  daily: 'Daily',
  latest: (name: string) => `latest: ${name}`,
  inbox: (n: number) => `Inbox · ${n}`,
  toVerify: (n: number, tag: string) => `To verify · ${n} ${tag}`,
  passations: (n: number) => `Active handoffs · ${n}`,
  errors: 'Errors',
  none: 'none',
  empty: 'empty',
}

export type Text = typeof EN

const FR: Text = {
  age: days => (days <= 0 ? "aujourd'hui" : days === 1 ? 'hier' : `il y a ${days} j`),
  vaultMissing: path =>
    `pyxis : dossier du vault introuvable (${path}). Réglez l'option vault dans /config, ou par \`claude plugin configure pyxis@pyxis\`.`,
  conventionsProblem: (file, key) => `pyxis : ${file} : ${key} ignoré, valeur par défaut.`,
  moveFailed: error => `pyxis : la passation n'a pas pu être déplacée (${error}).`,
  openFailed: file => `pyxis : Obsidian n'a pas ouvert ${file}.`,
  passationsCommand: 'Réaffiche les passations en cours : hors dépôt, dépôt de la session et dépôts des hubs actifs',
  vaultCommand: 'Tableau du vault : todos, Daily, Inbox, à vérifier, passations, erreurs',
  outsideRepo: 'hors dépôt',
  passationsTitle: 'Passations en cours',
  resume: 'Reprendre',
  resumeMoved: (path, resumed) =>
    `Reprends la passation \`${path}\`. Elle est déjà en \`status: done\` et rangée dans \`${resumed}/\` : lis-la en entier, puis continue.`,
  resumeNotMoved: (path, resumed) =>
    `Reprends la passation \`${path}\`. Elle est en \`status: done\` mais n'a pas pu être rangée dans \`${resumed}/\` : range-la, lis-la en entier, puis continue.`,
  elsewhere: repo => `Elle concerne le dépôt \`${repo}\`, pas le dossier de cette session.`,
  hide: 'Masquer',
  nonePassations: scope => `Aucune passation en cours (${scope}).`,
  somePassations: (n, scope) => `${n} passation(s) en cours (${scope}), au-dessus de la zone de saisie.`,
  over: (tokens, threshold) => `Contexte à ${tokens}, au-delà du seuil de passation (${threshold}).`,
  writePassation: 'Écrire la passation',
  dashboardOpened: 'Tableau du vault ouvert.',
  reading: 'Lecture du vault…',
  readAt: (date, time) => `${date} · lu à ${time}`,
  refresh: 'Rafraîchir',
  todos: (n, late) => `Todos · ${n} ouverts${late ? `, ${late} en retard` : ''}`,
  more: n => `+ ${n} autres`,
  daily: 'Daily',
  latest: name => `dernier : ${name}`,
  inbox: n => `Inbox · ${n}`,
  toVerify: (n, tag) => `À vérifier · ${n} ${tag}`,
  passations: n => `Passations actives · ${n}`,
  errors: 'Erreurs',
  none: 'aucun',
  empty: 'vide',
}

export const text = (language: Language): Text => (language === 'fr' ? FR : EN)

/** Whole days between two instants, floored: `0` is less than a day. */
export const daysBetween = (from: number, to: number) => Math.floor((to - from) / DAY)
