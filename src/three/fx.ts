import type { ActState } from './itemActs'

/** Effets transitoires (mutés hors React, lus chaque frame par la caméra, le fusil et le post-traitement). */
export const fx = {
  flash: 0,
  flashColor: [1, 1, 1] as readonly [number, number, number],
  /** Traumatisme de la caméra (0 = calme, ~2,5 = secousse maximale) : secousse en translation et rotation, retombe en ~1 s. */
  shake: 0,
  /** Impulsion de coup sec (recul : le regard monte, la tête part en arrière puis oscille), consommée par la caméra. */
  snap: 0,
  recoil: 0,
  muzzle: 0,
  /** Impulsion de coup reçu par le croupier (consommée par DealerRig). */
  dealerHit: 0,
  /** Impact frame : secondes écoulées depuis le tir, -1 = inactif. */
  impactT: -1,
  /** Transition titre -> partie : secondes écoulées depuis le clic sur JOUER, -1 = inactive. */
  transT: -1,
  /** Debug : >= 0 fige la transition à cet instant. */
  transHold: -1,
  /** Instant (ms, performance.now) du clic sur JOUER : la transition suit l'horloge murale, comme les timers du réalisateur. */
  transStart: -1,
  /** Debug : >= 0 fige l'impact frame à cet instant (ex. fx.impactHold = 0.05 dans la console). */
  impactHold: -1,
  /** Centre de l'impact en UV écran (origine en bas à gauche). */
  impactCenter: [0.5, 0.5] as readonly [number, number],
  impactColor: [1, 1, 1] as readonly [number, number, number],
  /** Coup de zoom (FOV) au moment du choc. */
  kick: 0,
  /** Entrée dans la salle après le contrat : instant (ms, performance.now) du début de la marche, -1 = inactive. */
  entranceStart: -1,
  /** Apparition du croupier hors de l'obscurité : 0 = invisible (noir), 1 = visible. */
  dealerReveal: 1,
  /** Scène du néant (fin du jeu) : instant (ms, performance.now) du début, -1 = inactive. */
  endStart: -1,
  /** Cinématique d'explication : caméra dirigée (position et point visé, en m) quand `on`. */
  cine: { on: false, pos: [0, 0, 0] as [number, number, number], aim: [0, 0, 0] as [number, number, number] },
  /** Lumière de mise en valeur d'un objet (cinématique) : s'allume au-dessus de (x, y, z) quand `on`. */
  focus: { on: false, x: 0, y: 0, z: 0 },
  /** Utilisation d'un objet en cours (joueur ou croupier) : voir itemActs.ts et ItemProps.tsx. */
  act: null as ActState | null,
  /** Debug : >= 0 fige la mise en scène de l'objet à cet instant (s), comme impactHold. */
  actHold: -1,
  /** Secousse de la pompe du fusil (balle éjectée) : retombe tout seul. */
  rack: 0,
  /** Vibration du fusil (inverseur) : 0 à 1, pilotée par ItemProps. */
  buzz: 0,
  /** Main droite du croupier envoyée vers un point du monde (il tient l'objet) quand `on`. */
  reach: { on: false, x: 0, y: 0, z: 0 },
  /** Rougeur des yeux du croupier : 0 = d'origine, 1 = au plus rouge (monte à chaque partie). */
  eyeRed: 0,
  /** Papillotement de la lampe (1 = fort), retombe tout seul. */
  flicker: 0,
  /** Niveau instantané de la lampe (1 = normal, ~0 = éteinte) : lu par le son de grésillement pour rester synchrone. */
  lamp: 1,
}

/** Entrée dans la salle : marche lente depuis l'obscurité, puis on s'assoit (durées en s, repères en m). */
export const ENTRANCE = {
  walk: 9.5,
  sit: 3.4,
  /** longueur d'un pas (m) : le cycle de marche (balancement de la tête, bruits de pas) est calé sur la distance parcourue */
  stepLen: 0.42,
  startZ: 6.7,
  standZ: 2.6,
  eye: 1.7,
}

const smooth01 = (q: number) => {
  const c = Math.min(Math.max(q, 0), 1)
  return c * c * (3 - 2 * c)
}
const WALK_TOTAL = ENTRANCE.startZ - ENTRANCE.standZ

/** Distance parcourue (m) après `te` secondes de marche : départ et arrêt très doux (démarrage / arrêt d'un humain). */
export const walkDistance = (te: number) => WALK_TOTAL * smooth01(te / ENTRANCE.walk)

/** Vitesse de marche (m/s) à l'instant `te`. */
export function walkSpeed(te: number) {
  const q = Math.min(Math.max(te / ENTRANCE.walk, 0), 1)
  return (WALK_TOTAL * 6 * q * (1 - q)) / ENTRANCE.walk
}

/** Nombre de pas complets de la marche. */
export const WALK_STEPS = Math.floor(WALK_TOTAL / ENTRANCE.stepLen)

/** Instant (s) où le i-ième pas touche le sol : là où la distance parcourue atteint i × longueur de pas. */
export function stepTime(i: number) {
  const f = (i * ENTRANCE.stepLen) / WALK_TOTAL
  if (f >= 1) return ENTRANCE.walk
  let lo = 0
  let hi = 1
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2
    if (smooth01(mid) < f) lo = mid
    else hi = mid
  }
  return ((lo + hi) / 2) * ENTRANCE.walk
}

/** Déclenche l'impact frame (flash blanc, image encrée à lignes de vitesse, puis flou radial). */
export function triggerImpact(center: readonly [number, number], color: readonly [number, number, number]) {
  fx.impactT = 0
  fx.impactCenter = center
  fx.impactColor = color
}

/** Durée totale de la transition (s) : voir le shader (retroEffect.ts). */
export const TRANSITION_END = 1.65

export function tickFx(dt: number) {
  fx.flash = Math.max(0, fx.flash - dt * 5)
  fx.muzzle = Math.max(0, fx.muzzle - dt * 9)
  fx.shake *= Math.exp(-dt * 2.6)
  fx.recoil *= Math.exp(-dt * 8)
  fx.rack *= Math.exp(-dt * 7)
  fx.kick *= Math.exp(-dt * 9)
  fx.flicker = Math.max(0, fx.flicker - dt * 0.3)
  if (fx.transHold >= 0) fx.transT = fx.transHold
  else if (fx.transStart >= 0) {
    fx.transT = (performance.now() - fx.transStart) / 1000
    if (fx.transT > TRANSITION_END) {
      fx.transT = -1
      fx.transStart = -1
    }
  }
  if (fx.impactHold >= 0) fx.impactT = fx.impactHold
  else if (fx.impactT >= 0) {
    fx.impactT += dt
    if (fx.impactT > 0.75) fx.impactT = -1
  }
}
