/** 本地 id 生成：前缀 + 时间戳（36 进制）+ 随机尾，保证同毫秒内多条也不撞 */
export const nid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
