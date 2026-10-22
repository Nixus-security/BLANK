import { tr } from '../../i18n'
import { popShell } from '../chamber'
import { ITEM_IDS } from '../items'
import { randInt, random } from '../rng'
import { generateChamber, MAX_ITEMS } from '../rules'
import type { ItemId } from '../types'
import { MULTI_ITEMS, validTarget } from './items'
import { MAX_PLAYERS, MIN_PLAYERS, type MultiAction, type MultiState, type Seat } from './types'

const clone = (s: MultiState): MultiState => structuredClone(s)
const aliveSeats = (s: MultiState) => s.alive.flatMap((a, i) => (a ? [i] : []))
const needsReload = (s: MultiState) => !s.chamber.some(Boolean)

/** Recharge le fusil et distribue 1 à 3 objets à chaque joueur vivant (mute le draft). */
function reload(s: MultiState) {
  const { chamber, announced } = generateChamber()
  s.chamber = chamber
  s.announced = announced
  s.remaining = { ...announced }
  s.known.fill(null)
  s.load += 1
  const n = randInt(1, 3)
  for (const seat of aliveSeats(s)) {
    for (let i = 0; i < n && s.inventory[seat].length < MAX_ITEMS; i++) {
      s.inventory[seat].push(ITEM_IDS[Math.floor(random() * ITEM_IDS.length)])
    }
  }
  s.log.push(tr(`— Chargement ${s.load} : ${announced.live} réelle(s), ${announced.blank} à blanc —`, `— Load ${s.load}: ${announced.live} live, ${announced.blank} blank —`))
}

/** `names` : 2 à 4 pseudos, dans l'ordre des sièges (= ordre de jeu). */
export function createMultiGame(names: string[], maxHp = 4): MultiState {
  if (names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) throw new Error(`${MIN_PLAYERS} à ${MAX_PLAYERS} joueurs`)
  const n = names.length
  const s: MultiState = {
    phase: 'playing',
    winner: null,
    turn: randInt(0, n - 1),
    maxHp,
    names: [...names],
    hp: Array<number>(n).fill(maxHp),
    alive: Array<boolean>(n).fill(true),
    chamber: [],
    announced: { live: 0, blank: 0 },
    remaining: { live: 0, blank: 0 },
    known: Array(n).fill(null),
    inventory: Array.from({ length: n }, () => [] as ItemId[]),
    sawed: Array<boolean>(n).fill(false),
    cuffed: Array<boolean>(n).fill(false),
    load: 0,
    log: [],
    id: Math.floor(Math.random() * 2 ** 31),
    seq: 0,
    last: null,
  }
  reload(s)
  return s
}

/** Marque les morts (PV ≤ 0), vide leurs affaires, désigne le gagnant s'il ne reste qu'un joueur. */
function resolveDeaths(s: MultiState) {
  for (let i = 0; i < s.alive.length; i++) {
    if (!s.alive[i] || s.hp[i] > 0) continue
    s.hp[i] = 0
    s.alive[i] = false
    s.inventory[i] = []
    s.sawed[i] = s.cuffed[i] = false
    s.known[i] = null
    s.log.push(tr(`${s.names[i]} est à terre.`, `${s.names[i]} is down.`))
  }
  const left = aliveSeats(s)
  if (left.length <= 1) {
    s.phase = 'gameOver'
    s.winner = left[0] ?? null
    if (left.length === 1) s.log.push(tr(`${s.names[left[0]]} est le dernier debout.`, `${s.names[left[0]]} is the last one standing.`))
  }
}

/**
 * Passe la main au joueur vivant suivant ; les menottés sautent leur tour (et sont libérés).
 * 2 tours de table : si `from` vient de mourir et que tous les autres étaient menottés, le premier libéré joue.
 */
function passTurn(s: MultiState, from: Seat) {
  const n = s.alive.length
  for (let k = 1; k <= 2 * n; k++) {
    const seat = (from + k) % n
    if (!s.alive[seat]) continue
    if (s.cuffed[seat]) {
      s.cuffed[seat] = false
      s.log.push(tr(`${s.names[seat]} est menotté : il passe son tour.`, `${s.names[seat]} is handcuffed: skips their turn.`))
      continue
    }
    s.turn = seat
    return
  }
}

/** Tire sur `target` (soi-même compris). Fonction pure : nouvel état, ou le même si coup illégal. */
export function shootMulti(state: MultiState, shooter: Seat, target: Seat): MultiState {
  if (state.phase !== 'playing' || state.turn !== shooter || !state.alive[target] || state.chamber.length === 0) return state
  const s = clone(state)
  const shell = popShell(s)
  s.known.fill(null)
  const self = shooter === target
  const dmg = s.sawed[shooter] ? 2 : 1
  s.sawed[shooter] = false
  s.seq += 1
  s.last = { kind: 'shoot', shooter, target, live: shell, dmg }
  const who = self ? tr('lui-même', 'themself') : s.names[target]
  if (shell) {
    s.hp[target] -= dmg
    s.log.push(tr(`${s.names[shooter]} tire sur ${who} : BANG (-${dmg} PV).`, `${s.names[shooter]} shoots ${who}: BANG (-${dmg} HP).`))
  } else {
    s.log.push(tr(`${s.names[shooter]} tire sur ${who} : clic (à blanc).`, `${s.names[shooter]} shoots ${who}: click (blank).`))
  }
  resolveDeaths(s)
  if (s.phase === 'gameOver') return s
  // auto-tir à blanc : on garde la main
  if (!(self && !shell)) passTurn(s, shooter)
  if (needsReload(s)) reload(s)
  return s
}

/** Utilise l'objet `index` de l'inventaire de `user`. `target` requis pour menottes/adrénaline. */
export function useItemMulti(state: MultiState, user: Seat, index: number, target?: Seat): MultiState {
  if (state.phase !== 'playing' || state.turn !== user) return state
  const id = state.inventory[user][index]
  if (!id) return state
  const def = MULTI_ITEMS[id]
  const t = def.needsTarget ? target : undefined
  if (def.needsTarget && !validTarget(state, user, t)) return state
  if (!def.canUse(state, user, t)) return state
  const s = clone(state)
  s.inventory[user].splice(index, 1)
  const hp0 = s.hp[user]
  const shell0 = s.chamber[0]
  s.log.push(def.use(s, user, t))
  s.seq += 1
  s.last = { kind: 'item', user, id, ...(t !== undefined ? { target: t } : {}) }
  if (id === 'beer') s.last.shell = shell0
  if (t !== undefined && id === 'adrenaline') {
    // l'objet volé : celui qui manque à la cible
    const left = [...s.inventory[t]]
    for (const x of state.inventory[t]) {
      const k = left.indexOf(x)
      if (k >= 0) left.splice(k, 1)
      else {
        s.last.stolen = x
        if (x === 'beer') s.last.shell = shell0
        break
      }
    }
  }
  const healed = s.hp[user] > hp0
  if (id === 'pills' || s.last.stolen === 'pills') s.last.good = healed
  resolveDeaths(s) // pilules (ou objet volé) : peut tuer
  if (s.phase === 'gameOver') return s
  if (!s.alive[user]) passTurn(s, user)
  if (needsReload(s)) reload(s) // bière sur la dernière balle
  return s
}

/** Abandon (déconnexion) : le joueur est éliminé, la main passe si c'était à lui. */
export function forfeitMulti(state: MultiState, seat: Seat): MultiState {
  if (state.phase !== 'playing' || !state.alive[seat]) return state
  const s = clone(state)
  s.hp[seat] = 0
  s.seq += 1
  s.last = { kind: 'forfeit', seat }
  s.log.push(tr(`${s.names[seat]} a quitté la table.`, `${s.names[seat]} left the table.`))
  resolveDeaths(s)
  if (s.phase === 'playing' && s.turn === seat) passTurn(s, seat)
  return s
}

/** Point d'entrée réseau : l'hôte applique l'action reçue du siège `seat`. */
export function applyAction(s: MultiState, seat: Seat, a: MultiAction): MultiState {
  return a.type === 'shoot' ? shootMulti(s, seat, a.target) : useItemMulti(s, seat, a.index, a.target)
}

/**
 * Vue envoyée à un client : chargeur masqué, loupes des autres masquées.
 * Reste public : PV, objets, scie, menottes, décompte des balles restantes, journal.
 */
export function viewFor(s: MultiState, seat: Seat): MultiState {
  const v = clone(s)
  v.chamber = []
  v.known = v.known.map((k, i) => (i === seat ? k : null))
  return v
}
