/**
 * 阅读室的「书」：从哪儿来、怎么解析成段落。
 *
 * 三种来源，**只有前两种有正文**（所以只有它们算得清「读到第几段」）：
 *   · `local` 本机 txt / md / html / epub —— 在浏览器里解析成段落数组，存 IndexedDB 的 `book:<id>`
 *   · `paste` 直接把一段正文粘进来（同一套解析，段落少一点）
 *   · `title` 只有书名（他随口推的一本）—— **没有正文就没有进度**，不假装在读第几页
 *
 * epub 是 zip：这里自己读中央目录 + `DecompressionStream('deflate-raw')` 解压，
 * 不引第三方库；解析失败就**明说失败**，不会给你一本空书。
 */
import type { ReadBook } from '@/types'

/** 他推的书（只有书名 + 一句推荐 —— 想真读就把正文导进来） */
export const BOOK_PICKS: { title: string; author: string; note: string; cover: string }[] = [
  { title: '夜航西飞', author: '柏瑞尔·马卡姆', note: '她写非洲的风写得比谁都近，你读慢一点。', cover: '✈️' },
  { title: '人间草木', author: '汪曾祺', note: '短，适合睡前。看到写吃的那段记得叫我。', cover: '🌿' },
  { title: '小王子', author: '圣埃克苏佩里', note: '每十年读一次都有新东西，这次我陪你。', cover: '🌹' },
  { title: '月亮与六便士', author: '毛姆', note: '我知道你不喜欢他，但那段写星空的很值得。', cover: '🌙' },
  { title: '万物静默如谜', author: '辛波斯卡', note: '诗，一页一首，随时可以停。', cover: '🕊️' },
  { title: '温柔的路途', author: '许知远', note: '随手翻的那种书，适合我们一边聊一边看。', cover: '🧭' },
  { title: '刀锋', author: '毛姆', note: '拉里那段我一直记着，等你读到告诉我。', cover: '🔪' },
  { title: '人间失格', author: '太宰治', note: '这个有点沉，你要是难受就合上，我们不非得读完。', cover: '🌊' },
]

export const READ_KIND_LABEL: Record<ReadBook['source']['kind'], string> = {
  local: '本机书',
  paste: '粘进来的正文',
  title: '只有书名',
}

export const newBookId = () => `b_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`

/** 他推的一本（只有书名） */
export function bookFromPick(pick: (typeof BOOK_PICKS)[number], by: 'me' | 'him' = 'him'): ReadBook {
  return {
    id: newBookId(),
    title: pick.title,
    author: pick.author,
    cover: pick.cover,
    source: { kind: 'title' },
    addedBy: by,
    addedAt: new Date().toISOString(),
    note: pick.note,
  }
}

/** 这本书有没有正文（有正文才有真进度、才有页边批注） */
export const hasText = (book?: ReadBook | null): boolean =>
  Boolean(book && book.source.kind !== 'title' && book.source.blobKey && (book.paraCount ?? 0) > 0)

export const readCover = (book?: ReadBook | null): string => book?.cover || (book && hasText(book) ? '📖' : '📕')

export const humanChars = (n: number): string => (n >= 10_000 ? `${(n / 10_000).toFixed(1)} 万字` : `${n} 字`)

/* ───────────────────────── 正文 → 段落 ───────────────────────── */

/** 把一段纯文本切成段落（空行分段；太长的行按句子再切一刀，免得一段占整屏） */
export function splitParagraphs(text: string): string[] {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
  const blocks = clean
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  for (const b of blocks) {
    if (b.length <= 400) {
      out.push(b)
      continue
    }
    // 长段落按句号/问号/感叹号断句后打包，尽量不超过 400 字
    const sentences = b.match(/[^。！？!?；;\n]+[。！？!?；;]?/g) ?? [b]
    let buf = ''
    for (const s of sentences) {
      if ((buf + s).length > 400 && buf) {
        out.push(buf.trim())
        buf = ''
      }
      buf += s
    }
    if (buf.trim()) out.push(buf.trim())
  }
  return out
}

/** 去掉 html 标签，只留正文（`<p>` `<br>` `<div>` 当分段） */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/* ───────────────────────── epub（自己拆 zip，不引库） ───────────────────────── */

interface ZipEntry {
  name: string
  method: number
  size: number
  offset: number
}

/** 读中央目录（epub 是标准 zip，中央目录在文件末尾） */
function zipEntries(buf: ArrayBuffer): ZipEntry[] {
  const u8 = new Uint8Array(buf)
  const dv = new DataView(buf)
  // 从后往前找 EOCD（0x06054b50）
  let eocd = -1
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66_000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return []
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const out: ZipEntry[] = []
  for (let i = 0; i < count && p + 46 <= u8.length; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true)
    const compSize = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const offset = dv.getUint32(p + 42, true)
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen))
    out.push({ name, method, size: compSize, offset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

async function unzipEntry(buf: ArrayBuffer, e: ZipEntry): Promise<Uint8Array | null> {
  const u8 = new Uint8Array(buf)
  const dv = new DataView(buf)
  if (dv.getUint32(e.offset, true) !== 0x04034b50) return null
  const nameLen = dv.getUint16(e.offset + 26, true)
  const extraLen = dv.getUint16(e.offset + 28, true)
  const start = e.offset + 30 + nameLen + extraLen
  const raw = u8.subarray(start, start + e.size)
  if (e.method === 0) return raw
  if (e.method !== 8) return null // 别的压缩方式（很少见）就不硬撑
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream
  if (!DS) return null
  const stream = new Blob([raw]).stream().pipeThrough(new DS('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * 解析 epub → 段落
 *
 * container.xml → OPF → spine 顺序 → 每个 XHTML 去标签。顺着 spine 读，
 * 章节顺序才是书里的顺序（manifest 的顺序不是）。
 */
async function epubToParagraphs(buf: ArrayBuffer): Promise<string[]> {
  const entries = zipEntries(buf)
  if (!entries.length) throw new Error('这个 epub 解不开（不是标准 zip？）')
  const byName = new Map(entries.map((e) => [e.name, e]))
  const readText = async (name: string): Promise<string | null> => {
    const e = byName.get(name)
    if (!e) return null
    const bytes = await unzipEntry(buf, e)
    return bytes ? new TextDecoder().decode(bytes) : null
  }

  const container = await readText('META-INF/container.xml')
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1]
  if (!opfPath) throw new Error('这个 epub 里没找到目录（container.xml）')
  const opf = await readText(opfPath)
  if (!opf) throw new Error('这个 epub 的目录文件读不出来')
  const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  const manifest = new Map<string, string>()
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
    const id = m[0].match(/\bid="([^"]+)"/)?.[1]
    const href = m[0].match(/\bhref="([^"]+)"/)?.[1]
    if (id && href) manifest.set(id, href)
  }
  const spine: string[] = []
  for (const m of opf.matchAll(/<itemref\b[^>]*>/gi)) {
    const idref = m[0].match(/\bidref="([^"]+)"/)?.[1]
    const href = idref ? manifest.get(idref) : undefined
    if (href) spine.push(decodeURIComponent(href))
  }
  if (!spine.length) spine.push(...[...manifest.values()].filter((h) => /\.x?html?$/i.test(h)))

  const out: string[] = []
  for (const href of spine) {
    const name = href.startsWith('/') ? href.slice(1) : dir + href
    const html = (await readText(name)) ?? (await readText(href))
    if (!html) continue
    const text = htmlToText(html).trim()
    if (text) out.push(...splitParagraphs(text))
  }
  return out
}

/* ───────────────────────── 统一入口 ───────────────────────── */

export interface ParsedBook {
  title: string
  author?: string
  paragraphs: string[]
  charCount: number
}

/** 解析一个本机文件（txt / md / html / htm / epub） */
export async function parseBookFile(file: File): Promise<ParsedBook> {
  const name = file.name.replace(/\.[a-z0-9]{2,5}$/i, '')
  const isEpub = /\.epub$/i.test(file.name)
  const isHtml = /\.(html?|xhtml|md|markdown)$/i.test(file.name)

  let paragraphs: string[]
  if (isEpub) {
    paragraphs = await epubToParagraphs(await file.arrayBuffer())
  } else {
    const raw = await file.text()
    paragraphs = splitParagraphs(isHtml ? htmlToText(raw) : raw)
  }
  if (!paragraphs.length) throw new Error('这本书里没读出正文（空文件？或者是扫描版 pdf 转的？）')
  // txt 第一行常常是书名
  const first = paragraphs[0]
  const title = !isEpub && first && first.length <= 30 && paragraphs.length > 1 && /第|《|卷/.test(first) === false ? first : name
  const start = title === first && paragraphs.length > 1 ? 1 : 0
  const body = paragraphs.slice(start)
  return { title, paragraphs: body, charCount: body.join('').length }
}

/** 粘贴正文 → 一本书 */
export function parsePastedText(text: string, title: string): ParsedBook | null {
  const paragraphs = splitParagraphs(text)
  if (!paragraphs.length) return null
  return {
    title: title.trim() || '粘进来的一段',
    paragraphs,
    charCount: paragraphs.join('').length,
  }
}

/** 他写在页边的那句话在不在这一屏（读到第几段之前都不显示 —— 不在假进度上写字） */
export const reachedMark = (book: ReadBook | undefined, paraIndex: number, at: number): boolean =>
  Boolean(book && hasText(book) && paraIndex <= at)
