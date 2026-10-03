// Usage: node scripts/glbnodes.mjs file.glb name1,name2  -> transforms locales et monde des noeuds
import fs from 'fs'
import * as THREE from 'three'
const [f, names] = [process.argv[2], (process.argv[3] || '').split(',')]
const b = fs.readFileSync(f); const len = b.readUInt32LE(12); const j = JSON.parse(b.slice(20, 20 + len).toString())
const f3 = (v) => v.toArray().map((x) => +x.toFixed(3)).join(',')
const walk = (i, parent) => {
  const n = j.nodes[i]; const m = new THREE.Matrix4()
  if (n.matrix) m.fromArray(n.matrix)
  else m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])))
  const w = parent.clone().multiply(m)
  if (names.includes(n.name)) {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s)
    const e = new THREE.Euler().setFromQuaternion(q)
    const wp = new THREE.Vector3().setFromMatrixPosition(w)
    console.log(`${n.name}: local T(${f3(p)}) Euler(${f3(new THREE.Vector3(e.x, e.y, e.z))}) S(${f3(s)})  world(${f3(wp)})`)
  }
  ;(n.children || []).forEach((c) => walk(c, w))
}
j.scenes[0].nodes.forEach((r) => walk(r, new THREE.Matrix4()))
