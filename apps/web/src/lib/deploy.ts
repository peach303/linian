/**
 * 部署形态
 *
 * `VITE_STATIC_ONLY=true` 时构建出来的是一份纯静态站：
 *   · 聊天 / 字卡 / 日记 / 朋友圈 / 信箱 / 陪伴… 这些本地引擎照常跑；
 *   · 不连 `/api`：语音合成、联网搜索推送、跨设备同步不会假装能用；
 *   · 不把任何 Key 写进网页 —— 静态站没有服务端，Key 放进来就等于公开。
 */
export const STATIC_ONLY = import.meta.env.VITE_STATIC_ONLY === 'true'
