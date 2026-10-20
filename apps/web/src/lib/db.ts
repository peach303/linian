/**
 * 本地存储层（IndexedDB）
 *  - kv：设置 / 规则 / 美化 / 形象等小对象
 *  - messages：聊天记录（按会话 + 时间建索引，支持游标分页）
 *  - outbox：离线同步队列（写入先落本地，推后端失败就排队，联网后补发）
 *
 * 为什么不用 localStorage：聊天记录很快会超过 5MB 上限；IndexedDB 容量按磁盘走。
 */

const DB_NAME = 'linian'
const DB_VERSION = 1
const STORES = ['kv', 'messages', 'outbox'] as const
type StoreName = (typeof STORES)[number]

export const hasIDB = typeof indexedDB !== 'undefined'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
      if (!db.objectStoreNames.contains('messages')) {
        const s = db.createObjectStore('messages', { keyPath: 'id' })
        // 复合索引：取出某会话按时间排序的消息
        s.createIndex('byConv', ['conversationId', 'createdAt'])
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | null): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const s = t.objectStore(store)
        const req = fn(s)
        t.oncomplete = () => {
          db.close()
          resolve(req ? (req.result as T) : undefined)
        }
        t.onerror = () => {
          db.close()
          reject(t.error)
        }
        t.onabort = () => {
          db.close()
          reject(t.error)
        }
      }),
  )
}

/** localStorage 兜底（隐私模式下 IndexedDB 可能不可用） */
const LS_KEY = 'linian:fallback'
type LSShape = Record<string, unknown>
function lsRead(): LSShape {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as LSShape
  } catch {
    return {}
  }
}
function lsWrite(data: LSShape) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data))
  } catch {
    /* 忽略配额错误 */
  }
}

export const db = {
  /* ── kv ── */
  async get<T>(key: string): Promise<T | undefined> {
    if (!hasIDB) return lsRead()[key] as T | undefined
    return tx<T>('kv', 'readonly', (s) => s.get(key))
  },

  async set(key: string, value: unknown): Promise<void> {
    if (!hasIDB) {
      lsWrite({ ...lsRead(), [key]: value })
      return
    }
    await tx('kv', 'readwrite', (s) => s.put(value, key))
  },

  /* ── 音频文件（本机 Blob，不进 state JSON；换设备要重新导入） ── */
  async putBlob(key: string, blob: Blob): Promise<void> {
    if (!hasIDB) throw new Error('隐私模式下无法保存音频文件')
    await tx('kv', 'readwrite', (s) => s.put(blob, `audio:${key}`))
  },

  async getBlob(key: string): Promise<Blob | undefined> {
    if (!hasIDB) return undefined
    return tx<Blob>('kv', 'readonly', (s) => s.get(`audio:${key}`))
  },

  async deleteBlob(key: string): Promise<void> {
    if (!hasIDB) return
    await tx('kv', 'readwrite', (s) => s.delete(`audio:${key}`))
  },

  /** 按前缀清 kv（语音缓存 `tts:` 之类；只删自己的，不动别的东西） */
  async clearKeys(prefix: string): Promise<number> {
    if (!hasIDB) return 0
    const keys = (await tx<IDBValidKey[]>('kv', 'readonly', (s) => s.getAllKeys())) ?? []
    const doomed = keys.filter((k) => String(k).startsWith(prefix))
    for (const k of doomed) await tx('kv', 'readwrite', (s) => s.delete(k))
    return doomed.length
  },

  /* ── messages ── */
  async putMessage(m: { id: string; conversationId: string; createdAt: string }): Promise<void> {
    if (!hasIDB) {
      const all = (lsRead()['messages'] as typeof m[] | undefined) ?? []
      const next = [...all.filter((x) => x.id !== m.id), m]
      lsWrite({ ...lsRead(), messages: next.slice(-500) })
      return
    }
    await tx('messages', 'readwrite', (s) => s.put(m))
  },

  async listMessages<T>(conversationId: string, limit = 200): Promise<T[]> {
    if (!hasIDB) {
      const all = ((lsRead()['messages'] as T[] | undefined) ?? []).filter(
        (m) => (m as { conversationId: string }).conversationId === conversationId,
      )
      return all.slice(-limit)
    }
    const range = IDBKeyRange.bound([conversationId, ''], [conversationId, '\uffff'])
    const rows = await tx<T[]>('messages', 'readonly', (s) => s.index('byConv').getAll(range) as IDBRequest<T[]>)
    return (rows ?? []).slice(-limit)
  },

  async patchMessage(id: string, patch: Record<string, unknown>): Promise<void> {
    if (!hasIDB) {
      const all = (lsRead()['messages'] as Record<string, unknown>[] | undefined) ?? []
      lsWrite({ ...lsRead(), messages: all.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
      return
    }
    const cur = await tx<Record<string, unknown>>('messages', 'readonly', (s) => s.get(id))
    if (cur) await tx('messages', 'readwrite', (s) => s.put({ ...cur, ...patch }))
  },

  async clearMessages(): Promise<void> {
    if (!hasIDB) {
      lsWrite({ ...lsRead(), messages: [] })
      return
    }
    await tx('messages', 'readwrite', (s) => s.clear())
  },

  /* ── outbox（离线同步队列） ── */
  async enqueue(op: { method: string; url: string; body?: unknown }): Promise<void> {
    if (!hasIDB) return
    await tx('outbox', 'readwrite', (s) => s.add({ ...op, at: new Date().toISOString() }))
  },

  async listOutbox<T>(): Promise<(T & { id: number })[]> {
    if (!hasIDB) return []
    return (await tx<(T & { id: number })[]>('outbox', 'readonly', (s) => s.getAll() as IDBRequest<(T & { id: number })[]>)) ?? []
  },

  async removeOutbox(id: number): Promise<void> {
    if (!hasIDB) return
    await tx('outbox', 'readwrite', (s) => s.delete(id))
  },
}
