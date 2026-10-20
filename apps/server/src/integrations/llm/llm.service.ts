/**
 * LLM 适配层：字卡拼接 / 自由组句 / 拼音造句 / 歌词抽取 / 情绪分析。
 * 通过 prompt 模板把「人设 + 字卡池 + 上下文 + 情绪」交给模型，拿回一句人话。
 */
import { Injectable, Logger } from '@nestjs/common'

export interface ComposeInput {
  cards: string[]
  emotion?: string
  context: string
  punctuation: boolean
  conjunction: boolean
}

@Injectable()
export class LlmService {
  private readonly log = new Logger(LlmService.name)

  async composeSentence(input: ComposeInput): Promise<string> {
    // TODO: 调用 LLM。模板要点见 docs/rule-engine.md §抽签顺序 第 5 步
    this.log.debug(`compose cards=${input.cards.length} emotion=${input.emotion ?? '-'}`)
    return input.cards.join('') || '嗯…我在听。'
  }

  /** 拼音造句：把中文句子转成拼音串（可保留声调） */
  async toPinyin(sentence: string): Promise<string> {
    // TODO: pinyin-pro / LLM 均可；此处给出占位实现
    return sentence
  }

  /** 歌词抽取：从一段歌词里挑一句最贴合当下情绪的话 */
  async extractLyric(lyrics: string, emotion?: string): Promise<string> {
    void emotion
    return lyrics.split('\n').filter(Boolean)[0] ?? ''
  }

  /** 情绪分析：为消息打上 情绪/心意/意图 标签 */
  async analyzeEmotion(text: string): Promise<string[]> {
    void text
    return []
  }
}
