import { Euler, Quaternion, Vector3 } from 'three'
import type { Pose } from '../store/stageStore'

export const q = (pitch: number, yaw: number, roll = 0) => new Quaternion().setFromEuler(new Euler(roll, yaw, pitch, 'YXZ'))
export const HALF_PI = Math.PI / 2
/** Poses monde du fusil (le canon pointe vers +X en local ; yaw +90° = vers -Z, i.e. le croupier). */
export const HELD: Record<Exclude<Pose, 'rest'>, { p: Vector3; r: Quaternion }> = {
  playerDealer: { p: new Vector3(0.12, 0.98, 0.95), r: q(0.05, HALF_PI) },
  playerSelf: { p: new Vector3(0.0, 1.0, 1.2), r: q(0.25, -HALF_PI) },
  dealerPlayer: { p: new Vector3(0.0, 0.95, 0.42), r: q(0.08, -HALF_PI) },
  dealerSelf: { p: new Vector3(0.0, 1.16, 0.7), r: q(-0.12, HALF_PI) },
  /** Le croupier prend le fusil pour s'en servir avec un objet (scie, loupe, inverseur, bière) : tenu de profil devant lui. */
  dealerShow: { p: new Vector3(0.05, 0.97, 0.6), r: q(0.04, 0) },
}
