/**
 * 抓一份 B 站当下的热门片单，写成静态 JSON。
 *
 * 浏览器直连 B 站接口会被 CORS 挡，公共 CORS 代理也不稳定；
 * 所以改成「构建时抓、前端读同源文件」：
 *   · GitHub Actions 每次部署前跑一次，另外定时跑一次；
 *   · 前端只读 `public/feed/bilibili.json`，不经过任何代理，也不需要 Key；
 *   · 抓不到就保留上一次的片单（本地开发没有网络也不会把文件清空）。
 *
 * 用法：node scripts/fetch-bilibili-feed.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'apps/web/public/feed/bilibili.json')

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Referer: 'https://www.bilibili.com/',
  Accept: 'application/json, text/plain, */*',
}

const mmss = (sec) => {
  const n = Number(sec)
  if (!Number.isFinite(n) || n < 0) return ''
  const s = Math.floor(n)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const https = (url) => String(url || '').replace(/^http:\/\//i, 'https://')

const clean = (text) =>
  String(text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

async function getJson(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json()
    if (j?.code !== 0) throw new Error(`code ${j?.code}: ${j?.message || 'unknown'}`)
    return j
  } finally {
    clearTimeout(timer)
  }
}

function normalize(item) {
  const bvid = String(item?.bvid || '').trim()
  const title = clean(item?.title)
  if (!bvid || !title) return null
  return {
    bvid,
    title,
    url: `https://www.bilibili.com/video/${bvid}`,
    cover: https(item?.pic),
    duration: mmss(item?.duration),
    durationSec: Number(item?.duration) || 0,
    owner: clean(item?.owner?.name) || 'B站 UP主',
    tname: clean(item?.tname) || '',
    desc: clean(item?.desc).slice(0, 160),
    view: Number(item?.stat?.view) || 0,
    like: Number(item?.stat?.like) || 0,
    danmaku: Number(item?.stat?.danmaku) || 0,
    pubdate: item?.pubdate ? new Date(Number(item.pubdate) * 1000).toISOString() : '',
  }
}

async function main() {
  const items = []
  const seen = new Set()

  for (const pn of [1, 2]) {
    try {
      const j = await getJson(`https://api.bilibili.com/x/web-interface/popular?ps=50&pn=${pn}`)
      for (const raw of j?.data?.list ?? []) {
        const item = normalize(raw)
        if (!item || seen.has(item.bvid)) continue
        seen.add(item.bvid)
        items.push(item)
      }
    } catch (e) {
      console.warn(`[bilibili] popular pn=${pn} 失败：${e instanceof Error ? e.message : e}`)
    }
  }

  // 排行榜当补充（和热门去重），让片单多一点非娱乐内容
  for (const rid of [0, 188, 36, 211]) {
    try {
      const j = await getJson(`https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid}&type=all`)
      for (const raw of j?.data?.list ?? []) {
        const item = normalize(raw)
        if (!item || seen.has(item.bvid)) continue
        seen.add(item.bvid)
        items.push(item)
        if (items.length >= 100) break
      }
    } catch (e) {
      console.warn(`[bilibili] ranking rid=${rid} 失败：${e instanceof Error ? e.message : e}`)
    }
    if (items.length >= 100) break
  }

  if (!items.length) {
    let old = null
    try {
      old = JSON.parse(await readFile(OUT, 'utf8'))
    } catch {
      /* 没有旧文件 */
    }
    if (old?.items?.length) {
      console.warn('[bilibili] 这次一条都没抓到，保留旧片单')
      return
    }
    throw new Error('一条都没抓到，也没有旧片单可保留')
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'bilibili-popular+ranking',
    count: Math.min(items.length, 100),
    items: items.slice(0, 100),
  }
  await mkdir(path.dirname(OUT), { recursive: true })
  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`[bilibili] 写入 ${items.length} 条 → ${path.relative(ROOT, OUT)}`)
}

await main()
