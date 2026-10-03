import { CanvasTexture, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type Object3D } from 'three'

/** Générateur pseudo-aléatoire déterministe : la plaie est toujours la même. */
const rng = (seed: number) => {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const W = 256
const H = 320
const CX = 128
const CY = 118

/**
 * Plaie de balle en texture 2D (fond transparent) : tache de sang humide qui s'étale, éclaboussures, quatre coulures
 * qui descendent avec leur goutte, étoffe déchirée autour du trou, trou noir au centre.
 */
function drawWound(seed = 11) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')!
  const r = rng(seed)

  // tache : blobs superposés, du bord sombre au cœur plus vif
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2
    const d = Math.pow(r(), 0.8) * 46
    const rad = 14 + r() * 26
    const grad = g.createRadialGradient(CX + Math.cos(a) * d, CY + Math.sin(a) * d * 1.15, 0, CX + Math.cos(a) * d, CY + Math.sin(a) * d * 1.15, rad)
    grad.addColorStop(0, 'rgba(110,8,6,0.95)')
    grad.addColorStop(0.7, 'rgba(78,4,3,0.85)')
    grad.addColorStop(1, 'rgba(60,3,2,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(CX + Math.cos(a) * d, CY + Math.sin(a) * d * 1.15, rad, 0, Math.PI * 2)
    g.fill()
  }
  // reflets humides : sang plus clair et brillant par endroits
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2
    const d = r() * 30
    g.fillStyle = `rgba(170,22,14,${0.25 + r() * 0.25})`
    g.beginPath()
    g.ellipse(CX + Math.cos(a) * d, CY + Math.sin(a) * d, 5 + r() * 9, 3 + r() * 6, r() * Math.PI, 0, Math.PI * 2)
    g.fill()
  }

  // coulures : traînées qui descendent, légèrement sinueuses, avec une goutte au bout
  g.lineCap = 'round'
  for (const [dx, len, w] of [[-26, 110, 6], [-8, 150, 7], [12, 95, 5], [30, 70, 4.5]] as const) {
    let x = CX + dx
    let y = CY + 14
    g.strokeStyle = 'rgba(82,5,4,0.92)'
    g.lineWidth = w
    g.beginPath()
    g.moveTo(x, y)
    const steps = 8
    for (let s = 1; s <= steps; s++) {
      x += (r() - 0.5) * 3
      y += len / steps
      g.lineTo(x, y)
    }
    g.stroke()
    g.fillStyle = 'rgba(96,6,5,0.95)'
    g.beginPath()
    g.ellipse(x, y + w * 0.4, w * 0.7, w * 1.05, 0, 0, Math.PI * 2)
    g.fill()
    // brillance de la coulure
    g.strokeStyle = 'rgba(180,30,20,0.3)'
    g.lineWidth = Math.max(1, w * 0.25)
    g.beginPath()
    g.moveTo(CX + dx - w * 0.2, CY + 16)
    g.lineTo(x - w * 0.2, y - 6)
    g.stroke()
  }

  // éclaboussures
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2
    const d = 30 + Math.pow(r(), 1.5) * 95
    g.fillStyle = `rgba(${70 + Math.floor(r() * 40)},4,3,${0.55 + r() * 0.4})`
    g.beginPath()
    g.arc(CX + Math.cos(a) * d, CY + Math.sin(a) * d * 1.1, 0.8 + r() * 3.6, 0, Math.PI * 2)
    g.fill()
  }

  // étoffe déchirée autour du trou, puis le trou lui-même (contour irrégulier)
  const hole = (rad: number, jitter: number, fill: string) => {
    g.fillStyle = fill
    g.beginPath()
    const n = 11
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const rr = rad * (1 + (r() - 0.5) * jitter)
      const x = CX + Math.cos(a) * rr
      const y = CY + Math.sin(a) * rr
      if (i === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.closePath()
    g.fill()
  }
  hole(15, 0.55, 'rgba(26,18,18,0.95)')
  hole(10, 0.5, 'rgba(48,4,3,1)')
  const core = g.createRadialGradient(CX, CY, 0, CX, CY, 8)
  core.addColorStop(0, 'rgba(0,0,0,1)')
  core.addColorStop(1, 'rgba(8,0,0,0.9)')
  g.fillStyle = core
  g.beginPath()
  g.arc(CX, CY, 7, 0, Math.PI * 2)
  g.fill()

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/**
 * Colle une plaie de balle sur la poitrine du croupier (côté du cœur) : un plan transparent, enfant du torse, qui en
 * suit donc la respiration et les mouvements. Renvoie le plan (à afficher selon la partie).
 */
export function addChestWound(torso: Object3D, obj: Object3D) {
  const mesh = new Mesh(
    new PlaneGeometry(0.27, 0.34),
    new MeshStandardMaterial({
      map: drawWound(),
      transparent: true,
      roughness: 0.3, // sang frais : brillant
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      side: DoubleSide,
    }),
  )
  mesh.name = 'plaie_balle'
  // point sur la poitrine, en coordonnées du modèle (le croupier regarde vers +Z ; son cœur est à +X) : on le convertit
  obj.updateMatrixWorld(true)
  mesh.position.copy(torso.worldToLocal(new Vector3(0.05, 0.98, 0.158)))
  mesh.renderOrder = 2
  mesh.visible = false
  torso.add(mesh)
  return mesh
}

/**
 * Chemise et veste trempées de sang (texture 2D, fond transparent) : larges nappes qui se recouvrent, longues coulures
 * depuis le col, giclées de gouttelettes.
 */
function drawSoak() {
  const w = 256
  const h = 384
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  const r = rng(77)

  // nappes
  for (let i = 0; i < 46; i++) {
    const x = 20 + r() * (w - 40)
    const y = 20 + Math.pow(r(), 1.2) * (h * 0.78)
    const rad = 18 + r() * 44
    const grad = g.createRadialGradient(x, y, 0, x, y, rad)
    grad.addColorStop(0, 'rgba(105,6,5,0.9)')
    grad.addColorStop(0.65, 'rgba(80,4,3,0.75)')
    grad.addColorStop(1, 'rgba(60,3,2,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
  }
  // coulures longues : du col et de la poitrine jusqu'au bas du buste
  g.lineCap = 'round'
  for (let i = 0; i < 14; i++) {
    let x = 30 + r() * (w - 60)
    let y = 14 + r() * 120
    const len = 120 + r() * 210
    const wd = 4 + r() * 11
    g.strokeStyle = `rgba(${74 + Math.floor(r() * 24)},5,4,0.9)`
    g.lineWidth = wd
    g.beginPath()
    g.moveTo(x, y)
    const steps = 10
    for (let s = 1; s <= steps; s++) {
      x += (r() - 0.5) * 4
      y += len / steps
      g.lineTo(x, y)
    }
    g.stroke()
    g.fillStyle = 'rgba(92,6,5,0.95)'
    g.beginPath()
    g.ellipse(x, y + wd * 0.4, wd * 0.7, wd * 1.1, 0, 0, Math.PI * 2)
    g.fill()
  }
  // giclées
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(${68 + Math.floor(r() * 50)},4,3,${0.5 + r() * 0.45})`
    g.beginPath()
    g.arc(r() * w, r() * h, 0.8 + r() * 3.2, 0, Math.PI * 2)
    g.fill()
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/**
 * Le croupier en partie 3 : tout le buste ensanglanté et criblé d'impacts. Un groupe d'enfants du torse (il suit
 * donc ses mouvements) : une nappe de sang qui couvre la chemise et la veste, et 8 plaies de balle réparties sur la
 * poitrine, le ventre et les flancs (positions en coordonnées du modèle, le croupier regarde vers +Z).
 */
export function addGore(torso: Object3D, obj: Object3D) {
  const group = new Group()
  group.name = 'gore'
  group.visible = false
  obj.updateMatrixWorld(true)
  const place = (mesh: Mesh, x: number, y: number, z: number, rot: number) => {
    mesh.position.copy(torso.worldToLocal(new Vector3(x, y, z)))
    mesh.rotation.z = rot
    mesh.renderOrder = 1
    group.add(mesh)
  }
  const mat = (map: CanvasTexture, rough: number) =>
    new MeshStandardMaterial({
      map,
      transparent: true,
      roughness: rough,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: DoubleSide,
    })

  // nappe de sang sur le devant du buste
  place(new Mesh(new PlaneGeometry(0.46, 0.7), mat(drawSoak(), 0.55)), 0, 0.93, 0.152, 0)

  // plaies : [x, y, taille, rotation, graine]
  const wounds: [number, number, number, number, number][] = [
    [-0.09, 1.08, 0.22, 0.3, 21],
    [0.13, 0.83, 0.2, -0.4, 33],
    [-0.05, 0.78, 0.24, 0.1, 45],
    [0.0, 1.15, 0.16, -0.2, 57],
    [-0.15, 0.9, 0.19, 0.5, 69],
    [0.16, 1.1, 0.18, -0.1, 81],
    [-0.12, 0.67, 0.19, 0.25, 93],
    [0.1, 0.68, 0.17, -0.5, 105],
  ]
  const textures = [21, 33, 45, 57].map((seed) => drawWound(seed))
  wounds.forEach(([x, y, size, rot, seed], i) => {
    const mesh = new Mesh(new PlaneGeometry(size, size * 1.25), mat(textures[i % textures.length], 0.3))
    place(mesh, x, y, 0.154 + i * 0.0004, rot + seed * 0.001)
  })
  torso.add(group)
  return group
}
