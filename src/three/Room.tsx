import { useGLTF } from '@react-three/drei'
import { useEffect } from 'react'
import type { Group } from 'three'
import { useStageStore } from '../store/stageStore'
import { MODELS } from './models'
import { hideByName, setupShadows, stripLights, worldTransformOf, type WorldTransform } from './prepare'

interface PreparedRoom {
  scene: Group
  gun: WorldTransform | null
}
const cache = new WeakMap<Group, PreparedRoom>()

/** Accessoires du décor remplacés par des éléments de jeu (plateau d'objets, cartouches) ou gênant leur place. */
const REPLACED = [
  'fusil_a_pompe',
  'cartouche_0', 'cartouche_1', 'cartouche_2', 'cartouche_3', 'cartouche_4',
  'canette', 'loupe',
  // électrodes et câbles du défibrillateur : la boîte reste sur la table (voir DEFIB_SHIFT_Z), mais ses patchs
  // tomberaient sur le plateau d'objets du joueur et les câbles ne seraient plus raccordés
  'patch_1', 'patch_2', 'cable_defib_1', 'cable_defib_2',
]
/** Le plateau d'objets (x -0,86 à -0,26, z 0,86 à 1,34) recouvrait la boîte du défibrillateur : on la recule vers le croupier. */
const DEFIB_SHIFT_Z = -0.22

/** Prépare room.glb une seule fois : ombres, lumières embarquées retirées, accessoires remplacés masqués. */
export function useRoom(): PreparedRoom {
  const { scene: src } = useGLTF(MODELS.room)
  let prepared = cache.get(src)
  if (!prepared) {
    // exemplaire propre au jeu : l'original reste intact pour l'écran titre (TitleScene)
    const scene = src.clone(true)
    stripLights(scene)
    setupShadows(scene, ['lampe_suspendue'])
    // Le fusil interactif (shotgun.glb) reprend exactement la pose du fusil décoratif.
    const gun = worldTransformOf(scene, 'fusil_a_pompe')
    hideByName(scene, REPLACED)
    const defib = scene.getObjectByName('defibrillateur')
    if (defib) defib.position.z += DEFIB_SHIFT_Z
    prepared = { scene, gun }
    cache.set(src, prepared)
  }
  return prepared
}

export function Room() {
  const { scene } = useRoom()
  const defibGone = useStageStore((s) => s.defibGone) // partie 3 : le croupier retire le défibrillateur
  useEffect(() => {
    const defib = scene.getObjectByName('defibrillateur')
    if (defib) defib.visible = !defibGone
    return () => {
      if (defib) defib.visible = true // l'exemplaire est partagé : on le laisse intact en quittant la scène
    }
  }, [scene, defibGone])
  return <primitive object={scene} />
}
