/**
 * 把信箱蓝色批注用的手写体「马善政」（Ma Shan Zheng）抓到本地
 *
 *   node apps/web/scripts/fetch-hand-font.mjs
 *
 * 为什么这么做：原来 index.html 里挂的是 fonts.googleapis.com 的 <link>，
 * 国内手机上这个域名经常慢/连不上 —— 字体加载不出来就退化成楷体，批注的字形会变。
 *
 * Google Fonts 的中文字体会按 unicode-range 切成很多片（这支是 92 片）：
 * 浏览器只下载页面上真用到的那几片，所以本地化之后比塞一整个 4MB 的 TTF 省流量，
 * 而且第一次之后就吃 HTTP 缓存了。
 *
 * 产出：
 *   apps/web/public/fonts/mashanzheng/*.woff2   （92 片，合计约 2~3MB，仓库里存着）
 *   apps/web/src/styles/hand-font.css           （自动生成，别手改）
 *
 * 字体授权：SIL Open Font License 1.1（可商用、可再分发），见同目录 OFL.txt。
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'fonts', 'mashanzheng')
const OUT_CSS = join(ROOT, 'src', 'styles', 'hand-font.css')
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap'
/** 必须装作 Chrome：否则 Google 会回 ttf 而不是 woff2 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const res = await fetch(CSS_URL, { headers: { 'User-Agent': UA } })
if (!res.ok) throw new Error(`取字体 CSS 失败：HTTP ${res.status}`)
const css = await res.text()

const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1])
if (!urls.length) throw new Error('CSS 里没找到字体文件地址（Google 可能换了返回格式）')

await mkdir(OUT_DIR, { recursive: true })

let total = 0
const renames = new Map()
for (let i = 0; i < urls.length; i++) {
  const name = `sub-${String(i + 1).padStart(2, '0')}.woff2`
  const r = await fetch(urls[i], { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`下载第 ${i + 1} 片失败：HTTP ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer())
  await writeFile(join(OUT_DIR, name), buf)
  total += buf.length
  renames.set(urls[i], `/fonts/mashanzheng/${name}`)
  process.stdout.write(`\r下载 ${i + 1}/${urls.length}  ${(total / 1024).toFixed(0)} KB`)
}
process.stdout.write('\n')

/* 把 CSS 里的外链换成本地路径，并加上「自动生成」的头 */
let out = css
for (const [from, to] of renames) out = out.split(from).join(to)

const header = `/* ⚠️ 这个文件是脚本生成的，别手改：node apps/web/scripts/fetch-hand-font.mjs
 *
 * 信箱里那条蓝色手写批注用的就是它：font-family: 'Ma Shan Zheng'（马善政毛笔楷书）。
 * 原来走 fonts.googleapis.com，国内手机加载不出来会退化成楷体 —— 现在整套字体在仓库里，
 * 按 unicode-range 切片加载（浏览器只下用到的那几片），断网也能显示。
 *
 * 授权：SIL Open Font License 1.1（见 public/fonts/mashanzheng/OFL.txt），可商用、可再分发。
 */
`
await writeFile(OUT_CSS, header + out)

/* 顺手把授权文件也存一份（拿不到就写个说明，不影响字体） */
try {
  const lic = await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/OFL.txt')
  if (lic.ok) await writeFile(join(OUT_DIR, 'OFL.txt'), await lic.text())
} catch {
  await writeFile(
    join(OUT_DIR, 'OFL.txt'),
    'Ma Shan Zheng (马善政) — SIL Open Font License 1.1\nhttps://github.com/google/fonts/tree/main/ofl/mashanzheng\n',
  )
}

console.log(`\n字体 ${urls.length} 片，合计 ${(total / 1024 / 1024).toFixed(2)} MB`)
console.log(`→ ${OUT_DIR}`)
console.log(`→ ${OUT_CSS}（${(await readFile(OUT_CSS, 'utf8')).length} 字符）`)
