// The session's git repository.
import type { EngineInterface } from 'claude-code'

/** The root of the main checkout of the git repository holding `cwd`: a worktree counts for its repository. */
export async function repoRoot($: EngineInterface, cwd: string): Promise<string | undefined> {
  const r = await $.process
    .run(['git', '-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'])
    .catch(() => null)
  const common = r?.exitCode === 0 ? r.stdout.trim() : ''

  return common ? common.replace(/\/[^/]+\/?$/, '') : undefined
}
