// Inspecte les GLB : bbox monde par noeud de haut niveau (usage: node scripts/glbinfo.mjs)
import fs from 'fs'
import * as THREE from 'three'
const depthShow = 2
for (const f of fs.readdirSync('.').filter((f) => f.endsWith('.glb'))) {
  const b = fs.readFileSync(f)
  const len = b.readUInt32LE(12)
  const j = JSON.parse(b.slice(20, 20 + len).toString())
  const nodes = j.nodes
  const total = new THREE.Box3()
  const out = []
  const walk = (i, parent, depth) => {
    const n = nodes[i]
    const m = new THREE.Matrix4()
    if (n.matrix) m.fromArray(n.matrix)
    else m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])))
    const world = parent.clone().multiply(m)
    const box = new THREE.Box3()
    if (n.mesh !== undefined) for (const p of j.meshes[n.mesh].primitives) {
      const a = j.accessors[p.attributes.POSITION]
      const bb = new THREE.Box3(new THREE.Vector3(...a.min), new THREE.Vector3(...a.max)).applyMatrix4(world)
      box.union(bb)
    }
    for (const c of n.children || []) box.union(walk(c, world, depth + 1))
    if (depth <= depthShow && !box.isEmpty()) out.push(`${'  '.repeat(depth)}${n.name} min ${box.min.toArray().map((x) => x.toFixed(2))} max ${box.max.toArray().map((x) => x.toFixed(2))}`)
    return box
  }
  for (const r of j.scenes[0].nodes) total.union(walk(r, new THREE.Matrix4(), 0))
  console.log(`== ${f}  total min ${total.min.toArray().map((x) => x.toFixed(2))} max ${total.max.toArray().map((x) => x.toFixed(2))}`)
  console.log(out.join('\n'))
  console.log('lights:', (j.extensions?.KHR_lights_punctual?.lights || []).map((l) => l.type + ' ' + l.intensity).join(', '))
}
