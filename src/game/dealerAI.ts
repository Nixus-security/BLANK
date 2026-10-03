import { ITEMS } from './items'
import { other } from './rules'
import type { Actor, GameState, ItemId } from './types'

export type DealerAction = { type: 'item'; index: number } | { type: 'shoot'; target: Actor }

/**
 * IA du croupier. N'utilise que l'info publique (remaining, known.dealer, inventaires) : jamais chamber.
 * 1. Soins (cigarette ; pilules si très blessé). 2. Loupe si balle inconnue. 3. Adrénaline (vol d'objet).
 * 4. Balle connue à blanc + inverseur -> inverse. 5. Choix de cible : connue, sinon probabilité.
 * 6. S'il vise le joueur : scie puis menottes avant de tirer.
 * Niveaux (s.level, un par partie) : 1 = ci-dessus. 2 = n'use sa scie que sur une balle sûre et un joueur à 2 PV ou plus.
 * 3 = en plus, à 1 PV il ne se tire plus dessus quand le risque est trop haut (il tire sur le joueur) et il éjecte la balle à la bière.
 */
export function decideDealer(s: GameState): DealerAction {
  const me: Actor = 'dealer'
  const inv = s.inventory[me]
  const use = (id: ItemId): DealerAction | null => {
    const index = inv.findIndex((i) => i === id && ITEMS[id].canUse(s, me))
    return index >= 0 ? { type: 'item', index } : null
  }

  const known = s.known[me]

  const level = s.level ?? 1
  const { live, blank } = s.remaining
  const pLive = live + blank > 0 ? live / (live + blank) : 0

  const early =
    use('cigarette') ??
    (s.hp[me] > 1 && s.hp[me] <= s.maxHp - 2 ? use('pills') : null) ??
    (known === null ? use('loupe') : null) ??
    use('adrenaline') ??
    (known === false ? use('inverter') : null) ??
    // niveau 3, à 1 PV, balle inconnue et risquée (30 à 50 % de réelles : sinon il tire sur le joueur) : il l'éjecte plutôt que de jouer sa vie
    (level >= 3 && s.hp[me] === 1 && known === null && pLive >= 0.3 && pLive < 0.5 ? use('beer') : null)
  if (early) return early

  let target: Actor
  if (known !== null) target = known ? other(me) : me
  else if (blank === 0) target = other(me)
  else if (live === 0) target = me
  else if (live > blank) target = other(me)
  else if (live < blank) target = level >= 3 && s.hp[me] === 1 && pLive >= 0.34 ? other(me) : me
  else target = other(me) // 50/50 : on ne se risque pas à mourir

  if (target === other(me)) {
    // niveau 2+ : la scie ne sert que sur une balle sûre, et pas si le joueur est déjà à 1 PV
    const sawWorth = level < 2 || ((known === true || blank === 0) && s.hp[other(me)] >= 2)
    const pre = (sawWorth ? use('saw') : null) ?? use('handcuffs')
    if (pre) return pre
  }
  return { type: 'shoot', target }
}
