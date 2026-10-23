/**
 * 引擎可用的「接入能力」开关（本机能不能真的调外部服务）
 *
 * 抽签（`planner.ts`）与排程（`runtime.ts` / `engine/*.ts`）都读这里：
 * 没接通的能力一律**只写进抽签轨迹、不伪造内容** —— 例如没配 MiniMax Key 就只写
 * `trace.skipped: voice: 未配置 MiniMax Key`，不会发一条假语音；
 * B 站视频推送不依赖 Key / 后端，读的是同源静态片单（`lib/search.ts`）。
 *
 * 真值由 `store/useIntegrationsStore.ts` 在启动时读 `GET /api/v1/integrations` 后写进来。
 */
export const INTEGRATIONS = { llm: false, tts: false, search: false }
