import type { Shell } from './types'

/** Retire la prochaine balle et met à jour le décompte public (état 1v1 ou multi). */
export function popShell(s: { chamber: Shell[]; remaining: { live: number; blank: number } }): Shell {
  const shell = s.chamber.shift()!
  if (shell) s.remaining.live -= 1
  else s.remaining.blank -= 1
  return shell
}
