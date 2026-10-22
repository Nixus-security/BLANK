import { tr } from '../../i18n'
import { popShell } from '../chamber'
import { random } from '../rng'
import type { ItemId } from '../types'
import type { MultiItemDef, MultiState, Seat } from './types'

const shellWord = (live: boolean) => (live ? tr('RÉELLE', 'LIVE') : tr('À BLANC', 'BLANK'))
const clearKnown = (s: MultiState) => s.known.fill(null)
export const validTarget = (s: MultiState, user: Seat, target: Seat | undefined): target is Seat =>
  target !== undefined && target !== user && s.alive[target] === true

/** Mêmes objets que le 1v1 (labels/descriptions : ITEMS dans ../items.ts), règles adaptées à N joueurs. */
export const MULTI_ITEMS: Record<ItemId, MultiItemDef> = {
  beer: {
    needsTarget: false,
    canUse: (s) => s.chamber.length > 0,
    use: (s, user) => {
      const shell = popShell(s)
      clearKnown(s)
      return tr(`${s.names[user]} éjecte une balle ${shellWord(shell)}.`, `${s.names[user]} ejects a ${shellWord(shell)} shell.`)
    },
  },
  loupe: {
    needsTarget: false,
    canUse: (s, user) => s.chamber.length > 0 && s.known[user] === null,
    use: (s, user) => {
      s.known[user] = s.chamber[0]
      // le journal est public : la balle n'y figure pas
      return tr(`${s.names[user]} inspecte la chambre.`, `${s.names[user]} inspects the chamber.`)
    },
  },
  cigarette: {
    needsTarget: false,
    canUse: (s, user) => s.hp[user] < s.maxHp,
    use: (s, user) => {
      s.hp[user] = Math.min(s.maxHp, s.hp[user] + 1)
      return tr(`${s.names[user]} fume une cigarette (+1 PV).`, `${s.names[user]} smokes a cigarette (+1 HP).`)
    },
  },
  saw: {
    needsTarget: false,
    canUse: (s, user) => !s.sawed[user] && s.chamber.length > 0,
    use: (s, user) => {
      s.sawed[user] = true
      return tr(`${s.names[user]} scie le canon : le prochain tir fera 2 dégâts.`, `${s.names[user]} saws off the barrel: the next shot will deal 2 damage.`)
    },
  },
  handcuffs: {
    needsTarget: true,
    canUse: (s, user, target) =>
      target === undefined
        ? s.alive.some((_, i) => validTarget(s, user, i) && !s.cuffed[i])
        : validTarget(s, user, target) && !s.cuffed[target],
    use: (s, user, target) => {
      s.cuffed[target!] = true
      return tr(`${s.names[user]} menotte ${s.names[target!]}.`, `${s.names[user]} handcuffs ${s.names[target!]}.`)
    },
  },
  pills: {
    needsTarget: false,
    canUse: (s, user) => s.hp[user] < s.maxHp,
    use: (s, user) => {
      if (random() < 0.5) {
        const before = s.hp[user]
        s.hp[user] = Math.min(s.maxHp, before + 2)
        return tr(`${s.names[user]} avale des pilules : +${s.hp[user] - before} PV.`, `${s.names[user]} swallows pills: +${s.hp[user] - before} HP.`)
      }
      s.hp[user] -= 1
      return tr(`${s.names[user]} avale des pilules périmées : -1 PV.`, `${s.names[user]} swallows expired pills: -1 HP.`)
    },
  },
  adrenaline: {
    needsTarget: true,
    // l'objet volé est utilisé sur la même cible (menottes volées → menottes sur `target`)
    canUse: (s, user, target) =>
      target === undefined
        ? s.alive.some((_, i) => validTarget(s, user, i) && MULTI_ITEMS.adrenaline.canUse(s, user, i))
        : validTarget(s, user, target) && s.inventory[target].some((id) => id !== 'adrenaline' && MULTI_ITEMS[id].canUse(s, user, target)),
    use: (s, user, target) => {
      const pool = s.inventory[target!]
        .map((id, i) => ({ id, i }))
        .filter(({ id }) => id !== 'adrenaline' && MULTI_ITEMS[id].canUse(s, user, target))
      const pick = pool[Math.floor(random() * pool.length)]
      s.inventory[target!].splice(pick.i, 1)
      const used = MULTI_ITEMS[pick.id].use(s, user, target)
      return tr(`${s.names[user]} s'injecte de l'adrénaline et vole un objet à ${s.names[target!]}. ${used}`, `${s.names[user]} injects adrenaline and steals an item from ${s.names[target!]}. ${used}`)
    },
  },
  inverter: {
    needsTarget: false,
    canUse: (s) => s.chamber.length > 0,
    use: (s, user) => {
      const was = s.chamber[0]
      s.chamber[0] = !was
      if (was) {
        s.remaining.live -= 1
        s.remaining.blank += 1
      } else {
        s.remaining.blank -= 1
        s.remaining.live += 1
      }
      // toute connaissance de la balle en chambre est inversée aussi
      s.known = s.known.map((k) => (k === null ? null : !k))
      return tr(`${s.names[user]} actionne l'inverseur : la balle change de polarité.`, `${s.names[user]} triggers the inverter: the shell flips polarity.`)
    },
  },
}
