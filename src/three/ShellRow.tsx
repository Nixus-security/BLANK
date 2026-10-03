import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { Color, Mesh, MeshStandardMaterial, type Group } from 'three'
import { useGameStore } from '../store/gameStore'
import { LAYOUT, MODELS } from './models'
import { setupShadows } from './prepare'

export const LIVE = new Color('#b3261e')
export const BLANK = new Color('#3f7fc4')

/** Variante de cartouche : le corps ('etui') est teinté rouge (réelle) ou bleu (à blanc). */
export function makeVariant(src: Group, color: Color) {
  const c = src.clone(true)
  c.traverse((o) => {
    if (!(o instanceof Mesh)) return
    o.material = (o.material as MeshStandardMaterial).clone()
    if (o.name === 'etui') (o.material as MeshStandardMaterial).color.copy(color)
  })
  setupShadows(c)
  return c
}

/**
 * Cartouches restantes, alignées sur la table devant le croupier : rouges = réelles, bleues = à blanc.
 * Le décompte est public (annoncé au chargement) ; l'ordre de tir, lui, reste caché.
 */
export function ShellRow() {
  const { scene } = useGLTF(MODELS.shell)
  const remaining = useGameStore((s) => s.game.remaining)
  const variants = useMemo(() => ({ live: makeVariant(scene, LIVE), blank: makeVariant(scene, BLANK) }), [scene])

  const shells = [
    ...Array.from({ length: Math.max(remaining.live, 0) }, () => 'live' as const),
    ...Array.from({ length: Math.max(remaining.blank, 0) }, () => 'blank' as const),
  ]
  const spacing = 0.05
  const x0 = LAYOUT.shellRow[0] - ((shells.length - 1) * spacing) / 2

  return (
    <group>
      {shells.map((kind, i) => (
        <primitive
          key={`${kind}${i}`}
          object={variants[kind].clone(true)}
          position={[x0 + i * spacing, LAYOUT.tableTopY, LAYOUT.shellRow[1]]}
          rotation={[0, i * 1.7, 0]}
          scale={1.4}
        />
      ))}
    </group>
  )
}
