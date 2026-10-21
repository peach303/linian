/** 美化配置：应用图标 / 主界面背景 / 相框 / 聊天背景 / 气泡 */
import type { ScreenId } from '@/store/useAppStore'

export type IconValue = { mode: 'emoji' | 'image'; value: string }

/** 背景：preset（预设渐变 key）/ color（纯色）/ image（图片，含本地 dataURL） */
export interface BackgroundValue {
  mode: 'preset' | 'color' | 'image'
  value: string
  /** 模糊 px */
  blur: number
  /** 遮罩浓度 0~1（图片过亮时压暗，让文字可读） */
  dim: number
}

export interface BubbleStyle {
  /** 我的气泡底色（hex） */
  me: string
  /** 对方气泡底色（hex） */
  peer: string
  /** 气泡内文字颜色（hex） */
  ink: string
  /** 圆角 rem */
  radius: number
  /** 是否显示小尾巴 */
  tail: boolean
  /** 自己导入的 CSS（聊天页生效；可以写 .ln-bubble / .ln-bubble-me / .ln-bubble-peer） */
  customCss?: string
}

export interface Appearance {
  /** 「黎念」应用图标（主界面顶部 / 相框旁） */
  appIcon: IconValue
  homeBackground: BackgroundValue
  /** 相框图片（空字符串 = 不显示） */
  frame: IconValue
  /** 主界面上方那句话（两颗心上面那段） */
  homeNote: string
  /** 主界面照片墙：三张可以叠着摆、拖着换位置 */
  photos: HomePhoto[]
  chatBackground: BackgroundValue
  /** 朋友圈顶部背景（本机上传的图 / 预设 / 纯色） */
  momentsBackground: BackgroundValue
  bubble: BubbleStyle
  /** 主界面五大入口的图标自定义 */
  entryIcons: Partial<Record<ScreenId, IconValue>>
}

/** 主界面照片墙的一张（位置是相对容器的百分比偏移，拖动后持久化） */
export interface HomePhoto {
  /** 空字符串 = 还没放照片（显示 ＋） */
  url: string
  /** 水平偏移（%，相对照片墙宽度） */
  x: number
  /** 垂直偏移（%） */
  y: number
  /** 旋转角度 */
  rot: number
  /** 层级：大的在上面 */
  z: number
}

export const DEFAULT_APPEARANCE: Appearance = {
  appIcon: { mode: 'image', value: 'icons/snow-192.png' },
  homeBackground: { mode: 'preset', value: 'linian-blue', blur: 0, dim: 0 },
  frame: { mode: 'emoji', value: '🖼️' },
  homeNote: '两颗缠绕的心，会走同一条路',
  photos: [
    { url: '', x: -22, y: 5, rot: -9, z: 1 },
    { url: '', x: 16, y: -5, rot: 7, z: 2 },
    { url: '', x: 0, y: 4, rot: -1, z: 3 },
  ],
  chatBackground: { mode: 'preset', value: 'plain', blur: 0, dim: 0 },
  momentsBackground: { mode: 'preset', value: 'linian-blue', blur: 0, dim: 0 },
  bubble: { me: '#a8d4ff', peer: '#ffffff', ink: '#1a2430', radius: 0.5, tail: true, customCss: '' },
  entryIcons: {},
}
