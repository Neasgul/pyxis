/** A `status: active` note of `<passations>/<folder>/`. */
export type Passation = {
  /** The repository's folder name (`otterbackend`), or the conventions' `outsideRepo`. */
  folder: string
  /** `kit-vault-victoire.md`. */
  file: string
  /** The file name without `.md`. */
  name: string
  /** The `description:` field. */
  description: string
  mtimeMs: number
  /** The repository's absolute path, when the note came from a hub's `repos:` or the session's repository. */
  repo?: string
}

/** What pyxis remembers of the current session; a new session id starts it over. */
export type SessionMemory = {
  id: string
  /** The start block went with a message since the session began or was compacted. */
  isPrimed: boolean
  /** Hubs whose text is in the context: each goes in once until a compaction. */
  served: string[]
  /** Hubs of the session's repository or cited since: their repositories' handoffs are listed. */
  active: string[]
  /** How many messages the model read at the last message: fewer now means a compaction. */
  transcript: number
}

/** A `- [ ]` line of the daily or hubs folder. */
export type DashboardTodo = {
  /** Relative to the vault: `Daily/2026-09-29.md`. */
  file: string
  line: number
  /** Without the box and the due date. */
  text: string
  /** The date after 📅, or null. */
  due: string | null
  isLate: boolean
}

/** A dashboard row that opens a note: its path relative to the vault, and what is said of it. */
export type DashboardRow = { file: string; detail: string }

/** Each section is absent when its folder is not set or not on disk. */
export type Dashboard = {
  today: string
  time: string
  todos?: DashboardTodo[]
  /** null: the daily folder holds no dated note. */
  latestDaily?: { file: string; days: number } | null
  inbox?: DashboardRow[]
  /** Notes holding the conventions' `verifyTag`, with how many times. */
  toVerify?: { tag: string; notes: { file: string; count: number }[] }
  passations?: { file: string; title: string; description: string; mtimeMs: number }[]
  errors?: DashboardRow[]
}

declare module 'claude-code' {
  interface PluginState {
    pyxis: {
      /** Messages already logged this session. */
      reported: string[]
      /** Messages already shown in a toast this session. */
      toasted: string[]
      session: SessionMemory | null
      /** The banner's handoffs. */
      passations: Passation[]
      isBannerHidden: boolean
      /** Context size at the last measurement, and the session it was measured in: a `/clear` makes it stale. */
      tokens: { id: string; size: number } | null
      isThresholdHidden: boolean
      /** The threshold notice went with a message since the last crossing. */
      isThresholdNoticed: boolean
      dashboard: Dashboard | null
    }
  }
}
