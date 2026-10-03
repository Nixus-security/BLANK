import { useStageStore } from '../store/stageStore'
import { playerFire } from './director'

/**
 * Zone invisible devant la caméra (tiers bas de l écran, sous la ligne de la table) : "se tirer dessus".
 * Active seulement quand le fusil est en main, sinon elle ne capte pas les clics.
 */
export function SelfTarget() {
  const aiming = useStageStore((s) => s.aiming)
  if (!aiming) return null
  return (
    <mesh
      position={[0, 0.84, 1.5]}
      onClick={(e) => {
        e.stopPropagation()
        void playerFire('player')
      }}
      onPointerOver={() => (document.body.style.cursor = 'crosshair')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <planeGeometry args={[2.4, 0.16]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}
