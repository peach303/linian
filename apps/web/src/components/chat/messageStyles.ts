/** 微信式气泡：带一个小三角「尾巴」，自己/对方方向相反，颜色跟随美化设置 */
export const MESSAGE_BUBBLE = {
  mine: {
    tail: "ln-bubble-tail after:absolute after:right-[-5px] after:top-[11px] after:border-y-[5px] after:border-l-[6px] after:border-y-transparent after:border-l-[rgb(var(--ln-bubble-me))] after:content-['']",
  },
  peer: {
    tail: "ln-bubble-tail before:absolute before:left-[-5px] before:top-[11px] before:border-y-[5px] before:border-r-[6px] before:border-y-transparent before:border-r-[rgb(var(--ln-bubble-peer))] before:content-['']",
  },
} as const

/** 气泡容器：圆角可调 + 相对定位（尾巴需要） */
export const BUBBLE_BASE = 'relative rounded-[var(--ln-bubble-radius,0.5rem)]'
