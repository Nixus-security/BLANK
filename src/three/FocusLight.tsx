import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { PointLight } from 'three'
import { fx } from './fx'

/**
 * Lumière de mise en valeur pendant la cinématique d'explication : une petite source chaude, juste au-dessus de
 * l'objet expliqué (fx.focus), qui s'allume et s'éteint en douceur et se déplace d'un objet à l'autre.
 */
export function FocusLight() {
  const light = useRef<PointLight>(null)
  const level = useRef(0)
  useFrame(({ clock }, dt) => {
    const l = light.current
    if (!l) return
    level.current += ((fx.focus.on ? 1 : 0) - level.current) * (1 - Math.exp(-Math.min(dt, 0.1) * 5))
    // la lumière glisse vers le nouvel objet au lieu d'y sauter
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 7)
    l.position.x += (fx.focus.x - l.position.x) * k
    l.position.y += (fx.focus.y + 0.38 - l.position.y) * k
    l.position.z += (fx.focus.z - l.position.z) * k
    l.intensity = 2.8 * level.current * (1 + 0.04 * Math.sin(clock.elapsedTime * 9))
  })
  return <pointLight ref={light} color="#ffe2b0" intensity={0} distance={1.6} decay={1.6} />
}
