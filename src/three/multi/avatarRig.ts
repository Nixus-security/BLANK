import { Euler, Group, Object3D, Quaternion, Vector3 } from 'three'
import { fx } from '../fx'
import { gunGrips } from '../grips'

/**
 * Animation procédurale d'un joueur adverse en multijoueur : même squelette et même IK à deux os que le croupier
 * (dealerRig.ts), mais l'état vient de l'avatar (AvatarState) au lieu des stores du jeu solo, et le modèle peut être
 * posé à n'importe quelle place : les cibles du monde (prises du fusil, objet tenu) sont ramenées dans son repère.
 */
export interface AvatarState {
  /** Mains sur le fusil. */
  hold: boolean
  /** Buste penché en avant (viser : 0,12 ; se viser : 0,32 ; montrer le fusil : 0,08). */
  lean: number
  /** Main droite envoyée sur l'objet qu'il utilise (fx.reach, en coordonnées monde). */
  reach: boolean
  cuffed: boolean
  /** Impulsion de coup reçu (consommée). */
  hit: number
  dead: boolean
}
export const newAvatarState = (): AvatarState => ({ hold: false, lean: 0, reach: false, cuffed: false, hit: 0, dead: false })

const DOWN = new Vector3(0, -1, 0)
const BONE = 0.36
const HIP = new Vector3(0, 0.58, 0)
const THROW_S = 1.0
const THROW_DIST = 1.7
const BOUND_X = 0.06

const rx = (a: number) => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), a)
const euler = (x: number, y: number, z: number) => new Quaternion().setFromEuler(new Euler(x, y, z))
const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const tmpEuler = new Euler()

interface Arm {
  shoulder: Object3D
  elbow: Object3D
  hand: Object3D
  restPos: Vector3
  restH: Quaternion
  pole: Vector3
  grip: 'right' | 'left'
  rest: Vector3
  table: Vector3
}

const dir = new Vector3()
const perp = new Vector3()
const elbowPos = new Vector3()
const handPos = new Vector3()
const v = new Vector3()
const qS = new Quaternion()
const qE = new Quaternion()
const qInv = new Quaternion()
const target = new Vector3()
const local = new Vector3()
const foreInv = new Quaternion()

export class AvatarRig {
  private root: Object3D
  private torso: Object3D
  private head: Object3D
  private restTorso: Quaternion
  private restHead: Quaternion
  private arms: Arm[]
  private holdW = 0
  private reachW = 0
  private boundW = 0
  private lean = 0
  private spring = { x: 0, v: 0 }
  private deadT = 0
  private body: Group
  private decor: Object3D | null
  private decorRestPos: Vector3
  private decorRestQuat: Quaternion
  /** Phase propre à chaque avatar : ils ne respirent pas tous en même temps. */
  private phase = Math.random() * 10

  constructor(root: Object3D) {
    const get = (n: string) => root.getObjectByName(n) as Object3D
    this.torso = get('torse')
    this.head = get('tete')
    this.restTorso = this.torso.quaternion.clone()
    this.restHead = this.head.quaternion.clone()
    const parts = ['croupier', 'epaule_d', 'epaule_g'].map(get)
    // les épaules vivent dans le repère du parent du corps : c'est là qu'on ramène les cibles du monde
    this.root = parts[0].parent ?? root
    this.body = new Group()
    parts[0].parent?.add(this.body)
    for (const p of parts) this.body.add(p)
    this.decor = root.getObjectByName('decor') ?? null
    this.decorRestPos = this.decor?.position.clone() ?? new Vector3()
    this.decorRestQuat = this.decor?.quaternion.clone() ?? new Quaternion()
    const mk = (s: string, e: string, h: string, pole: Vector3, grip: 'right' | 'left', rest: Vector3, table: Vector3): Arm => {
      const shoulder = get(s)
      return { shoulder, elbow: get(e), hand: get(h), restPos: shoulder.position.clone(), restH: get(h).quaternion.clone(), pole, grip, rest, table }
    }
    this.arms = [
      mk('epaule_d', 'coude_d', 'main_d', new Vector3(-0.6, -1, -0.1), 'right', new Vector3(-0.28, 0.83, 0.55), new Vector3(-0.62, 1.4, 0.0)),
      mk('epaule_g', 'coude_g', 'main_g', new Vector3(0.6, -1, -0.1), 'left', new Vector3(0.28, 0.83, 0.55), new Vector3(0.62, 1.4, 0.0)),
    ]
    const saw = root.getObjectByName('fusil_scie')
    if (saw) saw.visible = false
  }

  private solve(arm: Arm, tgt: Vector3) {
    const s = arm.shoulder.position
    dir.subVectors(tgt, s)
    const d = dir.length()
    dir.normalize()
    const dc = Math.min(Math.max(d, 0.08), 2 * BONE - 0.005)
    const a = dc / 2
    const h = Math.sqrt(Math.max(BONE * BONE - a * a, 0))
    perp.copy(arm.pole).addScaledVector(dir, -arm.pole.dot(dir)).normalize()
    elbowPos.copy(s).addScaledVector(dir, a).addScaledVector(perp, h)
    handPos.copy(s).addScaledVector(dir, dc)
    v.subVectors(elbowPos, s).normalize()
    qS.setFromUnitVectors(DOWN, v)
    v.subVectors(handPos, elbowPos).normalize().applyQuaternion(qInv.copy(qS).invert())
    qE.setFromUnitVectors(DOWN, v)
  }

  /** Point du monde → repère du modèle (là où vivent les épaules). */
  private toLocal(w: Vector3) {
    return this.root.worldToLocal(local.copy(w))
  }

  update(dt: number, time: number, st: AvatarState) {
    const t = time + this.phase
    this.root.updateWorldMatrix(true, false)

    if (st.hit > 0) {
      this.spring.v += 7 * st.hit
      st.hit = 0
    }
    const sp = this.spring
    sp.v += (-70 * sp.x - 7 * sp.v) * dt
    sp.x += sp.v * dt

    // mort : projeté en arrière, loin de la table (vers -Z local, quelle que soit la place)
    this.deadT = st.dead ? Math.min(1, this.deadT + dt / THROW_S) : 0
    const D = this.deadT
    const ez = 1 - (1 - D) ** 2.4
    let deathPitch = 0
    let deathHead = 0
    let deathRoll = 0
    if (D > 0) {
      deathPitch = -0.55 * ez
      deathHead = -0.5 * ez
      deathRoll = 0.3 * ez
      const lift = 0.55 * Math.sin(Math.PI * clamp01(D * 1.1)) - 0.5 * clamp01((D - 0.35) / 0.65) ** 2
      this.body.position.set(0, lift, -THROW_DIST * ez)
      this.body.quaternion.setFromEuler(tmpEuler.set(-1.42 * (1 - (1 - D) ** 3), 0.5 * ez, 0.35 * ez))
      if (this.decor) {
        this.decor.position.copy(this.decorRestPos).z -= 0.7 * ez
        this.decor.quaternion.copy(this.decorRestQuat).multiply(rx(-0.45 * ez))
      }
    } else {
      this.body.position.set(0, 0, 0)
      this.body.quaternion.identity()
      if (this.decor) {
        this.decor.position.copy(this.decorRestPos)
        this.decor.quaternion.copy(this.decorRestQuat)
      }
    }

    const alive = !st.dead
    this.lean += ((alive ? st.lean : 0) - this.lean) * (1 - Math.exp(-6 * dt))
    this.holdW += ((st.hold && alive ? 1 : 0) - this.holdW) * (1 - Math.exp(-7 * dt))
    this.reachW += ((st.reach && fx.reach.on && alive ? 1 : 0) - this.reachW) * (1 - Math.exp(-8 * dt))
    this.boundW += ((st.cuffed && alive ? 1 : 0) - this.boundW) * (1 - Math.exp(-6 * dt))

    const breath = Math.sin(t * 1.4) * 0.012
    const idle = (1 - this.holdW) * (1 - D)
    const headYaw = (Math.sin(t * 0.35) * 0.2 + Math.sin(t * 0.93) * 0.05) * idle
    const headPitch = Math.sin(t * 0.5) * 0.04 * idle
    const tapGate = Math.max(0, Math.sin(t * 0.55) - 0.4) * idle
    const tap = Math.sin(t * 11) * 0.16 * tapGate

    const pitch = breath + this.lean + deathPitch - 0.32 * sp.x
    this.torso.quaternion.copy(this.restTorso).multiply(rx(pitch))
    this.head.quaternion.copy(this.restHead).multiply(euler(headPitch - this.lean * 0.8 + deathHead - 0.55 * sp.x, headYaw, deathRoll))

    const torsoRot = rx(pitch)
    for (const arm of this.arms) {
      arm.shoulder.position.copy(arm.restPos).sub(HIP).applyQuaternion(torsoRot).add(HIP)
      if (D > 0) target.copy(arm.rest).lerp(arm.table, ez)
      else {
        target.copy(arm.rest)
        target.y += breath * 1.5
        if (this.holdW > 0.002) target.lerp(this.toLocal(arm.grip === 'right' ? gunGrips.right : gunGrips.left), this.holdW)
        if (this.boundW > 0.002) {
          v.set(arm.grip === 'right' ? -BOUND_X : BOUND_X, 0.83 + breath, 0.56 + (Math.sin(t * 2.3) > 0.8 ? 0.02 : 0))
          target.lerp(v, this.boundW)
        }
        if (arm.grip === 'right' && this.reachW > 0.002) target.lerp(this.toLocal(v.set(fx.reach.x, fx.reach.y, fx.reach.z)), this.reachW)
      }
      target.y += 0.25 * sp.x
      target.z -= 0.12 * sp.x
      this.solve(arm, target)
      arm.shoulder.quaternion.copy(qS)
      arm.elbow.quaternion.copy(qE)
      if (arm.grip === 'right') arm.hand.quaternion.copy(arm.restH)
      else {
        foreInv.copy(qS).multiply(qE).invert()
        arm.hand.quaternion.copy(foreInv)
      }
      if (arm.grip === 'left' && tap !== 0) arm.hand.quaternion.multiply(euler(tap, 0, 0))
    }
  }
}
