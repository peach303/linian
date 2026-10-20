/** 主界面五大核心入口（无底部导航栏，全部在这里） */
import type { ScreenId } from '@/store/useAppStore'
import type { Appearance, IconValue } from '@/types/appearance'

export interface EntryDef {
  key: ScreenId
  label: string
  icon: string
  badge?: number
}

export const ENTRIES: EntryDef[] = [
  { key: 'chat', label: '聊天', icon: '💬' },
  { key: 'moments', label: '朋友圈', icon: '🌈' },
  { key: 'mailbox', label: '信箱', icon: '✉️' },
  { key: 'hub', label: '功能', icon: '🧩' },
  { key: 'settings', label: '设置', icon: '⚙️' },
]

/** 取某个入口当前生效的图标（自定义优先） */
export function resolveEntryIcon(appearance: Appearance, entry: EntryDef): IconValue {
  return appearance.entryIcons?.[entry.key] ?? { mode: 'emoji', value: entry.icon }
}
