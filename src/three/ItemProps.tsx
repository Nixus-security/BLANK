import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  Box3, BoxGeometry, CapsuleGeometry, Color, CylinderGeometry, Euler, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, type Object3D, type PointLight, Quaternion, Vector3,
} from 'three'
import type { Actor, ItemId } from '../game/types'
import { useGameStore } from '../store/gameStore'
import { fx } from './fx'
import { gunGrips } from './grips'
import { LAYOUT, MODELS } from './models'
import { setupShadows } from './prepare'
import { BLANK, LIVE, makeVariant } from './ShellRow'

/**
 * Objets en action : quand le joueur ou le croupier utilise un objet, une copie de l'objet du plateau (inventaire.glb)
 * est soulevée, montrée à la caméra, puis fait son geste (menottes passées, canon scié, loupe sur la chambre, bière
 * bue, balle éjectée, cigarette allumée, pilules avalées, seringue plantée, inverseur branché). Tout est calculé à
 * partir du temps écoulé depuis le début (fx.act) : le réalisateur (director.ts) ne fait que lancer et attendre.
 */

// --- points du monde ---------------------------------------------------------------------------------------------

/** Où chaque camp montre l'objet : devant soi, à hauteur d'yeux, bien en vue de la caméra. */
const S_PLAYER = new Vector3(0, 1.04, 1.42)
const S_DEALER = new Vector3(-0.25, 1.12, 0.7)
/** La bouche (boire, fumer, avaler) et le bras (injection). */
const MOUTH_PLAYER = new Vector3(0, 1.1, 1.56)
const MOUTH_DEALER = new Vector3(0, 1.3, 0.42)
const ARM_PLAYER = new Vector3(-0.2, 1.05, 1.6)
const ARM_DEALER = new Vector3(0.26, 1.0, 0.46)
/** Poignets de la victime des menottes (le croupier : ses mains sur la table ; le joueur : devant nous). */
export const CUFFS_DEALER = new Vector3(0, 0.8, 0.56)
export const CUFFS_PLAYER = new Vector3(0.04, 0.8, 1.42)
/** D'où le croupier sort ses objets (sa main, côté droit de la table). */
const DEALER_POCKET = new Vector3(-0.3, 0.84, 0.52)

/** Taille de l'objet montré (1 = taille du plateau) : les petits objets sont agrandis pour qu'on les voie. */
const PRESENT: Record<ItemId, number> = { beer: 1.8, loupe: 1.5, cigarette: 1.6, saw: 1.3, handcuffs: 1.5, pills: 2.4, adrenaline: 1.8, inverter: 1.7 }

const NODE: Record<ItemId, string> = {
  beer: 'canette_froissee',
  loupe: 'loupe',
  cigarette: 'paquet_et_zippo',
  saw: 'scie_a_metaux',
  handcuffs: 'menottes',
  pills: 'boite_de_pilules',
  adrenaline: 'seringue_adrenaline',
  inverter: 'inverseur',
}
/** Éléments du plateau qu'on n'emporte pas avec l'objet (pilules éparses, fils de l'inverseur). */
const DROP: Partial<Record<ItemId, string[]>> = {
  pills: ['gelule_rouge', 'gelule_blanche', 'comprime'],
  inverter: ['fil_rouge', 'fil_noir'],
}
/** Pièce de l'objet qui doit se retrouver sur le point visé (le verre de la loupe sur la chambre…). */
const ANCHOR: Partial<Record<ItemId, string>> = { loupe: 'verre', saw: 'lame', adrenaline: 'aiguille', cigarette: 'meche', inverter: 'bouton_rouge' }

// --- construction des objets -------------------------------------------------------------------------------------

interface Prop {
  outer: Group
  /** Centre de l'objet sur le plateau (monde) */
  origin: Vector3
  /** Orientation de l'objet posé sur le plateau (rotation autour de la verticale) */
  yaw0: number
  /** Décalage (local, non mis à l'échelle) du point d'ancrage par rapport au centre */
  anchor: Vector3
  /** Pièce repérée pour les effets (flamme du zippo, aiguille…) */
  parts: Record<string, Object3D | undefined>
}

function buildProp(scene: Group, id: ItemId): Prop {
  const c = scene.clone(true)
  const node = c.getObjectByName(NODE[id])!
  const drop = DROP[id] ?? []
  const gone: Object3D[] = []
  node.traverse((o) => drop.includes(o.name) && gone.push(o))
  gone.forEach((o) => o.removeFromParent())
  c.updateMatrixWorld(true)
  const center = new Box3().setFromObject(node).getCenter(new Vector3())
  const pos = new Vector3()
  const q = new Quaternion()
  const s = new Vector3()
  node.matrixWorld.decompose(pos, q, s)
  const yaw0 = new Euler().setFromQuaternion(q, 'YXZ').y

  // l'objet est remis droit (sa rotation de plateau devient yaw0) et recentré sur son milieu : on le fait tourner autour
  const holder = new Group()
  holder.add(node)
  node.position.copy(pos)
  node.quaternion.identity()
  node.scale.copy(s)
  holder.updateMatrixWorld(true)
  node.position.sub(new Box3().setFromObject(node).getCenter(new Vector3()))
  holder.updateMatrixWorld(true)

  const anchor = new Vector3()
  const a = ANCHOR[id] && node.getObjectByName(ANCHOR[id]!)
  if (a) new Box3().setFromObject(a).getCenter(anchor)
  const parts: Record<string, Object3D | undefined> = {}
  for (const n of ['meche', 'aiguille', 'bouton_rouge', 'verre']) parts[n] = node.getObjectByName(n)

  setupShadows(holder)
  const outer = new Group()
  outer.add(holder)
  outer.visible = false
  const origin = new Vector3(LAYOUT.tray[0] + LAYOUT.trayScale * center.x, LAYOUT.tray[1] + LAYOUT.trayScale * center.y, LAYOUT.tray[2] + LAYOUT.trayScale * center.z)
  return { outer, origin, yaw0, anchor, parts }
}

// --- trajectoires -------------------------------------------------------------------------------------------------

/** Image clé : position (le point d'ancrage s'il y en a un, avec poids `a`), rotation [bascule vers nous, cap, roulis sur l'axe long], taille. */
interface Key {
  t: number
  p: Vector3
  r: [number, number, number]
  s: number
  a?: number
}
const V = (x: number, y: number, z: number) => new Vector3(x, y, z)
const plus = (v: Vector3, x: number, y: number, z: number) => v.clone().add(V(x, y, z))
const R = (tilt = 0, yaw = 0, roll = 0): [number, number, number] => [tilt, yaw, roll]
const smooth = (k: number) => k * k * (3 - 2 * k)

const sampled = { p: new Vector3(), r: [0, 0, 0] as [number, number, number], s: 1, a: 0 }
/** Interpole (en douceur) entre les images clés ; avant la première / après la dernière, reste figé. */
function sample(keys: Key[], t: number) {
  const first = keys[0]
  const last = keys[keys.length - 1]
  const put = (k: Key) => {
    sampled.p.copy(k.p)
    sampled.r = [...k.r]
    sampled.s = k.s
    sampled.a = k.a ?? 0
  }
  if (t <= first.t) return put(first)
  if (t >= last.t) return put(last)
  let i = 0
  while (t > keys[i + 1].t) i++
  const A = keys[i]
  const B = keys[i + 1]
  const k = smooth((t - A.t) / (B.t - A.t))
  sampled.p.lerpVectors(A.p, B.p, k)
  sampled.r = [A.r[0] + (B.r[0] - A.r[0]) * k, A.r[1] + (B.r[1] - A.r[1]) * k, A.r[2] + (B.r[2] - A.r[2]) * k]
  sampled.s = A.s + (B.s - A.s) * k
  sampled.a = (A.a ?? 0) + ((B.a ?? 0) - (A.a ?? 0)) * k
}

interface Ctx {
  user: Actor
  dealer: boolean
  P0: Vector3
  S: Vector3
  MOUTH: Vector3
  ARM: Vector3
  FOE: Vector3
  ch: Vector3
  saw: Vector3
  yaw0: number
  /** cap qui met la scie en travers du canon */
  psi: number
  m: number
  grow0: number
  apply: number
}

const HIDE = 0.01

function keysFor(id: ItemId, c: Ctx): Key[] {
  const { P0, S, MOUTH, ARM, FOE, ch, saw, yaw0, psi, m, grow0, apply } = c
  const rest = R(0, yaw0)
  const show = R(0.95, yaw0 * 0.3)
  const start: Key = { t: 0, p: P0, r: rest, s: grow0 }
  const lift: Key = { t: 0.7, p: S, r: show, s: m }
  switch (id) {
    case 'handcuffs':
      return [
        start,
        lift,
        { t: 1.45, p: plus(S, 0, 0.02, 0), r: R(0.95, yaw0 * 0.3 + 0.9), s: m }, // elles tournent : on les voit
        { t: 1.95, p: plus(FOE, 0, 0.14, 0), r: R(0.3, 0.3), s: m * 0.8 },
        { t: apply, p: plus(FOE, 0, 0.012, 0), r: R(0, 0.3), s: 1.35 },
      ]
    case 'saw':
      return [
        start,
        { t: 0.7, p: S, r: R(0.95, yaw0 * 0.3), s: 1.3 },
        { t: 1.5, p: plus(saw, 0, 0.16, 0), r: R(0, psi, -1.2), s: 1.4, a: 1 },
        { t: 1.9, p: plus(saw, 0, 0.06, 0), r: R(0, psi, -Math.PI / 2), s: 1.3, a: 1 },
        { t: apply - 0.05, p: plus(saw, 0, 0.012, 0), r: R(0, psi, -Math.PI / 2), s: 1.3, a: 1 }, // il s'enfonce
        { t: apply + 0.5, p: plus(saw, 0, 0.14, 0), r: R(0, psi, -1.2), s: 1.35, a: 1 },
        { t: apply + 1.0, p: S, r: R(0.95, yaw0 * 0.3), s: 1.3 },
        { t: apply + 1.2, p: S, r: R(0.95, yaw0 * 0.3), s: HIDE },
      ]
    case 'loupe':
      return [
        start,
        { t: 0.7, p: S, r: R(0.95, yaw0 * 0.3), s: 1.5 },
        { t: 1.5, p: plus(ch, 0, 0.16, 0), r: R(0, -0.6), s: 1.3, a: 1 },
        { t: 3.2, p: plus(ch, 0.012, 0.15, -0.01), r: R(0, -0.4), s: 1.3, a: 1 },
        { t: 3.7, p: S, r: R(0.95, yaw0 * 0.3), s: 1.5 },
        { t: 4.1, p: S, r: R(0.95, yaw0 * 0.3), s: HIDE },
      ]
    case 'beer':
      return [
        start,
        { t: 0.7, p: S, r: R(0.4, yaw0 * 0.3), s: m },
        { t: 1.35, p: MOUTH, r: R(0.7, 0, 0), s: m },
        { t: 1.75, p: MOUTH, r: R(1.55, 0, 0), s: m }, // elle se penche : il boit
        { t: 2.35, p: MOUTH, r: R(1.55, 0, 0), s: m },
        { t: 2.7, p: plus(S, 0, 0.0, 0), r: R(0.4, 0.4), s: m },
        { t: 3.0, p: plus(S, 0.55, 0.15, 0), r: R(2.5, 2.2, 3.0), s: m * 0.9 }, // jetée de côté
        { t: 3.5, p: plus(S, 0.95, -0.5, 0.05), r: R(5.5, 3.8, 6.0), s: m * 0.8 },
        { t: 3.7, p: plus(S, 1.0, -0.8, 0.05), r: R(5.5, 3.8, 6.0), s: HIDE },
      ]
    case 'cigarette':
      return [
        start,
        { t: 0.7, p: S, r: show, s: m },
        { t: 1.3, p: plus(S, 0, 0.02, 0), r: R(0.7, yaw0 * 0.3 + 0.5), s: m }, // le zippo claque
        { t: 2.3, p: plus(MOUTH, 0, -0.05, -0.1), r: R(0.5, 0.2), s: m },
        { t: 3.7, p: plus(MOUTH, 0, -0.05, -0.1), r: R(0.5, 0.2), s: m },
        { t: 4.1, p: S, r: show, s: m },
        { t: 4.5, p: S, r: show, s: HIDE },
      ]
    case 'pills':
      return [
        start,
        { t: 0.7, p: S, r: R(0.5, 0), s: m },
        { t: 1.6, p: plus(S, 0, 0.03, 0), r: R(0.5, 0), s: m }, // elles s'entrechoquent (secousse en plus)
        { t: 2.3, p: plus(S, 0, 0.03, 0), r: R(1.9, 0), s: m }, // il verse dans sa paume
        { t: 3.0, p: S, r: R(0.5, 0), s: m },
        { t: 3.7, p: S, r: R(0.5, 0), s: m },
        { t: 4.1, p: S, r: R(0.5, 0), s: HIDE },
      ]
    case 'adrenaline': {
      const side = c.dealer ? -1 : 1 // la seringue arrive du côté opposé au bras visé
      const yaw = c.dealer ? 0 : Math.PI // l'aiguille (côté +X de la seringue) pointe vers le bras
      return [
        start,
        { t: 0.7, p: S, r: show, s: m },
        { t: 1.3, p: plus(S, 0, 0.03, 0), r: R(0.7, yaw0 * 0.3 + 0.8), s: m },
        { t: 1.9, p: plus(ARM, 0.3 * side, 0.05, 0), r: R(0.1, yaw), s: m, a: 1 },
        { t: 2.35, p: plus(ARM, 0.0, 0, 0), r: R(0.1, yaw), s: m, a: 1 }, // elle s'enfonce
        { t: 3.1, p: plus(ARM, 0.0, 0, 0), r: R(0.1, yaw), s: m, a: 1 },
        { t: 3.6, p: plus(ARM, 0.45 * side, 0.12, 0), r: R(0.6, yaw + 0.4 * side), s: m, a: 1 },
        { t: 3.9, p: plus(ARM, 0.5 * side, -0.4, 0), r: R(2.5, yaw + 0.4 * side), s: HIDE, a: 1 },
      ]
    }
    case 'inverter':
      return [
        start,
        { t: 0.7, p: S, r: R(0.8, yaw0 * 0.3), s: m },
        { t: 1.4, p: plus(ch, 0, 0.17, 0), r: R(0, 0.5), s: 1.4, a: 1 },
        { t: 1.8, p: plus(ch, 0, 0.1, 0), r: R(0, 0.5), s: 1.4, a: 1 },
        { t: 3.0, p: plus(ch, 0, 0.1, 0), r: R(0, 0.5), s: 1.4, a: 1 },
        { t: 3.5, p: S, r: R(0.8, yaw0 * 0.3), s: m },
        { t: 3.9, p: S, r: R(0.8, yaw0 * 0.3), s: HIDE },
      ]
  }
}

// --- particules ---------------------------------------------------------------------------------------------------

interface Particle {
  p: Vector3
  v: Vector3
  age: number
  life: number
  s0: number
  s1: number
  gravity: number
  color: Color
}

/** Réserve de particules rendues en un seul InstancedMesh (étincelles, fumée…). */
class Pool {
  mesh: InstancedMesh
  parts: (Particle | null)[]
  private m = new Matrix4()
  private q = new Quaternion()
  private sc = new Vector3()
  constructor(cap: number, mesh: InstancedMesh) {
    this.mesh = mesh
    this.parts = Array<Particle | null>(cap).fill(null)
    mesh.frustumCulled = false
    mesh.count = cap
    for (let i = 0; i < cap; i++) mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0))
    mesh.instanceMatrix.needsUpdate = true
  }
  emit(p: Particle) {
    let i = this.parts.findIndex((x) => !x)
    if (i < 0) i = Math.floor(Math.random() * this.parts.length)
    this.parts[i] = p
  }
  update(dt: number) {
    for (let i = 0; i < this.parts.length; i++) {
      const q = this.parts[i]
      if (!q) {
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0))
        continue
      }
      q.age += dt
      if (q.age >= q.life) {
        this.parts[i] = null
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0))
        continue
      }
      q.v.y -= q.gravity * dt
      q.p.addScaledVector(q.v, dt)
      const k = q.age / q.life
      const size = (q.s0 + (q.s1 - q.s0) * k) * (1 - k ** 4)
      this.sc.setScalar(Math.max(size, 0.0001))
      this.m.compose(q.p, this.q.identity(), this.sc)
      this.mesh.setMatrixAt(i, this.m)
      this.mesh.setColorAt(i, q.color)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const SPARK = new Color(1, 0.72, 0.28)
const SMOKE = new Color(0.62, 0.62, 0.66)
const TABLE_Y = 0.78

const qa = new Quaternion()
const qb = new Quaternion()
const qc = new Quaternion()
const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const tmpV = new Vector3()
const tmpW = new Vector3()

/** Mini balistique d'un objet qui retombe sur la table (balle éjectée, bout de canon scié). */
interface Flying {
  on: boolean
  p: Vector3
  v: Vector3
  spin: Vector3
  rot: Vector3
}
const newFlying = (): Flying => ({ on: false, p: new Vector3(), v: new Vector3(), spin: new Vector3(), rot: new Vector3() })
function stepFlying(f: Flying, dt: number, rest: number) {
  f.v.y -= 9.8 * dt
  f.p.addScaledVector(f.v, dt)
  f.rot.addScaledVector(f.spin, dt)
  if (f.p.y < TABLE_Y + rest) {
    f.p.y = TABLE_Y + rest
    f.v.y *= -0.32
    f.v.x *= 0.6
    f.v.z *= 0.6
    f.spin.multiplyScalar(0.5)
  }
}

// --- composant ----------------------------------------------------------------------------------------------------

export function ItemProps() {
  const { scene } = useGLTF(MODELS.inventory)
  const { scene: shellScene } = useGLTF(MODELS.shell)
  const props = useMemo(() => {
    const out = {} as Record<ItemId, Prop>
    for (const id of Object.keys(NODE) as ItemId[]) out[id] = buildProp(scene, id)
    return out
  }, [scene])
  // menottes qui restent sur le poignet de la victime tant qu'elle n'a pas sauté son tour
  const cuffMarks = useMemo(() => ({ dealer: buildProp(scene, 'handcuffs'), player: buildProp(scene, 'handcuffs') }), [scene])

  const shells = useMemo(() => {
    const live = makeVariant(shellScene, LIVE)
    const blank = makeVariant(shellScene, BLANK)
    const g = new Group()
    g.add(live, blank)
    g.visible = false
    return { g, live, blank }
  }, [shellScene])
  const ejected = useMemo(() => {
    const live = makeVariant(shellScene, LIVE)
    const blank = makeVariant(shellScene, BLANK)
    const g = new Group()
    g.add(live, blank)
    g.visible = false
    return { g, live, blank }
  }, [shellScene])

  const extras = useMemo(() => {
    const capsule = new Mesh(new CapsuleGeometry(0.0055, 0.014, 2, 6), new MeshBasicMaterial({ color: '#d8d0b8' }))
    capsule.visible = false
    const flame = new Mesh(new IcosahedronGeometry(0.012, 0), new MeshBasicMaterial({ color: '#ffb040' }))
    flame.visible = false
    const chunk = new Mesh(new CylinderGeometry(0.014, 0.014, 0.22, 8), new MeshStandardMaterial({ color: '#2e2e33', metalness: 0.6, roughness: 0.55 }))
    chunk.visible = false
    chunk.castShadow = true
    const sparks = new Pool(90, new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: '#ffffff' }), 90))
    const smoke = new Pool(70, new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, depthWrite: false }), 70))
    return { capsule, flame, chunk, sparks, smoke }
  }, [])

  const light = useRef<PointLight>(null)
  const sim = useRef({
    start: 0,
    shell: newFlying(),
    chunk: newFlying(),
    pill: false,
    acc: { spark: 0, smoke: 0 },
    fired: {} as Record<string, boolean>,
  })

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const st = sim.current
    extras.sparks.update(dt)
    extras.smoke.update(dt)
    const game = useGameStore.getState().game

    // menottes posées sur le poignet de la victime (joueur : devant nous ; croupier : sur la table, entre ses mains)
    const act0 = fx.act
    for (const who of ['dealer', 'player'] as const) {
      const mark = cuffMarks[who]
      const t0 = act0 && act0.id === 'handcuffs' ? (performance.now() - act0.start) / 1000 : -1
      mark.outer.visible = game.cuffed[who]
      if (game.cuffed[who]) {
        const base = who === 'dealer' ? CUFFS_DEALER : CUFFS_PLAYER
        mark.outer.position.set(base.x, base.y + 0.012, base.z)
        mark.outer.quaternion.setFromAxisAngle(Y, 0.3)
        mark.outer.scale.setScalar(LAYOUT.trayScale * 1.35)
        if (t0 >= 0 && t0 < 0.01) mark.outer.visible = false
      }
    }

    const act = fx.act
    if (!act) {
      for (const id of Object.keys(props) as ItemId[]) props[id].outer.visible = false
      shells.g.visible = false
      ejected.g.visible = false
      extras.capsule.visible = false
      extras.flame.visible = false
      extras.chunk.visible = false
      fx.reach.on = false
      fx.buzz = 0
      if (light.current) light.current.intensity = 0
      st.start = 0
      st.shell.on = false
      st.chunk.on = false
      st.pill = false
      st.fired = {}
      return
    }
    if (st.start !== act.start) {
      st.start = act.start
      st.shell.on = false
      st.chunk.on = false
      st.pill = false
      st.fired = {}
      st.acc = { spark: 0, smoke: 0 }
    }
    const t = fx.actHold >= 0 ? fx.actHold : ((performance.now() - act.start) / 1000) * act.speed
    const { id, user } = act
    const dealer = user === 'dealer'
    const prop = props[id]
    for (const k of Object.keys(props) as ItemId[]) if (k !== id) props[k].outer.visible = false

    // points d'ancrage de cette image
    const P0 = (user === 'player') === !act.stolen ? prop.origin : DEALER_POCKET
    const ax = gunGrips.axis
    const psi = Math.atan2(-ax.x, -ax.z)
    const c: Ctx = {
      user,
      dealer,
      P0,
      S: dealer ? S_DEALER : S_PLAYER,
      MOUTH: dealer ? MOUTH_DEALER : MOUTH_PLAYER,
      ARM: dealer ? ARM_DEALER : ARM_PLAYER,
      FOE: dealer ? CUFFS_PLAYER : CUFFS_DEALER,
      ch: gunGrips.chamber,
      saw: gunGrips.saw,
      yaw0: prop.yaw0,
      psi,
      m: PRESENT[id],
      grow0: P0 === DEALER_POCKET ? 0.05 : 1,
      apply: act.apply,
    }
    sample(keysFor(id, c), t)
    const pos = sampled.p.clone()
    let [tilt, yaw, roll] = sampled.r
    let size = sampled.s
    const A = sampled.a

    // gestes en plus des trajectoires
    const per = tmpW.set(-ax.z, 0, ax.x).normalize() // horizontale, perpendiculaire au canon
    if (id === 'saw' && t > 1.9 && t < act.apply) {
      // va-et-vient en travers du canon, de plus en plus profond
      const k = (t - 1.9) / (act.apply - 1.9)
      pos.addScaledVector(per, Math.sin(t * 34) * 0.055)
      pos.y -= 0.045 * k
    }
    if (id === 'handcuffs' && t > 0.7 && t < 1.45) roll += Math.sin(t * 38) * 0.12 // cliquetis
    if (id === 'pills' && t > 0.8 && t < 1.7) roll += Math.sin(t * 46) * 0.2 // elles s'entrechoquent
    if (id === 'loupe' && t > 1.5 && t < 3.2) pos.x += Math.sin(t * 2.4) * 0.01
    if (id === 'inverter' && t > 1.8 && t < 3.0) {
      pos.x += (Math.random() - 0.5) * 0.006
      pos.z += (Math.random() - 0.5) * 0.006
      roll += (Math.random() - 0.5) * 0.08
    }
    if (id === 'beer' && t > 1.75 && t < 2.35) tilt += Math.sin(t * 9) * 0.06 // gorgées
    if (id === 'cigarette' && t > 2.3 && t < 3.7) tilt += Math.sin(t * 2) * 0.04 // il tire dessus

    // orientation : bascule vers nous (axe X du monde) × cap × roulis sur l'axe long de l'objet
    qa.setFromAxisAngle(X, tilt)
    qb.setFromAxisAngle(Y, yaw)
    qc.setFromAxisAngle(X, roll)
    prop.outer.quaternion.copy(qa).multiply(qb).multiply(qc)
    const scale = LAYOUT.trayScale * size
    prop.outer.scale.setScalar(scale)
    if (A > 0) pos.sub(tmpV.copy(prop.anchor).multiplyScalar(scale * A).applyQuaternion(prop.outer.quaternion))
    prop.outer.position.copy(pos)
    // menottes : à l'instant où elles se ferment, la copie posée sur le poignet prend le relais
    const swapped = id === 'handcuffs' && t >= act.apply && game.cuffed[dealer ? 'player' : 'dealer']
    prop.outer.visible = size > HIDE * 2 && !swapped
    prop.outer.updateMatrixWorld(true)

    // le croupier tient l'objet dans sa main droite (pas de lumière de mise en valeur : sa tête reste dans la pénombre)
    fx.reach.on = dealer && t > 0.1 && t < act.dur - 0.45 && prop.outer.visible
    fx.reach.x = pos.x
    fx.reach.y = pos.y - 0.04
    fx.reach.z = pos.z - 0.03

    let lightColor = '#ffb060'
    let lightPower = 0
    const lightAt = tmpV.set(0, 0, 0)
    const once = (key: string, at: number, fn: () => void) => {
      if (t >= at && !st.fired[key]) {
        st.fired[key] = true
        fn()
      }
    }
    const emitSpark = (p: Vector3, spread: number, up: number) =>
      extras.sparks.emit({ p: p.clone(), v: V(rnd(-spread, spread), rnd(up * 0.4, up), rnd(-spread, spread)), age: 0, life: rnd(0.25, 0.6), s0: 0.006, s1: 0.003, gravity: 6, color: SPARK })
    const emitSmoke = (p: Vector3, rise: number, size: number) =>
      extras.smoke.emit({ p: p.clone(), v: V(rnd(-0.03, 0.03), rise, rnd(-0.03, 0.03)), age: 0, life: rnd(1.4, 2.2), s0: size * 0.35, s1: size * 1.5, gravity: -0.02, color: SMOKE })

    // flamme du zippo, étincelles de la scie, bouche de la loupe, éclairs de l'inverseur, piqûre : effets propres à chaque objet
    extras.flame.visible = false
    extras.capsule.visible = false
    switch (id) {
      case 'saw': {
        if (t > 1.9 && t < act.apply) {
          // étincelles et copeaux au contact du canon
          st.acc.spark += dt * 70
          const hit = tmpW.copy(gunGrips.saw).addScaledVector(per, Math.sin(t * 34) * 0.055)
          hit.y += 0.015
          while (st.acc.spark >= 1) {
            st.acc.spark -= 1
            emitSpark(hit, 0.45, 1.1)
          }
          lightColor = '#ffa040'
          lightPower = 1.8
          lightAt.copy(hit).y += 0.04
          fx.shake = Math.max(fx.shake, 0.35)
        }
        // le bout de canon tombe
        once('cut', act.apply, () => {
          st.chunk.on = true
          st.chunk.p.copy(gunGrips.saw).addScaledVector(gunGrips.axis, 0.11)
          st.chunk.v.set(per.x * 0.5 + 0.05, 0.6, per.z * 0.5 + 0.3)
          st.chunk.spin.set(rnd(-3, 3), rnd(-2, 2), rnd(-4, 4))
          st.chunk.rot.set(0, 0, 0)
          for (let i = 0; i < 26; i++) emitSpark(gunGrips.saw, 0.9, 1.8)
          fx.shake = Math.max(fx.shake, 0.9)
        })
        break
      }
      case 'cigarette': {
        const flame = prop.parts.meche
        if (flame && t > 1.25 && t < 2.5) {
          flame.getWorldPosition(tmpW)
          tmpW.y += 0.012
          extras.flame.visible = true
          extras.flame.position.copy(tmpW)
          const flick = 0.8 + 0.35 * Math.sin(t * 40) + 0.2 * Math.sin(t * 23)
          extras.flame.scale.set(1, 1.6, 1).multiplyScalar(flick)
          lightColor = '#ff9a40'
          lightPower = 1.4 * flick
          lightAt.copy(tmpW)
        }
        if (t > 2.4 && t < 4.1) {
          // il fume : un mince filet, puis un nuage expiré
          st.acc.smoke += dt * (t > 3.2 ? 14 : 8)
          const mouth = tmpW.copy(c.MOUTH)
          mouth.z += dealer ? 0.1 : -0.08
          mouth.y -= 0.06
          while (st.acc.smoke >= 1) {
            st.acc.smoke -= 1
            emitSmoke(mouth, rnd(0.08, 0.16), 0.02)
          }
        }
        once('heal', act.apply, () => {
          if (!dealer) {
            fx.flash = Math.max(fx.flash, 0.22)
            fx.flashColor = [1, 0.15, 0.1]
          }
        })
        break
      }
      case 'pills': {
        // une gélule roule dans la main, puis part à la bouche
        if (t > 1.9 && t < 3.0) {
          const k = Math.min(1, (t - 1.9) / 1.0)
          const e = smooth(k)
          extras.capsule.visible = true
          const from = tmpW.copy(c.S).add(V(0, 0.01, 0.0))
          const to = c.MOUTH
          extras.capsule.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e + Math.sin(e * Math.PI) * 0.1, from.z + (to.z - from.z) * e)
          extras.capsule.rotation.set(t * 4, t * 3, 0)
          extras.capsule.scale.setScalar(dealer ? 1.4 : 1.8)
        }
        once('gulp', 3.0, () => {
          if (!dealer) fx.snap = 0.35
        })
        once('res', act.apply, () => {
          if (!dealer) {
            fx.flash = Math.max(fx.flash, act.good ? 0.2 : 0.4)
            fx.flashColor = act.good ? [1, 0.2, 0.15] : [0.9, 0.9, 0.9]
            if (!act.good) fx.shake = Math.max(fx.shake, 1.2)
          }
        })
        break
      }
      case 'adrenaline': {
        once('stab', 2.3, () => {
          fx.shake = Math.max(fx.shake, 1.0)
          fx.flash = Math.max(fx.flash, dealer ? 0.1 : 0.35)
          fx.flashColor = [1, 1, 1]
          fx.kick = Math.max(fx.kick, 0.8)
        })
        if (t > 2.35 && t < 3.6 && !dealer) {
          // l'adrénaline monte : le cœur cogne (secousses sourdes de la caméra)
          const beat = Math.floor((t - 2.35) / 0.42)
          once(`beat${beat}`, 2.35 + beat * 0.42, () => {
            fx.snap = 0.5
            fx.kick = Math.max(fx.kick, 0.5)
          })
        }
        if (t > 2.3 && t < 2.9) {
          lightColor = '#ffffff'
          lightPower = 2.2 * (1 - (t - 2.3) / 0.6)
          lightAt.copy(c.ARM).y += 0.08
        }
        break
      }
      case 'inverter': {
        if (t > 1.8 && t < 3.0) {
          // arcs électriques qui alternent entre le rouge et le bleu, le fusil vibre
          fx.buzz = 1
          const flip = Math.floor(t * 14) % 2 === 0
          lightColor = flip ? '#ff2a20' : '#3f7fe0'
          lightPower = 2.4 + Math.random()
          lightAt.copy(gunGrips.chamber).y += 0.08
          st.acc.spark += dt * 45
          while (st.acc.spark >= 1) {
            st.acc.spark -= 1
            emitSpark(gunGrips.chamber, 0.5, 0.9)
          }
          fx.shake = Math.max(fx.shake, 0.4)
        } else fx.buzz = 0
        once('zap', act.apply, () => {
          fx.flash = Math.max(fx.flash, 0.3)
          fx.flashColor = [0.6, 0.75, 1]
          fx.shake = Math.max(fx.shake, 1.2)
          for (let i = 0; i < 22; i++) emitSpark(gunGrips.chamber, 1.0, 1.6)
        })
        break
      }
      case 'beer': {
        once('eject', act.apply, () => {
          // la pompe claque : la balle jaillit de la culasse et retombe sur la table
          fx.rack = 1
          fx.shake = Math.max(fx.shake, 0.7)
          st.shell.on = true
          st.shell.p.copy(gunGrips.chamber)
          const toCenter = tmpW.set(0 - gunGrips.chamber.x, 0, 0.95 - gunGrips.chamber.z).normalize()
          st.shell.v.set(toCenter.x * 0.55, 1.9, toCenter.z * 0.55)
          st.shell.spin.set(rnd(-14, 14), rnd(-6, 6), rnd(-14, 14))
          st.shell.rot.set(0, 0, 0)
        })
        break
      }
      case 'loupe': {
        // la balle de la chambre, agrandie sous le verre (seulement pour le joueur : le croupier ne dévoile rien)
        shells.g.visible = false
        if (!dealer && act.shell !== null && t > 2.0 && t < 3.55) {
          const k = Math.min(1, (t - 2.0) / 0.4) * (t > 3.2 ? Math.max(0, 1 - (t - 3.2) / 0.35) : 1)
          shells.g.visible = k > 0.01
          shells.live.visible = act.shell
          shells.blank.visible = !act.shell
          shells.g.position.copy(gunGrips.chamber).add(V(0, 0.062, 0))
          shells.g.rotation.set(Math.PI / 2, 0, t * 1.2)
          shells.g.scale.setScalar(2.6 * k)
          lightColor = act.shell ? '#ff3020' : '#4f8fe0'
          lightPower = 1.6 * k
          lightAt.copy(gunGrips.chamber).y += 0.12
        }
        break
      }
      default:
        break
    }
    if (id !== 'loupe') shells.g.visible = false

    // balle éjectée
    ejected.g.visible = st.shell.on
    if (st.shell.on) {
      stepFlying(st.shell, dt, 0.008)
      ejected.g.position.copy(st.shell.p)
      ejected.g.rotation.set(st.shell.rot.x, st.shell.rot.y, st.shell.rot.z)
      ejected.g.scale.setScalar(1.7 * (t > act.dur - 0.5 ? Math.max(0.01, (act.dur - t) / 0.5) : 1))
      ejected.live.visible = act.shell === true
      ejected.blank.visible = act.shell === false
    }
    // bout de canon scié
    extras.chunk.visible = st.chunk.on
    if (st.chunk.on) {
      stepFlying(st.chunk, dt, 0.014)
      extras.chunk.position.copy(st.chunk.p)
      extras.chunk.rotation.set(st.chunk.rot.x, st.chunk.rot.y, st.chunk.rot.z)
      extras.chunk.scale.setScalar(t > act.dur - 0.6 ? Math.max(0.01, (act.dur - t) / 0.6) : 1)
    }

    const l = light.current
    if (l) {
      l.distance = 0.6 // courte portée : les lueurs d'effets n'atteignent jamais le visage du croupier
      l.color.set(lightColor)
      l.position.copy(lightAt)
      l.intensity = dealer ? 0 : lightPower * (1 + 0.05 * Math.sin(clock.elapsedTime * 30)) // jamais de lueur côté croupier : sa tête reste dans la pénombre
    }
  })

  return (
    <>
      {(Object.keys(props) as ItemId[]).map((id) => (
        <primitive key={id} object={props[id].outer} />
      ))}
      <primitive object={cuffMarks.dealer.outer} />
      <primitive object={cuffMarks.player.outer} />
      <primitive object={shells.g} />
      <primitive object={ejected.g} />
      <primitive object={extras.capsule} />
      <primitive object={extras.flame} />
      <primitive object={extras.chunk} />
      <primitive object={extras.sparks.mesh} />
      <primitive object={extras.smoke.mesh} />
      <pointLight ref={light} intensity={0} distance={1.4} decay={1.6} />
    </>
  )
}
