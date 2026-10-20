/**
 * 部署形态
 *
 * `VITE_STATIC_ONLY=true` 时构建出来的是一份纯静态站：
 *   · 聊天 / 字卡 / 日记 / 朋友圈 / 信箱 / 陪伴… 这些本地引擎照常跑；
 *   · 不连 `/api` 做跨设备同步，数据只在本机 IndexedDB；
 *   · 不把任何 Key 写进网页。
 *
 * 如果同时给了 `VITE_API_BASE`（例如 `https://linian-proxy.peach303.deno.net/api/v1`），
 * 静态站仍然只把聊天存在本机，但语音合成 / 联网搜索 / 图片代理会走这个小代理。
 * 代理只转发请求，密钥保存在代理的环境变量或 KV 里，网页里没有 Key。
 */
export const STATIC_ONLY = import.meta.env.VITE_STATIC_ONLY === 'true'

/** 空 = 同源 `/api/v1`；静态代理模式下是代理的完整地址 */
export const API_BASE = String(import.meta.env.VITE_API_BASE || '/api/v1').replace(/\/+$/, '')

/** 是否有可用的 API（本地完整版，或静态站 + 免费代理） */
export const API_ENABLED = !STATIC_ONLY || Boolean(import.meta.env.VITE_API_BASE)

/** 静态站 + 代理：数据仍然只在本机，语音 / 搜索走代理 */
export const PROXY_MODE = STATIC_ONLY && API_ENABLED
