/**
 * 一起听（音乐房间）的引擎
 *
 * **声音是她自己放的**（本机文件 / 直链）。这个文件只负责「他」在房间里的行为，
 * 全部有时间基准 + 种子随机，刷新不会重掷：
 *
 *   · 一次「房间会话」＝ 停下来超过 10 分钟后再播 = 新的一次
 *   · 他进来：会话开始 + 还没在房间里 → `music.join.p`（种子 = 曲目 id + 10 分钟节拍，刷新不重掷）
 *   · 他待多久：`music.listenMin`（分钟），到点说一句先走 —— 这次会话就不再进来
 *   · 每首歌可能说一句（`music.say`）：歌放到 20%~40% 的时候
 *   · 每首歌可能往歌单里加一首（`music.shareBack`）：放到 50%~80% 的时候
 *   · 一起听时长 = **真的播出来的秒数**（`<audio>` 在走才累加；网易云 / 只有歌名的曲目不算）
 */
import { onPlayer, playerState } from '@/lib/audio'
import { SONGS, trackFromSong } from '@/lib/music'
import { nid } from '@/lib/ids'
import { useAppStore } from '@/store/useAppStore'
import { useRulesStore } from '@/store/useRulesStore'
import { makeMusicLine, makeRoomAdd, makeRoomJoin, makeRoomLeave } from './content'
import { seededHit, seededRange } from './seed'
import type { MusicRoom, RoomMessage, Track } from '@/types'

/** 停下来超过这么久 → 下一次播放算新的一次「一起听」 */
const SESSION_GAP_MS = 10 * 60 * 1000
/** 10 分钟一个节拍：同一节拍内刷新不会重掷「他进不进来」 */
const BUCKET_MS = 10 * 60 * 1000
/** 一起听时长多久落一次盘 */
const FLUSH_MS = 10_000

let attached = false
let tick: ReturnType<typeof setInterval> | null = null
let lastTickAt = 0
let lastPlayAt = 0
let pendingSec = 0
let plannedTrackId: string | null = null

const session = {
  running: false,
  noted: new Set<string>(),
  added: new Set<string>(),
}

const room = (): MusicRoom => useAppStore.getState().room
const trackOf = (id: string) => room().tracks.find((t) => t.id === id)
const bucket = () => Math.floor(Date.now() / BUCKET_MS)

const timers: ReturnType<typeof setTimeout>[] = []
const clearTimers = () => {
  timers.forEach(clearTimeout)
  timers.length = 0
}
const after = (ms: number, fn: () => void) => timers.push(setTimeout(fn, Math.max(0, ms)))

const say = (text: string) => {
  const msg: RoomMessage = {
    id: nid('rm'),
    senderId: useAppStore.getState().dream.id,
    text,
    createdAt: new Date().toISOString(),
  }
  useAppStore.getState().pushRoomMessage(msg)
}

/** 开始一次房间会话：他进不进来、准备待多久，都在这里抽一次 */
function startSession() {
  session.running = true
  session.noted.clear()
  session.added.clear()
  plannedTrackId = null
  clearTimers()

  const st = useAppStore.getState()
  const rules = useRulesStore.getState().saved.music
  if (st.room.heJoinedAt) return // 他本来就在房间里，接着听

  const seed = `${st.room.currentId ?? 'room'}:${bucket()}`
  if (!rules.join.enabled || !seededHit(`room-join:${seed}`, rules.join.p)) {
    console.debug('[engine] 这一节拍他没进来一起听')
    return
  }
  const delay = Math.min(seededRange(`room-join-d:${seed}`, rules.join.delay) * 1000, 30_000)
  after(delay, () => {
    if (useAppStore.getState().room.heJoinedAt) return
    const stayMin = seededRange(`room-stay:${seed}`, rules.listenMin)
    useAppStore.getState().patchRoom({
      heJoinedAt: new Date().toISOString(),
      heStaysUntil: new Date(Date.now() + stayMin * 60_000).toISOString(),
    })
    say(makeRoomJoin())
    console.debug('[engine] 他进了一起听房间', `${stayMin.toFixed(0)} 分钟后他准备走`)
  })
}

/** 当前这首歌：他说一句 / 他加一首（一次会话里每首歌最多一次） */
function planForTrack(track: Track) {
  if (plannedTrackId === track.id) return
  // 他不在房间里就不出声；等他进来之后再排（tick 会不停地回来问）
  if (!room().heJoinedAt) return
  plannedTrackId = track.id
  const rules = useRulesStore.getState().saved.music
  const dur = playerState().duration || 0
  /** 歌长已知就按比例（20%~40% 这类），未知就退回到固定的秒数区间 */
  const at = (lo: number, hi: number, fbLo: number, fbHi: number, seed: string) =>
    dur > 20
      ? seededRange(seed, [lo, hi]) * dur * 1000
      : seededRange(`${seed}:s`, [fbLo, fbHi]) * 1000

  if (rules.say.enabled && !session.noted.has(track.id) && seededHit(`room-say:${track.id}`, rules.say.p)) {
    session.noted.add(track.id)
    after(at(0.2, 0.4, 15, 40, `room-say-at:${track.id}`), () => {
      const t = trackOf(track.id)
      if (!t || !room().heJoinedAt) return
      const line = makeMusicLine(t.title)
      useAppStore.getState().setTrackNote(track.id, line)
      say(line)
      console.debug('[engine] 他聊了一句这首歌', t.title)
    })
  }

  if (rules.shareBack.enabled && !session.added.has(track.id) && seededHit(`room-add:${track.id}`, rules.shareBack.p)) {
    session.added.add(track.id)
    after(at(0.5, 0.8, 45, 120, `room-add-at:${track.id}`), () => {
      if (!room().heJoinedAt) return
      const have = new Set(room().tracks.map((t) => `${t.title}|${t.artist}`))
      const pool = SONGS.filter((s) => !have.has(`${s.title}|${s.artist}`))
      if (!pool.length) return
      const song = pool[Math.floor(Math.random() * pool.length)]
      useAppStore.getState().addRoomTracks([trackFromSong(song, 'him')])
      say(makeRoomAdd(song.title))
      console.debug('[engine] 他往歌单里加了一首', song.title)
    })
  }
}

/** 他这次会话待够了吗 */
function checkLeave() {
  const r = room()
  if (!r.heJoinedAt || !r.heStaysUntil) return
  if (Date.now() < +new Date(r.heStaysUntil)) return
  useAppStore.getState().patchRoom({ heJoinedAt: undefined, heStaysUntil: undefined })
  say(makeRoomLeave())
  clearTimers()
  console.debug('[engine] 他先去忙了')
}

function onPlaybackChange() {
  const s = playerState()
  if (!s.trackId || !s.playing) return
  const track = trackOf(s.trackId)
  if (!track) return

  const now = Date.now()
  if (!session.running || now - lastPlayAt > SESSION_GAP_MS) startSession()
  lastPlayAt = now
  planForTrack(track)
}

/** 一起听时长：`<audio>` 真的在走才累加，每 FLUSH_MS 落一次盘 */
function startClock() {
  if (tick) return
  lastTickAt = Date.now()
  tick = setInterval(() => {
    const now = Date.now()
    const dt = (now - lastTickAt) / 1000
    lastTickAt = now
    const s = playerState()
    if (s.playing && !s.loading && s.trackId) {
      pendingSec += dt
      checkLeave()
      // 他可能在歌放到一半才进来 —— 每秒回来问一次，谁该说话谁说话
      const t = trackOf(s.trackId)
      if (t) planForTrack(t)
    }
    if (pendingSec >= FLUSH_MS / 1000) {
      const sec = Math.floor(pendingSec)
      pendingSec -= sec
      const id = playerState().trackId
      if (sec > 0 && id) useAppStore.getState().addPlayedSec(id, sec)
    }
  }, 1000)
}

export function attachRoomEngine() {
  if (attached) return
  attached = true
  onPlayer(onPlaybackChange)
  startClock()
  if (room().heJoinedAt) startSession() // 刷新前他还在房间里 → 继续（到点会自己走）
}

/** 离开房间页面：把没落盘的秒数补上，并让声音停下来 */
export function leaveRoomScreen() {
  const sec = Math.floor(pendingSec)
  pendingSec -= sec
  const id = playerState().trackId
  if (sec > 0 && id) useAppStore.getState().addPlayedSec(id, sec)
  clearTimers()
}
