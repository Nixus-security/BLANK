// Usage: node scripts/glbtree.mjs file.glb  -> enfants du noeud racine avec bbox monde, + lumières
import fs from 'fs'
import * as THREE from 'three'
const b = fs.readFileSync(process.argv[2]); const len = b.readUInt32LE(12); const j = JSON.parse(b.slice(20, 20 + len).toString())
const f3 = (v) => v.toArray().map((x) => +x.toFixed(2)).join(',')
const total = new THREE.Box3()
const walk = (i, parent, depth) => {
  const n = j.nodes[i]; const m = new THREE.Matrix4()
  if (n.matrix) m.fromArray(n.matrix)
  else m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])))
  const w = parent.clone().multiply(m); const box = new THREE.Box3()
  if (n.mesh !== undefined) for (const p of j.meshes[n.mesh].primitives) {
    const a = j.accessors[p.attributes.POSITION]
    box.union(new THREE.Box3(new THREE.Vector3(...a.min), new THREE.Vector3(...a.max)).applyMatrix4(w))
  }
  for (const c of n.children || []) box.union(walk(c, w, depth + 1))
  if (n.extensions?.KHR_lights_punctual) console.log('LIGHT', n.name, 'pos', f3(new THREE.Vector3().setFromMatrixPosition(w)))
  if (depth === 1 && !box.isEmpty()) console.log(`${n.name}  min ${f3(box.min)}  max ${f3(box.max)}`)
  return box
}
for (const r of j.scenes[0].nodes) total.union(walk(r, new THREE.Matrix4(), 0))
console.log('TOTAL min', f3(total.min), 'max', f3(total.max))
