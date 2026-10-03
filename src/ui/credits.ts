import { tr } from '../i18n'

/** Contenu du générique de fin. Renseigner AUTHOR pour afficher « Conception et réalisation ». */
export const AUTHOR = 'Anthony NAGUL'

export interface CreditBlock {
  role?: string
  lines: string[]
}

/** Le générique dans la langue courante. */
export const getCredits = (): CreditBlock[] => [
  ...(AUTHOR ? [{ role: tr('Conception et réalisation', 'Design and development'), lines: [AUTHOR] }] : []),
  { role: tr('Inspiré de', 'Inspired by'), lines: ['Buckshot Roulette', 'Mike Klubnika'] },
  {
    role: tr('Musique', 'Music'),
    lines: ['Buckshot Roulette OST — Mike Klubnika', 'General Release', 'Socket Calibration', 'Monochrome LCD', '70K', 'Before Every Load (Hard Techno Remix)'],
  },
  { role: tr('Sons', 'Sounds'), lines: ['opengameart.org', 'bigsoundbank.com — Joseph Sardin', 'Paul Wortmann'] },
  { role: tr('Réalisé avec', 'Made with'), lines: ['Three.js', 'React Three Fiber', 'React', 'Vite', 'TypeScript'] },
  { lines: [tr('Merci d’avoir joué.', 'Thanks for playing.')] },
]

/** Durée (s) du défilement du générique. */
export const CREDITS_SECONDS = 42
