import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3, type PerspectiveCamera } from 'three'
import { useGameStore } from '../store/gameStore'
import { useStageStore } from '../store/stageStore'
import { ENTRANCE, fx } from './fx'
import { entranceTarget, SeatedHead, Spring, type FpTarget } from './firstPerson'
import { LAYOUT } from './models'

const BASE_FOV = 62 // doit correspondre au fov du <Canvas>
const base = new Vector3(...LAYOUT.camera)
const look = new Vector3(...LAYOUT.cameraTarget)

/**
 * Scène du contrat : la caméra se lève et surplombe la table, orientée vers le bas sur la feuille A4
 * posée à plat (centre ~ (0, 0.78, 1.01)). Presque à la verticale (~80° vers le bas), à ~0,75 m de la feuille : elle occupe environ 80 % de la hauteur de l écran.
 */
const CONTRACT_CAM = {
  position: new Vector3(0, 1.52, 1.15),
  target: new Vector3(0, 0.78, 1.01),
}

const tmp = new Vector3()
const tPos = new Vector3()
const tAim = new Vector3()
const dir = new Vector3()
/** direction et distance du regard au repos (assis, face à la table) ; inclinaison correspondante */
const DIR0 = look.clone().sub(base).normalize()
const LOOK_DIST = look.distanceTo(base)
const BASE_PITCH = Math.asin(DIR0.y)
const NO_MOTION = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 0 }

/**
 * Arrivée sur le contrat : la caméra part de face, côté joueur (basse, légèrement penchée, focale serrée),
 * rase la table en avançant vers le fusil, puis se redresse au-dessus de la feuille jusqu'à la vue du dessus
 * (CONTRACT_CAM). Rayon, azimut et hauteur autour du centre de la feuille ont chacun leur courbe.
 */
const INTRO = {
  duration: 6,
  /** départ : rayon horizontal, azimut (0 = de face côté joueur, négatif = côté gauche), hauteur au-dessus de la feuille */
  from: { radius: 1.25, azimuth: 0, height: 0.09, roll: -0.14, fov: 38 },
  /** arrivée = CONTRACT_CAM : à 0,14 m de la verticale de la feuille, 0,74 m au-dessus */
  to: { radius: 0.14, azimuth: 0, height: 0.74, roll: 0, fov: BASE_FOV },
  /** le regard part en avant de la feuille, vers le croupier et le fusil, et revient sur elle */
  lookFrom: new Vector3(0, 0.05, -0.7),
}
const easeInOut3 = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2)
const mix = (a: number, b: number, k: number) => a + (b - a) * k

/**
 * Vue subjective : assis face à la table, léger balancement + regard limité à la souris.
 * Pendant le contrat : caméra haute au-dessus de la table (transition douce depuis/vers la position assise).
 */
export function PlayerCamera() {
  const camera = useThree((s) => s.camera)
  const mouse = useRef({ x: 0, y: 0 })
  // position et visée courantes (lissées), démarrées sur la vue assise
  const pos = useMemo(() => base.clone(), [])
  const aim = useMemo(() => look.clone(), [])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])

  const introStart = useRef(-1)
  // tête humaine pendant l'entrée dans la salle (voir firstPerson.ts)
  const fp = useMemo<FpTarget>(() => ({ pos: new Vector3(), aim: new Vector3(), roll: 0, pitch: 0, yaw: 0 }), [])
  const springPos = useMemo(() => new Spring(), [])
  const springAim = useMemo(() => new Spring(), [])
  const entranceInit = useRef(false)
  const cineHold = useRef(0)
  // coup de recul : ressort peu amorti (le regard monte, la tête recule, puis quelques oscillations)
  const snapSpring = useRef({ x: 0, v: 0 })
  const head = useMemo(() => new SeatedHead(), [])

  useFrame(({ clock }, dt) => {
    const cam = camera as PerspectiveCamera
    const contract = useStageStore.getState().contract
    const t = clock.elapsedTime
    // progression de l'arrivée sur le contrat (1 = terminée ; hors contrat, la prochaine entrée repart de 0)
    if (!contract) introStart.current = -1
    else if (introStart.current < 0) introStart.current = t
    const p = contract ? Math.min((t - introStart.current) / INTRO.duration, 1) : 1
    const intro = contract && p < 1

    // entrée dans la salle (après le contrat) : marche lente depuis l'obscurité, puis on s'assoit
    const te = useStageStore.getState().entrance && fx.entranceStart >= 0 ? (performance.now() - fx.entranceStart) / 1000 : -1
    if (te < 0) entranceInit.current = false
    const walking = te >= 0 && te < ENTRANCE.walk
    const sitting = te >= ENTRANCE.walk && te < ENTRANCE.walk + ENTRANCE.sit

    let introFov = 0
    let roll = 0
    let extraPitch = 0
    let extraYaw = 0
    let fast = NO_MOTION
    if (walking || sitting) {
      // tête humaine : cible calculée par firstPerson.ts, suivie à travers un ressort amorti (inertie)
      entranceTarget(te, fp)
      if (!entranceInit.current) {
        pos.copy(fp.pos)
        aim.copy(fp.aim)
        springPos.reset()
        springAim.reset()
        entranceInit.current = true
      } else {
        springPos.step(pos, fp.pos, 18, Math.min(dt, 0.05))
        springAim.step(aim, fp.aim, 7, Math.min(dt, 0.05))
      }
      roll = fp.roll
      extraPitch = fp.pitch
      extraYaw = fp.yaw
    } else if (intro) {
      // départ au ralenti (la caméra rampe au ras de la table), puis balayage qui s'accélère et se pose en douceur ;
      // la hauteur, le regard et le roulis ne bougent presque pas au début, puis se redressent d'un trait
      const e = easeInOut3(p)
      const eh = easeInOut3(Math.min(Math.max((p - 0.3) / 0.7, 0), 1))
      const { from, to } = INTRO
      const radius = mix(from.radius, to.radius, e)
      const azimuth = mix(from.azimuth, to.azimuth, e)
      const height = mix(from.height, to.height, eh)
      pos.set(
        CONTRACT_CAM.target.x + Math.sin(azimuth) * radius,
        CONTRACT_CAM.target.y + height,
        CONTRACT_CAM.target.z + Math.cos(azimuth) * radius,
      )
      aim.copy(CONTRACT_CAM.target).addScaledVector(INTRO.lookFrom, (1 - eh) ** 2)
      roll = mix(from.roll, to.roll, eh)
      introFov = mix(from.fov, to.fov, eh) - BASE_FOV
    } else if (contract) {
      const k = 1 - Math.exp(-2.4 * dt)
      pos.lerp(CONTRACT_CAM.position, k)
      aim.lerp(CONTRACT_CAM.target, k)
    } else {
      // vue assise : tête vivante (firstPerson.ts). La souris tourne la tête autour du cou, avec inertie ; la
      // respiration, le pouls et le tremblement s'ajoutent tels quels, plus forts quand la tension monte.
      const st = useStageStore.getState()
      const g = useGameStore.getState().game
      let arousal = st.aiming ? 0.55 : 0
      if (g.phase === 'playing') {
        if (g.hp.player <= 1) arousal += 0.3
        if (g.turn === 'dealer') arousal += 0.12
      }
      if (st.entrance && fx.dealerReveal > 0 && fx.dealerReveal < 1) arousal += 0.5 // le croupier sort de l'ombre
      arousal += Math.min(1, fx.shake * 0.8) // choc d'un tir
      const hm = head.update(t, Math.min(dt, 0.05), Math.min(arousal, 1), st.aiming)
      fast = hm.fast

      const yaw = mouse.current.x * 0.34 + hm.slow.yaw
      const cp = BASE_PITCH - mouse.current.y * 0.22 + hm.slow.pitch
      dir.set(Math.sin(yaw) * Math.cos(cp), Math.sin(cp), -Math.cos(yaw) * Math.cos(cp))
      // le cou : l'œil est ~10 cm devant le pivot de la tête, il décrit un petit arc quand la tête tourne
      tPos.set(base.x + hm.slow.x + mouse.current.x * 0.02, base.y + hm.slow.y, base.z + hm.slow.z)
      tPos.addScaledVector(tmp.copy(dir).sub(DIR0), 0.1)
      tAim.copy(tPos).addScaledVector(dir, LOOK_DIST)
      // cinématique d'explication : la caméra est dirigée vers l'objet, avec un ressort lent (glissé de caméra) ;
      // il reste lent ~1,8 s après la fin, pour revenir à la vue de jeu en douceur
      if (fx.cine.on) {
        tPos.set(...fx.cine.pos)
        tAim.set(...fx.cine.aim)
        cineHold.current = 1.8
      } else cineHold.current = Math.max(0, cineHold.current - Math.min(dt, 0.05))
      const slow = cineHold.current > 0
      springPos.step(pos, tPos, slow ? 3 : 9, Math.min(dt, 0.05))
      springAim.step(aim, tAim, slow ? 3.6 : 5.5, Math.min(dt, 0.05))
      roll = fast.roll
      extraYaw = fast.yaw
      extraPitch = fast.pitch
    }

    const fov = BASE_FOV - fx.kick * 9 + introFov + fast.fov
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }

    const bob = contract && !walking ? Math.sin(t * 1.1) * 0.003 : 0 // respiration (vue du contrat ; en jeu : voir SeatedHead)
    // main portée pendant l'arrivée : tremblement lent qui s'éteint avec le mouvement
    const hand = intro ? (1 - p) ** 2 * 0.016 : 0
    // coup de recul : impulsion (fx.snap) -> ressort ; le regard monte, la tête recule, puis oscille et se calme
    const sn = snapSpring.current
    if (fx.snap > 0) {
      sn.v += 48 * fx.snap
      fx.snap = 0
    }
    const sdt = Math.min(dt, 0.05)
    sn.v += (-(22 * 22) * sn.x - 2 * 0.3 * 22 * sn.v) * sdt
    sn.x += sn.v * sdt
    extraPitch += sn.x * 0.12
    // grosse secousse : traumatisme au carré (les petits chocs restent discrets, les gros sont violents), bruit
    // lisse à haute fréquence sur la position et les trois rotations
    const trauma = Math.min(fx.shake / 2.5, 1)
    const I = trauma ** 1.5 // moins sévère que le carré : les chocs moyens secouent déjà fort
    // deux fréquences : un balancement lourd (~4 Hz) et un tremblement rapide (~7-8 Hz)
    const jit = (f: number, s: number) => Math.sin(t * f * 0.62 + s) * 0.65 + Math.sin(t * f * 1.2 + s * 2.3) * 0.35
    if (I > 0.0005) {
      extraYaw += jit(41, 1) * 0.17 * I
      extraPitch += jit(47, 2) * 0.15 * I
      roll += jit(37, 3) * 0.13 * I
    }
    const sx = I > 0.0005 ? jit(43, 4) * 0.15 * I : 0
    const sy = I > 0.0005 ? jit(53, 5) * 0.15 * I : 0
    const sz = I > 0.0005 ? jit(39, 6) * 0.09 * I : 0
    camera.position.set(
      pos.x + fast.x + sx + Math.sin(t * 7.3) * hand,
      pos.y + fast.y + bob + sy + Math.sin(t * 5.1 + 1) * hand,
      pos.z + fast.z + sz + sn.x * 0.11 + Math.sin(t * 6.2 + 2) * hand,
    )
    camera.lookAt(aim)
    if (extraYaw) camera.rotateY(extraYaw)
    if (extraPitch) camera.rotateX(extraPitch)
    if (roll) camera.rotateZ(roll) // roulis autour de l'axe de visée
  })
  return null
}
