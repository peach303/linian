import { Module } from '@nestjs/common'

/**
 * 主动行为调度：BullMQ + Redis。
 * - 按 proactive.interval 随机排一条未来任务，写入 proactive_jobs
 * - 到点若对方在这段时间回过话（cancelIfRepliedWithin）则取消
 * - 命中则产出一条 proactive=true 的消息（UI 左上角小爱心）
 * - 主动发朋友圈 / 写信 单独队列 + 冷却（cooldownMin）
 */
@Module({})
export class ProactiveModule {}
