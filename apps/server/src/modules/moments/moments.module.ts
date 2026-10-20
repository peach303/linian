import { Module } from '@nestjs/common'

/**
 * 朋友圈：发动态（背景图 / 头像 / 分享音乐）、点赞、评论、回复我的回复、我点赞后他回赞。
 * 互动概率来自 rule_configs.moment，延时投递走 BullMQ。
 */
@Module({})
export class MomentsModule {}
