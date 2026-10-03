import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Object3D, type SpotLight } from 'three'
import { fx } from './fx'
import { LAYOUT } from './models'

/** Un seul spot dur sous l'abat-jour, ombres nettes. Aucun ambient : le reste est noir. */
export function Lighting() {
  const target = useMemo(() => {
    const t = new Object3D()
    t.position.set(LAYOUT.tableCenter[0], 0.7, LAYOUT.tableCenter[2] - 0.05)
    return t
  }, [])

  const spot = useRef<SpotLight>(null)
  const BASE = 26

  // Ampoule instable : tremblement continu + coupures brèves aléatoires
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const slot = Math.floor(t * 9)
    const dip = Math.sin(slot * 12.9898) * 43758.5453 % 1 > 0.93 ? 0.55 : 1
    // papillotement fort (apparition du croupier) : la lampe se coupe par à-coups irréguliers (créneaux de ~50 ms,
    // plus fréquents quand fx.flicker est haut), avec des éclairs partiels entre les coupures
    let flick = 1
    if (fx.flicker > 0) {
      const r = (Math.sin(Math.floor(t * 20) * 78.233) * 43758.5453) % 1
      const u = Math.abs(r)
      if (u < fx.flicker * 0.75) flick = u < fx.flicker * 0.3 ? 0.03 : 0.12 + 0.5 * ((u * 37) % 1)
    }
    fx.lamp = dip * flick
    if (spot.current) spot.current.intensity = BASE * dip * flick * (1 + 0.025 * Math.sin(t * 47) + 0.015 * Math.sin(t * 13))
  })

  return (
    <>
      <color attach="background" args={['#000']} />
      <spotLight
        ref={spot}
        position={[...LAYOUT.lamp]}
        target={target}
        angle={0.85}
        penumbra={0.25}
        intensity={26}
        decay={1.6}
        color="#ffd9a0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-near={0.1}
        shadow-camera-far={8}
      />
      <primitive object={target} />
      {/* Filet quasi invisible pour que le noir ne soit pas 100% plat */}
      <ambientLight intensity={0.012} color="#405060" />
    </>
  )
}
