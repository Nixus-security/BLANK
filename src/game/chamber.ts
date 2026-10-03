import type { GameState, Shell } from './types'

/** Retire la prochaine balle et met à jour le décompte public. */
export function popShell(s: GameState): Shell {
  const shell = s.chamber.shift()!
  if (shell) s.remaining.live -= 1
  else s.remaining.blank -= 1
  return shell
}
