/**
 * MiniMax 语音适配层。
 * 设置页填写 API Key 后（integration_configs.provider = MINIMAX），
 * 聊天中按 rules.voice.p 概率把文字合成真实语音发送。
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

export interface TtsResult {
  url: string
  durationMs: number
}

@Injectable()
export class MinimaxService {
  private readonly log = new Logger(MinimaxService.name)
  private key: string | undefined
  private groupId: string | undefined
  private voiceId: string | undefined

  constructor(private readonly config: ConfigService) {
    this.key = config.get('MINIMAX_API_KEY')
    this.groupId = config.get('MINIMAX_GROUP_ID')
    this.voiceId = config.get('MINIMAX_VOICE_ID')
  }

  /** 允许按 couple 覆盖（设置页写入的 Key 优先） */
  configure(p: { apiKey: string; groupId?: string; voiceId?: string }) {
    this.key = p.apiKey
    this.groupId = p.groupId ?? this.groupId
    this.voiceId = p.voiceId ?? this.voiceId
  }

  get enabled() {
    return Boolean(this.key)
  }

  /**
   * 文字 → 语音。返回可播放 URL（已落对象存储）。
   * TODO: 按 MiniMax T2A v2 文档补全 endpoint / 模型参数：
   *   POST https://api.minimax.chat/v1/t2a_v2?GroupId=xxx
   */
  async synthesize(text: string, opts?: { pace?: number; emotion?: string }): Promise<TtsResult> {
    if (!this.key) throw new Error('MiniMax API Key 未配置')
    this.log.debug(`synthesize ${text.length} chars, voice=${this.voiceId}, pace=${opts?.pace ?? 1}`)
    throw new Error('TODO: 接入 MiniMax T2A 接口，并把音频上传到 S3 后返回 url')
  }
}
