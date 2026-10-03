import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Euler, Mesh, Plane, Quaternion, Vector3, type Group, type MeshStandardMaterial, type PointLight } from 'three'
import { useGameStore } from '../store/gameStore'
import { useStageStore, type Pose } from '../store/stageStore'
import { toggleAim } from './director'
import { fx } from './fx'
import { gunGrips } from './grips'
import { MODELS } from './models'
import { setupShadows } from './prepare'
import { useRoom } from './Room'

const q = (pitch: number, yaw: number, roll = 0) => new Quaternion().setFromEuler(new Euler(roll, yaw, pitch, 'YXZ'))
const HALF_PI = Math.PI / 2
/** Le fusil au repos est décalé vers la droite : sa crosse recouvrait la canette du plateau d'objets (x -0,41 à -0,34). */
const REST_SHIFT = new Vector3(0.24, 0, 0)
/**
 * Au repos, le fusil est couché à plat sur la table, sur le flanc : on le fait rouler de 90° autour du canon.
 * Dans le modèle (shotgun.glb) il fait 21 cm de haut (crosse, pontet) pour 6,4 cm d'épaisseur : à plat, il reste donc
 * à 6,4 cm au-dessus du plateau, et sa hauteur s'étale vers le joueur (+Z local), qu'on recentre de 10,5 cm.
 */
const REST_ROLL = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), HALF_PI)
const FLAT_RECENTER = -0.105
const FLAT_HALF_THICKNESS = 0.034
const TABLE_TOP_Y = 0.78

/** Poses monde du fusil (le canon pointe vers +X en local ; yaw +90° = vers -Z, i.e. le croupier). */
const HELD: Record<Exclude<Pose, 'rest'>, { p: Vector3; r: Quaternion }> = {
  playerDealer: { p: new Vector3(0.12, 0.98, 0.95), r: q(0.05, HALF_PI) },
  playerSelf: { p: new Vector3(0.0, 1.0, 1.2), r: q(0.25, -HALF_PI) },
  dealerPlayer: { p: new Vector3(0.0, 0.95, 0.42), r: q(0.08, -HALF_PI) },
  dealerSelf: { p: new Vector3(0.0, 1.16, 0.7), r: q(-0.12, HALF_PI) },
  /** Le croupier prend le fusil pour s'en servir avec un objet (scie, loupe, inverseur, bière) : tenu de profil devant lui. */
  dealerShow: { p: new Vector3(0.05, 0.97, 0.6), r: q(0.04, 0) },
}

/** Fusil interactif : clic = le prendre/reposer ; les poses sont pilotées par stageStore. */
export function Shotgun() {
  const { scene } = useGLTF(MODELS.shotgun)
  const { gun } = useRoom()
  // plan de coupe : le canon scié est tronqué à l'endroit de la scie (voir useFrame) ; hors scie il est très loin, rien n'est coupé
  const cut = useMemo(() => new Plane(new Vector3(0, 1, 0), 1e6), [])
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])
  const obj = useMemo(() => {
    const c = scene.clone(true)
    // matériaux propres à ce fusil (ils sont partagés avec le fichier d'origine) : eux seuls reçoivent le plan de coupe
    c.traverse((o) => {
      if (!(o instanceof Mesh)) return
      o.material = (Array.isArray(o.material) ? o.material : [o.material]).map((m: MeshStandardMaterial) => {
        const copy = m.clone()
        copy.clippingPlanes = [cut]
        copy.clipShadows = true
        return copy
      })
      if (o.material.length === 1) o.material = o.material[0]
    })
    setupShadows(c)
    return c
  }, [scene, cut])
  const sawed = useGameStore((s) => s.game.sawed.player || s.game.sawed.dealer)

  const group = useRef<Group>(null)
  const light = useRef<PointLight>(null)
  const cur = useRef<{ p: Vector3; r: Quaternion } | null>(null)
  const tmp = useMemo(() => new Vector3(), [])
  // pose de repos : à plat sur la table (voir REST_ROLL), au même endroit qu'avant (décalée vers la droite)
  const rest = useMemo(() => {
    if (!gun) return { p: new Vector3(), r: new Quaternion() }
    const p = gun.position.clone().add(REST_SHIFT).addScaledVector(new Vector3(0, 0, 1).applyQuaternion(gun.quaternion), FLAT_RECENTER)
    p.y = TABLE_TOP_Y + FLAT_HALF_THICKNESS + 0.002
    return { p, r: gun.quaternion.clone().multiply(REST_ROLL) }
  }, [gun])

  useFrame(({ clock }, dt) => {
    const g = group.current
    if (!g || !gun) return
    // départ directement sur la pose de repos (pas de glissement depuis l'origine)
    cur.current ??= { p: rest.p.clone(), r: rest.r.clone() }
    const c = cur.current
    const pose = useStageStore.getState().pose
    const target = pose === 'rest' ? rest : HELD[pose]
    const k = 1 - Math.exp(-9 * dt)
    c.p.lerp(target.p, k)
    c.r.slerp(target.r, k)
    g.position.copy(c.p)
    g.quaternion.copy(c.r)
    if (pose !== 'rest') g.position.y += Math.sin(clock.elapsedTime * 2.3) * 0.004
    // recul : recule le long du canon et se cabre
    tmp.set(1, 0, 0).applyQuaternion(c.r)
    g.position.addScaledVector(tmp, -fx.recoil * 0.14)
    g.position.y += fx.recoil * 0.05
    // pompe actionnée (balle éjectée par la bière) : la crosse recule d'un coup, le fusil sursaute
    g.position.addScaledVector(tmp, -fx.rack * 0.05)
    g.position.y += fx.rack * 0.012
    // inverseur : le fusil vibre
    if (fx.buzz > 0) {
      g.position.x += (Math.random() - 0.5) * 0.008 * fx.buzz
      g.position.y += (Math.random() - 0.5) * 0.006 * fx.buzz
      g.position.z += (Math.random() - 0.5) * 0.008 * fx.buzz
    }
    if (light.current) light.current.intensity = fx.muzzle * 6
    // points de saisie pour les mains du croupier, points d'ancrage des objets (scie, loupe, balle éjectée)
    g.updateMatrixWorld(true)
    gunGrips.right.set(-0.12, 0.09, 0).applyMatrix4(g.matrixWorld)
    gunGrips.left.set(0.2, 0.14, 0).applyMatrix4(g.matrixWorld)
    gunGrips.chamber.set(-0.02, 0.13, 0).applyMatrix4(g.matrixWorld)
    gunGrips.saw.set(0.42, 0.15, 0).applyMatrix4(g.matrixWorld)
    gunGrips.muzzle.set(0.64, 0.15, 0).applyMatrix4(g.matrixWorld)
    gunGrips.axis.set(1, 0, 0).transformDirection(g.matrixWorld)
    // canon scié : tout ce qui dépasse du point de coupe disparaît (la scie vient de le détacher, voir ItemProps)
    const gs = useGameStore.getState().game.sawed
    if (gs.player || gs.dealer) {
      cut.normal.copy(gunGrips.axis).negate()
      cut.constant = gunGrips.axis.dot(gunGrips.saw)
    } else {
      cut.normal.set(0, 1, 0)
      cut.constant = 1e6
    }
  })

  const canGrab = useGameStore((s) => s.game.turn === 'player' && s.game.phase === 'playing')

  return (
    <group
      ref={group}
      position={rest.p}
      quaternion={rest.r}
      scale={gun?.scale}
      onClick={(e) => {
        e.stopPropagation()
        toggleAim()
      }}
      onPointerOver={() => canGrab && (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <primitive object={obj} name="shotgun" />
      {/* tranche du canon scié : métal nu, à l'endroit de la coupe */}
      <mesh position={[0.42, 0.125, 0]} visible={sawed}>
        <boxGeometry args={[0.006, 0.085, 0.036]} />
        <meshStandardMaterial color="#9a9a98" metalness={0.7} roughness={0.35} />
      </mesh>
      <pointLight ref={light} position={[0.75, 0.15, 0]} color="#ffb060" distance={4} decay={2} intensity={0} />
    </group>
  )
}
