import { Color, Matrix4, Quaternion, Vector3 } from 'three'
import type { Seat } from '../../game/multi/types'

/**
 * Places autour de la table en multijoueur. Chaque client se voit toujours assis au sud (la caméra du jeu solo) ;
 * les autres sont placés relativement à lui, dans l'ordre du tour : à sa gauche (ouest), en face (nord, la place
 * du croupier), à sa droite (est).
 *
 * Deux repères natifs existent dans le code solo : celui du joueur (sud : caméra, plateau, poses « player ») et
 * celui du croupier (nord : le modèle, ses mains, ses poses « dealer »). seatMatrix / dealerMatrix les transportent
 * sur n'importe quelle place.
 */
export type Slot = 0 | 1 | 2 | 3
export const SOUTH: Slot = 0
export const WEST: Slot = 1
export const NORTH: Slot = 2
export const EAST: Slot = 3

/** Places occupées selon le nombre de joueurs (index = écart de siège par rapport à soi). */
const SLOTS: Record<number, Slot[]> = { 2: [0, 2], 3: [0, 1, 3], 4: [0, 1, 2, 3] }

export const slotOf = (seat: Seat, me: Seat, n: number): Slot => SLOTS[n]?.[(seat - me + n) % n] ?? NORTH

/** Centre de la table (room.glb : x -0,86..0,89, z 0,45..1,35). */
const CENTER = new Vector3(0, 0, 0.9)
/**
 * La table est plus longue que large : les bouts (ouest / est) sont 0,42 m plus loin du centre que les côtés
 * (nord / sud). On recule donc d'autant ce qui est transporté sur une place d'un bout.
 */
const END_SHIFT = 0.42
const ANGLE: Record<Slot, number> = { 0: 0, 1: -Math.PI / 2, 2: Math.PI, 3: Math.PI / 2 }
const SHIFT: Record<Slot, number> = { 0: 0, 1: -END_SHIFT, 2: 0, 3: END_SHIFT }

const seatCache = new Map<Slot, Matrix4>()
const dealerCache = new Map<Slot, Matrix4>()

/** Repère du joueur (sud) → place `slot`. */
export function seatMatrix(slot: Slot): Matrix4 {
  let m = seatCache.get(slot)
  if (!m) {
    m = new Matrix4()
      .makeTranslation(CENTER.x + SHIFT[slot], 0, CENTER.z)
      .multiply(new Matrix4().makeRotationY(ANGLE[slot]))
      .multiply(new Matrix4().makeTranslation(-CENTER.x, 0, -CENTER.z))
    seatCache.set(slot, m)
  }
  return m
}

/** Repère du croupier (nord) → place `slot`. Identité au nord. */
export function dealerMatrix(slot: Slot): Matrix4 {
  let m = dealerCache.get(slot)
  if (!m) {
    // nord → sud est un demi-tour autour du centre (sa propre inverse)
    m = seatMatrix(slot).clone().multiply(seatMatrix(NORTH))
    dealerCache.set(slot, m)
  }
  return m
}

/** Rotation seule (autour de la verticale) de la place. */
export const slotYaw = (slot: Slot) => ANGLE[slot]
export const slotQuat = (slot: Slot) => new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), ANGLE[slot])

/** Point du repère croupier transporté sur `slot`. */
export const fromDealer = (slot: Slot, x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(dealerMatrix(slot))

/** Poitrine de celui qui est assis à `slot` (cible du fusil). Sud = nous : sous la caméra. */
export const chestOf = (slot: Slot) => (slot === SOUTH ? new Vector3(0, 1.08, 1.95) : fromDealer(slot, 0, 1.12, 0.12))

/**
 * Centre approximatif (UV écran, origine en bas à gauche) de celui qui est à `slot`, vu de notre place :
 * l'image d'impact (fx.impactCenter) part de là.
 */
export const screenOf = (slot: Slot): [number, number] =>
  slot === NORTH ? [0.5, 0.62] : slot === WEST ? [0.12, 0.58] : slot === EAST ? [0.88, 0.58] : [0.5, 0.5]

/** Couleur de costume de chaque siège (assombrie : la salle est sombre, le costume reste une nuance). */
export const SEAT_COLORS = ['#7a1a14', '#1d3a6b', '#2c5a2a', '#7a5a14'].map((c) => new Color(c))
export const SEAT_CSS = ['#c0392b', '#4a7fd0', '#4f9a4a', '#c99a2e']
