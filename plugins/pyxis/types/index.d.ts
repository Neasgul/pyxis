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
}

/** What pyxis remembers of the current session; a new session id starts it over. */
export type SessionMemory = {
  id: string
  /** The start block went with a message since the session began or was compacted. */
  isPrimed: boolean
  /** How many messages the model read at the last message: fewer now means a compaction. */
  transcript: number
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
      /** Context size at the last measurement, the threshold for the model's window then, and the session it was measured in: a `/clear` makes it stale. */
      tokens: { id: string; size: number; threshold: number } | null
      isThresholdHidden: boolean
      /** The threshold notice went with a message since the last crossing. */
      isThresholdNoticed: boolean
    }
  }
}
