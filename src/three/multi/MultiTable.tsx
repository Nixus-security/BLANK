import { Vector3 } from 'three'
import { LAYOUT } from '../models'
import { ShellRowView } from '../ShellRow'
import { TrayView } from '../Tray'
import { Avatar } from './Avatar'
import { mpFire, mpUseItem, slotOfSeat, useMpStage } from './mpDirector'
import { seatMatrix, slotYaw, SOUTH, type Slot } from './seats'

/**
 * Plateau d'un adversaire : en face (nord), le plateau du jeu solo retourné ; aux bouts de la table (ouest, est),
 * plus étroits, un plateau réduit devant lui (coordonnées du repère joueur, transportées à sa place).
 */
const SIDE_TRAY = { at: [-0.2, LAYOUT.tray[1], 1.12] as const, scale: 0.45 }

function trayPlacement(slot: Slot) {
  const side = slot === 1 || slot === 3
  const local = side ? SIDE_TRAY.at : LAYOUT.tray
  const p = new Vector3(...local).applyMatrix4(seatMatrix(slot))
  return { position: [p.x, p.y, p.z] as const, yaw: slotYaw(slot), scale: side ? SIDE_TRAY.scale : LAYOUT.trayScale }
}

/** Zone invisible sous la caméra (comme SelfTarget en solo) : se tirer dessus, fusil en main. */
function SelfZone() {
  const aiming = useMpStage((s) => s.aiming)
  const me = useMpStage((s) => s.me)
  if (!aiming) return null
  return (
    <mesh
      position={[0, 0.84, 1.5]}
      onClick={(e) => {
        e.stopPropagation()
        mpFire(me)
      }}
      onPointerOver={() => (document.body.style.cursor = 'crosshair')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <planeGeometry args={[2.4, 0.16]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

/** La table en multijoueur : les autres joueurs, les plateaux de chacun, les cartouches. */
export function MultiTable() {
  const shown = useMpStage((s) => s.shown)
  const me = useMpStage((s) => s.me)
  const hideTray = useMpStage((s) => s.hideTray)
  if (!shown) return null
  const slots = shown.names.map((_, seat) => slotOfSeat(seat))
  const mine = shown.inventory[me]
  return (
    <>
      {shown.names.map((_, seat) =>
        seat === me ? null : (
          <Avatar key={seat} seat={seat} slot={slots[seat]} />
        ),
      )}
      <TrayView inventory={mine} hidden={hideTray} position={LAYOUT.tray} scale={LAYOUT.trayScale} onUse={(id) => mpUseItem(mine.indexOf(id))} />
      {shown.names.map((_, seat) => {
        if (seat === me || slots[seat] === SOUTH || !shown.alive[seat]) return null
        const t = trayPlacement(slots[seat])
        return <TrayView key={`tray${seat}`} inventory={shown.inventory[seat]} position={t.position} yaw={t.yaw} scale={t.scale} />
      })}
      <ShellRowView remaining={shown.remaining} x={LAYOUT.shellRow[0]} z={LAYOUT.shellRow[1]} />
      <SelfZone />
    </>
  )
}
