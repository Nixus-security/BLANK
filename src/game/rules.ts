import { tr } from '../i18n'
import { popShell } from './chamber'
import { ITEMS, ITEM_IDS } from './items'
import { randInt, random, shuffle } from './rng'
import type { Actor, GameState, ItemId, Shell } from './types'

export const MAX_ITEMS = 8
export const other = (a: Actor): Actor => (a === 'player' ? 'dealer' : 'player')
const name = (a: Actor) => (a === 'player' ? tr('Tu', 'You') : tr('Le croupier', 'The dealer'))

/** 2 à 8 balles, au moins 1 réelle et 1 à blanc. */
export function generateChamber() {
  const total = randInt(2, 8)
  const live = Math.min(total - 1, Math.max(1, Math.round(total / 2) + randInt(-1, 1)))
  const blank = total - live
  const chamber: Shell[] = shuffle([...Array<Shell>(live).fill(true), ...Array<Shell>(blank).fill(false)])
  return { chamber, announced: { live, blank } }
}

function dealItems(inv: ItemId[], n: number) {
  for (let i = 0; i < n && inv.length < MAX_ITEMS; i++) {
    inv.push(ITEM_IDS[Math.floor(random() * ITEM_IDS.length)])
  }
}

/** Chambre vide, ou ne contenant plus que des balles à blanc : plus rien à tirer, on recharge. */
const needsReload = (s: GameState) => !s.chamber.some(Boolean)

/** Recharge le fusil et distribue des objets (mute le draft). */
function reload(s: GameState) {
  const { chamber, announced } = generateChamber()
  s.chamber = chamber
  s.announced = announced
  s.remaining = { ...announced }
  s.known = { player: null, dealer: null }
  s.load += 1
  const n = randInt(1, 3)
  dealItems(s.inventory.player, n)
  dealItems(s.inventory.dealer, n)
  s.log.push(tr(`— Chargement ${s.load} : ${announced.live} réelle(s), ${announced.blank} à blanc —`, `— Load ${s.load}: ${announced.live} live, ${announced.blank} blank —`))
}

export function createGame(maxHp = 3, level = 1): GameState {
  const s: GameState = {
    phase: 'playing',
    winner: null,
    turn: 'player',
    maxHp,
    level,
    hp: { player: maxHp, dealer: maxHp },
    chamber: [],
    announced: { live: 0, blank: 0 },
    remaining: { live: 0, blank: 0 },
    known: { player: null, dealer: null },
    inventory: { player: [], dealer: [] },
    sawed: { player: false, dealer: false },
    cuffed: { player: false, dealer: false },
    load: 0,
    log: [],
  }
  reload(s)
  return s
}

const clone = (s: GameState): GameState => structuredClone(s)

/** Tire. Fonction pure : renvoie un nouvel état (ou le même si coup illégal). */
export function shoot(state: GameState, shooter: Actor, target: Actor): GameState {
  if (state.phase !== 'playing' || state.turn !== shooter || state.chamber.length === 0) return state
  const s = clone(state)
  const shell = popShell(s)
  s.known = { player: null, dealer: null }
  const self = shooter === target
  const targetLabel = self
    ? shooter === 'player' ? tr('toi-même', 'yourself') : tr('lui-même', 'himself')
    : target === 'player' ? tr('toi', 'you') : tr('le croupier', 'the dealer')
  const fires = shooter === 'player' ? 'shoot' : 'shoots'

  const dmg = s.sawed[shooter] ? 2 : 1
  s.sawed[shooter] = false
  if (shell) {
    s.hp[target] -= dmg
    s.log.push(tr(`${name(shooter)} tire sur ${targetLabel} : BANG (-${dmg} PV).`, `${name(shooter)} ${fires} ${targetLabel}: BANG (-${dmg} HP).`))
  } else {
    s.log.push(tr(`${name(shooter)} tire sur ${targetLabel} : clic (à blanc).`, `${name(shooter)} ${fires} ${targetLabel}: click (blank).`))
  }

  if (s.hp[target] <= 0) {
    s.phase = 'gameOver'
    s.winner = other(target)
    s.log.push(s.winner === 'player' ? tr('Le croupier est à terre. Tu gagnes.', 'The dealer is down. You win.') : tr('Tu es mort.', 'You are dead.'))
    return s
  }

  // Auto-tir à blanc : on garde la main. Tous les autres cas : tour adverse.
  if (!(self && !shell)) {
    const next = other(shooter)
    if (s.cuffed[next]) {
      // l'adversaire menotté saute son tour : la main reste au tireur
      s.cuffed[next] = false
      s.log.push(next === 'player' ? tr('Tu es menotté : tu passes ton tour.', 'You are handcuffed: you skip your turn.') : tr('Le croupier est menotté : il passe son tour.', 'The dealer is handcuffed: he skips his turn.'))
    } else {
      s.turn = next
    }
  }

  if (needsReload(s)) reload(s)
  return s
}

export function useItem(state: GameState, user: Actor, index: number): GameState {
  if (state.phase !== 'playing' || state.turn !== user) return state
  const id = state.inventory[user][index]
  if (!id || !ITEMS[id].canUse(state, user)) return state
  const s = clone(state)
  s.inventory[user].splice(index, 1)
  s.log.push(ITEMS[id].use(s, user))
  // pilules (ou objet volé) : peut tuer
  for (const a of ['player', 'dealer'] as const) {
    if (s.hp[a] <= 0 && s.phase === 'playing') {
      s.phase = 'gameOver'
      s.winner = other(a)
      s.log.push(a === 'player' ? tr('Tu es mort.', 'You are dead.') : tr('Le croupier est à terre. Tu gagnes.', 'The dealer is down. You win.'))
    }
  }
  if (s.phase === 'playing' && needsReload(s)) reload(s) // bière sur la dernière balle
  return s
}
