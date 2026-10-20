import { create } from 'zustand'
import type { Conversation, DoodlePayload, ExtendAction, GiftItem, Message, QuestionAnswerRow, QuestionItem, RedPacketPayload } from '@/types'
import { MOCK_CONVERSATION, MOCK_MESSAGES } from '@/mock/chat'
import { myPatLine } from '@/lib/pats'
import { appendMessage, markSent, recallMessage as repoRecall } from '@/lib/repo'
import { useAppStore } from '@/store/useAppStore'
import { useRulesStore } from '@/store/useRulesStore'

interface ChatState {
  conversation: Conversation | null
  messages: Message[]
  draft: string
  /** 输入法/语音切换 */
  inputMode: 'text' | 'voice'
  /** 「+」扩展面板 */
  extendOpen: boolean
  extendPanel: 'main' | ExtendAction
  /** 引用中的消息 */
  quoteOf?: Message
  /** 梦角是否在输入（WS 推送） */
  peerTyping: boolean

  setDraft: (v: string) => void
  setInputMode: (m: 'text' | 'voice') => void
  openExtend: (panel?: 'main' | ExtendAction) => void
  closeExtend: () => void
  setQuote: (m?: Message) => void
  setPeerTyping: (v: boolean) => void

  /** 发送：本地乐观追加 → 落 IndexedDB → 推后端（失败排队） */
  sendText: () => void
  pushMessage: (m: Message) => void
  /** 我拍他：suffix 是「我的拍一拍」库里的后缀 */
  sendPat: (suffix: string) => void
  /** 递东西给他：抉择（他会在规则时间内帮你选一个） */
  sendChoice: (question: string, options: string[]) => void
  /** 递东西给他：问卷（单选 / 多选，他逐题作答） */
  sendQuestion: (title: string, items: QuestionItem[]) => void
  /** 他从题库里挑一套来问我（消息发送者是他，答卷人是我） */
  askQuestionFromDream: (title: string, items: QuestionItem[]) => void
  /** 我答完他发来的问卷 */
  answerQuestionAsMe: (id: string, answers: QuestionAnswerRow[], note?: string) => void
  /** 递东西给他：红包（`isRandom` 时金额由规则里的区间抽） */
  sendRedPacket: (amount: number, isRandom: boolean, blessing: string) => void
  /** 递东西给他：礼物（从礼物柜里挑一件） */
  sendGift: (gift: GiftItem, note?: string) => void
  /** 递东西给他：音乐邀请（一起听这首歌） */
  sendMusicInvite: (song: { title: string; artist: string; cover?: string }) => void
  /** 递东西给他：涂鸦（存笔画，不存图片） */
  sendDoodle: (payload: DoodlePayload) => void
  /** 发一张本机图片（dataURL） */
  sendImage: (dataUrl: string) => void
  /**
   * 发一条语音（按住说话真的录）。
   * 录音存成 dataURL 塞在消息 payload 里 —— 换设备也放得出来。
   * `transcript` 留给以后接语音转文字，现在没有就存 '[语音]'。
   */
  sendVoice: (v: { url: string; durationMs: number; transcript?: string }) => void
  /** 拆开他发来的红包（我自己点开） */
  openRedPacket: (id: string) => void
  /** 局部更新一条消息（已读角标 / 引擎轨迹），本地 + 后端幂等 upsert */
  patchMessage: (id: string, patch: Partial<Message>) => void
  recall: (id: string) => void
  /** 清空本地聊天记录 */
  resetMessages: () => void
  /** 启动时注入本地聊天记录 */
  hydrate: (msgs: Message[]) => void
  /**
   * 把远端记录并进本地（而不是整包替换）。
   *
   * 同一个 id 以远端为准（撤回 / 已读角标在那边更权威）；
   * 本地独有的（还在 outbox 里、没推上去的）保留 —— 否则一联网就把刚发的话吞了。
   */
  mergeMessages: (msgs: Message[]) => void
  /** 是否已注入过本地记录（用于决定要不要去后端补拉） */
  hydrated: boolean
}

const now = () => new Date().toISOString()
/** 消息 id 必须跨刷新唯一：模块级计数器会在刷新后重置并撞 id（覆盖历史消息） */
const newId = () =>
  `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const useChatStore = create<ChatState>((set, get) => ({
  conversation: MOCK_CONVERSATION,
  messages: MOCK_MESSAGES,
  draft: '',
  inputMode: 'text',
  extendOpen: false,
  extendPanel: 'main',
  peerTyping: false,
  hydrated: false,

  setDraft: (v) => set({ draft: v }),
  setInputMode: (m) => set({ inputMode: m }),
  openExtend: (panel = 'main') => set({ extendOpen: true, extendPanel: panel }),
  closeExtend: () => set({ extendOpen: false, extendPanel: 'main' }),
  setQuote: (m) => set({ quoteOf: m }),
  setPeerTyping: (v) => set({ peerTyping: v }),

  sendText: () => {
    const { draft, conversation, quoteOf } = get()
    const text = draft.trim()
    if (!text || !conversation) return
    const msg: Message = {
      id: newId(),
      conversationId: conversation.id,
      senderId: conversation.me.id,
      kind: 'TEXT',
      status: 'SENDING',
      text,
      quoteOf: quoteOf ? { id: quoteOf.id, text: quoteOf.text, senderId: quoteOf.senderId } : undefined,
      createdAt: now(),
    }
    set((st) => ({ messages: [...st.messages, msg], draft: '', quoteOf: undefined }))

    // ① 本地持久化（离线也成功）② 推后端（失败进 outbox）③ 覆盖为 SENT
    void appendMessage(msg).then(async () => {
      set((st) => ({
        messages: st.messages.map((m) => (m.id === msg.id ? { ...m, status: 'SENT' } : m)),
      }))
      await markSent(msg)
    })
  },

  pushMessage: (m) => {
    set((st) => ({ messages: [...st.messages, m] }))
    void appendMessage(m)
  },

  sendPat: (suffix) => {
    const { conversation } = get()
    if (!conversation || !suffix.trim()) return
    const peerName = useAppStore.getState().dream.nickname
    const msg: Message = {
      id: newId(),
      conversationId: conversation.id,
      senderId: conversation.me.id,
      kind: 'PAT',
      status: 'SENT',
      text: myPatLine(peerName, suffix.trim()),
      payload: { pat: 'mine', suffix: suffix.trim() },
      createdAt: now(),
    }
    // 发完顺手收起「+」面板
    set((st) => ({ messages: [...st.messages, msg], extendOpen: false, extendPanel: 'main' }))
    void appendMessage(msg)
  },

  /** 抉择：一张卡问他「选哪个」，他会在 `rules.choice.delay` 内给出答案 */
  sendChoice: (question, options) => {
    const { conversation } = get()
    const q = question.trim()
    const opts = options.map((s) => s.trim()).filter(Boolean).slice(0, 6)
    if (!conversation || !q || opts.length < 2) return
    const msg: Message = {
      id: newId(),
      conversationId: conversation.id,
      senderId: conversation.me.id,
      kind: 'CHOICE',
      status: 'SENT',
      text: q,
      payload: {
        question: q,
        options: opts.map((label, i) => ({ id: `o_${i + 1}`, label })),
      },
      createdAt: now(),
    }
    set((st) => ({ messages: [...st.messages, msg], extendOpen: false, extendPanel: 'main' }))
    void appendMessage(msg)
  },

  /** 问卷：我出卷，他逐题作答（每题都可能留空） */
  sendQuestion: (title, items) => {
    const { conversation } = get()
    const t = title.trim() || '问卷'
    const clean = items
      .map((it, i) => ({
        ...it,
        id: it.id || `q_${i + 1}`,
        text: it.text.trim(),
        options: it.options.filter((o) => o.label.trim()),
      }))
      .filter((it) => it.text && it.options.length >= 2)
      .slice(0, 5)
    if (!conversation || !clean.length) return
    const msg: Message = {
      id: newId(),
      conversationId: conversation.id,
      senderId: conversation.me.id,
      kind: 'QUESTION',
      status: 'SENT',
      text: t,
      payload: { title: t, items: clean },
      createdAt: now(),
    }
    set((st) => ({ messages: [...st.messages, msg], extendOpen: false, extendPanel: 'main' }))
    void appendMessage(msg)
  },

  /** 他从题库里挑一套来问我 */
  askQuestionFromDream: (title, items) => {
    const { conversation } = get()
    const t = title.trim() || '想问你几个问题'
    const clean = items
      .map((it, i) => ({
        ...it,
        id: it.id || `hq_${i + 1}`,
        text: it.text.trim(),
        options: it.options.filter((o) => o.label.trim()),
      }))
      .filter((it) => it.text && it.options.length >= 2)
      .slice(0, 5)
    if (!conversation || !clean.length) return
    const dream = useAppStore.getState().dream
    const msg: Message = {
      id: newId(),
      conversationId: conversation.id,
      senderId: dream.id,
      kind: 'QUESTION',
      status: 'SENT',
      text: t,
      payload: { title: t, items: clean, askedBy: 'him' },
      createdAt: now(),
    }
    set((st) => ({ messages: [...st.messages, msg], extendOpen: false, extendPanel: 'main' }))
    void appendMessage(msg)
  },

  /** 我答完他发来的问卷 */
  answerQuestionAsMe: (id, answers, note) => {
    const msg = get().messages.find((m) => m.id === id)
    if (!msg) return
    const p = (msg.payload ?? {}) as unknown as Record<string, unknown>
    get().patchMessage(id, {
      payload: {
        ...p,
        answers,
        note: note?.trim() || undefined,
        submittedAt: now(),
      },
    })
  },


  sendRedPacket: (amount, isRandom, blessing) => {
    const { conversation } = get()
    if (!conversation) return
    const range = useRulesStore.getState().saved.redPacket.amount
    const raw = isRandom
      ? range[0] + Math.random() * Math.max(0, range[1] - range[0])
      : amount
    const amt = Number(raw.toFixed(2))
    if (!(amt > 0)) return

    const bless = blessing.trim() || '恭喜发财，大吉大利'
    const msg: Message = {
      id: newId(),
      conversationId: conversation.id,
      senderId: conversation.me.id,
      kind: 'RED_PACKET',
      status: 'SENT',
      text: bless,
      payload: { amount: amt, blessing: bless, isRandom },
      createdAt: now(),
    }
    set((st) => ({ messages: [...st.messages, msg], extendOpen: false, extendPanel: 'main' }))
    void appendMessage(msg)
  },

  /** 礼物：把礼物柜里的一件递给他（卡片文案可以临时改） */
  sendGift: (gift, note) => {
    const { conversation } = get()
    if (!conversation) return
    const msg: Message = {
      id: newId(),
      conversationId: conversation.id,
      senderId: conversation.me.id,
      kind: 'GIFT',
      status: 'SENT',
      text: gift.name,
      payload: {
        giftId: gift.id,
        name: gift.name,
        icon: gift.icon,
        price: gift.price,
        imageUrl: gift.imageUrl,
        note: note?.trim() || gift.note,
      },
      createdAt: now(),
    }
    set((st) => ({ messages: [...st.messages, msg], extendOpen: false, extendPanel: 'main' }))
    void appendMessage(msg)
  },

  /** 递东西给他：音乐邀请（一起听这首歌） */
  sendMusicInvite: (song) => {
    const { conversation } = get()
    if (!conversation) return
    const title = song.title.trim()
    if (!title) return
    const msg: Message = {
      id: newId(),
      conversationId: conversation.id,
      senderId: conversation.me.id,
      kind: 'MUSIC_INVITE',
      status: 'SENT',
      text: song.artist ? `${title} - ${song.artist}` : title,
      payload: { title, artist: song.artist.trim(), cover: song.cover, from: 'me' },
      createdAt: now(),
    }
    set((st) => ({ messages: [...st.messages, msg], extendOpen: false, extendPanel: 'main' }))
    void appendMessage(msg)
  },

  /** 递东西给他：涂鸦（POST 的是笔画，不是截图） */
  sendDoodle: (payload) => {    const { conversation } = get()
    if (!conversation || !payload.strokes.length) return
    const msg: Message = {
      id: newId(),
      conversationId: conversation.id,
      senderId: conversation.me.id,
      kind: 'DOODLE',
      status: 'SENT',
      text: '涂鸦',
      payload: { ...payload, from: 'me' },
      createdAt: now(),
    }
    set((st) => ({ messages: [...st.messages, msg], extendOpen: false, extendPanel: 'main' }))
    void appendMessage(msg)
  },

  /** 发一张本机图片（dataURL，存在消息 payload 里） */
  sendImage: (dataUrl) => {
    const { conversation } = get()
    if (!conversation || !dataUrl) return
    const msg: Message = {
      id: newId(),
      conversationId: conversation.id,
      senderId: conversation.me.id,
      kind: 'IMAGE',
      status: 'SENT',
      text: '[图片]',
      payload: { url: dataUrl, via: 'local' },
      createdAt: now(),
    }
    set((st) => ({ messages: [...st.messages, msg], extendOpen: false, extendPanel: 'main' }))
    void appendMessage(msg)
  },

  /** 按住说话：录下来的音频存成 dataURL 放进消息（本机录的，换设备也还放得出来） */
  sendVoice: ({ url, durationMs, transcript }) => {
    const { conversation } = get()
    if (!conversation || !url) return
    const msg: Message = {
      id: newId(),
      conversationId: conversation.id,
      senderId: conversation.me.id,
      kind: 'VOICE',
      status: 'SENT',
      text: transcript?.trim() || '[语音]',
      payload: { url, durationMs, via: 'local' },
      audioDurationMs: durationMs,
      createdAt: now(),
    }
    set((st) => ({ messages: [...st.messages, msg] }))
    void appendMessage(msg)
  },

  /** 拆开他发来的红包：金额进卡片（我点开才看得到） */
  openRedPacket: (id) => {
    const { messages, conversation, patchMessage } = get()
    const msg = messages.find((m) => m.id === id)
    if (!msg || !conversation) return
    const p = (msg.payload ?? {}) as unknown as RedPacketPayload
    if (p.claimed) return
    patchMessage(id, {
      payload: {
        ...msg.payload,
        claimed: { byId: conversation.me.id, amount: p.amount, at: now() },
      },
    })
  },

  patchMessage: (id, patch) => {
    const cur = get().messages.find((m) => m.id === id)
    if (!cur) return
    const next = { ...cur, ...patch }
    set((st) => ({ messages: st.messages.map((m) => (m.id === id ? next : m)) }))
    void appendMessage(next)
  },

  recall: (id) => {
    set((st) => ({
      messages: st.messages.map((m) =>
        m.id === id ? { ...m, status: 'RECALLED', recalled: true, text: undefined } : m,
      ),
    }))
    void repoRecall(id)
  },

  hydrate: (msgs) => set({ messages: msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), hydrated: true }),
  mergeMessages: (msgs) =>
    set((st) => {
      const map = new Map(st.messages.map((m) => [m.id, m]))
      msgs.forEach((m) => map.set(m.id, m))
      return {
        messages: [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        hydrated: true,
      }
    }),
  resetMessages: () => set({ messages: [], hydrated: true }),
}))
