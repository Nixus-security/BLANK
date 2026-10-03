import { tr } from '../i18n'
import { popShell } from './chamber'
import { random } from './rng'
import type { Actor, ItemDef, ItemId } from './types'

/** Sujet de la phrase du journal : « Tu » / « Le croupier » (« You » / « The dealer »). */
const who = (a: Actor) => (a === 'player' ? tr('Tu', 'You') : tr('Le croupier', 'The dealer'))
/** Verbe anglais à la bonne personne : « You eject » / « The dealer ejects ». */
const s3 = (a: Actor, verb: string) => (a === 'player' ? verb : `${verb}s`)
const opp = (a: Actor): Actor => (a === 'player' ? 'dealer' : 'player')
const shellWord = (live: boolean) => (live ? tr('RÉELLE', 'LIVE') : tr('À BLANC', 'BLANK'))

/**
 * Registre extensible : ajouter un objet = ajouter son id dans ItemId + une entrée ici
 * (+ un noeud dans inventaire.glb pour le plateau 3D : voir Tray.tsx).
 * `use` mute le draft d'état et renvoie le message de journal ; il ne doit dépendre que de l'état et de rng.ts.
 * Les textes (nom, description, journal) suivent la langue choisie (i18n.ts).
 */
export const ITEMS: Record<ItemId, ItemDef> = {
  beer: {
    id: 'beer',
    get label() {
      return tr('Bière', 'Beer')
    },
    get description() {
      return tr('Éjecte la balle en chambre sans tirer.', 'Ejects the shell in the chamber without firing.')
    },
    canUse: (s) => s.chamber.length > 0,
    use: (s, user) => {
      const shell = popShell(s)
      s.known = { player: null, dealer: null }
      return tr(`${who(user)} éjecte une balle ${shellWord(shell)}.`, `${who(user)} ${s3(user, 'eject')} a ${shellWord(shell)} shell.`)
    },
  },
  loupe: {
    id: 'loupe',
    get label() {
      return tr('Loupe', 'Magnifier')
    },
    get description() {
      return tr('Révèle la balle en chambre.', 'Reveals the shell in the chamber.')
    },
    canUse: (s, user) => s.chamber.length > 0 && s.known[user] === null,
    use: (s, user) => {
      s.known[user] = s.chamber[0]
      return user === 'player'
        ? tr(`Tu regardes la chambre : balle ${shellWord(s.chamber[0])}.`, `You look into the chamber: ${shellWord(s.chamber[0])} shell.`)
        : tr('Le croupier inspecte la chambre.', 'The dealer inspects the chamber.')
    },
  },
  cigarette: {
    id: 'cigarette',
    get label() {
      return tr('Cigarette', 'Cigarette')
    },
    get description() {
      return tr('Soigne 1 PV.', 'Heals 1 HP.')
    },
    canUse: (s, user) => s.hp[user] < s.maxHp,
    use: (s, user) => {
      s.hp[user] = Math.min(s.maxHp, s.hp[user] + 1)
      return tr(`${who(user)} fume une cigarette (+1 PV).`, `${who(user)} ${s3(user, 'smoke')} a cigarette (+1 HP).`)
    },
  },
  saw: {
    id: 'saw',
    get label() {
      return tr('Scie', 'Saw')
    },
    get description() {
      return tr('Le prochain tir inflige 2 dégâts.', 'The next shot deals 2 damage.')
    },
    canUse: (s, user) => !s.sawed[user] && s.chamber.length > 0,
    use: (s, user) => {
      s.sawed[user] = true
      return tr(`${who(user)} scie le canon : le prochain tir fera 2 dégâts.`, `${who(user)} ${s3(user, 'saw')} off the barrel: the next shot will deal 2 damage.`)
    },
  },
  handcuffs: {
    id: 'handcuffs',
    get label() {
      return tr('Menottes', 'Handcuffs')
    },
    get description() {
      return tr("L'adversaire saute son prochain tour.", 'The opponent skips their next turn.')
    },
    canUse: (s, user) => !s.cuffed[opp(user)],
    use: (s, user) => {
      s.cuffed[opp(user)] = true
      return user === 'player'
        ? tr('Tu menottes le croupier.', 'You handcuff the dealer.')
        : tr('Le croupier te passe les menottes.', 'The dealer handcuffs you.')
    },
  },
  pills: {
    id: 'pills',
    get label() {
      return tr('Pilules', 'Pills')
    },
    get description() {
      return tr('Quitte ou double : 50 % +2 PV, 50 % -1 PV.', 'Double or nothing: 50% +2 HP, 50% -1 HP.')
    },
    canUse: (s, user) => s.hp[user] < s.maxHp,
    use: (s, user) => {
      if (random() < 0.5) {
        const before = s.hp[user]
        s.hp[user] = Math.min(s.maxHp, before + 2)
        return tr(`${who(user)} avale des pilules : +${s.hp[user] - before} PV.`, `${who(user)} ${s3(user, 'swallow')} pills: +${s.hp[user] - before} HP.`)
      }
      s.hp[user] -= 1
      return tr(`${who(user)} avale des pilules périmées : -1 PV.`, `${who(user)} ${s3(user, 'swallow')} expired pills: -1 HP.`)
    },
  },
  adrenaline: {
    id: 'adrenaline',
    get label() {
      return tr('Adrénaline', 'Adrenaline')
    },
    get description() {
      return tr("Vole un objet utilisable de l'adversaire (au hasard) et l'utilise aussitôt.", 'Steals a usable item from the opponent (at random) and uses it at once.')
    },
    canUse: (s, user) => s.inventory[opp(user)].some((id) => id !== 'adrenaline' && ITEMS[id].canUse(s, user)),
    use: (s, user) => {
      const pool = s.inventory[opp(user)]
        .map((id, i) => ({ id, i }))
        .filter(({ id }) => id !== 'adrenaline' && ITEMS[id].canUse(s, user))
      const pick = pool[Math.floor(random() * pool.length)]
      s.inventory[opp(user)].splice(pick.i, 1)
      const stolen = ITEMS[pick.id].label.toLowerCase()
      return tr(
        `${who(user)} s'injecte de l'adrénaline et vole : ${stolen}. ${ITEMS[pick.id].use(s, user)}`,
        `${who(user)} ${s3(user, 'inject')} adrenaline and ${s3(user, 'steal')}: ${stolen}. ${ITEMS[pick.id].use(s, user)}`,
      )
    },
  },
  inverter: {
    id: 'inverter',
    get label() {
      return tr('Inverseur', 'Inverter')
    },
    get description() {
      return tr('Inverse la polarité de la balle en chambre (réelle ⇄ à blanc).', 'Flips the polarity of the shell in the chamber (live ⇄ blank).')
    },
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
      for (const a of ['player', 'dealer'] as const) if (s.known[a] !== null) s.known[a] = !s.known[a]
      return tr(`${who(user)} actionne l'inverseur : la balle change de polarité.`, `${who(user)} ${s3(user, 'trigger')} the inverter: the shell flips polarity.`)
    },
  },
}

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[]
