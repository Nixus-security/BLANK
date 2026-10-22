import { useState } from 'react'
import { MAX_PLAYERS, MIN_PLAYERS } from '../game/multi/types'
import { useTr } from '../i18n'
import { isCode, normalizeCode, useNetStore } from '../net/session'

const NAME_KEY = 'buckshot.mpName'
const readName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
const saveName = (n: string) => {
  try {
    localStorage.setItem(NAME_KEY, n)
  } catch {
    /* stockage indisponible : pas grave */
  }
}

const btn = 'text-bone/90 transition hover:text-blood disabled:cursor-default disabled:text-bone/30 disabled:hover:text-bone/30'
const field = 'w-72 border-b border-bone/40 bg-transparent px-2 py-1 text-center text-bone outline-none focus:border-blood'

/** Créer ou rejoindre un salon. */
function Menu() {
  const tr = useTr()
  const net = useNetStore()
  const [name, setName] = useState(readName)
  const [code, setCode] = useState('')
  const go = (fn: () => void) => {
    saveName(name.trim())
    fn()
  }
  return (
    <div className="flex flex-col items-center gap-6">
      <span className="text-3xl tracking-[0.5em] text-bone/90">MULTIPLAYER</span>
      <label className="flex flex-col items-center gap-1 text-lg tracking-[0.2em] text-bone/60">
        {tr('PSEUDO', 'NAME')}
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} autoFocus className={field} />
      </label>
      <button onClick={() => go(() => net.host(name))} className={btn}>
        {tr('CRÉER UN SALON', 'CREATE ROOM')}
      </button>
      <form
        className="flex flex-col items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (isCode(code)) go(() => net.join(code, name))
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
          placeholder="CODE"
          className={`${field} tracking-[0.6em] placeholder:text-bone/25`}
        />
        <button type="submit" disabled={!isCode(code)} className={btn}>
          {tr('REJOINDRE', 'JOIN')}
        </button>
      </form>
      <button onClick={() => net.setOpen(false)} className="pt-2 text-bone/60 transition hover:text-blood">
        BACK
      </button>
    </div>
  )
}

/** Salon : code à partager, joueurs connectés, l'hôte lance la partie. */
function Lobby() {
  const tr = useTr()
  const { role, code, names, seat, start, leave } = useNetStore()
  return (
    <div className="flex flex-col items-center gap-6">
      <span className="text-lg tracking-[0.3em] text-bone/60">{tr('CODE DU SALON', 'ROOM CODE')}</span>
      <span className="select-text text-6xl tracking-[0.5em] text-blood">{code}</span>
      <ul className="flex flex-col items-center gap-1 text-2xl tracking-[0.2em]">
        {Array.from({ length: MAX_PLAYERS }, (_, i) => (
          <li key={i} className={names[i] ? 'text-bone/90' : 'text-bone/25'}>
            {names[i] ?? '· · ·'}
            {i === 0 && names[i] && <span className="text-bone/40"> ({tr('hôte', 'host')})</span>}
            {i === seat && names[i] && <span className="text-blood"> ◂</span>}
          </li>
        ))}
      </ul>
      {role === 'host' ? (
        <button onClick={start} disabled={names.length < MIN_PLAYERS} autoFocus className={btn}>
          {names.length < MIN_PLAYERS ? tr('EN ATTENTE DE JOUEURS…', 'WAITING FOR PLAYERS…') : tr('LANCER', 'START')}
        </button>
      ) : (
        <span className="text-xl tracking-[0.2em] text-bone/50">{tr("EN ATTENTE DE L'HÔTE…", 'WAITING FOR HOST…')}</span>
      )}
      <button onClick={leave} className="text-bone/60 transition hover:text-blood">
        {tr('QUITTER', 'LEAVE')}
      </button>
    </div>
  )
}

/** Écran multijoueur (remplace l'écran titre) : menu → salon ; la partie elle-même est en 3D (MultiHud). */
export function Multiplayer() {
  const tr = useTr()
  const { status, error, leave } = useNetStore()
  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center overflow-y-auto bg-black/75 py-8 text-2xl tracking-[0.3em] [animation:fadein_0.6s_ease-out] [text-shadow:0_2px_8px_#000]">
      {status === 'idle' && <Menu />}
      {status === 'connecting' && <span className="text-bone/70">{tr('CONNEXION…', 'CONNECTING…')}</span>}
      {status === 'lobby' && <Lobby />}
      {status === 'error' && (
        <div className="flex flex-col items-center gap-6">
          <span className="text-blood">{error}</span>
          <button onClick={leave} autoFocus className={btn}>BACK</button>
        </div>
      )}
    </div>
  )
}
