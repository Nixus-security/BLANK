import { create } from 'zustand'

export type Lang = 'fr' | 'en'

const KEY = 'buckshot.lang'
const read = (): Lang => {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'fr'
  } catch {
    return 'fr'
  }
}

/** Langue de l'interface, du journal de jeu, des sous-titres et du contrat. Mémorisée entre les sessions. */
interface LangStore {
  lang: Lang
  setLang: (l: Lang) => void
}

export const useLangStore = create<LangStore>((set) => ({
  lang: read(),
  setLang: (lang) => {
    try {
      localStorage.setItem(KEY, lang)
    } catch {
      /* stockage indisponible : pas grave */
    }
    set({ lang })
  },
}))

/** Langue courante (hors React : règles du jeu, réalisateur…). */
export const getLang = (): Lang => useLangStore.getState().lang

/** Texte dans la langue courante : `tr('Bière', 'Beer')`. */
export const tr = (fr: string, en: string) => (getLang() === 'en' ? en : fr)

/** Dans un composant : s'abonne à la langue (le composant se redessine quand elle change) et renvoie `tr`. */
export function useTr() {
  useLangStore((s) => s.lang)
  return tr
}
