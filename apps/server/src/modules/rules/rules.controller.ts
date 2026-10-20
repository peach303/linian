import { Body, Controller, Get, Put } from '@nestjs/common'
import { RulesService } from './rules.service'

/** 概率调节引擎的读写接口（设置 → 深度拟真） */
@Controller('rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  get() {
    return this.rules.getActive('cp_1')
  }

  @Put()
  save(@Body() body: unknown) {
    return this.rules.save('cp_1', body)
  }
}
