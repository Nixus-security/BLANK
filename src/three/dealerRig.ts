import { Euler, Group, Object3D, Quaternion, Vector3 } from 'three'
import { useGameStore } from '../store/gameStore'
import { useStageStore } from '../store/stageStore'
import { fx } from './fx'
import { gunGrips } from './grips'

/**
 * Animation procédurale du croupier (le GLB n'a pas de clips). Le squelette est une hiérarchie de
 * noeuds : torse -> tête, et deux bras indépendants (épaule -> coude -> main). Les bras ne sont pas
 * enfants du torse : on les repositionne à la main quand le torse bascule, et on les oriente
 * par un IK à deux os pour saisir le fusil ou tomber sur la table.
 *
 * États : attente (respiration, regard, tapotement) -> viser le joueur / se viser (mains sur le
 * fusil, buste penché) -> coup reçu (ressort amorti) -> mort : projeté violemment en arrière dans la pénombre.
 */
const DOWN = new Vector3(0, -1, 0)
const BONE = 0.36 // longueur bras et avant-bras
const HIP = new Vector3(0, 0.58, 0)

const rx = (a: number) => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), a)
const euler = (x: number, y: number, z: number) => new Quaternion().setFromEuler(new Euler(x, y, z))
/** Durée (s) du projeté en arrière, de l'impact à l'arrêt dans le noir. */
const THROW_S = 1.0
/** Distance (m) parcourue vers le fond de la salle. */
const THROW_DIST = 1.7
const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1)
const tmpEuler = new Euler()
const reachPos = new Vector3()
const boundPos = new Vector3()
/** Écart (m) de chaque poignet quand il est menotté : les mains sont jointes sur la table. */
const BOUND_X = 0.06

interface Arm {
  shoulder: Object3D
  elbow: Object3D
  hand: Object3D
  restPos: Vector3
  restS: Quaternion
  restE: Quaternion
  restH: Quaternion
  pole: Vector3
  grip: 'right' | 'left'
  /** Main posée sur la table (attente) */
  rest: Vector3
  /** Main levée et rejetée en arrière quand il est projeté (bras écartés, moulinant) */
  table: Vector3
}

// scratch
const dir = new Vector3()
const perp = new Vector3()
const elbowPos = new Vector3()
const handPos = new Vector3()
const v = new Vector3()
const qS = new Quaternion()
const qE = new Quaternion()
const qInv = new Quaternion()
const target = new Vector3()
const foreInv = new Quaternion()

export class DealerRig {
  private torso: Object3D
  private head: Object3D
  private saw: Object3D | null
  private restTorso: Quaternion
  private restHead: Quaternion
  private arms: Arm[]
  private holdW = 0
  /** Poids de la main droite qui tient un objet (fx.reach) et des poignets menottés, mains jointes sur la table. */
  private reachW = 0
  private boundW = 0
  private lean = 0
  private spring = { x: 0, v: 0 }
  private dead = 0
  /** Corps (jambes, torse, bras) regroupé pour être projeté d'un bloc ; la chaise (decor) suit à part */
  private body: Group
  private decor: Object3D | null
  private decorRestPos: Vector3
  private decorRestQuat: Quaternion

  constructor(root: Object3D) {
    const get = (n: string) => root.getObjectByName(n) as Object3D
    this.torso = get('torse')
    this.head = get('tete')
    this.saw = root.getObjectByName('fusil_scie') ?? null
    this.restTorso = this.torso.quaternion.clone()
    this.restHead = this.head.quaternion.clone()
    // le corps est regroupé (identité au repos) : on le projette en arrière d'un bloc, pivot au sol sous le bassin
    const parts = ['croupier', 'epaule_d', 'epaule_g'].map(get)
    this.body = new Group()
    parts[0].parent?.add(this.body)
    for (const p of parts) this.body.add(p)
    this.decor = root.getObjectByName('decor') ?? null
    this.decorRestPos = this.decor?.position.clone() ?? new Vector3()
    this.decorRestQuat = this.decor?.quaternion.clone() ?? new Quaternion()
    const mk = (s: string, e: string, h: string, pole: Vector3, grip: 'right' | 'left', rest: Vector3, table: Vector3): Arm => {
      const shoulder = get(s)
      const elbow = get(e)
      const hand = get(h)
      return { shoulder, elbow, hand, restPos: shoulder.position.clone(), restS: shoulder.quaternion.clone(), restE: elbow.quaternion.clone(), restH: hand.quaternion.clone(), pole, grip, rest, table }
    }
    this.arms = [
      mk('epaule_d', 'coude_d', 'main_d', new Vector3(-0.6, -1, -0.1), 'right', new Vector3(-0.28, 0.83, 0.55), new Vector3(-0.62, 1.4, 0.0)),
      mk('epaule_g', 'coude_g', 'main_g', new Vector3(0.6, -1, -0.1), 'left', new Vector3(0.28, 0.83, 0.55), new Vector3(0.62, 1.4, 0.0)),
    ]
  }

  /** Résout l'IK 2 os d'un bras vers `tgt` (monde) et écrit les quaternions dans qS/qE. */
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

  update(dt: number, t: number) {
    const { pose, dealerDead } = useStageStore.getState()
    const holding = pose === 'dealerPlayer' || pose === 'dealerSelf' || pose === 'dealerShow'

    // --- ressort de coup reçu ---
    if (fx.dealerHit > 0) {
      this.spring.v += 7 * fx.dealerHit
      fx.dealerHit = 0
    }
    const sp = this.spring
    sp.v += (-70 * sp.x - 7 * sp.v) * dt
    sp.x += sp.v * dt

    // --- mort : projeté violemment en arrière, dans la pénombre ---
    // L'impact le soulève et le propulse vers le fond de la salle (il part très vite puis frotte au sol), le corps
    // bascule en arrière en tournant sur lui-même, les bras sont arrachés vers le haut ; la chaise est repoussée.
    if (dealerDead) this.dead = Math.min(1, this.dead + dt / THROW_S)
    else this.dead = 0
    const D = this.dead
    const ez = 1 - (1 - D) ** 2.4 // décélération : fulgurant au début
    let deathPitch = 0
    let deathHead = 0
    let deathRoll = 0
    if (D > 0) {
      deathPitch = -0.55 * ez // le buste se cambre vers l'arrière
      deathHead = -0.5 * ez
      deathRoll = 0.3 * ez
      const lift = 0.55 * Math.sin(Math.PI * clamp01(D * 1.1)) - 0.5 * clamp01((D - 0.35) / 0.65) ** 2 // soulevé, puis retombe au sol
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

    // --- posture visée : penché en avant pour tenir le fusil ---
    const leanTarget = dealerDead ? 0 : pose === 'dealerSelf' ? 0.32 : pose === 'dealerPlayer' ? 0.12 : pose === 'dealerShow' ? 0.08 : 0
    this.lean += (leanTarget - this.lean) * (1 - Math.exp(-6 * dt))

    // --- attente : respiration, regard qui erre, tapotement ---
    // holdW : 0 = mains posées sur la table (attente), 1 = mains sur le fusil
    this.holdW += ((holding && !dealerDead ? 1 : 0) - this.holdW) * (1 - Math.exp(-7 * dt))
    const cuffed = useGameStore.getState().game.cuffed.dealer && !dealerDead
    this.reachW += ((fx.reach.on && !dealerDead && (!holding || pose === 'dealerShow') ? 1 : 0) - this.reachW) * (1 - Math.exp(-8 * dt))
    this.boundW += ((cuffed ? 1 : 0) - this.boundW) * (1 - Math.exp(-6 * dt))
    reachPos.set(fx.reach.x, fx.reach.y, fx.reach.z)
    const breath = Math.sin(t * 1.4) * 0.012
    const idle = (1 - this.holdW) * (1 - D)
    const headYaw = (Math.sin(t * 0.35) * 0.2 + Math.sin(t * 0.93) * 0.05) * idle
    const headPitch = Math.sin(t * 0.5) * 0.04 * idle
    const tapGate = Math.max(0, Math.sin(t * 0.55) - 0.4) * idle
    const tap = Math.sin(t * 11) * 0.16 * tapGate

    const pitch = breath + this.lean + deathPitch - 0.32 * sp.x
    this.torso.quaternion.copy(this.restTorso).multiply(rx(pitch))
    this.head.quaternion
      .copy(this.restHead)
      .multiply(euler(headPitch - this.lean * 0.8 + deathHead - 0.55 * sp.x, headYaw, deathRoll))

    // --- bras : toujours en IK (le pose d'origine du GLB, bras levé, n'est pas une posture d'attente) ---
    const torsoRot = rx(pitch)
    for (const arm of this.arms) {
      arm.shoulder.position.copy(arm.restPos).sub(HIP).applyQuaternion(torsoRot).add(HIP)
      if (D > 0) target.copy(arm.rest).lerp(arm.table, ez)
      else {
        target.copy(arm.rest)
        target.y += breath * 1.5
        if (this.holdW > 0.002) target.lerp(arm.grip === 'right' ? gunGrips.right : gunGrips.left, this.holdW)
        if (this.boundW > 0.002) {
          // menotté : poignets joints sur la table, qui tirent par moments sur la chaîne
          boundPos.set(arm.grip === 'right' ? -BOUND_X : BOUND_X, 0.83 + breath, 0.56 + (Math.sin(t * 2.3) > 0.8 ? 0.02 : 0))
          target.lerp(boundPos, this.boundW)
        }
        if (arm.grip === 'right' && this.reachW > 0.002) target.lerp(reachPos, this.reachW) // il tient l'objet qu'il utilise
      }
      // coup reçu : les mains sursautent
      target.y += 0.25 * sp.x
      target.z -= 0.12 * sp.x
      this.solve(arm, target)
      arm.shoulder.quaternion.copy(qS)
      arm.elbow.quaternion.copy(qE)
      if (arm.grip === 'right') arm.hand.quaternion.copy(arm.restH) // poing
      else {
        // main gauche (paume plate, doigts le long de son axe Z) : avec son orientation de repos d'origine elle sortait tordue,
        // doigts en travers, une fois le bras replacé en IK. On la remet à plat, doigts vers le joueur, quelle que soit la pose du bras.
        foreInv.copy(qS).multiply(qE).invert()
        arm.hand.quaternion.copy(foreInv)
      }
      if (arm.grip === 'left' && tap !== 0) arm.hand.quaternion.multiply(euler(tap, 0, 0))
    }

    // son propre fusil scié n'est plus utilisé : il ne doit pas rester levé à côté de sa tête
    if (this.saw) this.saw.visible = false
  }
}
