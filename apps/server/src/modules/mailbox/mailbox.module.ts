import { Module } from '@nestjs/common'

/**
 * 信箱：写信 / 回信 + 蓝色手写体批注（letter_annotations，锚定到段落或字符区间）。
 * 字数、标点随机、回信概率与延迟见 rule_configs.mail。
 */
@Module({})
export class MailboxModule {}
