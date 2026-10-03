import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { Light, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three'
import { ClubLights } from './ClubLights'
import { MODELS } from './models'

/** Les lumières du fichier (22 / 28 / 12 cd) sont trop faibles sans tone mapping : on les renforce sans changer leur portée. */
const LIGHT_BOOST = 3
/** Opacité maximale d'une volute de fumée : elles sont empilées (36), l'effet cumulé doit rester léger. */
const SMOKE_ALPHA = 0.08
/** Durée d'un cycle complet du fumeur (s). */
const CYCLE = 9

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

interface Puff {
  mesh: Mesh
  mat: MeshBasicMaterial
  phase: number
}

/**
 * Le fumeur de passerelle-halle.glb. Le fichier ne contient aucun clip d'animation (le GLB est un
 * instantané exporté par THREE.GLTFExporter) : elle est donc recréée ici, à partir de sa hiérarchie :
 *  - fumée : les 36 volutes du fichier forment une traînée qui monte de la cigarette ; chaque volute
 *    parcourt cette traînée en boucle (grossit, dérive, s'efface) ;
 *  - respiration du torse, regard qui erre, braise qui pulse ;
 *  - toutes les 9 s : il porte la cigarette à la bouche, tire (la braise s'avive), puis souffle une bouffée.
 */
function createSmoker(hall: Object3D) {
  const get = (n: string) => hall.getObjectByName(n) as Object3D | undefined
  const torso = get('torse_groupe')
  const head = get('tete_groupe')
  const arm = get('bras_droit') // épaule (l'os du bras pend le long de son axe -Y)
  const elbow = get('coude_d')
  const hand = get('main_d')
  const cigarette = get('cigarette')
  const ember = get('braise') as Mesh | undefined
  const emberMat = ember?.material as MeshStandardMaterial | undefined
  const emberBase = emberMat?.emissiveIntensity ?? 1

  hall.updateMatrixWorld(true)
  const restTorsoY = torso?.scale.y ?? 1
  const restHead = head?.quaternion.clone()
  const restArm = arm?.quaternion.clone()
  const restElbow = elbow?.quaternion.clone()
  const restHand = hand?.quaternion.clone()

  // --- pose de repos en coordonnées monde (sert de base à l'IK) ---
  const wp = (o?: Object3D) => (o ? o.getWorldPosition(new Vector3()) : new Vector3())
  const wq = (o?: Object3D) => (o ? o.getWorldQuaternion(new Quaternion()) : new Quaternion())
  const shoulderW = wp(arm)
  const elbowRestW = wp(elbow)
  const handRestW = wp(hand)
  const armQ0 = wq(arm)
  const foreQ0 = wq(elbow)
  const handQ0 = wq(hand)
  const upperLen = shoulderW.distanceTo(elbowRestW)
  const foreLen = elbowRestW.distanceTo(handRestW)
  const upperDir0 = elbowRestW.clone().sub(shoulderW).normalize()
  const foreDir0 = handRestW.clone().sub(elbowRestW).normalize()
  // vecteur pôle : le coude pend vers le bas (légèrement vers l'extérieur du corps, côté +Z), sous la ligne
  // épaule -> main. Repris du repos, il enverrait le coude haut sur le côté quand la main monte à la bouche.
  const pole = new Vector3(0.05, -1, 0.3).normalize()
  // axe de la cigarette (filtre -> braise = +Z local) au repos
  const cigAxis0 = new Vector3(0, 0, 1).applyQuaternion(wq(cigarette))
  const emberRestW = wp(ember)

  // fumée : trajectoire ordonnée par hauteur, à partir des positions/échelles du fichier
  const volutes: Mesh[] = []
  get('fumee')?.traverse((o) => o instanceof Mesh && volutes.push(o))
  const trail = volutes.map((m) => ({ p: m.position.clone(), s: m.scale.x })).sort((a, b) => a.p.y - b.p.y)
  const puffs: Puff[] = volutes.map((mesh, i) => {
    const mat = (mesh.material as Material).clone() as MeshBasicMaterial
    mat.transparent = true
    mat.depthWrite = false
    mesh.material = mat
    return { mesh, mat, phase: i / volutes.length }
  })

  // scratch
  const q = new Quaternion()
  const axisX = new Vector3(1, 0, 0)
  const axisY = new Vector3(0, 1, 0)
  const mouth = new Vector3()
  const handT = new Vector3()
  const dir = new Vector3()
  const perp = new Vector3()
  const elbowW = new Vector3()
  const handW = new Vector3()
  const newUpper = new Vector3()
  const newFore = new Vector3()
  const fwd = new Vector3()
  const axisT = new Vector3()
  const axisD = new Vector3()
  const axisNow = new Vector3()
  const armQ = new Quaternion()
  const foreQ = new Quaternion()
  const handQ = new Quaternion()
  const parentQ = new Quaternion()
  const inv = new Quaternion()
  const emberW = new Vector3()

  return (t: number) => {
    const c = (t % CYCLE) / CYCLE // 0..1 dans le cycle
    // tirer : levé (0.10-0.22), tenu (jusqu'à 0.34), baissé (0.34-0.46), souffle à 0.40
    const drag = smooth(0.1, 0.22, c) * (1 - smooth(0.34, 0.46, c))
    const exhale = Math.exp(-Math.max(c - 0.4, 0) * 9) * (c > 0.4 ? 1 : 0)

    if (torso) torso.scale.y = restTorsoY * (1 + 0.006 * Math.sin(t * 1.4) + 0.004 * drag)
    if (head && restHead) {
      const yaw = Math.sin(t * 0.3) * 0.12 + Math.sin(t * 0.83) * 0.04
      const pitch = -0.1 * drag + 0.07 * exhale + Math.sin(t * 0.5) * 0.02
      head.quaternion.copy(restHead).multiply(q.setFromAxisAngle(axisX, pitch)).multiply(q.setFromAxisAngle(axisY, yaw))
    }

    // --- bras : IK 2 os dans le monde, la main va du repos jusqu'à la bouche ---
    if (arm && elbow && hand && cigarette && restArm && restElbow && restHand && head) {
      if (drag < 0.001) {
        arm.quaternion.copy(restArm)
        elbow.quaternion.copy(restElbow)
        hand.quaternion.copy(restHand)
      } else {
        head.updateWorldMatrix(true, false)
        // bouche : devant le visage (le personnage regarde vers +X), un peu sous le centre de la tête
        mouth.set(0.19, 0.05, 0.03)
        head.localToWorld(mouth)
        handT.lerpVectors(handRestW, mouth, drag)

        dir.subVectors(handT, shoulderW)
        const d = Math.min(Math.max(dir.length(), 0.1), upperLen + foreLen - 0.005)
        dir.normalize()
        const a = (upperLen * upperLen - foreLen * foreLen + d * d) / (2 * d)
        const h = Math.sqrt(Math.max(upperLen * upperLen - a * a, 0))
        perp.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize()
        elbowW.copy(shoulderW).addScaledVector(dir, a).addScaledVector(perp, h)
        handW.copy(shoulderW).addScaledVector(dir, d)

        // les segments tournent depuis leur pose de repos (la torsion d'origine est conservée)
        newUpper.subVectors(elbowW, shoulderW).normalize()
        newFore.subVectors(handW, elbowW).normalize()
        armQ.setFromUnitVectors(upperDir0, newUpper).multiply(armQ0)
        foreQ.setFromUnitVectors(foreDir0, newFore).multiply(foreQ0)
        arm.parent!.getWorldQuaternion(parentQ)
        arm.quaternion.copy(inv.copy(parentQ).invert().multiply(armQ))
        elbow.quaternion.copy(inv.copy(armQ).invert().multiply(foreQ))
        // la main suit l'avant-bras
        handQ.copy(handQ0).premultiply(q.setFromUnitVectors(foreDir0, newFore))
        hand.quaternion.copy(inv.copy(foreQ).invert().multiply(handQ))

        // poignet : la cigarette pointe vers l'avant et légèrement vers le bas, filtre aux lèvres
        hall.updateMatrixWorld(true)
        head.getWorldQuaternion(q)
        fwd.set(1, 0, 0).applyQuaternion(q)
        axisT.copy(fwd).multiplyScalar(0.92).addScaledVector(axisY, -0.3).normalize()
        axisD.lerpVectors(cigAxis0, axisT, drag).normalize()
        cigarette.getWorldQuaternion(q)
        axisNow.set(0, 0, 1).applyQuaternion(q)
        handQ.premultiply(q.setFromUnitVectors(axisNow, axisD))
        hand.quaternion.copy(inv.copy(foreQ).invert().multiply(handQ))
      }
    }
    if (emberMat) emberMat.emissiveIntensity = emberBase * (0.8 + 0.25 * Math.sin(t * 2.3) + 2.2 * drag)

    // fumée : chaque volute monte du bout de la cigarette jusqu'à la plus haute, en grossissant et en
    // dérivant ; la bouffée expirée l'épaissit un instant. L'origine suit la braise quand elle bouge.
    const start = trail[0]
    const end = trail[trail.length - 1]
    if (ember) {
      hall.updateMatrixWorld(true)
      ember.getWorldPosition(emberW).sub(emberRestW)
    }
    for (const pf of puffs) {
      const u = (pf.phase + t * 0.07) % 1
      pf.mesh.position.lerpVectors(start.p, end.p, u)
      pf.mesh.position.x += Math.sin(t * 0.9 + pf.phase * 40) * 0.07 * u + 0.05 * u * u
      pf.mesh.position.z += Math.cos(t * 0.7 + pf.phase * 27) * 0.05 * u
      pf.mesh.position.addScaledVector(emberW, 1 - u)
      pf.mesh.scale.setScalar(start.s + (end.s - start.s) * u)
      pf.mat.opacity = SMOKE_ALPHA * smooth(0, 0.12, u) * (1 - smooth(0.6, 1, u)) * (1 + 1.8 * exhale)
    }
  }
}

/**
 * Décor de l'écran titre : passerelle-halle.glb tel quel (géométrie, matériaux et trois lumières :
 * rouge à gauche, bleues dans la halle), avec le fumeur animé. Pas d'éléments de jeu.
 */
export function TitleScene() {
  const { scene } = useGLTF(MODELS.hall)
  const { hall, animate } = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o) => {
      if (o instanceof Light) o.intensity *= LIGHT_BOOST
      // matériaux clonés (clone(true) les partage avec l'original) : l'animation modifie braise et fumée
      if (o instanceof Mesh && (o.name === 'braise' || o.parent?.name === 'fumee')) o.material = (o.material as Material).clone()
    })
    return { hall: c, animate: createSmoker(c) }
  }, [scene])
  // debug : window.__smokerT = 2.5 fige l'animation à cet instant du cycle (undefined pour la relancer)
  useFrame(({ clock }) => animate((window as unknown as { __smokerT?: number }).__smokerT ?? clock.elapsedTime))
  return (
    <>
      <primitive object={hall} name="title-hall" />
      <ClubLights />
    </>
  )
}

/**
 * Cadrage fixe (d'après la capture de référence) : depuis le vide de la halle, la passerelle et son
 * mur de briques à gauche avec le fumeur adossé à la rambarde, la façade vitrée de la halle à droite.
 */
export const TITLE_CAMERA = {
  position: new Vector3(2.9, 7.5, -0.6),
  /** Regard : -Z tourné de ~22° vers -X, à peine incliné vers le bas. */
  target: new Vector3(2.9 - 3.7, 7.42, -0.6 - 9.3),
}

export function TitleCamera() {
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    // debug : window.__titleCam = [px, py, pz, tx, ty, tz] pour inspecter de près
    const dbg = (window as unknown as { __titleCam?: number[] }).__titleCam
    if (dbg) {
      camera.position.set(dbg[0], dbg[1], dbg[2])
      camera.lookAt(dbg[3], dbg[4], dbg[5])
      return
    }
    camera.position.copy(TITLE_CAMERA.position)
    camera.lookAt(TITLE_CAMERA.target)
  })
  return null
}
