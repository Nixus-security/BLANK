import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Light, type Mesh, type WebGLProgramParametersWithUniforms } from 'three'
import { useLangStore } from '../i18n'
import { useStageStore } from '../store/stageStore'
import { setScratch } from './audio'
import { ContractPaper, INK_RECT, MIN_STROKE, PAPER_M, PAPER_PX, SIGN_RECT } from './contractPaper'
import { signContract } from './director'
import { LAYOUT, MODELS } from './models'

/** La lumière d'ampoule du fichier (6 cd) est trop faible sans tone mapping : on la renforce, sans autre changement. */
const LIGHT_BOOST = 10
/** Centre de la feuille en profondeur (la table va de z 0,45 à 1,35). */
const PAPER_Z = 1.01

/**
 * Décor de la scène du contrat : environnement-salle.glb tel quel (aucun accessoire masqué ni remplacé,
 * sa propre ampoule comme seule source de lumière). Sans croupier : il n'apparaît qu'en partie.
 * Le décor de jeu (Room.tsx) est une autre copie du fichier, modifiée pour la partie.
 * Le contrat (feuille A4) est posé à plat sur la table, sous l'ampoule : on signe directement dessus.
 */
export function ContractScene() {
  const { scene } = useGLTF(MODELS.room)
  const room = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o) => {
      if (o instanceof Light) o.intensity *= LIGHT_BOOST
    })
    // la feuille occupe le centre de la table : on repousse les objets du décor qui y sont posés (rien n'est masqué)
    for (const n of ['fusil_a_pompe', 'cartouche_0', 'cartouche_1', 'cartouche_2', 'cartouche_3', 'cartouche_4']) {
      const o = c.getObjectByName(n)
      if (o) o.position.z -= 0.46 // vers le côté du croupier
    }
    for (const n of ['jeton_0', 'jeton_1', 'jeton_2', 'jeton_3']) {
      const o = c.getObjectByName(n)
      if (o) o.position.x -= 0.14 // sur la gauche de la table
    }
    return c
  }, [scene])
  return (
    <>
      <primitive object={room} name="contract-room" />
      <ContractPaper3D />
    </>
  )
}

/** Sait convertir une position UV de la feuille en pixels de texture. */
const toPx = (uv: { x: number; y: number }) => ({ x: uv.x * PAPER_PX.w, y: (1 - uv.y) * PAPER_PX.h })
const inSign = (p: { x: number; y: number }) =>
  p.x >= SIGN_RECT.x - 30 && p.x <= SIGN_RECT.x + SIGN_RECT.w + 30 && p.y >= SIGN_RECT.y - 60 && p.y <= SIGN_RECT.y + SIGN_RECT.h + 40

/**
 * La feuille échappe au post-traitement rétro : elle écrit un alpha de 0,5 dans le buffer de scène (le reste de
 * la scène y met 1 ou 0), que RetroEffect lit pour la restituer nette, en pleine résolution.
 */
const keepSharp = (shader: WebGLProgramParametersWithUniforms) => {
  shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.a = 0.5;')
}

/** Calque d'encre en repère local de la feuille (origine au centre, y vers le haut). */
const inkW = (INK_RECT.w / PAPER_PX.w) * PAPER_M.w
const inkH = (INK_RECT.h / PAPER_PX.h) * PAPER_M.h
const inkX = ((INK_RECT.x + INK_RECT.w / 2) / PAPER_PX.w - 0.5) * PAPER_M.w
const inkY = (0.5 - (INK_RECT.y + INK_RECT.h / 2) / PAPER_PX.h) * PAPER_M.h

function ContractPaper3D() {
  const paper = useMemo(() => new ContractPaper(), [])
  const mesh = useRef<Mesh>(null)
  const stroke = useRef({ on: false, len: 0, x: 0, y: 0 })
  const signed = useStageStore((s) => s.signed)
  const lang = useLangStore((s) => s.lang)

  useEffect(
    () => () => {
      paper.texture.dispose()
      paper.inkTexture.dispose()
    },
    [paper],
  )
  // changement de langue (écran d'accueil) : le texte de la feuille est redessiné
  useEffect(() => {
    paper.redraw()
  }, [lang, paper])
  // le calque d'encre n'est renvoyé au GPU qu'une fois par image, quel que soit le nombre d'événements souris
  useFrame(() => paper.flush())
  // à la signature : tampon rouge sur la feuille
  useEffect(() => {
    if (signed) paper.stamp()
  }, [signed, paper])

  const finish = () => {
    const s = stroke.current
    if (!s.on) return
    s.on = false
    setScratch(0)
    if (s.len >= MIN_STROKE) void signContract()
    else paper.clear() // simple gribouillis : on recommence
  }

  return (
    <mesh
      ref={mesh}
      position={[LAYOUT.tableCenter[0], LAYOUT.tableTopY + 0.004, PAPER_Z]}
      rotation={[-Math.PI / 2, 0, -0.04]}
      onPointerDown={(e) => {
        if (useStageStore.getState().signed || !e.uv) return
        const p = toPx(e.uv)
        if (!inSign(p)) return
        e.stopPropagation()
        stroke.current = { on: true, len: 0, x: p.x, y: p.y }      }}
      onPointerMove={(e) => {
        const s = stroke.current
        if (!e.uv) return
        const p = toPx(e.uv)
        document.body.style.cursor = !useStageStore.getState().signed && inSign(p) ? 'crosshair' : ''
        if (!s.on || useStageStore.getState().signed) return
        paper.strokeTo(s.x, s.y, p.x, p.y)
        const step = Math.hypot(p.x - s.x, p.y - s.y)
        s.len += step
        s.x = p.x
        s.y = p.y
        setScratch(Math.min(step / 40, 1)) // le grattement suit la vitesse du geste
      }}
      onPointerUp={finish}
      onPointerOut={() => {
        document.body.style.cursor = ''
        finish() // le stylo quitte la feuille : le tracé s'arrête
      }}
    >
      <planeGeometry args={[PAPER_M.w, PAPER_M.h]} />
      <meshStandardMaterial
        map={paper.texture}
        color="#8a857a"
        roughness={0.95}
        metalness={0}
        onBeforeCompile={keepSharp}
        customProgramCacheKey={() => 'paper-keep'}
      />
      {/* calque d'encre : ignore les clics (le tracé se lit sur la feuille en dessous) */}
      <mesh position={[inkX, inkY, 0.0005]} raycast={() => null}>
        <planeGeometry args={[inkW, inkH]} />
        <meshStandardMaterial
          map={paper.inkTexture}
          color="#8a857a"
          roughness={0.95}
          metalness={0}
          alphaTest={0.35}
          polygonOffset
          polygonOffsetFactor={-1}
          onBeforeCompile={keepSharp}
          customProgramCacheKey={() => 'paper-keep'}
        />
      </mesh>
    </mesh>
  )
}
