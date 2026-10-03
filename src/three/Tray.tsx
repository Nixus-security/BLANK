import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { Color, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import type { ItemId } from '../game/types'
import { useGameStore } from '../store/gameStore'
import { useStageStore } from '../store/stageStore'
import { playerUseItem } from './director'
import { LAYOUT, MODELS } from './models'
import { setupShadows } from './prepare'

/** Objets du plateau (inventaire.glb) ⇄ objets du jeu. */
const ITEM_NODES: Record<string, ItemId> = {
  canette_froissee: 'beer',
  loupe: 'loupe',
  paquet_et_zippo: 'cigarette',
  scie_a_metaux: 'saw',
  menottes: 'handcuffs',
  boite_de_pilules: 'pills',
  seringue_adrenaline: 'adrenaline',
  inverseur: 'inverter',
}

const itemOf = (o: Object3D): string | null => {
  for (let p: Object3D | null = o; p; p = p.parent) if (p.name in ITEM_NODES) return p.name
  return null
}

/** Assombrissement des objets du plateau que le joueur ne possède pas (ils restent posés, hors de portée). */
const UNOWNED_DIM = 0.45

/**
 * Plateau d'objets posé sur la table, côté joueur : tous les objets du jeu y sont posés. Ceux que le joueur
 * possède sont éclairés normalement et cliquables (un clic l'utilise) ; les autres restent visibles mais sombres
 * et inertes.
 */
export function Tray() {
  const { scene } = useGLTF(MODELS.inventory)
  const inventory = useGameStore((s) => s.game.inventory.player)
  const tutorial = useStageStore((s) => s.tutorial) // cinématique d'explication : tous les objets éclairés
  const hidden = useStageStore((s) => s.hideTray) // objet en main (animation d'utilisation) : il quitte le plateau
  const obj = useMemo(() => {
    const c = scene.clone(true)
    setupShadows(c)
    // matériaux propres à chaque pièce (ils sont partagés avec le fichier d'origine) : on mémorise la couleur de base
    c.traverse((o) => {
      if (!(o instanceof Mesh)) return
      const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
        const copy = m.clone()
        if (copy instanceof MeshStandardMaterial) copy.userData.base = copy.color.clone()
        return copy
      })
      o.material = Array.isArray(o.material) ? mats : mats[0]
    })
    return c
  }, [scene])

  useEffect(() => {
    for (const [name, id] of Object.entries(ITEM_NODES)) {
      const node = obj.getObjectByName(name)
      if (!node) continue
      node.visible = id !== hidden
      const k = tutorial || inventory.includes(id) ? 1 : UNOWNED_DIM
      node.traverse((o) => {
        if (!(o instanceof Mesh)) return
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          const base = m.userData.base as Color | undefined
          if (base && m instanceof MeshStandardMaterial) m.color.copy(base).multiplyScalar(k)
        }
      })
    }
  }, [obj, inventory, tutorial, hidden])

  return (
    <primitive
      object={obj}
      name="tray"
      position={[...LAYOUT.tray]}
      scale={LAYOUT.trayScale}
      onClick={(e: { object: Object3D; stopPropagation: () => void }) => {
        const name = itemOf(e.object)
        if (!name) return
        e.stopPropagation()
        if (!inventory.includes(ITEM_NODES[name])) return // posé sur la table mais pas dans l'inventaire
        void playerUseItem(ITEM_NODES[name])
      }}
      onPointerOver={(e: { object: Object3D }) => {
        const name = itemOf(e.object)
        if (name && inventory.includes(ITEM_NODES[name])) document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    />
  )
}
