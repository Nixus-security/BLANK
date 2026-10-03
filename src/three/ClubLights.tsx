import { useFrame } from '@react-three/fiber'
import { musicBeat } from './audio'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Color, ConeGeometry, DoubleSide, ShaderMaterial, type Group, type PointLight } from 'three'

/**
 * Éclairage de boîte de nuit techno en bas de la halle (écran titre) : faisceaux qui balayent,
 * lumières colorées et flash blanc qui pulsent sur les kicks de la bande son (instants détectés dans
 * audio.ts, lus d'après la position de lecture). Sans musique, repli sur un tempo fixe (BPM).
 */
const BPM = 143 // repli quand la bande son ne joue pas : tempo du morceau
const PALETTE = ['#ff2bd6', '#22d3ee', '#7c3aed', '#3b82f6', '#f43f5e', '#ffffff'].map((c) => new Color(c))

interface Emitter {
  pos: [number, number, number]
  /** vitesse et amplitude du balayage */
  speed: number
  amp: number
  /** décalage sur les temps (0 = coup, 0.5 = contretemps) */
  offbeat: number
  /** décalage de couleur dans la palette */
  hue: number
}

// Émetteurs au sol de la halle : face vitrée du fond (z ≈ -13) et sous la passerelle.
const EMITTERS: Emitter[] = [
  { pos: [4.5, 0.2, -13], speed: 0.9, amp: 0.7, offbeat: 0, hue: 0 },
  { pos: [8.5, 0.2, -13], speed: 1.3, amp: 0.8, offbeat: 0.5, hue: 2 },
  { pos: [12, 0.2, -12], speed: 1.0, amp: 0.7, offbeat: 0, hue: 4 },
  { pos: [4, 0.2, -8], speed: 1.6, amp: 0.6, offbeat: 0.5, hue: 1 },
  { pos: [9.5, 0.2, -8.5], speed: 1.1, amp: 0.9, offbeat: 0, hue: 3 },
  { pos: [3.5, 0.2, -6.5], speed: 1.4, amp: 0.6, offbeat: 0.5, hue: 5 },
]
const BEAM_LEN = 14

/** Faisceau volumétrique factice : plus lumineux au cœur (fresnel) et à la source, s'efface vers le haut. */
const beamMaterial = () =>
  new ShaderMaterial({
    uniforms: { uColor: { value: new Color('#ffffff') }, uOpacity: { value: 0.1 } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vY = position.y / ${BEAM_LEN.toFixed(1)};
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float fade = pow(1.0 - clamp(vY, 0.0, 1.0), 1.3);
        gl_FragColor = vec4(uColor, uOpacity * core * fade);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthWrite: false,
  })

export function ClubLights() {
  const beams = useRef<Group[]>([])
  const mats = useMemo(() => EMITTERS.map(beamMaterial), [])
  const lights = useRef<PointLight[]>([])
  const strobe = useRef<PointLight>(null)
  const geo = useMemo(() => {
    // cône ouvert : pointe à l'émetteur (origine), s'évase vers le haut
    const g = new ConeGeometry(0.55, BEAM_LEN, 24, 1, true)
    g.rotateX(Math.PI)
    g.translate(0, BEAM_LEN / 2, 0)
    return g
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // rythme : kicks réels de la bande son si elle joue, sinon métronome
    const mb = musicBeat()
    const beat = (t * BPM) / 60
    const kickPulse = mb ? mb.pulse : Math.exp(-(beat % 1) * 7)
    const offPulse = mb ? mb.off : Math.exp(-((beat + 0.5) % 1) * 7)
    const count = mb ? mb.index : Math.floor(beat)
    EMITTERS.forEach((e, i) => {
      const p = e.offbeat ? offPulse : kickPulse
      const color = PALETTE[(Math.floor(count / 2) + e.hue) % PALETTE.length]
      const g = beams.current[i]
      const m = mats[i]
      const l = lights.current[i]
      if (g) {
        g.rotation.z = Math.sin(t * e.speed + i) * e.amp
        g.rotation.x = Math.cos(t * e.speed * 0.7 + i * 2) * e.amp * 0.6
      }
      if (m) {
        m.uniforms.uColor.value.copy(color)
        m.uniforms.uOpacity.value = 0.25 + 1.1 * p
      }
      if (l) {
        l.color.copy(color)
        l.intensity = 12 + 130 * p
      }
    })
    // flash blanc à chaque kick, plus fort sur le premier de chaque mesure de 4
    if (strobe.current) strobe.current.intensity = (count % 4 === 0 ? 420 : 240) * kickPulse * kickPulse
  })

  return (
    <group>
      {EMITTERS.map((e, i) => (
        <group key={i} position={e.pos}>
          <group ref={(g) => { if (g) beams.current[i] = g }}>
            <mesh geometry={geo}>
              <primitive object={mats[i]} attach="material" />
            </mesh>
          </group>
          <pointLight ref={(l) => { if (l) lights.current[i] = l }} position={[0, 1.6, 0]} distance={16} decay={2} intensity={0} />
        </group>
      ))}
      <pointLight ref={strobe} position={[6, 4, -8]} color="#ffffff" distance={30} decay={1.6} intensity={0} />
    </group>
  )
}

