import { applyPS1 } from '../shaders/ps1Vertex'
import { Light, Mesh, Object3D, Quaternion, Vector3 } from 'three'

const isUnder = (o: Object3D, names: string[]) => {
  for (let p: Object3D | null = o; p; p = p.parent) if (names.includes(p.name)) return true
  return false
}

/** Ombres partout + vertex jitter PS1, sauf sur les sous-arbres listés (ex: la lampe, sinon l'abat-jour bloque la lumière). */
export function setupShadows(root: Object3D, noCast: string[] = []) {
  applyPS1(root)
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    o.castShadow = !isUnder(o, noCast)
    o.receiveShadow = true
  })
}

/** Supprime les lumières embarquées dans les GLB : l'éclairage est géré par la scène. */
export function stripLights(root: Object3D) {
  const lights: Object3D[] = []
  root.traverse((o) => o instanceof Light && lights.push(o))
  lights.forEach((l) => l.removeFromParent())
}

export function hideByName(root: Object3D, names: string[]) {
  root.traverse((o) => {
    if (names.includes(o.name)) o.visible = false
  })
}

export interface WorldTransform {
  position: Vector3
  quaternion: Quaternion
  scale: Vector3
}

export function worldTransformOf(root: Object3D, name: string): WorldTransform | null {
  root.updateWorldMatrix(true, true)
  const node = root.getObjectByName(name)
  if (!node) return null
  const t: WorldTransform = { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3() }
  node.matrixWorld.decompose(t.position, t.quaternion, t.scale)
  return t
}
