/**
 * 构建纯静态站（给 GitHub Pages 用）
 *
 *   VITE_STATIC_ONLY=true  不连 /api，语音 / 搜索 / 跨设备同步不假装能用
 *   VITE_BASE_PATH         项目页默认挂在 /linian/ 下
 *
 * 用法：npm run build:web:static
 * 产物：apps/web/dist
 */
import { spawnSync } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const base = process.env.VITE_BASE_PATH || '/linian/'

const r = spawnSync(npm, ['run', 'build:web'], {
  stdio: 'inherit',
  // Windows 上 npm 是 .cmd，不加 shell 会 EINVAL
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    VITE_STATIC_ONLY: 'true',
    VITE_BASE_PATH: base,
  },
})

if (r.error) throw r.error
process.exit(r.status ?? 1)
