import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { Mesh, MeshStandardMaterial, type Object3D, Quaternion, Vector3 } from 'three'
import type { Seat } from '../../game/multi/types'
import { MODELS } from '../models'
import { hideByName, setupShadows, stripLights } from '../prepare'
import { AvatarRig } from './avatarRig'
import { avatars, labels, mpClickSeat, mpHover, mpSeatClickable } from './mpDirector'
import { dealerMatrix, SEAT_COLORS, SEAT_CSS, type Slot } from './seats'

const headPos = new Vector3()

/** Mêmes retouches que le croupier (Croupier.tsx) : plastron sous la veste, yeux alignés. */
const PLASTRON_SHIFT = new Vector3(0, 0, -0.03)
const EYE_ALIGN = new Vector3(-0.018, 0.026, -0.006)

/**
 * Un autre joueur, assis à sa place : le modèle du croupier (masque de porcelaine, costume), costume et lueur des
 * yeux à la couleur du siège (on le reconnaît dans le noir). Animé par AvatarRig (attente, fusil en main, coup reçu, projeté à la mort).
 * Cliquable : cible du fusil, ou victime d'un objet (menottes, adrénaline).
 */
export function Avatar({ seat, slot }: { seat: Seat; slot: Slot }) {
  const { scene } = useGLTF(MODELS.dealer)
  const camera = useThree((s) => s.camera)
  const { obj, rig, head } = useMemo(() => {
    const c = scene.clone(true)
    stripLights(c)
    hideByName(c, ['table_plateau', 'table_tapis', 'table_pied'])
    // matériaux propres à cet avatar : le costume prend la couleur du siège
    c.traverse((o) => {
      if (!(o instanceof Mesh)) return
      const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
        const copy = m.clone()
        const color = SEAT_COLORS[seat % SEAT_COLORS.length]
        if (copy instanceof MeshStandardMaterial && copy.name === 'costume_noir') copy.color.copy(color)
        if (copy instanceof MeshStandardMaterial && copy.name === 'lueur_yeux') copy.emissive.set(SEAT_CSS[seat % SEAT_CSS.length])
        return copy
      })
      o.material = Array.isArray(o.material) ? mats : mats[0]
    })
    setupShadows(c)
    c.getObjectByName('plastron')?.position.add(PLASTRON_SHIFT)
    c.getObjectByName('orbite_d')?.position.add(EYE_ALIGN)
    return { obj: c, rig: new AvatarRig(c), head: c.getObjectByName('tete') as Object3D | undefined }
  }, [scene, seat])

  const place = useMemo(() => {
    const p = new Vector3()
    const r = new Quaternion()
    dealerMatrix(slot).decompose(p, r, new Vector3())
    return { p, r }
  }, [slot])

  useFrame(({ clock }, dt) => {
    rig.update(Math.min(dt, 0.05), clock.elapsedTime, avatars[seat])
    // étiquette du nom (MultiHud) : au-dessus de la tête, projetée à l'écran
    const l = labels[seat]
    if (!head) return
    head.getWorldPosition(headPos)
    headPos.y += 0.32
    headPos.project(camera)
    // gardée hors des bords (joueurs des bouts : leur tête frôle le bord, sous la liste des joueurs et les cartouches)
    l.x = Math.min(0.8, Math.max(0.2, (headPos.x + 1) / 2))
    l.y = Math.min(0.85, Math.max(0.12, (1 - headPos.y) / 2))
    l.on = headPos.z < 1
  })

  return (
    <group position={place.p} quaternion={place.r}>
      <primitive
        object={obj}
        onClick={(e: { stopPropagation: () => void }) => {
          if (!mpSeatClickable(seat)) return
          e.stopPropagation()
          mpClickSeat(seat)
        }}
        onPointerOver={() => {
          mpHover(seat)
          if (mpSeatClickable(seat)) document.body.style.cursor = 'crosshair'
        }}
        onPointerOut={() => {
          mpHover(null)
          document.body.style.cursor = ''
        }}
      />
      {/* lueur du masque : sans elle, la tête reste dans le noir au-dessus du cône de la lampe */}
      <pointLight position={[0, 1.55, 0.75]} color="#ffd9a0" intensity={0.8} distance={1.4} decay={1.6} />
      {/* et ses mains (le fusil qu'il tient, l'objet qu'il montre), loin du centre de la lampe aux bouts de la table */}
      <pointLight position={[0, 1.15, 0.85]} color="#ffd9a0" intensity={0.45} distance={1.0} decay={1.6} />
    </group>
  )
}
