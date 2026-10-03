import { useStageStore } from '../store/stageStore'
import { backToTitle } from '../three/director'
import { useTr } from '../i18n'
import { CREDITS_SECONDS, getCredits } from './credits'

/**
 * Fins du jeu : « THE END » sur la scène du néant (mort en partie 3) ; dans les deux cas (néant ou voiture), le
 * générique défile ensuite sur fond noir. Le rideau noir sert aux fondus. Échap passe directement au titre.
 */
export function Ending() {
  const tr = useTr()
  const ending = useStageStore((s) => s.ending)
  const endTitle = useStageStore((s) => s.endTitle)
  const credits = useStageStore((s) => s.credits)
  const curtain = useStageStore((s) => s.curtain)
  return (
    <>
      {/* rideau noir : fondus entre la partie et la scène de fin */}
      <div
        className="pointer-events-none absolute inset-0 z-30 bg-black"
        style={{ opacity: curtain ? 1 : 0, transition: curtain ? 'opacity 1.8s ease-in' : 'opacity 3s ease-out' }}
      />
      {ending && endTitle && (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          {/* voile sombre : le texte clair doit rester lisible sur le halo blanc */}
          <div className="absolute inset-0 bg-black [animation:endveil_5s_ease-out_forwards]" />
          <span className="relative text-8xl tracking-[0.5em] text-bone [animation:endtitle_5s_ease-out_forwards] [text-shadow:0_0_40px_rgba(216,208,184,0.45)]">
            THE END
          </span>
        </div>
      )}
      {ending && (
        <div
          className={`absolute inset-0 z-40 overflow-hidden bg-black transition-opacity duration-[3000ms] ${credits ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          {credits && (
            <div
              className="absolute inset-x-0 top-full flex flex-col items-center gap-16 pb-[40vh] text-center"
              style={{ animation: `creditsroll ${CREDITS_SECONDS}s linear forwards` }}
            >
              <h2 className="m-0 text-6xl font-normal tracking-[0.35em] text-bone">
                <span className="text-blood">BLANK</span>
              </h2>
              {getCredits().map((b, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  {b.role && <span className="text-xl tracking-[0.4em] text-blood">{b.role.toUpperCase()}</span>}
                  {b.lines.map((l) => (
                    <span key={l} className={`tracking-[0.2em] text-bone ${b.role ? 'text-2xl' : 'text-4xl'}`}>
                      {l}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
          {credits && (
            <button onClick={backToTitle} className="pointer-events-auto absolute bottom-6 right-6 text-lg tracking-[0.3em] text-bone/30 transition hover:text-bone">
              {tr('passer', 'skip')}
            </button>
          )}
        </div>
      )}
    </>
  )
}
