import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { BasicShadowMap, NoToneMapping } from 'three'
import { ContractScene } from './ContractScene'
import { CarCamera, CarScene } from './CarScene'
import { Croupier } from './Croupier'
import { EndCamera, EndScene } from './EndScene'
import { FocusLight } from './FocusLight'
import { ItemProps } from './ItemProps'
import { Lighting } from './Lighting'
import { LAYOUT } from './models'
import { PostFX } from './PostFX'
import { PlayerCamera } from './PlayerCamera'
import { Room } from './Room'
import { TitleCamera, TitleScene } from './TitleScene'
import { useStageStore } from '../store/stageStore'
import { SelfTarget } from './SelfTarget'
import { ShellRow } from './ShellRow'
import { Tray } from './Tray'
import { Shotgun } from './Shotgun'

export function GameScene() {
  // titre : passerelle-halle.glb ; contrat : environnement-salle.glb brut ; partie : salle de jeu modifiée
  const started = useStageStore((s) => s.started)
  const contract = useStageStore((s) => s.contract)
  const ending = useStageStore((s) => s.ending) // fin du jeu : la scène du néant ou de la voiture remplace la salle
  const car = useStageStore((s) => s.endKind === 'car')
  const inRoom = started || contract // caméra de la salle (contrat ou partie)
  return (
    <Canvas
      shadows={{ type: BasicShadowMap }} // ombres dures, crénelées : look PS1
      camera={{ fov: 62, near: 0.05, far: 30, position: [...LAYOUT.camera] }}
      gl={{ antialias: false, toneMapping: NoToneMapping }}
      dpr={1}
      // fin en voiture : image virée au brun (sépia très contrasté), comme une vieille cassette
      style={ending && car ? { filter: 'sepia(1) saturate(1.7) contrast(1.4) brightness(0.95)' } : undefined}
    >
      {ending ? car ? <CarCamera /> : <EndCamera /> : inRoom ? <PlayerCamera /> : <TitleCamera />}
      <Suspense fallback={null}>
        <group visible={!inRoom}>
          <TitleScene />
        </group>
        {/* contrat : environnement-salle.glb tel quel (sa propre lumière) */}
        <group visible={contract}>
          <ContractScene />
        </group>
        {/* partie : salle de jeu modifiée (accessoires remplacés, spot dédié, fusil, plateau, cartouches) */}
        <group visible={started && !ending}>
          <Lighting />
          <FocusLight />
          <Room />
          <Shotgun />
          <SelfTarget />
          <Tray />
          <ItemProps />
          <ShellRow />
        </group>
        {/* le croupier n'apparaît qu'en partie (absent de la scène du contrat) */}
        <group visible={started && !ending}>
          <Croupier />
        </group>
        {/* fin du jeu : le néant et son portail */}
        <EndScene />
        {/* fin victorieuse : le siège passager d'une voiture */}
        <CarScene />
      </Suspense>
      <PostFX />
    </Canvas>
  )
}
