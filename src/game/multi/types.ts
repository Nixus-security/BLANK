import type { ItemId, Shell } from '../types'

/** Index de siège (0 à MAX_PLAYERS-1). Les tableaux de l'état sont indexés par siège. */
export type Seat = number
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4

/**
 * Partie multijoueur : 2 à 4 humains, chacun pour soi, dernier vivant gagne.
 * Le croupier n'est pas un participant. L'état complet n'existe que chez l'hôte :
 * les clients reçoivent `viewFor(state, seat)` (chargeur et loupes des autres masqués).
 */
export interface MultiState {
  phase: 'playing' | 'gameOver'
  winner: Seat | null
  /** Siège qui a la main. */
  turn: Seat
  maxHp: number
  names: string[]
  hp: number[]
  alive: boolean[]
  /** Chargeur : index 0 = prochaine balle. Vide dans une vue client. */
  chamber: Shell[]
  announced: { live: number; blank: number }
  /** Décompte public des balles restantes. */
  remaining: { live: number; blank: number }
  /** Balle courante connue (loupe), par siège. Privé. */
  known: (Shell | null)[]
  inventory: ItemId[][]
  sawed: boolean[]
  cuffed: boolean[]
  load: number
  log: string[]
  /** Identifiant de la partie (change à chaque nouvelle partie / revanche). */
  id: number
  /** Numéro de la dernière action appliquée : les clients rejouent chaque action une par une. */
  seq: number
  /** Dernière action (public : rien de privé, la loupe ne révèle pas sa balle ici). */
  last: MultiEvent | null
}

/** Ce qui vient de se passer, pour que chaque client puisse le mettre en scène. */
export type MultiEvent =
  | { kind: 'shoot'; shooter: Seat; target: Seat; live: boolean; dmg: number }
  | {
      kind: 'item'
      user: Seat
      id: ItemId
      target?: Seat
      /** Adrénaline : l'objet volé à `target` (et aussitôt utilisé). */
      stolen?: ItemId
      /** Bière : la balle éjectée (publique, elle tombe sur la table). */
      shell?: boolean
      /** Pilules : +PV ? */
      good?: boolean
    }
  | { kind: 'forfeit'; seat: Seat }

export interface MultiItemDef {
  /** Demande un siège cible (menottes, adrénaline). */
  needsTarget: boolean
  /** Sans `target` pour un objet ciblé : « existe-t-il une cible valide ? » (UI). */
  canUse: (s: MultiState, user: Seat, target?: Seat) => boolean
  /** Mute le draft, renvoie le message de journal (public : ne doit rien révéler de privé). */
  use: (s: MultiState, user: Seat, target?: Seat) => string
}

export type MultiAction =
  | { type: 'shoot'; target: Seat }
  | { type: 'item'; index: number; target?: Seat }
