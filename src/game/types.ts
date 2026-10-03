export type Actor = 'player' | 'dealer'
/** true = balle réelle, false = balle à blanc */
export type Shell = boolean
export type ItemId = 'beer' | 'loupe' | 'cigarette' | 'saw' | 'handcuffs' | 'pills' | 'adrenaline' | 'inverter'
export type Phase = 'playing' | 'gameOver'

export interface GameState {
  phase: Phase
  winner: Actor | null
  turn: Actor
  maxHp: number
  /** Niveau de l'IA du croupier (1 = partie 1, 3 = partie 3). */
  level: number
  hp: Record<Actor, number>
  /** Chargeur : index 0 = prochaine balle. Ordre caché à l'UI/IA. */
  chamber: Shell[]
  /** Comptes révélés au début du chargement */
  announced: { live: number; blank: number }
  /** Décompte public des balles restantes (annoncé - déjà sorties) */
  remaining: { live: number; blank: number }
  /** Balle courante connue (loupe), par acteur */
  known: Record<Actor, Shell | null>
  inventory: Record<Actor, ItemId[]>
  /** Scie : le prochain tir de cet acteur inflige 2 dégâts. */
  sawed: Record<Actor, boolean>
  /** Menotté : cet acteur sautera son prochain tour. */
  cuffed: Record<Actor, boolean>
  load: number
  log: string[]
}

export interface ItemDef {
  id: ItemId
  label: string
  description: string
  /** Mute le draft, renvoie le message de log. */
  use: (s: GameState, user: Actor) => string
  /** False si l'objet est inutile (chargeur vide, PV max...) : sert à l'IA et à l'UI. */
  canUse: (s: GameState, user: Actor) => boolean
}
