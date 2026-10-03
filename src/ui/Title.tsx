import { useState } from 'react'
import { useLangStore, useTr } from '../i18n'
import { useSoundStore } from '../store/soundStore'
import { useStageStore } from '../store/stageStore'
import { unlockAudio } from '../three/audio'
import { startGame } from '../three/director'
import { goFullscreen, isTouch } from './touch'

/** Un réglage de volume : nom, curseur de 0 à 100, valeur. */
function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-5 text-bone/80">
      <span className="w-64 text-left">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-56 accent-[#b3261e]"
      />
      <span className="w-14 text-left">{Math.round(value * 100)}</span>
    </label>
  )
}

/** Réglages : son (coupé / activé), volume général, musique et effets sonores. */
function Settings({ onBack }: { onBack: () => void }) {
  const muted = useSoundStore((s) => s.muted)
  const volume = useSoundStore((s) => s.volume)
  const musicVolume = useSoundStore((s) => s.musicVolume)
  const sfxVolume = useSoundStore((s) => s.sfxVolume)
  const toggle = useSoundStore((s) => s.toggle)
  const setVolume = useSoundStore((s) => s.setVolume)
  const setMusicVolume = useSoundStore((s) => s.setMusicVolume)
  const setSfxVolume = useSoundStore((s) => s.setSfxVolume)
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  return (
    <div className="flex flex-col items-center gap-6 text-2xl tracking-[0.4em] [text-shadow:0_2px_8px_#000]">
      <span className="text-3xl tracking-[0.5em] text-bone/90">PARAMETER</span>
      <button
        onClick={() => {
          // premier appui : le geste débloque l'audio ; ensuite il bascule le son
          unlockAudio()
          toggle()
        }}
        className="text-bone/80 transition hover:text-blood"
      >
        SOUND : {muted ? 'OFF' : 'ON'}
      </button>
      <button onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')} className="text-bone/80 transition hover:text-blood">
        LANGUAGE : {lang === 'fr' ? 'FRANÇAIS' : 'ENGLISH'}
      </button>
      <Slider label="VOLUME" value={volume} onChange={setVolume} />
      <Slider label="MUSIC" value={musicVolume} onChange={setMusicVolume} />
      <Slider label="SOUND EFFECTS" value={sfxVolume} onChange={setSfxVolume} />
      <button onClick={onBack} autoFocus className="pt-2 text-bone/60 transition hover:text-blood">
        BACK
      </button>
    </div>
  )
}

/** Écran d'accueil : la salle tourne derrière ; PLAY (ou Entrée) lance la partie, PARAMETER ouvre les réglages. */
export function Title() {
  const tr = useTr()
  const leaving = useStageStore((s) => s.transitioning)
  const [settings, setSettings] = useState(false)
  return (
    <div className={`${leaving ? 'pointer-events-none opacity-0 !bg-black/0' : 'pointer-events-auto'} transition-opacity duration-500 absolute inset-0 flex flex-col items-center justify-center gap-10 bg-black/45 [animation:fadein_1.5s_ease-out]`}>
      {settings ? (
        <Settings onBack={() => setSettings(false)} />
      ) : (
        <nav className="flex flex-col items-center gap-5 text-3xl tracking-[0.5em] [text-shadow:0_2px_8px_#000]">
          <button onClick={() => { goFullscreen(); void startGame() }} autoFocus className="text-bone/90 transition hover:text-blood">
            PLAY
          </button>
          <button onClick={() => setSettings(true)} className="text-bone/90 transition hover:text-blood">
            PARAMETER
          </button>
          {/* pas encore disponible : visible mais éteint */}
          <button disabled className="cursor-default text-bone/30">
            SOON
          </button>
        </nav>
      )}
      {!isTouch && (
        <span className="absolute bottom-6 text-lg tracking-[0.2em] text-bone/35">
          {tr('clic : fusil et objets · échap : reposer · m : son · r : rejouer', 'click: gun and items · esc: put down · m: sound · r: retry')}
        </span>
      )}
    </div>
  )
}
