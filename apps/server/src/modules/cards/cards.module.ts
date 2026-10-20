import { Controller, Get, Module, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { PrismaService } from '../../common/prisma.service'

/**
 * 字卡库：系统预设（可开关 / 调占比 / 禁自由造句）+ 自定义（全类型）
 * 自动查重（hash + embedding 相似度）、自动分类、批量导入。
 */
@Controller('cards')
export class CardsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    // TODO: 支持 ?type=&category=&source= 过滤
    return this.prisma.card.findMany({ where: { deletedAt: null }, take: 100 })
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: { buffer: Buffer }) {
    void file
    // 1) 解析 CSV/JSON/TXT → 2) 清洗 → 3) hash 查重 → 4) 自动分类 → 5) 入库
    return { created: 0, duplicated: 0 }
  }
}

@Module({ controllers: [CardsController] })
export class CardsModule {}
