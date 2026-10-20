import { Module } from '@nestjs/common'
import { LlmService } from './llm/llm.service'
import { MinimaxService } from './minimax/minimax.service'
import { SearchService } from './search/search.service'

/**
 * 第三方能力总装：LLM / MiniMax 语音 / 联网搜索 / 对象存储。
 * 设置页写入的 Key 落到 integration_configs，运行时通过 configure() 注入。
 */
@Module({
  providers: [LlmService, MinimaxService, SearchService],
  exports: [LlmService, MinimaxService, SearchService],
})
export class IntegrationsModule {}
