import Peer, { type DataConnection } from 'peerjs'
import { create } from 'zustand'
import { applyAction, createMultiGame, forfeitMulti, viewFor } from '../game/multi/rules'
import { MAX_PLAYERS, MIN_PLAYERS, type MultiAction, type MultiState, type Seat } from '../game/multi/types'
import { MAX_ITEMS } from '../game/rules'
import { tr } from '../i18n'

/**
 * Multijoueur P2P (WebRTC via PeerJS) : aucun serveur de jeu.
 * Le serveur public PeerJS ne sert qu'à la mise en relation ; les données passent ensuite de pair à pair.
 * Topologie en étoile : l'hôte (siège 0) détient l'état complet, applique les actions reçues et envoie
 * à chaque client sa vue filtrée (`viewFor` : chargeur et loupes des autres masqués).
 */

const PREFIX = 'blank-mp-'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sans 0/O, 1/I
const CODE_LEN = 4
const JOIN_TIMEOUT = 12000
/** Battement : un pair muet plus de PEER_TIMEOUT est considéré parti (WebRTC met parfois 30 s+ à le signaler). */
const PING_EVERY = 2000
const PEER_TIMEOUT = 8000

const randomCode = () => Array.from({ length: CODE_LEN }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN)
export const isCode = (c: string) => c.length === CODE_LEN && [...c].every((ch) => ALPHABET.includes(ch))
export const cleanName = (n: unknown) => (typeof n === 'string' ? n.replace(/\s+/g, ' ').trim().slice(0, 16) : '') || tr('Joueur', 'Player')

type ToHost = { t: 'hello'; name: string } | { t: 'action'; action: MultiAction } | { t: 'ping' }
type ToClient =
  | { t: 'lobby'; names: string[]; you: Seat }
  | { t: 'state'; view: MultiState; you: Seat }
  | { t: 'reject'; reason: 'full' | 'started' }
  | { t: 'ping' }

const isSeat = (v: unknown): v is Seat => Number.isInteger(v) && (v as number) >= 0 && (v as number) < MAX_PLAYERS

/** Les données d'un pair sont non fiables : on ne garde qu'une action bien formée. */
function parseAction(a: unknown): MultiAction | null {
  if (!a || typeof a !== 'object') return null
  const o = a as Record<string, unknown>
  if (o.type === 'shoot' && isSeat(o.target)) return { type: 'shoot', target: o.target }
  if (o.type === 'item' && Number.isInteger(o.index) && (o.index as number) >= 0 && (o.index as number) < MAX_ITEMS) {
    if (o.target === undefined || o.target === null) return { type: 'item', index: o.index as number }
    if (isSeat(o.target)) return { type: 'item', index: o.index as number, target: o.target }
  }
  return null
}

export type NetStatus = 'idle' | 'connecting' | 'lobby' | 'playing' | 'error'

interface NetStore {
  /** L'écran multijoueur remplace l'écran titre. */
  open: boolean
  role: 'host' | 'client' | null
  status: NetStatus
  code: string
  /** Joueurs du salon, dans l'ordre des sièges (0 = hôte). */
  names: string[]
  seat: Seat
  /** Vue de la partie pour ce joueur (filtrée par l'hôte). */
  view: MultiState | null
  error: string
  setOpen: (open: boolean) => void
  host: (name: string) => void
  join: (code: string, name: string) => void
  /** Hôte : lance (ou relance) la partie avec les joueurs connectés. */
  start: () => void
  /** Hôte : retour au salon (pour attendre d'autres joueurs). */
  toLobby: () => void
  act: (a: MultiAction) => void
  /** Quitte le salon / la partie (reste sur l'écran multijoueur). */
  leave: () => void
}

interface Member {
  name: string
  /** null pour l'hôte lui-même. */
  conn: DataConnection | null
  /** Déconnecté pendant une partie : son siège reste (mort) jusqu'à la suivante. */
  gone: boolean
}

let peer: Peer | null = null
let hostConn: DataConnection | null = null
let members: Member[] = []
let full: MultiState | null = null
/** Dernier message reçu de chaque pair (hôte : par client ; client : clé = connexion à l'hôte). */
const lastSeen = new Map<DataConnection, number>()
let heartbeat: ReturnType<typeof setInterval> | undefined
/** Incrémenté à chaque session : les callbacks d'une ancienne session (fermetures après leave) sont ignorés. */
let session = 0

function teardown() {
  session++
  const p = peer
  peer = null
  hostConn = null
  members = []
  full = null
  lastSeen.clear()
  clearInterval(heartbeat)
  p?.destroy()
}

type SessionFields = Pick<NetStore, 'role' | 'status' | 'code' | 'names' | 'seat' | 'view' | 'error'>
const IDLE: SessionFields = { role: null, status: 'idle', code: '', names: [], seat: 0, view: null, error: '' }

export const useNetStore = create<NetStore>((set, get) => {
  const fail = (error: string) => {
    teardown()
    set({ ...IDLE, status: 'error', error })
  }

  const send = (c: DataConnection | null, m: ToClient) => {
    if (c?.open) c.send(m)
  }

  // ——— hôte ———

  const broadcastLobby = () => {
    const names = members.map((m) => m.name)
    set({ names, seat: 0 })
    members.forEach((m, i) => send(m.conn, { t: 'lobby', names, you: i }))
  }

  const broadcastState = () => {
    if (!full) return
    const g = full
    set({ view: viewFor(g, 0), seat: 0 })
    members.forEach((m, i) => !m.gone && send(m.conn, { t: 'state', view: viewFor(g, i), you: i }))
  }

  const uniqueName = (name: string) => {
    const taken = new Set(members.map((m) => m.name))
    let n = name
    for (let k = 2; taken.has(n); k++) n = `${name.slice(0, 13)} ${k}`
    return n
  }

  const onHostData = (conn: DataConnection, raw: unknown) => {
    lastSeen.set(conn, Date.now())
    const msg = raw as ToHost
    if (!msg || typeof msg !== 'object') return
    const idx = members.findIndex((m) => m.conn === conn)
    if (msg.t === 'hello' && idx < 0) {
      const reason = get().status === 'playing' ? 'started' : members.length >= MAX_PLAYERS ? 'full' : null
      if (reason) {
        send(conn, { t: 'reject', reason })
        setTimeout(() => conn.close(), 500)
        return
      }
      members.push({ name: uniqueName(cleanName(msg.name)), conn, gone: false })
      lastSeen.set(conn, Date.now())
      broadcastLobby()
    } else if (msg.t === 'action' && idx > 0 && full) {
      const a = parseAction(msg.action)
      if (!a) return
      const next = applyAction(full, idx, a)
      if (next !== full) {
        full = next
        broadcastState()
      }
    }
  }

  const onHostClose = (conn: DataConnection) => {
    lastSeen.delete(conn)
    const idx = members.findIndex((m) => m.conn === conn)
    if (idx <= 0) return
    if (full) {
      // en partie (ou sur l'écran de fin) : le siège reste, le joueur abandonne
      members[idx] = { ...members[idx], conn: null, gone: true }
      full = forfeitMulti(full, idx)
      broadcastState()
    } else {
      members.splice(idx, 1)
      broadcastLobby()
    }
  }

  const host = (name: string, tries = 0) => {
    teardown()
    const my = session
    const code = randomCode()
    set({ ...IDLE, role: 'host', status: 'connecting', code })
    const p = new Peer(PREFIX + code)
    peer = p
    p.on('open', () => {
      if (my !== session) return
      members = [{ name: cleanName(name), conn: null, gone: false }]
      set({ status: 'lobby' })
      broadcastLobby()
      heartbeat = setInterval(() => {
        const now = Date.now()
        for (const m of members) {
          if (!m.conn || m.gone) continue
          if (now - (lastSeen.get(m.conn) ?? now) > PEER_TIMEOUT) {
            const c = m.conn
            onHostClose(c)
            c.close()
          } else send(m.conn, { t: 'ping' })
        }
      }, PING_EVERY)
    })
    p.on('connection', (conn) => {
      if (my !== session) return conn.close()
      conn.on('data', (d) => my === session && onHostData(conn, d))
      conn.on('close', () => my === session && onHostClose(conn))
      conn.on('error', () => my === session && onHostClose(conn))
    })
    // perte du serveur de mise en relation : les connexions établies continuent, on tente de s'y reconnecter
    p.on('disconnected', () => my === session && !p.destroyed && p.reconnect())
    p.on('error', (e) => {
      if (my !== session) return
      if (e.type === 'unavailable-id' && tries < 3) return host(name, tries + 1) // code déjà pris
      if (e.type === 'peer-unavailable' || get().status === 'playing') return
      fail(tr('Impossible de créer le salon.', 'Could not create the room.'))
    })
  }

  // ——— client ———

  const onClientData = (raw: unknown) => {
    const msg = raw as ToClient
    if (!msg || typeof msg !== 'object') return
    if (msg.t === 'lobby') set({ status: 'lobby', names: msg.names, seat: msg.you, view: null })
    else if (msg.t === 'state') set({ status: 'playing', view: msg.view, seat: msg.you })
    else if (msg.t === 'reject') fail(msg.reason === 'full' ? tr('Salon complet (4 joueurs max).', 'Room is full (4 players max).') : tr('La partie a déjà commencé.', 'The game has already started.'))
  }

  const join = (rawCode: string, name: string) => {
    teardown()
    const my = session
    const code = normalizeCode(rawCode)
    set({ ...IDLE, role: 'client', status: 'connecting', code })
    const p = new Peer()
    peer = p
    setTimeout(() => my === session && get().status === 'connecting' && fail(tr('Salon introuvable.', 'Room not found.')), JOIN_TIMEOUT)
    p.on('open', () => {
      if (my !== session) return
      const c = p.connect(PREFIX + code, { reliable: true, serialization: 'json' })
      hostConn = c
      c.on('open', () => {
        if (my !== session) return
        c.send({ t: 'hello', name: cleanName(name) } satisfies ToHost)
        lastSeen.set(c, Date.now())
        heartbeat = setInterval(() => {
          if (Date.now() - (lastSeen.get(c) ?? 0) > PEER_TIMEOUT) fail(tr("L'hôte a quitté la partie.", 'The host left the game.'))
          else if (c.open) c.send({ t: 'ping' } satisfies ToHost)
        }, PING_EVERY)
      })
      c.on('data', (d) => {
        if (my !== session) return
        lastSeen.set(c, Date.now())
        onClientData(d)
      })
      c.on('close', () => my === session && fail(tr("L'hôte a quitté la partie.", 'The host left the game.')))
    })
    p.on('disconnected', () => my === session && !p.destroyed && p.reconnect())
    p.on('error', (e) => {
      if (my !== session) return
      if (e.type === 'peer-unavailable') return fail(tr('Salon introuvable.', 'Room not found.'))
      if (get().status === 'playing' || get().status === 'lobby') return // déjà connecté à l'hôte
      fail(tr('Connexion impossible.', 'Connection failed.'))
    })
  }

  return {
    open: false,
    ...IDLE,
    setOpen: (open) => {
      if (!open) teardown()
      set({ ...IDLE, open })
    },
    host: (name) => host(name),
    join,
    start: () => {
      if (get().role !== 'host') return
      members = members.filter((m) => !m.gone)
      if (members.length < MIN_PLAYERS) return
      full = createMultiGame(members.map((m) => m.name))
      set({ status: 'playing' })
      broadcastState()
    },
    toLobby: () => {
      if (get().role !== 'host') return
      members = members.filter((m) => !m.gone)
      full = null
      set({ status: 'lobby', view: null })
      broadcastLobby()
    },
    act: (a) => {
      if (get().role === 'host') {
        if (!full) return
        const next = applyAction(full, 0, a)
        if (next !== full) {
          full = next
          broadcastState()
        }
      } else if (hostConn?.open) {
        hostConn.send({ t: 'action', action: a } satisfies ToHost)
      }
    },
    leave: () => {
      teardown()
      set({ ...IDLE })
    },
  }
})

// fermeture de l'onglet : on prévient les pairs tout de suite plutôt que d'attendre le délai WebRTC
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => peer?.destroy())
