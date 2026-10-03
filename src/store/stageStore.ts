import { create } from 'zustand'
import { tr } from '../i18n'
import type { ItemId } from '../game/types'

/** Phrase de l'entracte qui suit la signature du contrat. */
export const interludeText = () => tr('Pourquoi je fais cela ?', 'Why am I doing this?')

/** Où est le fusil. 'rest' = posé sur la table. */
export type Pose = 'rest' | 'playerDealer' | 'playerSelf' | 'dealerPlayer' | 'dealerSelf' | 'dealerShow'

/** État de mise en scène (animations en cours), séparé des règles du jeu. */
interface StageStore {
  pose: Pose
  /** Le joueur a pris le fusil en main et choisit sa cible. */
  aiming: boolean
  /** Une séquence (tir, tour du croupier) est en cours : entrées bloquées. */
  busy: boolean
  /** L'écran titre a été passé (bouton JOUER). */
  started: boolean
  /** Scène du contrat : la salle de jeu, en attendant la signature. */
  contract: boolean
  /** Le joueur a signé (le tampon apparaît, la partie va se lancer). */
  signed: boolean
  /** Transition titre -> partie en cours (le titre s'efface, les clics sont ignorés). */
  transitioning: boolean
  /** Entrée dans la salle après le contrat : on marche vers la table, on s'assoit, le croupier apparaît (interface masquée, entrées bloquées). */
  entrance: boolean
  /** Mort du joueur : écran noir (sur le flash d'impact), arrêt cardiaque. */
  death: boolean
  /** « TU ES MORT » s'affiche. */
  deathText: boolean
  /** Cinématique d'explication des objets (partie 1) : tous les objets du plateau sont éclairés, Échap la passe. */
  tutorial: boolean
  /** Partie du jeu en cours (1 à 3) : le croupier ressuscite plus menaçant à chaque victoire du joueur. */
  chapter: number
  /** Fin du jeu (mort en partie 3) : la scène du néant est affichée, jusqu'au retour au titre. */
  ending: boolean
  /** Quelle fin : `void` (mort : le néant) ou `car` (victoire : la voiture). */
  endKind: 'void' | 'car'
  /** Rideau noir plein écran (fondus de la fin). */
  curtain: boolean
  /** « THE END » est affiché. */
  endTitle: boolean
  /** Le générique défile. */
  credits: boolean
  /** Partie 3 : le défibrillateur a été retiré de la table par le croupier. */
  defibGone: boolean
  /** Sous-titre affiché (voix du croupier), '' = aucun. */
  subtitle: string
  /** Entracte après la signature : écran noir, silence, une phrase s'écrit. */
  interlude: boolean
  /** Écran noir « mettez un casque » entre le titre et le contrat. */
  headphones: boolean
  /** Texte déjà écrit de l'entracte (machine à écrire). */
  interludeText: string
  /** Le croupier est mort : animation d'effondrement. */
  dealerDead: boolean
  /** L'écran de fin peut s'afficher (après l'animation). */
  endReady: boolean
  /** Objet du plateau momentanément retiré (il est dans la main du joueur ou du croupier). */
  hideTray: ItemId | null
  set: (p: Partial<Pick<StageStore, 'hideTray' | 'pose'| 'aiming' | 'busy' | 'started' | 'contract' | 'signed' | 'transitioning' | 'entrance' | 'tutorial' | 'chapter' | 'ending' | 'endKind' | 'curtain' | 'endTitle' | 'credits' | 'defibGone' | 'subtitle' | 'death' | 'deathText' | 'interlude' | 'headphones' | 'interludeText' | 'dealerDead' | 'endReady'>>) => void
}

export const useStageStore = create<StageStore>((set) => ({
  pose: 'rest',
  aiming: false,
  busy: false,
  started: false,
  contract: false,
  signed: false,
  transitioning: false,
  entrance: false,
  tutorial: false,
  chapter: 1,
  ending: false,
  endKind: 'void',
  curtain: false,
  endTitle: false,
  credits: false,
  defibGone: false,
  subtitle: '',
  death: false,
  deathText: false,
  interlude: false,
  headphones: false,
  interludeText: '',
  dealerDead: false,
  endReady: false,
  hideTray: null,
  set: (p) => set(p),
}))
