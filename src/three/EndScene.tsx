import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Box3, BufferAttribute, CanvasTexture, Group, Points, type SpriteMaterial } from 'three'
import { useStageStore } from '../store/stageStore'
import { fx } from './fx'
import { MODELS } from './models'

/** Durées de la scène du néant (s) : marche vers le portail, ouverture des vantaux. */
export const END_SCENE = { approach: 26, openFrom: 9, openLen: 14, openAngle: 1.25 }

const smooth = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1)
  return t * t * (3 - 2 * t)
}
const elapsed = () => (fx.endStart < 0 ? 0 : (performance.now() - fx.endStart) / 1000)

/** Halo blanc doux (dégradé radial) : la lumière qu'on devine derrière le portail. */
function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(225,232,255,0.7)')
  grad.addColorStop(0.6, 'rgba(150,165,220,0.18)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  return new CanvasTexture(c)
}

const DUST = 420

/**
 * Le néant : portail.glb seul dans le vide (sol de terre et d'herbe morte qui se perd dans le noir), un halo blanc
 * derrière lui, des cendres en suspension. Les vantaux de la grille s'ouvrent lentement sur la lumière.
 */
export function EndScene() {
  const ending = useStageStore((s) => s.ending && s.endKind === 'void')
  const { scene } = useGLTF(MODELS.portal)
  const glowMap = useMemo(glowTexture, [])
  const glow = useRef<SpriteMaterial>(null)
  const dust = useRef<Points>(null)

  const { root, left, right } = useMemo(() => {
    const r = scene.clone(true)
    r.updateMatrixWorld(true)
    // chaque vantail pivote autour de son bord extérieur (charnière), pas autour de son centre
    const hinge = (name: string, side: -1 | 1) => {
      const leaf = r.getObjectByName(name)
      if (!leaf) return null
      const b = new Box3().setFromObject(leaf)
      const pivot = new Group()
      pivot.position.set(side < 0 ? b.min.x : b.max.x, 0, (b.min.z + b.max.z) / 2)
      r.add(pivot)
      pivot.attach(leaf)
      return pivot
    }
    return { root: r, left: hinge('vantail_gauche', -1), right: hinge('vantail_droit', 1) }
  }, [scene])

  const dustGeo = useMemo(() => {
    const p = new Float32Array(DUST * 3)
    for (let i = 0; i < DUST; i++) {
      p[i * 3] = (Math.random() - 0.5) * 18
      p[i * 3 + 1] = Math.random() * 5
      p[i * 3 + 2] = Math.random() * 16 - 6
    }
    return p
  }, [])

  useFrame((_, dt) => {
    if (!ending) return
    const open = smooth((elapsed() - END_SCENE.openFrom) / END_SCENE.openLen) * END_SCENE.openAngle
    // les deux vantaux s'ouvrent vers l'intérieur (loin de nous)
    if (left) left.rotation.y = open
    if (right) right.rotation.y = -open
    if (glow.current) glow.current.opacity = 0.6 + 0.4 * smooth((elapsed() - END_SCENE.openFrom) / END_SCENE.openLen)
    // cendres : chutent très lentement et reviennent en haut
    const pts = dust.current
    if (pts) {
      const a = pts.geometry.getAttribute('position') as BufferAttribute
      for (let i = 0; i < DUST; i++) {
        let y = a.getY(i) - dt * (0.05 + (i % 7) * 0.012)
        if (y < 0) y += 5
        a.setY(i, y)
        a.setX(i, a.getX(i) + Math.sin(elapsed() * 0.2 + i) * dt * 0.03)
      }
      a.needsUpdate = true
    }
  })

  return (
    <group visible={ending}>
      {ending && <fogExp2 attach="fog" args={['#000', 0.085]} />}
      <ambientLight intensity={0.55} color="#8f9bc0" />
      {/* éclairage froid de face, et contre-jour venant du halo */}
      <directionalLight position={[3, 5, 8]} intensity={1.1} color="#a8b4d8" />
      <pointLight position={[0, 1.4, -1.8]} intensity={6} distance={14} color="#e8eeff" />
      <primitive object={root} />
      <sprite position={[0, 1.3, -3.5]} scale={[22, 22, 1]}>
        <spriteMaterial map={glowMap} transparent fog={false} depthWrite={false} blending={AdditiveBlending} ref={glow} />
      </sprite>
      <points ref={dust}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dustGeo, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.035} color="#c9d3f5" transparent opacity={0.55} depthWrite={false} />
      </points>
    </group>
  )
}

/** Caméra de la scène du néant : marche lente et droite vers le portail, avec un léger balancement. */
export function EndCamera() {
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    const t = elapsed()
    const p = smooth(t / END_SCENE.approach)
    camera.position.set(Math.sin(t * 0.3) * 0.06, 1.5 + Math.sin(t * 0.9) * 0.025, 8 - 5.2 * p)
    camera.lookAt(0, 1.25, -2)
  })
  return null
}

useGLTF.preload(MODELS.portal)
