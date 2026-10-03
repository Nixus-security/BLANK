import type { Actor, ItemId } from '../game/types'

/** Durées (s) de la mise en scène de chaque objet, et instant où l'effet est appliqué à l'état du jeu. */
export const ACTS: Record<ItemId, { dur: number; apply: number }> = {
  handcuffs: { dur: 3.4, apply: 2.3 },
  saw: { dur: 4.4, apply: 3.2 },
  loupe: { dur: 4.2, apply: 1.9 },
  beer: { dur: 4.4, apply: 3.0 },
  cigarette: { dur: 4.6, apply: 3.2 },
  pills: { dur: 4.2, apply: 2.9 },
  adrenaline: { dur: 4.0, apply: 4.0 }, // pas d'effet propre : c'est l'objet volé qui s'applique (voir director.ts)
  inverter: { dur: 4.0, apply: 2.5 },
}

/** Vitesse des animations d'objets par partie : normale en partie 1, plus rapide en 2, encore plus en 3. */
export const ACT_SPEED = [1, 1.45, 2]

/** Mise en scène en cours (mutée par le réalisateur, lue chaque frame par ItemProps, Shotgun, DealerRig…). */
export interface ActState {
  id: ItemId
  user: Actor
  /** performance.now() au début */
  start: number
  dur: number
  apply: number
  /** Facteur de vitesse (voir ACT_SPEED) : le temps de la mise en scène s'écoule « speed » fois plus vite. */
  speed: number
  /** Objet volé par l'adrénaline : il part de la place de l'adversaire (plateau du joueur ou poche du croupier). */
  stolen: boolean
  /** Bière : la balle éjectée est réelle ? Loupe : la balle de la chambre est réelle ? (null = inconnu / secret) */
  shell: boolean | null
  /** Pilules : bon résultat (+PV) ? */
  good: boolean
}

