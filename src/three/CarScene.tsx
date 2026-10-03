import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Box3, BufferAttribute, CanvasTexture, Euler, Group, Mesh, MeshStandardMaterial, PointLight, Quaternion, SRGBColorSpace, Sprite, Vector3 } from 'three'
import { useStageStore } from '../store/stageStore'
import { fx } from './fx'
import { MODELS } from './models'

/** Réglages de la scène de la voiture (distances en m, vitesses en m/s). */
const CAR = {
  /** Réverbères : un tous les `spacing` m, qui défilent à `speed` côté fenêtre. */
  speed: 17,
  spacing: 24,
  lamps: 7,
  lampX: -4.5,
  lampY: 2.9,
}

const smooth = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1)
  return t * t * (3 - 2 * t)
}
const elapsed = () => (fx.endStart < 0 ? 0 : (performance.now() - fx.endStart) / 1000)

/** Halo orange doux (dégradé radial) : un réverbère vu de loin. */
function lampTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,236,190,1)')
  grad.addColorStop(0.2, 'rgba(255,170,70,0.75)')
  grad.addColorStop(0.55, 'rgba(255,120,30,0.14)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new CanvasTexture(c)
}

/** Un billet de 100 (dessin simple : cadre, médaillon, chiffres) : posé sur le dessus de chaque liasse. */
function billTexture() {
  const w = 320
  const h = 136
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#c9d6ae'
  g.fillRect(0, 0, w, h)
  g.strokeStyle = '#3f5a3a'
  g.lineWidth = 5
  g.strokeRect(6, 6, w - 12, h - 12)
  g.lineWidth = 2
  g.strokeRect(16, 16, w - 32, h - 32)
  // médaillon central
  g.fillStyle = '#8fa57f'
  g.beginPath()
  g.ellipse(w / 2, h / 2, 40, 48, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#3f5a3a'
  g.beginPath()
  g.ellipse(w / 2, h / 2 - 10, 14, 17, 0, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.ellipse(w / 2, h / 2 + 30, 26, 14, 0, 0, Math.PI * 2)
  g.fill()
  // chiffres et fines hachures
  g.font = 'bold 34px monospace'
  g.fillStyle = '#2e4630'
  g.fillText('100', 26, 52)
  g.fillText('100', w - 92, h - 28)
  g.strokeStyle = 'rgba(63,90,58,0.45)'
  g.lineWidth = 1
  for (let x = 26; x < 120; x += 6) {
    g.beginPath()
    g.moveTo(x, h - 30)
    g.lineTo(x + 20, h - 62)
    g.stroke()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/** UV planaires (vue de dessus) d'une liasse : le billet occupe tout le dessus. */
function planarUV(mesh: Mesh) {
  const geo = mesh.geometry.clone()
  geo.computeBoundingBox()
  const b = geo.boundingBox as Box3
  const pos = geo.getAttribute('position')
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - b.min.x) / Math.max(b.max.x - b.min.x, 1e-6)
    uv[i * 2 + 1] = (pos.getZ(i) - b.min.z) / Math.max(b.max.z - b.min.z, 1e-6)
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2))
  mesh.geometry = geo
}

/** Le fusil de la valise.glb est remplacé par celui du jeu : couché sur le flanc en travers du bord de la valise, canon vers la portière. */
const GUN = {
  pos: new Vector3(0.2, 0.67, 0.34),
  /** Canon vers -X (la portière), puis roulé de 90° autour de son axe. */
  rot: new Quaternion().setFromEuler(new Euler(Math.PI / 2, Math.PI, 0, 'YXZ')),
  scale: 1,
}

/**
 * Fin « victoire » : le siège passager d'une voiture qui roule de nuit (valise.glb : portière, siège, valise ouverte
 * pleine de liasses), avec le fusil du jeu posé devant la valise. Dehors, des réverbères défilent côté fenêtre : leur
 * lumière balaie l'habitacle à chaque passage (la dalle blanche `lumiere_fenetre` du fichier est retirée : elle cacherait la route).
 */
export function CarScene() {
  const ending = useStageStore((s) => s.ending && s.endKind === 'car')
  const { scene } = useGLTF(MODELS.car)
  const { scene: shotgun } = useGLTF(MODELS.shotgun)
  const lampMap = useMemo(lampTexture, [])
  const bill = useMemo(billTexture, [])
  const sweep = useRef<PointLight>(null)
  const lamps = useRef<(Sprite | null)[]>([])

  const { root } = useMemo(() => {
    const r = scene.clone(true)
    r.getObjectByName('fusil')?.removeFromParent() // le fusil du fichier cède la place à celui du jeu
    // le couvercle ouvert est enfoncé dans le dossier : on avance toute la valise de 20 cm pour qu'il se dresse devant
    const valise = r.getObjectByName('valise')
    if (valise) valise.position.z += 0.2
    r.getObjectByName('cadre_bas')?.removeFromParent() // plaque pleine posée sur la valise : elle cacherait les billets
    // les billets et la doublure du couvercle saturent sous les lumières (pas de tone mapping) : on les assombrit
    r.traverse((o) => {
      if (!(o instanceof Mesh)) return
      const m = o.material as MeshStandardMaterial
      if (m.name === 'billet') {
        // les liasses portent un dessin de billet de 100 (UV planaires : le glb n'en a pas)
        planarUV(o)
        const mat = m.clone()
        mat.map = bill
        mat.color.setScalar(1)
        o.material = mat
      } else if (m.name === 'bande' || m.name === 'aluminium') {
        o.material = m.clone()
        ;(o.material as MeshStandardMaterial).color.multiplyScalar(m.name === 'aluminium' ? 0.22 : 0.6)
      }
    })
    // la dalle blanche derrière la vitre (lumiere_fenetre) et la vitre elle-même sortent en blanc opaque et cacheraient
    // les réverbères : fenêtre ouverte sur la nuit
    r.getObjectByName('lumiere_fenetre')?.removeFromParent()
    r.getObjectByName('vitre')?.removeFromParent()
    return { root: r }
  }, [scene, bill])

  const gun = useMemo(() => {
    const g = new Group()
    g.add(shotgun.clone(true))
    g.position.copy(GUN.pos)
    g.quaternion.copy(GUN.rot)
    g.scale.setScalar(GUN.scale)
    return g
  }, [shotgun])

  useFrame(() => {
    if (!ending) return
    const t = elapsed()
    const total = CAR.spacing * CAR.lamps
    // position (z, la voiture avance vers +Z : le décor recule vers -Z) du réverbère le plus proche de la fenêtre
    let nearest = 99
    for (let i = 0; i < CAR.lamps; i++) {
      const z = ((((CAR.lamps - i) * CAR.spacing - t * CAR.speed) % total) + total) % total - total / 2
      const s = lamps.current[i]
      if (s) s.position.set(CAR.lampX, CAR.lampY, z)
      if (Math.abs(z) < Math.abs(nearest)) nearest = z
    }
    // le passage d'un réverbère : une bosse de lumière orange sur l'habitacle
    const bump = Math.exp(-((nearest / 2.4) ** 2))
    if (sweep.current) {
      sweep.current.position.set(-3, 3.2, nearest)
      sweep.current.intensity = 2 + 90 * bump
    }
  })

  return (
    <group visible={ending}>
      <ambientLight intensity={1.1} color="#ffb98a" />
      {/* éclairage doux de la valise : on doit voir les billets */}
      <pointLight position={[0.15, 0.95, 0.7]} intensity={4.5} distance={3} color="#fff0d8" />
      {/* éclairage doux sur le siège, la valise et le fusil */}
      <pointLight position={[0.5, 1.6, 0.9]} intensity={2.5} distance={5} color="#ffc08a" />
      {/* lueur du tableau de bord : froide, de côté */}
      <pointLight position={[1.1, 0.8, 0.6]} intensity={1.2} distance={4} color="#ff9a5a" />
      <pointLight ref={sweep} position={[-3, 3.2, 0]} distance={12} color="#ffa94d" />
      <primitive object={root} />
      <primitive object={gun} />
      {Array.from({ length: CAR.lamps }, (_, i) => (
        <sprite key={i} ref={(s) => { lamps.current[i] = s }} position={[CAR.lampX, CAR.lampY, 0]} scale={[2.6, 2.6, 1]}>
          <spriteMaterial map={lampMap} transparent fog={false} depthWrite={false} blending={AdditiveBlending} />
        </sprite>
      ))}
    </group>
  )
}

const POS = new Vector3()
/**
 * Caméra : côté conducteur, un peu en avant du siège. On regarde le siège passager, la valise ouverte et le fusil
 * posé devant ; la route fait vibrer la vue, et on se penche très lentement vers l'argent.
 */
export function CarCamera() {
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    const t = elapsed()
    const lean = smooth(t / 30)
    // vibration de la route : balancement lent + trépidation fine
    const bob = Math.sin(t * 1.3) * 0.012 + Math.sin(t * 17.3) * 0.0022 + Math.sin(t * 9.1) * 0.0018
    const sway = Math.sin(t * 0.55) * 0.02
    POS.set(0.5 - 0.1 * lean + sway, 1.14 - 0.08 * lean + bob, 0.82 - 0.08 * lean)
    camera.position.copy(POS)
    camera.lookAt(0.0, 0.58, 0.0)
    camera.rotation.z += Math.sin(t * 0.7) * 0.004
  })
  return null
}

useGLTF.preload(MODELS.car)
