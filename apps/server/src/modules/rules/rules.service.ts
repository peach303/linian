import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { ruleConfigSchema, type RuleConfig } from '@linian/shared'

/**
 * 概率配置读写：version 化。改规则 = 新增一个 version 并置为 active，
 * 旧版本保留，可在「统计」页对比真实分布，随时回滚。
 */
@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  async getActive(coupleId: string): Promise<RuleConfig> {
    const row = await this.prisma.ruleConfig.findFirst({
      where: { coupleId, isActive: true },
      orderBy: { version: 'desc' },
    })
    return ruleConfigSchema.parse(row?.data ?? {})
  }

  async save(coupleId: string, patch: unknown, updatedBy?: string) {
    const merged = ruleConfigSchema.parse(patch) // zod 全量校验，防止漏项/越界
    const latest = await this.prisma.ruleConfig.findFirst({
      where: { coupleId },
      orderBy: { version: 'desc' },
    })
    const version = (latest?.version ?? 0) + 1

    await this.prisma.$transaction([
      this.prisma.ruleConfig.updateMany({ where: { coupleId }, data: { isActive: false } }),
      this.prisma.ruleConfig.create({
        data: { coupleId, version, data: merged as never, isActive: true, updatedBy },
      }),
    ])

    return { version, data: merged }
  }
}
