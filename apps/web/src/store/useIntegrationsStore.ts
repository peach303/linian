import { create } from 'zustand'
import { API_ENABLED, PROXY_MODE } from '@/lib/deploy'
import { INTEGRATIONS } from '@/lib/integrations'
import {
  EMPTY_INTEGRATIONS,
  readIntegrations,
  saveIntegrations,
  type IntegrationsPatch,
  type IntegrationsStatus,
} from '@/lib/voice'

interface IntegrationsState {
  /** 后端读回来的接入状态（Key 只有尾号） */
  status: IntegrationsStatus
  /** 后端通不通（不通时配置页会提示「后端没在跑」） */
  reachable: boolean
  loaded: boolean
  saving: boolean
  /** 最近一次操作的结果说明（配置页显示） */
  note: string
  refresh: () => Promise<void>
  save: (patch: IntegrationsPatch) => Promise<boolean>
}

/**
 * 接入状态（MiniMax 语音 / 联网搜索）
 *
 * 只做三件事：读状态 → 写状态 → **把 `INTEGRATIONS` 同步给引擎**。
 * Key 的明文永远在服务端（本地完整版或免费代理），这里拿到的只有「配没配 + 尾号」。
 */
export const useIntegrationsStore = create<IntegrationsState>((set) => ({
  status: EMPTY_INTEGRATIONS,
  reachable: false,
  loaded: false,
  saving: false,
  note: '',

  refresh: async () => {
    if (!API_ENABLED) {
      INTEGRATIONS.tts = false
      INTEGRATIONS.search = false
      set({
        status: EMPTY_INTEGRATIONS,
        reachable: false,
        loaded: true,
        note: '纯静态模式：没有后端或代理，语音 / 搜索 / 同步不可用',
      })
      return
    }
    const s = await readIntegrations()
    // 后端不通时保留上一份状态，只把「够不够得着」标出来
    const status = s ?? EMPTY_INTEGRATIONS
    if (s) {
      INTEGRATIONS.tts = s.minimax.configured
      INTEGRATIONS.search = s.search.configured
    }
    set({
      status,
      reachable: Boolean(s),
      loaded: true,
      note: !s && PROXY_MODE ? '免费代理没连上（检查代理地址 / 部署状态）' : '',
    })
  },

  save: async (patch) => {
    if (!API_ENABLED) {
      set({
        saving: false,
        reachable: false,
        note: '纯静态模式不能配置接口；Key 也不会写进网页',
      })
      return false
    }
    set({ saving: true, note: '' })
    const next = await saveIntegrations(patch)
    if (!next) {
      set({
        saving: false,
        reachable: false,
        note: PROXY_MODE
          ? '保存失败：管理密码不对，或免费代理暂时连不上'
          : '后端没在跑（`npm run dev:api`）—— 配置存不上',
      })
      return false
    }
    INTEGRATIONS.tts = next.minimax.configured
    INTEGRATIONS.search = next.search.configured
    set({ status: next, saving: false, reachable: true, loaded: true, note: '已保存' })
    return true
  },
}))
