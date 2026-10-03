import { useFrame } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { useMemo } from 'react'
import { RetroEffect } from '../shaders/retroEffect'
import { fx, tickFx } from './fx'

/** Pile de post-traitement PS1/CRT (un seul EffectPass). Multisampling 0 : pas d'anti-aliasing, volontairement. */
export function PostFX() {
  const retro = useMemo(() => new RetroEffect(), [])
  useFrame((_, dt) => {
    tickFx(Math.min(dt, 0.1))
    retro.setFlash(fx.flash, fx.flashColor)
    retro.setTransition(fx.transT)
    retro.setImpact(fx.impactT, fx.impactCenter, fx.impactColor)
  })
  return (
    <EffectComposer multisampling={0} depthBuffer>
      <primitive object={retro} dispose={null} />
    </EffectComposer>
  )
}
