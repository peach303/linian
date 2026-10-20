/**
 * 打一个「可以传到 GitHub 的干净副本」
 *
 *   node scripts/make-public-copy.mjs             → 复制到 ../linian-public
 *   node scripts/make-public-copy.mjs D:\上传包    → 复制到指定目录
 *
 * 它会跳过：
 *   · `node_modules/`、`dist/`、`.git/`（依赖 / 构建产物，别人 clone 后自己装）
 *   · `.data/`（**你的聊天记录、字卡，以及 MiniMax / 博查 的 API Key 明文都在这里**）
 *   · `.env`（本地环境变量；只保留 `.env.example`）
 *   · 各种临时测试页 / 日志
 *
 * 复制完会再扫一遍目标目录：只要发现像密钥的串（`sk-` 开头）或漏掉的 `.data`，直接报错退出。
 *
 * 为什么要这个脚本：GitHub 网页版「拖文件夹上传」不会读 `.gitignore`，`git add -A` 也不会提示，
 * 手滑一次 Key 就进了 commit 历史（删掉也还留在历史里）。所以「复制一份干净的」最稳。
 */
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = resolve(process.argv[2] ?? join(ROOT, '..', 'linian-public'))

/** 永远不进副本的目录名（任意层级） */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.data', '.vite', '.turbo', 'coverage'])
/** 工作区里另外放的一份 GitHub 仓库副本：不能把整份仓库再套进上传包里 */
const SKIP_TOP_DIRS = new Set(['linian'])
/** 永远不进副本的文件名 */
const SKIP_FILES = new Set(['.env', '.env.local', '.env.production', 'tsconfig.tsbuildinfo'])
/** 测试期间用过的临时文件（`_` 开头 / 扫描脚本） */
const SKIP_PREFIX = ['_', 'scan-', 'repair-']

if (TARGET === ROOT) {
  console.error('目标目录不能是仓库自己。')
  process.exit(1)
}

console.log(`源：${ROOT}\n→  ${TARGET}\n`)
if (existsSync(TARGET)) {
  console.log('目标已存在，先删掉重建。')
  rmSync(TARGET, { recursive: true, force: true })
}

let skipped = 0
cpSync(ROOT, TARGET, {
  recursive: true,
  filter: (src) => {
    const rel = relative(ROOT, src)
    if (!rel) return true
    const parts = rel.split(/[\\/]/)
    if (parts.length > 0 && SKIP_TOP_DIRS.has(parts[0])) {
      skipped++
      return false
    }
    if (parts.some((part) => SKIP_DIRS.has(part))) {
      skipped++
      return false
    }
    const name = basename(src)
    if (SKIP_FILES.has(name) || SKIP_PREFIX.some((p) => name.startsWith(p))) {
      skipped++
      return false
    }
    return true
  },
})

const countFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).reduce(
    (n, e) => n + (e.isDirectory() ? countFiles(join(dir, e.name)) : 1),
    0,
  )

/* ── 复查：副本里绝对不能出现密钥 / 隐私数据 ── */
const SECRET = /sk-[A-Za-z0-9_-]{10,}/g
const problems = []
const scan = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '.data') problems.push(`漏了数据目录：${relative(TARGET, p)}`)
      scan(p)
      continue
    }
    if (!/\.(ts|tsx|js|mjs|cjs|json|md|css|html|yml|yaml|prisma|example)$/i.test(e.name)) continue
    const hits = readFileSync(p, 'utf8').match(SECRET)
    if (hits) problems.push(`发现疑似密钥：${relative(TARGET, p)}（${hits.length} 处）`)
  }
}
scan(TARGET)

console.log(`文件 ${countFiles(TARGET)} 个，跳过 ${skipped} 个目录/文件。`)
if (problems.length) {
  console.error('\n✗ 副本不干净，别上传：')
  for (const p of problems) console.error('  · ' + p)
  process.exit(1)
}
console.log('\n✓ 副本干净（无 .data、无 .env、无 sk- 开头的密钥），可以直接传到 GitHub。')
console.log(`  下一步：把 ${basename(TARGET)} 里的内容拖进仓库；别人拿到后要在「设置 → 接入」里填自己的 Key。`)
