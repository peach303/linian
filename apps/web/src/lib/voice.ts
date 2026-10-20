/**
 * 语音（MiniMax T2A）
 *
 * 分工：**Key 在后端**，浏览器只调 `POST /api/v1/voice/tts` 拿 mp3 字节，
 * 转成 dataURL 存进消息里（这样换设备也听得到）—— 顺便按「文本 + 音色 + 模型 + 语速」缓存一份，
 * 同一句话不会重复计费。
 *
 * 没配 Key 时这里一律返回 null，调用方**退化成一条文字**（绝不假装是语音）。
 */
import { hash32 } from '@/lib/engine/seed'
import { API_BASE } from '@/lib/deploy'
import { db } from '@/lib/db'

/** MiniMax 常见的系统音色（也可以在「接入」页填自定义 voiceId，比如克隆音色） */
export interface VoicePreset {
  id: string
  name: string
  tag: string
}

export const VOICES: VoicePreset[] = [
  { id: 'male-qn-qingse', name: '青涩青年音', tag: '男' },
  { id: 'male-qn-jingying', name: '精英青年音', tag: '男' },
  { id: 'male-qn-badao', name: '霸道青年音', tag: '男' },
  { id: 'male-qn-daxuesheng', name: '青年大学生音', tag: '男' },
  { id: 'male-qn-qingse-jingpin', name: '青涩青年音 · 精品', tag: '男' },
  { id: 'male-qn-jingying-jingpin', name: '精英青年音 · 精品', tag: '男' },
  { id: 'male-qn-badao-jingpin', name: '霸道青年音 · 精品', tag: '男' },
  { id: 'female-shaonv', name: '少女音', tag: '女' },
  { id: 'female-yujie', name: '御姐音', tag: '女' },
  { id: 'female-chengshu', name: '成熟女性音', tag: '女' },
  { id: 'female-tianmei', name: '甜美女性音', tag: '女' },
  { id: 'female-shaonv-jingpin', name: '少女音 · 精品', tag: '女' },
  { id: 'presenter_male', name: '男性主持人', tag: '男' },
  { id: 'presenter_female', name: '女性主持人', tag: '女' },
  { id: 'audiobook_male_1', name: '男性有声书', tag: '男' },
  { id: 'audiobook_female_1', name: '女性有声书', tag: '女' },
]

export const voiceName = (id?: string) => VOICES.find((v) => v.id === id)?.name ?? id ?? '默认音色'

export const MODELS = [
  { id: 'speech-02-hd', name: 'speech-02-hd（高保真，贵一点）' },
  { id: 'speech-02-turbo', name: 'speech-02-turbo（快，便宜）' },
  { id: 'speech-01-turbo', name: 'speech-01-turbo（老模型，最便宜）' },
]

/** MiniMax 支持的情绪（`voice_setting.emotion`） */
export type VoiceEmotion = 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised' | 'neutral'

/**
 * 情绪标签 → MiniMax 情绪。
 * 引擎的标签是中文（温柔 / 期待 / 委屈…），这里只映射有把握的几个，其余返回 undefined（走默认）。
 */
const EMOTION_MAP: Record<string, VoiceEmotion> = {
  开心: 'happy',
  高兴: 'happy',
  期待: 'happy',
  撒娇: 'happy',
  温柔: 'happy',
  甜: 'happy',
  难过: 'sad',
  委屈: 'sad',
  失落: 'sad',
  低落: 'sad',
  抱歉: 'sad',
  生气: 'angry',
  不悦: 'angry',
  吃醋: 'angry',
  担心: 'fearful',
  害怕: 'fearful',
  不安: 'fearful',
  紧张: 'fearful',
  惊讶: 'surprised',
  惊喜: 'surprised',
  平静: 'neutral',
}

export function emotionFromTags(tags?: string[]): VoiceEmotion | undefined {
  if (!tags?.length) return undefined
  for (const t of tags) {
    const e = EMOTION_MAP[t]
    if (e) return e
  }
  return undefined
}

export interface VoiceAudio {
  /** dataURL（`data:audio/mpeg;base64,…`）—— 存进消息里，换设备也能听 */
  url: string
  /** 时长（毫秒） */
  durationMs: number
  voiceId: string
  model: string
  bytes: number
  /** 命中了本机缓存（没重新计费） */
  cached?: boolean
}

export interface SynthOptions {
  voiceId?: string
  model?: string
  speed?: number
  emotion?: VoiceEmotion
  /** 跳过缓存（「接入」页试听时用） */
  noCache?: boolean
}

const cacheKey = (text: string, o: SynthOptions) =>
  `tts:${hash32(`${o.voiceId ?? ''}|${o.model ?? ''}|${o.speed ?? ''}|${o.emotion ?? ''}|${text}`)}`

/** 内存 + IndexedDB 两级缓存：同一句话不重复计费 */
const mem = new Map<string, VoiceAudio>()

/** 合成的失败原因（「接入」页要原样显示给用户，不能只 console.warn 了事） */
export interface SynthFailure {
  error: string
  detail?: string
  hint?: string
}

/**
 * 合成（带失败原因）。
 * 缓存命中就直接返回，否则打后端。
 */
export async function synthesizeDetailed(
  text: string,
  o: SynthOptions = {},
): Promise<{ ok: true; audio: VoiceAudio } | { ok: false; failure: SynthFailure }> {
  const t = text.trim()
  if (!t) return { ok: false, failure: { error: 'EMPTY_TEXT' } }
  const key = cacheKey(t, o)

  if (!o.noCache) {
    const hit = mem.get(key)
    if (hit) return { ok: true, audio: { ...hit, cached: true } }
    const stored = await db.get<VoiceAudio>(key)
    if (stored?.url) {
      mem.set(key, stored)
      return { ok: true, audio: { ...stored, cached: true } }
    }
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/voice/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: t, voiceId: o.voiceId, model: o.model, speed: o.speed, emotion: o.emotion }),
    })
  } catch (e) {
    return { ok: false, failure: { error: 'BACKEND_UNREACHABLE', detail: String(e) } }
  }

  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as SynthFailure | null
    return {
      ok: false,
      failure: { error: j?.error ?? `HTTP_${res.status}`, detail: j?.detail, hint: j?.hint },
    }
  }

  const blob = await res.blob()
  const url = await blobToDataUrl(blob)
  const audio: VoiceAudio = {
    url,
    durationMs: Number(res.headers.get('X-Audio-Duration-Ms') ?? 0) || 0,
    voiceId: o.voiceId ?? '',
    model: o.model ?? '',
    bytes: blob.size,
  }
  mem.set(key, audio)
  await db.set(key, audio)
  return { ok: true, audio }
}

/** 引擎用的简版：失败就返回 null（调用方退化成文字），失败原因写 console */
export async function synthesize(text: string, o: SynthOptions = {}): Promise<VoiceAudio | null> {
  const r = await synthesizeDetailed(text, o)
  if (r.ok) return r.audio
  console.warn('[voice] 合成失败：', r.failure.error, r.failure.detail ?? r.failure.hint ?? '')
  return null
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

/** 清空语音缓存（「接入」页用：觉得占地方就清） */
export async function clearVoiceCache(): Promise<void> {
  mem.clear()
  await db.clearKeys('tts:')
}

/* ───────────────────────── 接入配置 ───────────────────────── */

export interface IntegrationsStatus {
  minimax: {
    configured: boolean
    /** 这把 Key 是从哪儿来的：settings = 设置页填的，env = .env 读的 */
    source: 'settings' | 'env' | 'none'
    /** 只有尾号，明文永远不出后端 */
    hint: string
    groupId: string
    model: string
    voiceId: string
    speed: number
    defaults: { model: string; voiceId: string; speed: number }
  }
  search: {
    configured: boolean
    source: 'settings' | 'env' | 'none'
    /** 只有尾号，明文永远不出后端 */
    hint: string
    /** 博查的时效过滤（`oneDay` / `oneWeek` / `oneMonth` / `oneYear` / `noLimit`） */
    freshness: string
    /** 一次取几条（1~10） */
    count: number
    defaults: { freshness: string; count: number }
  }
}

export const EMPTY_INTEGRATIONS: IntegrationsStatus = {
  minimax: {
    configured: false,
    source: 'none',
    hint: '',
    groupId: '',
    model: 'speech-02-hd',
    voiceId: 'male-qn-qingse',
    speed: 1,
    defaults: { model: 'speech-02-hd', voiceId: 'male-qn-qingse', speed: 1 },
  },
  search: {
    configured: false,
    source: 'none',
    hint: '',
    freshness: 'oneYear',
    count: 5,
    defaults: { freshness: 'oneYear', count: 5 },
  },
}

/** 后端回来的状态补齐默认值（老后端没有 `search` 这一块也能用） */
function withIntegrationDefaults(j: Partial<IntegrationsStatus> | null | undefined): IntegrationsStatus {
  return {
    ...EMPTY_INTEGRATIONS,
    ...j,
    minimax: { ...EMPTY_INTEGRATIONS.minimax, ...(j?.minimax ?? {}) },
    search: { ...EMPTY_INTEGRATIONS.search, ...(j?.search ?? {}) },
  }
}

export async function readIntegrations(): Promise<IntegrationsStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/integrations`)
    if (!res.ok) return null
    const j = (await res.json()) as Partial<IntegrationsStatus>
    return withIntegrationDefaults(j)
  } catch {
    return null
  }
}

export interface IntegrationsPatch {
  /** 免费代理模式：保存 / 断开 Key 时需要管理密码；完整本地后端会忽略 */
  adminPassword?: string
  minimax?: {
    apiKey?: string
    groupId?: string
    model?: string
    voiceId?: string
    speed?: number
    removeKey?: boolean
    clear?: boolean
  }
  /** 联网搜索（博查）：`apiKey` 留空 = 不改；清空授权用 `clear` */
  search?: {
    apiKey?: string
    freshness?: string
    count?: number
    removeKey?: boolean
    clear?: boolean
  }
}

export async function saveIntegrations(patch: IntegrationsPatch): Promise<IntegrationsStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/integrations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) return null
    const j = (await res.json()) as Partial<IntegrationsStatus>
    return withIntegrationDefaults(j)
  } catch {
    return null
  }
}
