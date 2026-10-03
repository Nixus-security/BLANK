import { Vector3 } from 'three'
import { ENTRANCE, stepTime, walkDistance, walkSpeed } from './fx'
import { LAYOUT } from './models'

/**
 * Caméra subjective de l'entrée dans la salle (marche puis assise), modélisée comme une tête humaine :
 *  - la marche suit la distance parcourue (un pas = `stepLen`) : la tête monte et descend à chaque pas (arc de
 *    pendule inversé : sommet arrondi à mi-pas, creux net à l'appui du talon), ondule d'une épaule à l'autre
 *    (une fois par double-pas), roule et tourne très légèrement, et encaisse l'impact du talon (ressort amorti) ;
 *  - l'amplitude suit la vitesse : nulle à l'arrêt, maximale en pleine marche ;
 *  - le regard dérive en continu et fait quelques coups d'œil (côté, vers le bas) ;
 *  - l'assise se fait en plusieurs temps : on baisse les yeux, le corps recule et descend, impact sur la chaise,
 *    puis la chaise est tirée vers la table et la tête se relève.
 * La caméra suit ces cibles à travers un ressort amorti (voir Spring) : la tête a une inertie.
 */

const base = new Vector3(...LAYOUT.camera)
const look = new Vector3(...LAYOUT.cameraTarget)

export interface FpTarget {
  pos: Vector3
  aim: Vector3
  /** rotations ajoutées après lookAt (rad) */
  roll: number
  pitch: number
  yaw: number
}

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const easeInOut = (x: number) => {
  const q = clamp01(x)
  return q < 0.5 ? 4 * q * q * q : 1 - (-2 * q + 2) ** 3 / 2
}
const mix = (a: number, b: number, k: number) => a + (b - a) * k
/** Cloche lisse centrée en `c`, de demi-largeur `w` (0 hors de [c-w, c+w], 1 en c). */
const bump = (t: number, c: number, w: number) => {
  const x = (t - c) / w
  return Math.abs(x) >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * x))
}

/** Ressort critique amorti (intégration implicite, stable quel que soit dt) : fait tendre `cur` vers `target`. */
export class Spring {
  readonly v = new Vector3()
  reset() {
    this.v.set(0, 0, 0)
  }
  step(cur: Vector3, target: Vector3, omega: number, dt: number) {
    const f = 1 + 2 * dt * omega
    const hoo = dt * omega * omega
    const hhoo = dt * hoo
    const inv = 1 / (f + hhoo)
    for (const a of ['x', 'y', 'z'] as const) {
      const x = cur[a]
      const v = this.v[a]
      cur[a] = (f * x + dt * v + hhoo * target[a]) * inv
      this.v[a] = (v + hoo * (target[a] - x)) * inv
    }
  }
}

const AIM_STAND = new Vector3(0, 0.95, 0.6)
const AIM_DOWN = new Vector3(0, 0.55, 1.7)

/** Cible de la caméra `te` secondes après le début de l'entrée (marche : 0 → walk, assise : walk → walk + sit). */
export function entranceTarget(te: number, o: FpTarget) {
  const { walk, eye, startZ, standZ, stepLen } = ENTRANCE
  o.roll = 0
  o.pitch = 0
  o.yaw = 0

  if (te < walk) {
    const dist = walkDistance(te)
    const sf = Math.min(1, walkSpeed(te) / 0.42) // facteur d'amplitude lié à la vitesse
    const phase = dist / stepLen // 1 unité = 1 pas
    const stride = Math.PI * phase
    const arc = Math.abs(Math.sin(stride)) - 0.637 // arc du pas, de moyenne nulle
    // réponse au dernier appui de talon : choc qui s'amortit en ~0,3 s
    const k = Math.floor(phase)
    const dt = k >= 1 ? te - stepTime(k) : 99
    const heel = Math.exp(-dt * 9) * Math.cos(dt * 26)

    const z = startZ - dist
    o.pos.set(Math.sin(stride) * 0.017 * sf, eye + 0.026 * sf * arc - 0.007 * sf * heel, z)

    // regard : vers la table, dérive lente + coups d'œil (côté gauche, côté droit, puis vers le bas)
    const yawG = -0.3 * bump(te, 2.9, 1.5) + 0.2 * bump(te, 6.1, 1.2) + 0.03 * Math.sin(te * 0.7) + 0.018 * Math.sin(te * 1.9 + 1)
    const pitchG = -0.1 * bump(te, 7.6, 1.1) + 0.015 * Math.sin(te * 0.9 + 2)
    const range = Math.max(z - AIM_STAND.z, 1)
    o.aim.set(yawG * range, AIM_STAND.y + pitchG * range, AIM_STAND.z)

    o.roll = 0.009 * Math.sin(stride) * sf
    o.yaw = 0.008 * Math.sin(stride + 0.6) * sf
    o.pitch = (0.004 * arc - 0.006 * heel) * sf
    return
  }

  // assise
  const u = te - walk
  const down = easeInOut(u / 0.55) // 0 → 0,55 s : on baisse les yeux vers la chaise
  const back = easeInOut((u - 0.55) / 0.9) // 0,55 → 1,45 s : le corps recule et descend
  const pull = easeInOut((u - 1.75) / 1.45) // 1,75 → 3,2 s : la chaise est tirée vers la table
  const seatY = base.y
  const landZ = standZ + 0.14

  let y = mix(eye, seatY + 0.04, back) - 0.04 * pull
  const dtb = u - 1.45
  if (dtb > 0) y -= 0.02 * Math.exp(-dtb * 9) * Math.cos(dtb * 24) // choc sur l'assise
  const vib = pull > 0 && pull < 1 ? 0.0012 * Math.sin(u * 85) * Math.sin(Math.PI * pull) : 0 // la chaise racle
  o.pos.set(0, y, mix(standZ, landZ, back) + (base.z - landZ) * pull + vib)

  o.aim.copy(AIM_STAND).lerp(AIM_DOWN, down).lerp(look, pull)
  o.roll = 0.012 * Math.sin(Math.PI * back) // le corps pivote un instant pour s'asseoir
}

// --- vue assise, pendant la partie ------------------------------------------------------------------

const TAU = Math.PI * 2
/** Bruit lisse dans [-1, 1] : trois sinusoïdes de fréquences incommensurables (pas de répétition perceptible). */
const wander = (t: number, seed: number) =>
  (Math.sin(t * 0.71 + seed * 1.7) + 0.6 * Math.sin(t * 1.37 + seed * 4.1) + 0.35 * Math.sin(t * 2.93 + seed * 2.3)) / 1.95

/** Positions et angles à ajouter à la vue assise. */
export interface HeadMotion {
  /** mouvements lents (posture, déplacement du poids, penché en avant) : passent par le ressort de la tête */
  slow: { x: number; y: number; z: number; yaw: number; pitch: number }
  /** mouvements rapides (respiration, pouls, tremblement) : appliqués tels quels sur la caméra */
  fast: { x: number; y: number; z: number; yaw: number; pitch: number; roll: number; fov: number }
}

/**
 * Tête d'un joueur assis, qui vit : respiration (inspiration plus rapide que l'expiration, la tête se lève
 * légèrement), pouls (double battement « lub-dub » visible dans la vue), micro-mouvements de la tête et des
 * épaules, dérive de la posture, déplacement du poids de temps en temps, penché vers la table quand on vise.
 * `arousal` (0 calme → 1 terreur) accélère la respiration et le pouls et amplifie le tremblement.
 */
export class SeatedHead {
  private breath = 0
  private beat = 0
  private arousal = 0
  private lean = 0
  readonly out: HeadMotion = {
    slow: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
    fast: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 0 },
  }

  update(t: number, dt: number, arousalTarget: number, aiming: boolean) {
    // l'excitation monte vite, retombe lentement
    const rate = arousalTarget > this.arousal ? 1.2 : 0.35
    this.arousal += (arousalTarget - this.arousal) * (1 - Math.exp(-dt * rate))
    this.lean += ((aiming ? 1 : 0) - this.lean) * (1 - Math.exp(-dt * 2.2))
    const a = this.arousal

    // respiration : ~0,26 Hz au calme, jusqu'à ~0,5 Hz sous tension ; inspiration plus brève que l'expiration
    this.breath += dt * TAU * (0.26 + 0.24 * a)
    const b = Math.sin(this.breath - 0.4 * Math.sin(this.breath))
    const ba = 1 + 1.3 * a
    // pouls : 62 → 117 battements/min, double battement
    this.beat += dt * (62 + 55 * a) / 60
    const ph = this.beat % 1
    const pulse = Math.exp(-((ph / 0.06) ** 2)) + 0.55 * Math.exp(-(((ph - 0.27) / 0.07) ** 2))
    const pa = 0.25 + 1.6 * a
    // tremblement des muscles du cou, plus fort sous tension
    const tr = 1 + 1.8 * a

    const f = this.out.fast
    f.x = 0.0012 * tr * wander(t * 1.6, 1)
    f.y = 0.0024 * ba * b + 0.0004 * pa * pulse + 0.0008 * tr * wander(t * 1.3, 2)
    f.z = 0.0016 * ba * b + 0.0007 * tr * wander(t * 1.1, 3)
    f.yaw = 0.0022 * tr * wander(t * 0.9, 4)
    f.pitch = 0.0024 * ba * b + 0.0016 * tr * wander(t * 1.2, 5) - 0.0006 * pa * pulse
    f.roll = 0.0016 * tr * wander(t * 0.8, 6) + 0.0004 * pa * pulse * Math.sin(this.beat * TAU * 0.5)
    f.fov = 0.06 * pa * pulse

    // posture : dérive lente, déplacement du poids toutes les ~11 s (un côté puis l'autre)
    const cycle = t % 11.3
    const side = Math.sin(Math.floor(t / 11.3) * 2.1) > 0 ? 1 : -1
    const shift = 0.012 * side * bump(cycle, 3.4, 0.9)
    const s = this.out.slow
    const l = this.lean
    s.x = 0.009 * wander(t * 0.25, 7) + shift
    s.y = 0.005 * wander(t * 0.2, 8) - 0.02 * l
    s.z = 0.004 * wander(t * 0.22, 9) - 0.07 * l
    s.yaw = 0.012 * wander(t * 0.3, 10)
    s.pitch = 0.01 * wander(t * 0.26, 11) - 0.05 * l
    return this.out
  }
}
