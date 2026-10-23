import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { NavBar } from '@/components/common/NavBar'
import { MusicAccountCard } from '@/components/settings/MusicAccountCard'
import { RuleField } from '@/components/settings/controls'
import { API_ENABLED, PROXY_MODE } from '@/lib/deploy'
import { getAtPath, RULE_GROUPS } from '@/lib/rules'
import { pushNow } from '@/lib/engine/search'
import { searchReason, searchWeb, type SearchResult } from '@/lib/search'
import { fromNow } from '@/lib/time'
import { MODELS, VOICES, clearVoiceCache, synthesizeDetailed, voiceName } from '@/lib/voice'
import { useAppStore } from '@/store/useAppStore'
import { useIntegrationsStore } from '@/store/useIntegrationsStore'
import { useRulesStore } from '@/store/useRulesStore'

/**
 * 接入（设置 → 接口与扩展）
 *
 * 干两件事：把「梦角能真的出声」（MiniMax 语音）和「他真的能上网搜」
 *（博查搜索）这两条路接通。
 * - Key 存在**你自己的后端**（`apps/server/.data/db.json`），接口只回尾号，明文永远不回前端；
 *   也可以改走 `apps/server/.env`（`MINIMAX_API_KEY` / `SEARCH_API_KEY`），设置页留空即用 .env 的。
 * - 「测试发音」用当前音色真合成一句；「测试搜索」真去搜一次 —— 能听见 / 能搜到才算接通。
 * - 没接通时引擎**绝不发假的**：语音只把「命中但未配置」写进轨迹；
 *   搜索**一条都不推**，只在轨迹里记一条失败。
 */

const SAMPLE = '你听，这是我自己说的，不是字卡拼出来的。'

/** 搜索关键词沿用概率引擎的字段元数据，保证两边是同一份定义 */
const TOPICS_FIELD = RULE_GROUPS.flatMap((g) => g.fields).find((f) => f.path === 'search.topics')

/** 博查的时效过滤（值要和上游一致） */
const FRESHNESS: { id: string; label: string }[] = [
  { id: 'oneDay', label: '一天内' },
  { id: 'oneWeek', label: '一周内' },
  { id: 'oneMonth', label: '一个月内' },
  { id: 'oneYear', label: '一年内' },
  { id: 'noLimit', label: '不限时间' },
]

export function IntegrationScreen() {
  const { status, loaded, reachable, saving, note, refresh, save } = useIntegrationsStore()
  const rules = useRulesStore((s) => s.saved)
  const draftRules = useRulesStore((s) => s.draft)
  const updateRule = useRulesStore((s) => s.update)
  const saveRules = useRulesStore((s) => s.save)
  const push = useAppStore((s) => s.push)
  const logs = useAppStore((s) => s.searchPush.logs)
  const removeSearchLog = useAppStore((s) => s.removeSearchLog)
  const clearSearchLogs = useAppStore((s) => s.clearSearchLogs)

  /** 免费代理模式下保存 / 断开 Key 用的管理密码；只留在本次页面内存里，不写 localStorage */
  const [adminPassword, setAdminPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [groupId, setGroupId] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)
  const [customModel, setCustomModel] = useState('')
  const [voiceId, setVoiceId] = useState<string | null>(null)
  const [customVoice, setCustomVoice] = useState('')
  const [testing, setTesting] = useState(false)
  const [testNote, setTestNote] = useState<{ ok: boolean; text: string } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  /**
   * 哪一张卡的「断开」正在等确认
   *
   * 断开是**不可逆**的：明文 Key 只在后端（接口只回尾号），清掉就得重填。
   * 所以两步走 —— 第一次点只是把它亮出来，再点一次才真的断。
   */
  const [confirmOff, setConfirmOff] = useState<null | 'minimax' | 'search'>(null)

  /* ── 联网搜索（博查）── */
  const [searchKey, setSearchKey] = useState('')
  const [freshness, setFreshness] = useState<string | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchNote, setSearchNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [testQuery, setTestQuery] = useState('今天有什么新闻')

  /** 服务端状态回来后同步到输入框（之后以输入框为准） */
  useEffect(() => {
    if (!loaded) return
    setGroupId((v) => v ?? status.minimax.groupId)
    setModel((v) => v ?? status.minimax.model)
    setCustomModel((v) => v || (MODELS.some((m) => m.id === status.minimax.model) ? '' : status.minimax.model))
    setVoiceId((v) => v ?? status.minimax.voiceId)
    setFreshness((v) => v ?? status.search.freshness)
    setCount((v) => v ?? status.search.count)
  }, [loaded, status])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const effModel = (model ?? status.minimax.model).trim() || status.minimax.model || 'speech-2.8-hd'
  const effVoice = voiceId ?? status.minimax.voiceId
  const modelIsPreset = MODELS.some((m) => m.id === effModel)
  const canSave = !PROXY_MODE || adminPassword.trim().length > 0
  const admin = PROXY_MODE ? adminPassword.trim() : undefined

  const doSave = async () => {
    setTestNote(null)
    const ok = await save({
      adminPassword: admin,
      minimax: {
        // 留空 = 不改（避免「只想换音色」却把 Key 抹掉）
        apiKey: apiKey.trim() || undefined,
        groupId: groupId ?? '',
        model: effModel,
        voiceId: effVoice,
      },
    })
    if (ok) setApiKey('')
  }

  const doTest = async () => {
    setTesting(true)
    setTestNote(null)
    const r = await synthesizeDetailed(SAMPLE, {
      voiceId: effVoice,
      model: effModel,
      speed: rules.voice.pace,
      noCache: true,
    })
    setTesting(false)
    if (r.ok) {
      setTestNote({
        ok: true,
        text: `合成成功 · ${(r.audio.durationMs / 1000).toFixed(1)}s · ${(r.audio.bytes / 1024).toFixed(0)}KB（正在播放…）`,
      })
      audioRef.current?.pause()
      const a = new Audio(r.audio.url)
      audioRef.current = a
      void a.play().catch(() => setTestNote({ ok: false, text: '拿到了音频，但浏览器不让自动播放 —— 再点一次试试' }))
    } else {
      setTestNote({ ok: false, text: reason(r.failure.error, r.failure.detail ?? r.failure.hint) })
    }
  }

  const doClearCache = async () => {
    const n = await clearVoiceCache()
    setTestNote({ ok: true, text: `语音缓存清了 ${n} 条（下次同一句话会重新合成）` })
  }

  const doDisconnect = async () => {
    audioRef.current?.pause()
    setApiKey('')
    await save({ adminPassword: admin, minimax: { clear: true } })
  }

  /* ── 联网搜索（博查） ── */
  const effFreshness = freshness ?? status.search.freshness
  const effCount = count ?? status.search.count

  const doSaveSearch = async () => {
    setSearchNote(null)
    /** 关键词改在本地 rules 草稿里；这里和接口设置一起落盘 */
    await saveRules()
    const ok = await save({
      adminPassword: admin,
      // 留空 = 不改（避免「只想换时效」却把 Key 抹掉）
      search: { apiKey: searchKey.trim() || undefined, freshness: effFreshness, count: effCount },
    })
    if (ok) {
      setSearchKey('')
      setSearchNote({ ok: true, text: '已保存。下面点「搜一下」真搜一次看看' })
    }
  }

  /** 测试搜索：真去搜一次（只看结果，不发消息、不进轨迹） */
  const doTestSearch = async () => {
    setSearching(true)
    setSearchNote(null)
    setResults([])
    const r = await searchWeb(testQuery)
    setSearching(false)
    if (r.ok) {
      setResults(r.results)
      const top = r.results[0]
      setSearchNote({ ok: true, text: `真搜到 ${r.results.length} 条 · 首条：${top.siteName ? `${top.siteName} · ` : ''}${top.name}` })
    } else {
      setSearchNote({ ok: false, text: searchReason(r.error, r.detail) })
    }
  }

  /** 现在推一条：走引擎那条路（会真的往聊天里推一张卡 + 记一条轨迹） */
  const doPushNow = async () => {
    setSearching(true)
    setSearchNote(null)
    const r = await pushNow()
    setSearching(false)
    if (r.ok) {
      const shape = r.media === 'video' ? '视频卡' : r.media === 'image' ? '图片卡' : '链接卡'
      setSearchNote({ ok: true, text: `搜到并推了一条${shape}：「${r.topic}」→ ${r.title}（去聊天里看那张卡）` })
    } else {
      setSearchNote({ ok: false, text: `没搜到，什么都没推（这样才对）：「${r.topic}」· ${searchReason(r.error ?? 'HTTP_ERROR', r.detail)}` })
    }
  }

  const doDisconnectSearch = async () => {
    setSearchKey('')
    setResults([])
    await save({ adminPassword: admin, search: { clear: true } })
  }

  const enabled = rules.voice.enabled

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-page">
      <NavBar
        title="接入"
        right={
          <button className="tap text-[12px] text-brand-deep" onClick={() => void refresh()}>
            刷新
          </button>
        }
      />

      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {!API_ENABLED && (
          <section className="rounded-xl border border-brand/30 bg-brand/5 p-3">
            <p className="text-[13px] font-medium text-ink">静态托管版</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-sub">
              聊天、字卡、日记、朋友圈、信箱、功能都在本机跑，不依赖后端。语音合成、联网搜索推送、跨设备同步需要服务端，这个版本不会假装能用；Key 也不会写进网页。
            </p>
          </section>
        )}

        {PROXY_MODE && (
          <section className="rounded-xl border border-brand/30 bg-brand/5 p-3">
            <p className="text-[13px] font-medium text-ink">静态站 + 免费代理</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-sub">
              聊天记录仍然只存在这台设备；语音和联网搜索通过 Deno Deploy 免费代理转发，Key 存在代理的 KV 里，网页和聊天记录里都没有 Key。
              保存 / 断开 Key 需要管理密码 —— 它只用于这一次请求，不会写进浏览器存储。
            </p>
          </section>
        )}

        {API_ENABLED && (
          <>
        {PROXY_MODE && (
          <section className="rounded-xl bg-surface p-3 shadow-card">
            <Field label="代理管理密码" hint="只用来保存 / 断开 Key，不会保存到本地">
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="部署代理时在 Deno Deploy 里设置的 ADMIN_PASSWORD"
                className="w-full rounded-lg bg-page px-3 py-2.5 text-[14px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint focus:ring-brand"
              />
            </Field>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
              不填也能读「已接通 / 未配置」的状态；只有点保存或断开时才需要它。密码只留在当前页面内存里，刷新就没了。
            </p>
          </section>
        )}

        {/* ── 状态 ── */}
        <section className="rounded-xl bg-surface p-3 shadow-card">
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                'h-2 w-2 rounded-full',
                status.minimax.configured ? 'bg-[#07C160]' : reachable ? 'bg-[#FA9D3B]' : 'bg-[#FA5151]',
              )}
            />
            <span className="text-[14px] text-ink">
              MiniMax 语音
              <span className="ml-1 text-[12px] text-ink-sub">
                {status.minimax.configured
                  ? `已接通 · ${status.minimax.source === 'env' ? (PROXY_MODE ? 'Deno Deploy 环境变量里的 Key' : '.env 里的 Key') : '设置里填的 Key'} ${status.minimax.hint}`
                  : reachable
                    ? '未配置'
                    : PROXY_MODE
                      ? '代理没连上'
                      : '后端没在跑'}
              </span>
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
            音频由服务端 / 免费代理代取（浏览器直连 MiniMax 会被 CORS 挡）。Key 只存在服务端，接口只回尾号；
            没接通时引擎不会伪造语音，只把「命中但未配置」写进抽签轨迹。
          </p>
        </section>

        {/* ── MiniMax ── */}
        <Card title="MiniMax（真实语音）" desc="填好 Key 后点「测试发音」，能听见才算接通">
          <Field label="API Key" hint="留空 = 不改；清空授权请点下面的「断开」">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status.minimax.configured ? `已配置 ${status.minimax.hint}（不填就不改）` : 'sk-… 从 MiniMax 控制台拿'}
              className="w-full rounded-lg bg-page px-3 py-2.5 text-[14px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint focus:ring-brand"
            />
          </Field>

          <Field label="GroupId（旧版控制台才需要）" hint="不是代理网址；新版 Key 可以留空">
            <input
              value={groupId ?? ''}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="旧版的一串数字，例如 18…；新版留空即可"
              className="w-full rounded-lg bg-page px-3 py-2.5 text-[14px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint focus:ring-brand"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
              新版 MiniMax（platform.minimax.io / api.minimax.io）只用 API Key，不需要 GroupId；旧版控制台才有这一项。
              代理会先走新版接口，填错了也不会影响新版 Key。
            </p>
          </Field>

          <Field label="模型" hint="最新是 2.8；也能自己填模型 ID">
            <select
              value={modelIsPreset ? effModel : '__custom'}
              onChange={(e) => {
                if (e.target.value === '__custom') {
                  setCustomModel(modelIsPreset ? '' : effModel)
                  setModel(effModel)
                } else {
                  setCustomModel('')
                  setModel(e.target.value)
                }
              }}
              className="w-full rounded-lg bg-page px-3 py-2.5 text-[14px] text-ink outline-none ring-1 ring-hairline focus:ring-brand"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              <option value="__custom">{modelIsPreset ? '自定义模型…' : `自定义：${effModel}`}</option>
            </select>
            <input
              value={customModel}
              onChange={(e) => {
                setCustomModel(e.target.value)
                setModel(e.target.value)
              }}
              placeholder={`自定义模型 ID（当前 ${effModel}）`}
              className="mt-2 w-full rounded-lg bg-page px-3 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint focus:ring-brand"
            />
          </Field>

          <Field label="音色" hint="系统音色之外，也能填克隆音色的 voiceId">
            <select
              value={VOICES.some((v) => v.id === effVoice) ? effVoice : '__custom'}
              onChange={(e) => setVoiceId(e.target.value === '__custom' ? customVoice || effVoice : e.target.value)}
              className="w-full rounded-lg bg-page px-3 py-2.5 text-[14px] text-ink outline-none ring-1 ring-hairline focus:ring-brand"
            >
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}（{v.tag}）
                </option>
              ))}
              <option value="__custom">
                {VOICES.some((v) => v.id === effVoice) ? '自定义 voiceId…' : `自定义：${effVoice}`}
              </option>
            </select>
            <input
              value={customVoice}
              onChange={(e) => {
                setCustomVoice(e.target.value)
                setVoiceId(e.target.value)
              }}
              placeholder={`自定义 voiceId（当前 ${voiceName(effVoice)}）`}
              className="mt-2 w-full rounded-lg bg-page px-3 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint focus:ring-brand"
            />
          </Field>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="tap rounded-lg bg-brand px-3 py-2 text-[13px] text-white disabled:opacity-50"
              disabled={saving || !canSave}
              onClick={() => void doSave()}
            >
              保存
            </button>
            <button
              className="tap rounded-lg bg-surface px-3 py-2 text-[13px] text-brand-deep ring-1 ring-hairline disabled:opacity-50"
              disabled={testing || !status.minimax.configured}
              onClick={() => void doTest()}
            >
              {testing ? '合成中…' : '测试发音'}
            </button>
            <button className="tap rounded-lg bg-surface px-3 py-2 text-[13px] text-ink-sub ring-1 ring-hairline" onClick={() => void doClearCache()}>
              清空语音缓存
            </button>
            {status.minimax.configured &&
              (confirmOff === 'minimax' ? (
                <div className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-[#fdecec] px-3 py-2 text-[12px] text-[#c0392b]">
                  <span>断开 = 清掉服务端那把 Key（只回尾号，清掉要重填）</span>
                  <button
                    className="tap ml-auto rounded-md bg-[#FA5151] px-2.5 py-1 font-semibold text-white disabled:opacity-50"
                    disabled={!canSave}
                    onClick={() => {
                      setConfirmOff(null)
                      void doDisconnect()
                    }}
                  >
                    确认断开
                  </button>
                  <button className="tap text-ink-sub" onClick={() => setConfirmOff(null)}>
                    取消
                  </button>
                </div>
              ) : (
                <button
                  className="tap rounded-lg bg-surface px-3 py-2 text-[13px] text-[#FA5151] ring-1 ring-hairline"
                  onClick={() => setConfirmOff('minimax')}
                >
                  断开
                </button>
              ))}
          </div>

          {(note || testNote) && (
            <p className={clsx('mt-2 text-[11px] leading-relaxed', testNote && !testNote.ok ? 'text-[#FA5151]' : 'text-ink-sub')}>
              {testNote ? `${testNote.ok ? '✅ ' : '⚠️ '}${testNote.text}` : note}
            </p>
          )}

          {!status.minimax.configured && (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              {PROXY_MODE ? (
                <>
                  也可以不填这里：在 Deno Deploy 后台给代理加 <code>MINIMAX_API_KEY</code> /{' '}
                  <code>MINIMAX_GROUP_ID</code> 环境变量。两处都有时以这里保存的为准。
                </>
              ) : (
                <>
                  也可以不填这里：把 <code>MINIMAX_API_KEY</code> / <code>MINIMAX_GROUP_ID</code> 写进{' '}
                  <code>apps/server/.env</code> 再重启后端。两处都有时以设置页为准。
                </>
              )}
            </p>
          )}
        </Card>

        {/* ── 引擎开关 ── */}
        <Card title="引擎里的语音开关" desc="接通了还要在概率调节引擎里把它打开，他才会偶尔发语音">
          <div className="flex items-center gap-2">
            <span className={clsx('text-[13px]', enabled ? 'text-ink' : 'text-ink-faint')}>
              MiniMax 真实语音：{enabled ? '已开启' : '未开启'}
            </span>
            {!enabled && (
              <button
                className="tap ml-auto rounded-lg bg-brand px-3 py-1.5 text-[12px] text-white"
                onClick={() => {
                  updateRule('voice.enabled', true)
                  void saveRules()
                }}
              >
                打开（并保存）
              </button>
            )}
          </div>
          <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-ink-faint">
            <li>· 发语音概率 / 字数上限 / 语速 / 按情绪变调 → 都在「概率调节引擎 → 语音」里</li>
            <li>· 命中后会把这一轮本来就打算说的某一句改成真语音（不会平白多一句）</li>
            <li>· 太长或拼音串的句子不会被挑去念；合成失败就退回文字，并把原因写进轨迹</li>
          </ul>
          <button className="tap mt-2 text-[12px] text-brand-deep" onClick={() => push('rule-engine')}>
            去概率调节引擎 ›
          </button>
        </Card>

        {/* ── 联网搜索（博查） ── */}
        <Card
          title="联网搜索推送（博查）"
          desc="填好 Key 后点「搜一下」，真搜到才算接通。推给你的卡有三种形态，形态由内容说了算：链接卡（带站点图标和封面）/ 图片卡 / 视频卡 —— 图都是服务端真取过一遍的，取不到就不配图；博查几乎不返回视频站，所以视频卡很少见"
        >
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                'h-2 w-2 rounded-full',
                status.search.configured ? 'bg-[#07C160]' : reachable ? 'bg-[#FA9D3B]' : 'bg-[#FA5151]',
              )}
            />
            <span className="text-[14px] text-ink">
              博查搜索
              <span className="ml-1 text-[12px] text-ink-sub">
                {status.search.configured
                  ? `已接通 · ${status.search.source === 'env' ? (PROXY_MODE ? 'Deno Deploy 环境变量里的 Key' : '.env 里的 Key') : '设置里填的 Key'} ${status.search.hint}`
                  : reachable
                    ? '未配置'
                    : PROXY_MODE
                      ? '代理没连上'
                      : '后端没在跑'}
              </span>
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
            由服务端 / 免费代理代搜（浏览器直连博查会被 CORS 挡，Key 也不该下发到前端）。Key 只存在服务端，接口只回尾号。
            <span className="text-ink-sub">
              搜到才推那张卡；搜不到 —— 没配 Key / 断网 / 被限流 / 一条结果都没有 —— <b>一条消息都不会发</b>，只在下面的轨迹里记一条失败。
            </span>
          </p>

          <Field label="API Key" hint="留空 = 不改；清空授权请点下面的「断开」">
            <input
              type="password"
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
              placeholder={status.search.configured ? `已配置 ${status.search.hint}（不填就不改）` : 'sk-… 从博查开放平台（open.bochaai.com）拿'}
              className="w-full rounded-lg bg-page px-3 py-2.5 text-[14px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint focus:ring-brand"
            />
          </Field>

          <Field label="时效" hint="搜多久以内的东西（越近越像「新闻」，越远越像「资料」）">
            <select
              value={effFreshness}
              onChange={(e) => setFreshness(e.target.value)}
              className="w-full rounded-lg bg-page px-3 py-2.5 text-[14px] text-ink outline-none ring-1 ring-hairline focus:ring-brand"
            >
              {FRESHNESS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
              {!FRESHNESS.some((f) => f.id === effFreshness) && <option value={effFreshness}>{effFreshness}</option>}
            </select>
          </Field>

          <Field label="一次取几条" hint="引擎只把第一条推成卡片；多取几条是给下面的「搜一下」看的">
            <select
              value={String(effCount)}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full rounded-lg bg-page px-3 py-2.5 text-[14px] text-ink outline-none ring-1 ring-hairline focus:ring-brand"
            >
              {[3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n} 条
                </option>
              ))}
            </select>
          </Field>

          {(rules.search.enabled || draftRules.search.enabled) && TOPICS_FIELD && (
            <div className="mt-1 border-t border-hairline">
              <RuleField
                field={TOPICS_FIELD}
                value={getAtPath(draftRules, 'search.topics')}
                onChange={(v) => {
                  updateRule('search.topics', v)
                  void saveRules()
                }}
                active
              />
              <p className="-mt-1 pb-1 text-[11px] leading-relaxed text-ink-faint">加 / 删关键词会自动保存</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="tap rounded-lg bg-brand px-3 py-2 text-[13px] text-white disabled:opacity-50"
              disabled={saving || !canSave}
              onClick={() => void doSaveSearch()}
            >
              保存
            </button>
            <button
              className="tap rounded-lg bg-surface px-3 py-2 text-[13px] text-brand-deep ring-1 ring-hairline disabled:opacity-50"
              disabled={searching || !status.search.configured}
              onClick={() => void doPushNow()}
            >
              {searching ? '搜着…' : '现在推一条'}
            </button>
            {status.search.configured &&
              (confirmOff === 'search' ? (
                <div className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-[#fdecec] px-3 py-2 text-[12px] text-[#c0392b]">
                  <span>断开 = 清掉服务端那把 Key（只回尾号，清掉要重填）</span>
                  <button
                    className="tap ml-auto rounded-md bg-[#FA5151] px-2.5 py-1 font-semibold text-white disabled:opacity-50"
                    disabled={!canSave}
                    onClick={() => {
                      setConfirmOff(null)
                      void doDisconnectSearch()
                    }}
                  >
                    确认断开
                  </button>
                  <button className="tap text-ink-sub" onClick={() => setConfirmOff(null)}>
                    取消
                  </button>
                </div>
              ) : (
                <button
                  className="tap rounded-lg bg-surface px-3 py-2 text-[13px] text-[#FA5151] ring-1 ring-hairline"
                  onClick={() => setConfirmOff('search')}
                >
                  断开
                </button>
              ))}
          </div>

          <Field label="搜一下（测试连通）" hint="真去搜一次：看得见结果才算接通。这一步不发消息、也不进轨迹">
            <div className="flex gap-2">
              <input
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="想搜什么"
                className="min-w-0 flex-1 rounded-lg bg-page px-3 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint focus:ring-brand"
              />
              <button
                className="tap shrink-0 rounded-lg bg-surface px-3 py-2 text-[13px] text-brand-deep ring-1 ring-hairline disabled:opacity-50"
                disabled={searching || !status.search.configured}
                onClick={() => void doTestSearch()}
              >
                搜一下
              </button>
            </div>
          </Field>

          {searchNote && (
            <p className={clsx('mt-2 text-[11px] leading-relaxed', searchNote.ok ? 'text-ink-sub' : 'text-[#FA5151]')}>
              {searchNote.ok ? '✅ ' : '⚠️ '}
              {searchNote.text}
            </p>
          )}

          {results.length > 0 && (
            <>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                首条会推成卡片。上面这一测只看连通，所以没有真去验图；点「现在推一条」才会连图一起试。
              </p>
              <ul className="mt-2 space-y-1.5">
                {results.map((r, i) => (
                  <li key={`${r.url}-${i}`} className="rounded-lg bg-page p-2 text-[11px]">
                    <div className="flex items-start gap-1.5">
                      {r.siteIcon ? (
                        <img src={r.siteIcon} alt="" className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded-sm" />
                      ) : null}
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 text-[12px] leading-snug text-ink"
                      >
                        {r.name}
                      </a>
                      {r.video?.is && (
                        <span className="shrink-0 rounded bg-brand-soft px-1 py-0.5 text-[9.5px] text-brand-deep">
                          视频{r.video.duration ? ` ${r.video.duration}` : ''}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-ink-faint">
                      {r.siteName ? `${r.siteName} · ` : ''}
                      {r.url}
                      {r.datePublished ? ` · ${r.datePublished.slice(0, 10)}` : ''}
                    </div>
                    {(r.snippet || r.summary) && (
                      <p className="mt-1 line-clamp-3 leading-relaxed text-ink-sub">{r.snippet || r.summary}</p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-3 flex items-center gap-2 border-t border-hairline pt-3">
            <span className={clsx('text-[13px]', rules.search.enabled ? 'text-ink' : 'text-ink-faint')}>
              引擎里的联网搜索推送：{rules.search.enabled ? '已开启' : '未开启'}
            </span>
            {!rules.search.enabled && (
              <button
                className="tap ml-auto rounded-lg bg-brand px-3 py-1.5 text-[12px] text-white"
                onClick={() => {
                  updateRule('search.enabled', true)
                  void saveRules()
                }}
              >
                打开（并保存）
              </button>
            )}
          </div>
          <button className="tap mt-2 text-[12px] text-brand-deep" onClick={() => push('rule-engine')}>
            去概率调节引擎 ›
          </button>
        </Card>

        {/* ── 音乐账号 ── */}
        <MusicAccountCard />

        {/* ── 搜索轨迹 ── */}
        <Card
          title="搜索轨迹"
          desc="真的去搜过就记一条（成功和失败都记）—— 失败的那几条就是用来回答「为什么没搜到」的"
        >
          {logs.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-ink-faint">
              还没搜过。上面点「现在推一条」立刻试一次（会真的用当前主题去搜）。
            </p>
          ) : (
            <>
              <ul className="space-y-1.5">
                {[...logs]
                  .reverse()
                  .slice(0, 8)
                  .map((l) => (
                    <li key={l.id} className="rounded-lg bg-page p-2 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={clsx(
                            'shrink-0 rounded px-1 py-0.5 text-[9.5px]',
                            l.ok ? 'bg-brand-soft text-brand-deep' : 'bg-[#fdecec] text-[#c0392b]',
                          )}
                        >
                          {l.ok ? '推了' : '没搜到'}
                        </span>
                        {l.ok && l.media && (
                          <span className="shrink-0 rounded bg-hairline/70 px-1 py-0.5 text-[9.5px] text-ink-sub">
                            {l.media === 'video' ? '视频卡' : l.media === 'image' ? '图片卡' : '链接卡'}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-ink-sub">「{l.topic}」</span>
                        <span className="shrink-0 text-ink-faint">{fromNow(l.at)}</span>
                        <button className="tap shrink-0 text-brand-deep" onClick={() => removeSearchLog(l.id)}>
                          删
                        </button>
                      </div>
                      <div className="mt-1 break-words text-ink-sub">
                        {l.ok ? l.title : searchReason(l.error ?? 'HTTP_ERROR', l.detail)}
                      </div>
                      {l.ok && l.note && <div className="mt-0.5 break-words text-ink-faint">{l.note}</div>}
                      {l.ok && l.url && (
                        <div className="mt-0.5 truncate text-ink-faint">
                          {l.siteName ? `${l.siteName} · ` : ''}
                          {l.url}
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
              <button className="tap mt-2 text-[12px] text-[#FA5151]" onClick={() => clearSearchLogs()}>
                清空轨迹
              </button>
            </>
          )}
        </Card>

        <p className="pb-4 text-center text-[11px] text-ink-faint">
          「测试发音」的每一句都会缓存，同一句话不会重复计费；搜索不缓存，每次都真去搜。
        </p>
          </>
        )}
      </div>
    </div>
  )
}

/** 失败原因的「人话」 */
function reason(error: string, detail?: string): string {
  if (error === 'BACKEND_UNREACHABLE') return '后端没在跑：先启动 npm run dev:api'
  if (error === 'MINIMAX_NOT_CONFIGURED') return '后端还没拿到 Key —— 填上并点「保存」'
  if (error === 'MINIMAX_NO_GROUP_ID') return '还缺 GroupId'
  if (error === 'TEXT_TOO_LONG') return '这句太长（一次最多 400 字）'
  return detail ? `${error}：${detail}` : error
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface p-3 shadow-card">
      <h2 className="text-[14px] text-ink">{title}</h2>
      {desc && <p className="mb-2 mt-0.5 text-[11px] text-ink-faint">{desc}</p>}
      {children}
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[12px] text-ink-sub">{label}</div>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-ink-faint">{hint}</p>}
    </div>
  )
}
