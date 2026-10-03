import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { useStageStore } from '../store/stageStore'
import { DealerRig } from './dealerRig'
import { playerFire } from './director'
import { fx } from './fx'
import { addChestWound, addGore } from './wound'
import { MODELS } from './models'
import { hideByName, setupShadows, stripLights } from './prepare'

const RED = new Color(1, 0, 0)
/** Partie 3 : couleurs vers lesquelles le sang fait virer le costume, la chemise et les gants (trempés). */
const GORE_TINT: Record<string, Color> = {
  chemise: new Color(0.38, 0.012, 0.01),
  gant_blanc: new Color(0.5, 0.02, 0.02),
  costume_noir: new Color(0.035, 0.003, 0.003),
}
/** Recul du plastron (m, repère du torse) pour qu'il reste sous la veste. */
const PLASTRON_SHIFT = new Vector3(0, 0, -0.03)
/** Décalage (m, repère de la tête) de l'œil droit pour l'aligner sur le gauche : plus haut, plus écarté, moins avancé. */
const EYE_ALIGN = new Vector3(-0.018, 0.026, -0.006)
/** La lueur de l'œil droit est 1,34 fois plus grosse que celle du gauche dans le modèle : on la ramène à la même taille. */
const RIGHT_GLOW_SCALE = 0.75

/**
 * Croupier assis face à nous, animé par DealerRig (attente, visée, coup reçu, effondrement).
 * le-croupier.glb embarque sa propre table (même position que celle de la salle) : on la masque.
 * Cliquable (cible "tirer sur le croupier") uniquement quand le joueur tient le fusil.
 */
export function Croupier() {
  const { scene } = useGLTF(MODELS.dealer)
  const { obj, rig, wound, gore, eyes } = useMemo(() => {
    const c = scene.clone(true)
    stripLights(c)
    hideByName(c, ['table_plateau', 'table_tapis', 'table_pied'])
    setupShadows(c)
    // le plastron (chemise) affleure sous l'ourlet de la veste (plus étroit que lui) : une pointe blanche perce
    // devant le bas du ventre. On le recule derrière la veste.
    c.getObjectByName('plastron')?.position.add(PLASTRON_SHIFT)
    const rig = new DealerRig(c)
    // plaie de balle sur la poitrine : visible à partir de la partie 2 (voir useFrame)
    const torso = c.getObjectByName('torse')
    const wound = torso ? addChestWound(torso, c) : null
    // partie 3 : tout le buste ensanglanté et criblé d'impacts (voir useFrame)
    const gore = torso ? addGore(torso, c) : null
    // yeux : dans le modèle, l'œil droit est 2,6 cm plus bas, 1,8 cm trop près du centre et 0,6 cm trop en avant par
    // rapport au gauche, et sa lueur est plus grosse : on le recale pour que les deux soient alignés et égaux
    for (const n of ['orbite_d', 'lueur_d']) c.getObjectByName(n)?.position.add(EYE_ALIGN)
    // les lueurs grossissent avec fx.eyeRed (plus de pixels rouges), chacune autour de son propre centre
    const eyes = ['lueur_g', 'lueur_d']
      .map((n) => c.getObjectByName(n))
      .filter((o): o is Mesh => o instanceof Mesh)
      .map((o) => {
        o.geometry.computeBoundingBox()
        const center = o.geometry.boundingBox!.getCenter(new Vector3())
        if (o.name === 'lueur_d') {
          o.scale.multiplyScalar(RIGHT_GLOW_SCALE)
          o.position.addScaledVector(center, 1 - RIGHT_GLOW_SCALE) // réduite autour de son centre
        }
        return { o, center, pos: o.position.clone(), scale: o.scale.clone() }
      })
    return { obj: c, rig, wound, gore, eyes }
  }, [scene])

  // matériaux du croupier (propres à ce modèle) : couleur d'origine mémorisée pour l'apparition hors de l'obscurité
  const mats = useMemo(() => {
    const list: { m: MeshStandardMaterial; color: Color; emissive: number; eye: boolean; emissiveColor: Color; tint: Color | null }[] = []
    const seen = new Set<unknown>()
    obj.traverse((o) => {
      if (!(o instanceof Mesh)) return
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (seen.has(m) || !(m instanceof MeshStandardMaterial)) continue
        seen.add(m)
        list.push({ m, color: m.color.clone(), emissive: m.emissiveIntensity, eye: m.name === 'lueur_yeux', emissiveColor: m.emissive.clone(), tint: GORE_TINT[m.name] ?? null })
      }
    })
    return list
  }, [obj])
  const shown = useRef(1)
  const shownEye = useRef(0)
  const shownGore = useRef(0)

  useFrame(({ clock }, dt) => {
    rig.update(Math.min(dt, 0.05), clock.elapsedTime)
    // les yeux grossissent : partie 2 ≈ ×1,9, partie 3 ≈ ×3,3 (autour de leur centre : ils restent à leur place)
    const grow = 1 + 0.9 * fx.eyeRed
    for (const e of eyes) {
      e.o.scale.copy(e.scale).multiplyScalar(grow)
      e.o.position.copy(e.pos).addScaledVector(e.center, 1 - grow)
    }
    const chapter = useStageStore.getState().chapter
    const goreK = chapter >= 3 ? 1 : 0
    if (wound) wound.visible = chapter >= 2 // il a déjà été abattu une fois
    if (gore) gore.visible = chapter >= 3 // et il a pris des balles de partout
    // apparition : fx.dealerReveal 0 -> 1 fait monter l'albédo du noir à sa valeur (le croupier « sort de l'ombre »)
    const r = fx.dealerReveal
    obj.visible = r > 0.002
    if (r !== shown.current || fx.eyeRed !== shownEye.current || goreK !== shownGore.current) {
      shown.current = r
      shownEye.current = fx.eyeRed
      shownGore.current = goreK
      const k = r * r
      for (const { m, color, emissive, eye, emissiveColor, tint } of mats) {
        m.color.copy(color)
        if (tint && goreK > 0) m.color.lerp(tint, goreK)
        m.color.multiplyScalar(k)
        // les yeux rougissent à chaque partie : lueur plus intense et plus saturée
        m.emissiveIntensity = emissive * k * (eye ? 1 + 1.8 * fx.eyeRed : 1)
        if (eye) m.emissive.copy(emissiveColor).lerp(RED, Math.min(1, fx.eyeRed * 0.7))
      }
    }
  })

  return (
    <primitive
      object={obj}
      name="croupier"
      onClick={(e: { stopPropagation: () => void }) => {
        if (!useStageStore.getState().aiming) return
        e.stopPropagation()
        void playerFire('dealer')
      }}
      onPointerOver={() => useStageStore.getState().aiming && (document.body.style.cursor = 'crosshair')}
      onPointerOut={() => (document.body.style.cursor = '')}
    />
  )
}
