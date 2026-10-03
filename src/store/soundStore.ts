import { create } from 'zustand'

const KEY = 'buckshot.muted'
const VOLUME_KEY = 'buckshot.volume'
const MUSIC_KEY = 'buckshot.volume.music'
const SFX_KEY = 'buckshot.volume.sfx'
const read = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
const readVolume = (key = VOLUME_KEY) => {
  try {
    const v = parseFloat(localStorage.getItem(key) ?? '')
    return Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 1
  } catch {
    return 1
  }
}

/** Coupe-son global (effets + ambiance) et volume général. Mémorisés entre les parties. */
interface SoundStore {
  muted: boolean
  /** Volume général, 0 à 1 */
  volume: number
  /** Volume de la musique et des effets sonores (avec ambiance et voix), 0 à 1 */
  musicVolume: number
  sfxVolume: number
  toggle: () => void
  setVolume: (v: number) => void
  setMusicVolume: (v: number) => void
  setSfxVolume: (v: number) => void
}

export const useSoundStore = create<SoundStore>((set, get) => ({
  muted: read(),
  volume: readVolume(),
  musicVolume: readVolume(MUSIC_KEY),
  sfxVolume: readVolume(SFX_KEY),
  toggle: () => {
    const muted = !get().muted
    try {
      localStorage.setItem(KEY, muted ? '1' : '0')
    } catch {
      /* stockage indisponible : pas grave */
    }
    set({ muted })
  },
  setVolume: (v) => {
    const volume = Math.min(Math.max(v, 0), 1)
    try {
      localStorage.setItem(VOLUME_KEY, String(volume))
    } catch {
      /* stockage indisponible : pas grave */
    }
    set({ volume })
  },
  setMusicVolume: (v) => {
    const musicVolume = Math.min(Math.max(v, 0), 1)
    try {
      localStorage.setItem(MUSIC_KEY, String(musicVolume))
    } catch {
      /* stockage indisponible : pas grave */
    }
    set({ musicVolume })
  },
  setSfxVolume: (v) => {
    const sfxVolume = Math.min(Math.max(v, 0), 1)
    try {
      localStorage.setItem(SFX_KEY, String(sfxVolume))
    } catch {
      /* stockage indisponible : pas grave */
    }
    set({ sfxVolume })
  },
}))
