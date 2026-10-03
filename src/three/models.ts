import { useGLTF } from '@react-three/drei'

export const MODELS = {
  room: '/models/room.glb',
  dealer: '/models/dealer.glb',
  shotgun: '/models/shotgun.glb',
  inventory: '/models/inventory.glb',
  shell: '/models/shell.glb',
  hall: '/models/hall.glb',
  portal: '/models/portal.glb',
  car: '/models/car.glb',
} as const

Object.values(MODELS).forEach((url) => useGLTF.preload(url))

/** Point d'ancrage des éléments de jeu, en coordonnées monde (mesurées dans room.glb). */
export const LAYOUT = {
  tableTopY: 0.78,
  tableCenter: [0, 0.78, 0.9] as const,
  lamp: [0, 1.9, 0.9] as const,
  /** Plateau d'objets (côté joueur, à gauche du fusil) */
  tray: [-0.56, 0.785, 1.1] as const,
  trayScale: 0.58,
  /** Rangée de cartouches : [x centre, z] — côté joueur, devant le fusil, pour qu'on les voie */
  shellRow: [0.2, 1.27] as const,
  camera: [0, 1.32, 2.05] as const,
  cameraTarget: [0, 0.95, 0.5] as const,
}
