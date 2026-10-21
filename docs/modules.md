# 功能模块清单（18 项 + 引擎）

| # | 模块 | 状态 | 关键表 | 概率来源（rule_configs） | 前端入口 |
| --- | --- | --- | --- | --- | --- |
| 1 | 聊天（字卡传讯） | 完成（引擎出稿 · 已读角标 · 拍一拍库） | `messages` `cards` `read_cursors` | `chat.*` | `screens/chat/ChatScreen.tsx` |
| 2 | 语音通话（模拟） | 完成（响铃→接通/忙线/拒绝/无人接听 · 真计时 · 留下通话记录） | `call_records`（本地存 `CALL_EVENT` 消息 payload） | `call.*` | `ExtendPanel → CALL` · `components/chat/CallOverlay.tsx` · `lib/engine/call.ts` |
| 3 | 抉择（帮选） | 完成（他选一个 + 理由 + 引用你的卡） | `choices` | `choice.*` | `ExtendPanel → CHOICE` · `lib/engine/timeline.ts#answerMyChoice` |
| 4 | 问卷（单选/多选/定时） | 完成（聊天「+」里的问卷 = **我出卷问他**：逐题作答 · 可留空 · 可写备注；功能 → 问卷：题库可自建/导入，他按概率挑一套来问我；另有默契问卷与默契度总结） | `questions` `question_answers` `state.questionPacks` `state.quizSessions` | `question.*` | `ExtendPanel → QUESTION` · `timeline#answerMyQuestion` · `screens/hub/SurveyScreen.tsx` · `components/chat/HisQuestionCard.tsx` |
| 5 | 红包（双向/随机金额/默认话术） | 完成（他领取 / 回一个 · 他发的要你点开） | `red_packets`（本地存消息 payload） | `redPacket.*` | `ExtendPanel → RED_PACKET` · `timeline#hisRedPacketResponse` |
| 6 | 音乐邀请（一起听/推歌词） | 完成（他加入 · 说一句 · 可能回推一首） | `music_sessions`（聊天里的 `MUSIC_INVITE` 卡） | `music.*` | `ExtendPanel → MUSIC` · `lib/music.ts` |
| 7 | 礼物柜（自定义图片/定价/卡片） | 完成（柜子 CRUD + 他收下/回送 · 送出记录=聊天里的卡） | `gifts` `gift_orders`（本地 `state.gifts`） | `gift.*` | `ExtendPanel → GIFT` · `screens/hub/GiftCabinetScreen.tsx` |
| 8 | 涂鸦（双向画笔） | 完成（手画 + 他回话 + 他画一张回你；`doodle.proactive` 支持**他主动画给你**，不等你先画；存笔画 JSON） | `doodles` | `doodle.*` | `ExtendPanel → DOODLE` · `lib/doodles.ts` · `lib/engine/timeline.ts#hisDoodleOpportunity` |
| 9 | 联网搜索推送（博查） | 完成（真搜 · 搜到才推 · 搜不到只记轨迹 · 链接/图片/视频三种卡） | `search_pushes`（本地存 `state.searchPush.logs`） | `search.*` | `screens/settings/IntegrationScreen.tsx`（接入 + 搜索轨迹）· `lib/engine/search.ts` · `apps/server/media.mjs` · `MessageBubble(SEARCH_PUSH)` |
| 10 | MiniMax 真实语音 | 完成（设置 → 接入 填 Key · 后端代理合成 · 语音气泡可回放 · 失败退回文字 · **收藏 → 语音字卡复用**） | `messages.payload.url`（存 dataURL）· `cards.voice`（字卡自带音频） | `voice.*` | `MessageBubble(VOICE)` · `components/chat/VoiceBubble.tsx` · `lib/voice.ts` · `lib/voiceFav.ts` · `screens/settings/IntegrationScreen.tsx` |
| 11 | 朋友圈（背景图/点赞/评论/分享音乐） | 完成（他主动发 · 点赞评论互动） | `state.moments`（对应 `moments` `moment_likes` `moment_comments`） | `moment.*` `proactive.moment` | `screens/moments` |
| 12 | 信箱（蓝色手写批注） | 完成（他主动来信 · 回信 · 蓝笔批注） | `state.letters`（对应 `letters` `letter_annotations`） | `mail.*` `proactive.letter` | `screens/mailbox` |
| 13 | 音乐（黑胶 / 一起听了多久） | 完成（`music-room`：**真播放器**（本机文件 / 直链 / 网易云官方外链）+ 真的播出来的秒数 + 房间对话；Hub 的数字也从这里来） | `state.musicRoom`（歌单 / 一起听秒数 / 房间对话；音频 Blob 只在 IndexedDB） | `music.*` | `screens/hub/MusicRoomScreen.tsx` · `lib/audio.ts` · `lib/engine/room.ts` · `hub/HubScreen` |
| 14 | 陪伴（睡觉/学习/工作 + 自定义背景） | 完成（**真计时**（真实秒数，到点封顶）· 他一叫就来 / 先忙一会儿再来 / 中途说话 / 会先走 · 房间内对话 · 结束时聊天里留一条记录 · 每模式一张背景 · 今天/连续/合计都是现算） | `state.companion`（`companion_sessions`） | `companion.*` | `screens/hub/CompanionScreen.tsx` · `lib/engine/companion.ts` · `lib/companion.ts` |
| 15 | 世界感知（时间差/状态） | 完成（**他那边的钟点真换算**（时差是你设的设定）· 他的状态与「正在做的事」按时段分池抽（**种子 = 日期 + 采样槽** → 同一段时间同一个答案）· 采样台账最多 40 条 · `toChat` 每天最多在聊天里说一句 · **天气没接源就一个字都不编**） | `world_sense_logs`（本地放 `state.world`） | `world.*` | `screens/hub/WorldScreen.tsx` · `lib/world.ts` · `lib/engine/world.ts` · `lib/time.describeTimeOffset` |
| 16 | 日记 / 纪念日 | 都完成（日记：**我的不限条数，同一天想写几条都行**；他自动写的每天最多一条；他写不写 / 几点写 / 提不提今天真事全是抽签，**种子 = 日期**；提到的每件事都从今天的聊天与记录里真数出来；我的每一条可选**公开 / 私密**，每条私密首次保存各掷一次 30% 被他破解，之后不重掷，30% 写死不进概率页） | `diary_entries`（本地放 `state.diary`）`anniversaries` | `diary.*` | `screens/hub/DiaryScreen.tsx` · `lib/diary.ts` · `lib/engine/diary.ts` · `HomeScreen` |
| 17 | 统计 / 适应度 | 完成（**数字全部现算**：统计页看聊天 / 通话 / 红包 / 一起听 / 陪伴；适应度页看「他抽过我哪些卡」+ 配置 vs 实际 ≫ `lib/stats.ts`） | `word_stats` `fitness_scores`（本地不落表，全从消息现算） | —（读 `messages` 与 `messages.plan`，没有自己的概率项） | `screens/hub/StatsScreen.tsx` · `screens/hub/FitnessScreen.tsx` · `lib/stats.ts` |
| ★ | 收藏（我收藏的 / 他收藏我的） | 完成（快照模型；聊天 / 字卡 / 推送 / 语音 / 信件 / 朋友圈分类；长按消息 / 语音 / 信件 / 朋友圈都能收；他按 `favorite.collect` 自动收藏我的内容并写原因，原因池可增删；语音还能变成语音字卡复用） | `state.favorites` `state.favoriteReasons` `state.voices` `cards.voice` | `favorite.*` | `screens/hub/VoiceFavoritesScreen.tsx` · `lib/favorites.ts` · `lib/voiceFav.ts` · `MessageActionSheet` · `lib/engine/timeline.ts#hisFavoriteOpportunity` |
| 18 | 查岗 / 观影室 / 阅读室 / 拾取 / 情绪意图 | **全部完成**（查岗：我发起 → 他 3~12 秒回（种子 = 请求 id，存 `respondAt`）；**报告分「真的 / 抽的」两栏**；冷却现算；他每天最多来查你 `checkPhone.dailyLimit` 次（1~5，默认 1，上限 5，不是固定一天一条）；`EXPIRED` 保留但本机版不产生） | `check_requests` `watch_rooms` `read_rooms` `pickup_logs` `emotion_tags` 本地放 `state.checkPhone` / `state.watchRoom` / `state.readRoom` | `checkPhone.*` `emotion.*` `watchRoom.*` `readRoom.*` | `screens/hub/CheckScreen.tsx` · `lib/check.ts` · `lib/engine/check.ts` · `screens/hub/WatchRoomScreen.tsx` · `screens/hub/ReadRoomScreen.tsx` · `lib/watch.ts` · `lib/videoEl.ts` · `lib/read.ts` · `lib/engine/watch.ts` · `lib/engine/read.ts` |
| ★ | 概率调节引擎 | 引擎完成 | `rule_configs` | 全部 | `Settings → 概率调节引擎` |
| ★ | 拟真引擎（本机出稿） | 完成 | `messages.plan` | `chat.*` `voice.*` `search.*` `emotion.*` | `lib/engine/*` · 长按消息 →「看抽签」 |
| ★ | 已读 / 已读不回角标 | 完成 | `messages.status` `messages.plan` | `chat.readNoReply` | `MessageBubble`（我这条下方） |
| ★ | 拍一拍库（我的 / 他的） | 完成 | `state.pats` | `chat.pat` | `lib/pats.ts` · 聊天「+」→ 拍一拍 / 点头像 |
| ★ | 字卡库（预设/自定义/拾取 + 导入查重） | 完成 | `cards` `card_decks` | `chat.weights` × `cards.weight` | `Settings → 字卡库` |
| ★ | 主动行为调度 | 完成 | `messages.proactive`（对应 `proactive_jobs`） | `proactive.message` | `lib/engine/proactive.ts` · 气泡左上角 ❤️ |
| ★ | 朋友圈 / 信箱时间轴 | 完成 | `state.moments` `state.letters` | `moment.*` `mail.*` `proactive.moment` `proactive.letter` | `lib/engine/timeline.ts` · `lib/engine/content.ts` |
| ★ | 本地记录 + 后端同步 | 完成 | IndexedDB（kv/messages/outbox） | — | `lib/db.ts` `lib/repo.ts` `store/bootstrap.ts` |
| ★ | 美化（图标/背景/相框/气泡） | 完成（气泡支持导入 CSS，注入独立 `<style>`；选择器 `.ln-bubble` / `.ln-bubble-me` / `.ln-bubble-peer`，清空即移除） | `state.appearance` | — | `Settings → 美化` · `lib/appearance.ts` |

## 待办优先级建议

1. ~~接通后端 + 聊天记录本地保存~~ ✅ **已完成**：
   - 本地优先数据层：`lib/db.ts`（IndexedDB 三区：`kv` / `messages` / `outbox`）+ `lib/repo.ts`（写入先落本地，推后端失败进 outbox，联网自动补发）。
   - 启动引导 `store/bootstrap.ts`：只读本地 → 渲染 → 后台 `GET /state` `/rules` `/messages` 覆盖 → `flush()` 补发。
   - 聊天：`useChatStore.sendText` → 本地落库 → `POST /api/v1/conversations/:id/messages`（幂等 upsert）→ 覆盖 `SENT`。
   - 零依赖开发后端 `apps/server/dev-server.mjs`（`npm run dev:api`，数据落 `apps/server/.data/db.json`），与 NestJS 同一套 REST 契约。
   - ~~剩余：把 `ChatScreen` 里的演示回复换成真监听 WS `message:new`（由 `engine/reply-engine` 产出）。~~ → 已改为**本机引擎出稿**，见第 5 条。
2. ~~概率调节引擎 UI~~ ✅ **已完成**：`screens/settings/RuleEngineScreen.tsx`
   元数据驱动（`lib/rules.ts` 的 `RULE_GROUPS`）→ 自动渲染滑块/开关/区间/标签；
   顶部字卡占比可视化 + 「模拟一次回复」抽签链路预览（`lib/simulate.ts`）；
   底部保存条带差异计数，保存即新增一个 version（对应后端 `RulesService.save`）。
   `GET/PUT /api/v1/rules` 已接（`store/useRulesStore.ts` → `lib/repo.ts`），保存后草稿清空、版本 +1。
3. ~~美化（设置 → 美化）~~ ✅ **已完成**：`screens/settings/AppearanceScreen.tsx`
   应用图标 / 主界面背景（预设·纯色·图片 + 模糊 + 压暗）/ 相框图片 / 聊天背景 / 气泡样式（配色·圆角·尾巴）
   / 五大入口图标；改动即时写入 CSS 变量并持久化（图片以 dataURL 存本机）。
   注意职责边界：`applyTheme` 只写主题色，**气泡色归美化管**，主题里搭配的气泡色由 `setTheme` 转发给 `setBubble`。
4. ~~字卡库 UI~~ ✅ **已完成**：`screens/cards/CardLibraryScreen.tsx`（设置 → 字卡库，`#card-library`）
   - 三层概率可视化：类型占比（概率引擎 `chat.weights`）× 卡内权重 = **综合命中率**，每张卡都标「命中 / 池内」；
     emoji 与文字共用「文字」占比池（`lib/cards.ts` 的 `POOL_OF`）。
   - 四种来源 Tab（全部 / 系统预设 49 张 / 自定义 / 拾取）+ 搜索 + 类型筛选 + 数量角标。
   - 预设卡：可开关、调权重、改分类、开关「禁自由造句」；文字锁定，另有「恢复系统预设」（不动自定义与拾取）。
   - 自定义 / 拾取：全类型 CRUD（文字 / 颜文字 / emoji / 表情包 / 图片），图片卡本地上传存 dataURL。
   - 批量导入 `components/cards/ImportSheet.tsx`：一行一张卡（支持 `1.` `-` `"…"` 前缀，`#` 注释），
     导入前查重预览——指纹相同判「重复」、Dice 二元组相似度 ≥ 0.85 判「疑似」（阈值可调），逐条勾选 / 一键「仅新增」；
     同批内部也会互相查重（标「疑似与本批…重复」）。
   - 管理态多选批量启用 / 停用 / 删除；「试发到聊天」把卡直接发进微信式聊天（复用 `MessageBubble` 的 CARD 分发）。
   - 持久化：`store/useCardsStore.ts` 本地优先 + 防抖整包 `PUT /api/v1/cards`；首次启动 `seedIfEmpty()` 把预设卡落库（id 稳定）。
5. ~~拟真引擎出稿~~ ✅ **已完成**：`lib/engine/{planner,compose,runtime}.ts`
   - 落地位置：**浏览器本地**（和字卡库/规则/聊天记录同一个 local-first 世界，断网也能出稿）；
     抽签顺序与服务端 `apps/server/src/engine/reply-engine.ts` 完全一致，产出结构对齐（后续可整体抽到 `packages/shared` 一份实现两处用）。
   - `planner.ts`：`planReply({rules, cards, myMessage})` → 已读不回 / 拍一拍 / 载体抽签 / 多字卡拼接 / 自由组句 /
     撤回（+补发换一张卡）/ 引用 / 句数 / 拟真延迟 / 拼音 / 语音旁路 / 情绪标签 / 拾取，共 20+ 抽签点，
     每步写入 `trace.steps`（对应 DB 的 `messages.plan JSONB`）。**联网搜索推送不在这一链上**（它有独立的排程，见模块 9）。
   - `compose.ts`：无 LLM 时的自由组句兜底（连词 / 标点开关 / 以我上一句语气挑模板）；
     拼音优先取字卡库里的「全 ASCII 拼音卡」，否则用内置常用字表转写，**覆盖率 < 80% 直接跳过**；
     情绪/意图用关键词打标（心动 / 心疼 / 温柔 / 认真听…）。
   - `runtime.ts`：`attachReplyEngine()` 启动时订阅聊天仓库，**任何一条「我发的消息」**（文字 / 字卡 / 红包…）都会触发一轮；
     按 `replyInterval` 定时上屏、提前 0.9s 显示「正在输入」、命中撤回则 2~6s 后回收并补发；
     我连发消息时取消旧排程、只回最新那句；回复同样先落 IndexedDB 再推后端。
   - 复盘 UI：`components/chat/MessageActionSheet.tsx` —— 长按消息 → 引用 / 复制 / **⭐ 收藏这段语音** / 撤回 / **看抽签**（13+ 步轨迹 + 跳过原因 + 载体 + 用卡 + 延迟 + 规则版本）。
   - 不伪造：MiniMax 语音没配 Key 时只记录命中、写进 `trace.skipped`，不发假语音；联网搜索更硬 —— **搜不到就一条消息都不发**，只在轨迹里记一条失败（见模块 9）。
    - MiniMax 语音（已接通）：`planner` 命中第 9 步时只把某一条**标记**成语音（避开拼音串与超长句），
      真正合成在 `runtime.startVoices()` 里提前并行跑（藏在拟真延迟里）；音频好了发 `VOICE` 气泡（`payload.url` = dataURL、
      `audioDurationMs`、`via: 'MiniMax'`），**没合成出来就退回文字**并把原因写进轨迹。
      Key 只留在后端（`GET /api/v1/integrations` 只回尾号），合成走 `POST /api/v1/voice/tts`；同一句话按「文本+音色+模型+语速+情绪」缓存。
      入口：设置 → 接口与扩展 → **接入**（`#integration`，含「测试发音」）。
    - **语音卡（收藏 → 变成语音字卡）**：长按他的语音 → ⭐ 收藏（`state.voices`，音频是 dataURL，随 `state` 同步）。
      「功能 → 收藏 ⭐」（`screens/hub/VoiceFavoritesScreen.tsx`）里能试听 / 改名 / 删除 / **变成语音字卡**：
      字卡库已有同句的文字卡就直接给它配上语音，没有就新建一张（`category: '语音'`、`tags: ['语音']`、**自动 `noFreeSentence`**，文字 = 这段语音说的话）。
      `planner` 抽到这张卡时比对「这一轮的原话」与 `cards.voice.text`（`bareSentence` 忽略标点），一致就把这段现成音频挂上 →
      `runtime` **直接用，不调 MiniMax、不花钱**（`payload.via = '语音卡'`、轨迹里写「本轮用的是字卡自带的那段音频」）；
      对不上就照常当普通文字卡。所以**与 `voice.enabled` 总开关无关**，也不占 `voice.p` 的掷签。
      解绑 = 清掉卡的 `voice`（卡保留）；删除收藏 = 一并清掉所绑卡的 `voice`。
   - 拾取闭环：命中时真往他的字卡库塞一张 `source: PICKED` 的卡（同内容去重），字卡库「拾取」Tab 会实时长出来。
   - 已读角标：他「点开看了」之前先按 `replyInterval` 推一个已读时刻（`clamp(replyInterval[0]×0.4, 0.8s, 3s)`），
     把我的消息 `status` 置 `READ` 并把这轮轨迹挂到我这条上 → 气泡下方出现 **`✓✓ 已读`**；命中第 1 步已读不回则显示 **`已读不回`**。
     （微信本身没有已读回执；这里是专门给梦角加的可视化，长按我自己的消息也能看「他怎么看这条」。）
   - 拍一拍库：`lib/pats.ts`（预设后缀 / 抽签取值 / 整句拼装）+ `components/chat/PatPanel.tsx`（我的 / 他的两栏，可加可删、他的可逐条启停）；
     入口有三个：聊天「+」→ 拍一拍、点顶部他的头像、双击他的头像。**我拍他**手点即发（「你」拍了拍「梦角」的×××），
     **他拍我**由 planner 第 2 步从启用的后缀里随机抽（「梦角」拍了拍我的×××）。拍一拍不占 `replySentences` 的句数额度。
   - 形象：昵称默认「梦角」，设置 → 形象里点「我的昵称 / 梦角昵称」用通用弹层 `components/common/PromptSheet.tsx` 随时改（聊天标题 / 拍一拍 / 朋友圈跟着变）。
6. ~~主动消息调度~~ ✅ **已完成（本机定时器版）**：`lib/engine/proactive.ts` + `runtime.ts`
   - **不是「回你」是「他来找你」**：同一个 `planner` 跑同一套抽签，只是第 1 步从「已读不回」换成「主动触发」，
     跳过引用（没你的上一句）与拾取，不显示「正在输入」；发出的消息 `messages.proactive = true` → 气泡左上角 ❤️（一次主动只标第一条）。
   - 四道闸（都在 `proactive.message`）：`interval` 距最后一次说话多久来（每次有新消息就重排 = 从最后一次活动重新计时，你们在聊他就不插嘴）、
     `dailyLimit` 每天几条（**按日期稳定抽一个额度**，从聊天记录里数今天已发的主动条数，用完顺延到明天）、
     `cancelIfRepliedWithin` 被打断窗口（要发的那一刻你刚说过话 → 取消并重新计时）、`quietHours` 免打扰（支持跨零点，排程时顺延到时段结束 + 抖 0~15 分钟）。
   - 细节：时间基准是「最后一条消息」而不是「打开 App 的时刻」（刷新 / 关机再开不会重新数一遍）；
     排到的时间已过去（关机很久）时等 30 秒再冒出来，不会一开 App 就弹；启动 `store/bootstrap.ts` → `attachProactiveScheduler()` 挂上，规则一改就重排。
   - 立刻看效果：**设置 → 概率调节引擎 →「现在就来一条」**（手动预览，跳过四道闸，轨迹写明「手动预览」）；引擎页顶部还会显示「⏰ 下一条主动消息：…」。
   - 演示用的 `mock/chat.ts` 里那几条 `proactive: true` **不计入**每日额度（只数引擎产出的）。
   - 服务端 `apps/server/src/engine/proactive.module.ts`（BullMQ）仍是多端版本的占位，与这套规则同源。
7. ~~朋友圈 + 信箱（含主动投喂）~~ ✅ **已完成**：`lib/engine/timeline.ts` + `lib/engine/content.ts` + 两个屏幕重写
   - **数据不再是写死的**：`state.moments` / `state.letters` 进本机存储（`repo.ts` 的 `PersistedState`），随 `state` 一起推后端；
     朋友圈支持双方发动态、点赞、评论、回复我的评论；信箱支持写信 / 回信 / 未读已读 / 已寄出已回信。
   - **时间轴调度**（`timeline.ts`）：所有待办都**从数据推导**，不存定时任务表 —— 每个事件由「那条动态/那封信的时间 + 规则里的延迟」算出，
     掷签用 `seed.ts` 的种子随机（种子 = 记录 id），所以刷新 / 关机 / 换设备都不会重掷、也不会因为刷新把概率偷偷放大。
   - 他主动发朋友圈 / 写信：`proactive.moment` / `proactive.letter` 只有「概率 + 冷却」，所以给它们一个 **20 分钟节拍**（每个节拍一次机会，冷却没到直接跳过；**一个节拍只发一条**）。
   - 我发的动态 → 他的点赞（`moment.like.p` + `moment.like.delay`）与评论（`moment.comment.p` + `moment.comment.delay`）；
     我在他动态下评论 / 点赞 → 他回复我的评论（`moment.replyMyReply`）/ 回赞（`moment.likeBackIfILiked`）。
   - 我寄出的信 → 他回信（`mail.reply.p` + `mail.replyDelayH`，从**寄出那一刻**算起，跨天也不会丢）；
     `mail.annotation` 是**另一件独立掷签的事**：命中时他在我的信上用**蓝笔写批注**（`content.ts` 把批注锚定到信里的某一句话，
     读者页就在那一行底下手写体显示）。所以「只回信」「只批注不回信」「又回信又批注」三种都有 ——
     只批注时我那封信的状态显示「他读了 · 写了批注」。
   - 内容生成 `content.ts`：没有 LLM 就用「模板 + 他自己的字卡库」拼（会自然引用我上一句话、偶尔配图/分享音乐），不假装 AI 生成；
     字数按 `mail.length` / `mail.replyLength` 凑，`mail.randomPunctuation` 会偶尔少一个句号。
   - 立刻看效果：**设置 → 概率调节引擎** 顶部新增「🌈 让他发条朋友圈」「✉️ 让他写封信」两个手动预览按钮（不等概率与冷却）；
     引擎页还会显示「⏰ 朋友圈 / 信箱：他接下来要做什么 · 几点」。
8. ~~「+」里递给他的东西~~ ✅ **已完成**：抉择 / 问卷 / 红包 / 礼物 / 音乐邀请 / 涂鸦 / 语音通话
   - **一条铁律：递过去的卡片只由时间轴回应**。`lib/engine/cards.ts` 列出 `CARD_KINDS`（CHOICE / QUESTION /
     RED_PACKET / GIFT / MUSIC_INVITE / DOODLE），聊天回复引擎（`runtime.ts`）直接跳过它们；
     系统类消息（`CALL_EVENT` / `SYSTEM` / `SEARCH_PUSH`，`isQuietKind()`）同样不触发「随口回一句」。
     否则同一张卡会同时触发「他随口回一句」和「他认真答这张卡」两套互不相干的排程。
   - 每件东西的抽签都写在 `timeline.ts`，**种子 = 那条消息的 id** → 同一张卡只掷一次签，刷新 / 关机 / 换设备都不会重掷：
     | 递过去的东西 | 他的回应 | 规则组 |
     | --- | --- | --- |
     | 图片 `IMAGE` | 就是一张图（dataURL 存本机），按普通消息触发回复；「拍照」只在手机浏览器上会真调起相机 | `chat.*` |
     | 抉择 `CHOICE` | 选一个选项（可带理由）+ 引用你的卡说一句；`p` 落空就一直停在「等他选…」 | `choice.*` |
     | 问卷 `QUESTION` | 逐题作答（每题都有概率留空）、可选写备注；卡片上显示「他填了 N/M 题」 | `question.*` |
     | 红包 `RED_PACKET` | 领取（卡片变「已被领取 ¥x」+ 系统提示），**再独立掷一次签**决定要不要回一个红包给你 | `redPacket.*` |
     | 礼物 `GIFT` | 收下 + 说声谢谢；反过来他也会主动送你一件 | `gift.*` |
     | 音乐邀请 `MUSIC_INVITE` | 加入一起听（回填「他准备待多久」）+ 说一句关于这首歌的话，还可能回推一首歌；真的想听，点卡片上的「进房间一起听 ›」 | `music.*` |
     | 涂鸦 `DOODLE` | 回一句话，并且可能画一张回给你（从他自己的图案模板里挑，稳定可复现） | `doodle.*` |
     | 语音通话 `CALL_EVENT` | 见下一条 | `call.*` |
   - 「他答完会引用那张卡说一句」：所以卡片会**就地**更新（他选了哪个 / 填了哪题 / 红包被领取 / 礼物被收下），
     旁边还有一条引用它的普通消息 —— 两层信息，和微信里「引用回复」手感一致。
   - 礼物柜 `screens/hub/GiftCabinetScreen.tsx`：预设 6 件 + 自己加（名字 / 定价 / emoji / 本地图片 / 默认卡片文案），
     数据在 `PersistedState.gifts`（随 `state` 推后端）；**送出记录不另存表**，就是聊天里的 GIFT 消息 → 柜子与聊天永远一致。
   - 涂鸦存**笔画**（颜色 + 粗细 + 归一化坐标的 JSON），不是 PNG：几百字节、同步得动、放大不糊；
     画完的图用 SVG 重放（`MessageBubble` 的 `DOODLE` 分支）。
   - 音乐分成两条路，别混：
     · **聊天里的 `MUSIC_INVITE` 卡** = 一张「邀请卡」，显示歌名 / 歌手 / 封面图，
       点「进房间一起听」就把歌带到房间里；按 `music.*` 抽他加不加入、准备待多久、要不要回推一首；
     · **「一起听」房间** `screens/hub/MusicRoomScreen.tsx` = 真播放器（`lib/audio.ts` 里一个 `<audio>` 单例），三种来源：
       本机音频文件（Blob 存 IndexedDB，**只在这台设备上、不上传服务器**）· 音频直链 · 网易云
       （`/api/v1/music/audio` 默认 302 到公开音频 CDN，浏览器直接取 Range；不跳网易云页面）。
       进度 / 时长 / 音量 / seek 都是真的；网易云 VIP / 版权 / 地区受限时可能只给试听或播不了，界面会直接说。
     · 「一起听了多久」= `<audio>` **真的走出来的秒数**（`PersistedState.musicRoom.playedSec`）——
       网易云也能计数，只有歌名、没有音频地址的曲目不计数；Hub 上的数字也从这里来，不再把「他答应加入了」当成听过。
     · 房间里的他由 `lib/engine/room.ts` 驱动（他在不在 / 说一句 / 加一首 / 到点先走，见 `docs/rule-engine.md`）。
   - 语音通话：拨出先落一条 `CALL_EVENT`（`CALLING`），按 `call.*` 抽结局（接通 / 忙线 / 拒绝 / 无人接听），
     接通后**真的计时**（`CallOverlay` 的秒表跟着墙上时间走），挂断回填 `durationSec` + `outcome`（他先挂 / 我挂）；
     通话界面只有挂断键 —— 没有「静音 / 免提」这种点了没用的按钮。刷新 / 关机时中断的通话由 `finalizeStaleCalls()` 收尾。
9. ~~陪伴（睡觉 / 学习 / 工作）~~ ✅ **已完成**：`lib/engine/companion.ts` + `screens/hub/CompanionScreen.tsx`
   - **陪伴时长是真的**：`state.companion.active.startedAt` → 收尾那一刻的真实秒数（挂到别的页面、切后台都在走）；
     到点自动收尾按目标时长**封顶**（关掉页面 8 小时再回来不会记成 8 小时），提前点结束按实际时间记。
   - 他的行为全在 `companion.*`，**种子 = 这一次陪伴的 id**（刷新 / 关机重进不重掷，全部从数据推导，不存定时任务表）：
     `join`（一叫就来 / 没空就先说「一会儿过去陪你」，`joinDelay` 秒后到场，到场时刻存在 `heComingAt`）、
     `say`（**每 10 分钟一个节拍**掷一次，命中就说一句带「还有 N 分钟」的话）、
     `replyMe`（我在房间里说话他接不接）、`leave` + `leaveAfterMin`（他先走，走了之后**陪伴继续计时**、他不再出声）。
   - 房间内对话是独立的一段（`state.companion.messages`，跟一起听一样的做法）；结束时往聊天里落一条 `SYSTEM` 居中小字
     （「📚 和黎深一起学 · 45 分钟」，`isQuietKind()` → 不会再触发回复引擎）。
   - 每个模式可以换背景（`state.companion.backgrounds`，dataURL 随 `state` 同步），每个模式记得上次设的时长；
     「今天 / 连续 / 一共」三个数字都**从记录现算**（没陪过就是 0 秒）。记录可单条删除 / 一键清空。
   - 立刻看效果：**功能 → 🌙 陪伴**（Hub 上正在陪时会亮一个小圆点）。
10. ~~统计 / 适应度~~ ✅ **已完成**：`lib/stats.ts` + `screens/hub/StatsScreen.tsx` + `screens/hub/FitnessScreen.tsx`
   - **一条不伪造的红线**：这一页每个数字都能追到一条真实记录 —— 消息、`messages.plan` 抽签轨迹、
     `CALL_EVENT` 通话记录、红包 / 礼物 payload、一起听**真的播出来的秒数**、`state.companion.sessions`。
     算不出来的（比如网易云曲目的播放进度）干脆不列，宁可少一个数字。
   - 统计（功能 → 📊）：消息构成 / 最近 14 天 / 他的活跃时段 / 我发多少轮他回多少轮（已读不回、没接话分开算）/
     平均回复间隔 / 语音（MiniMax · 语音卡 · 我录的）/ 通话（接通率 · 总时长 · 最长 · 他先挂）/ 红包与礼物 /
     一起听 / 陪伴（三模式分别合计）/ 高频词（**二元粗切**，界面写明没分词库）/ 情绪标签。
   - 适应度（功能 → 🧭）：「他适应我了吗」只认能测的三件事 —— 字卡覆盖（抽到过的卡 / 字卡总数）、回应率、拾取率，
     综合分就是这三项的**平均**，公式印在页面上；另有「配置占比 vs 实际占比」（按轮的载体分布）、
     字卡熟练度排行（`plan.cardIds` 按轮去重，一次抽签发 3 条不重复计数）、他收下的我的话、说话习惯对比。
   - 刻意**不用** `cards.useCount` 当熟练度：那个数现在只有编辑卡片时才会动，不是引擎的真实命中数。
   - Hub 上两个入口的文案也是现算（「20 条消息 · 通话 0 次」「字卡用过 6 / 52 张」）。
11. ~~观影室（一起看片）~~ ✅ **已完成**：`screens/hub/WatchRoomScreen.tsx` + `lib/watch.ts` + `lib/videoEl.ts` + `lib/engine/watch.ts`
    - **红线一：进度必须是真的**。片源四类 —— 本机视频文件（Blob 只存 IndexedDB，换设备要重导）· 视频直链 ·
      B 站链接（**官方 iframe 播放器** `player.bilibili.com`）· 只有片名（他推的片）。
      前两类走我们自己的 `<video>` 单例（`lib/videoEl.ts`）：播放 / 暂停 / seek / 片长都是真的，
      只有 `<video>` **真在走**才按秒累加（每秒结算、每 10 秒落盘）→ `state.watchRoom.playedSec`、`position`。
      B 站与只有片名的**跨域拿不到进度 → 一秒都不计、一条弹幕都不发**（不在假进度上飘字），
      界面上也写明白；卡片上写着「这里没有模拟进度条：`<video>` 没在走，秒数就不加」。
    - **红线二：他的表现是抽出来的**。`watchRoom.*` 8 项（见 `docs/rule-engine.md`），**种子 = 这一次观影的 id** →
      刷新 / 关机重进不重掷，全部从数据推导，不存定时任务表。他进房间（1~6 秒 / 「一会儿再来」）、
      **到场那一刻一次排完这一场的弹幕**（条数抽一次，位置 = 片长的 5%~95% 种子散开，**当场落库**，
      界面只在进度越过 `atSec` 时才飘出来 → 刷新还是同一批、同一时刻）、按播放进度说一句、
      中途先走（片照放，他不出声）、房间里回我一句。
    - 片长是弹幕的前提：拿不到（`Infinity` / `NaN` / 0）就不排；不到 15 秒的片子也不飘（一次飘 8 秒太长）；
      一整场不重复同一句。弹幕清单可以点开看（写明「会剧透」）——他的抽签结果不怕给你看。
    - 房间对话独立成一段（`state.watchRoom.messages`，跟一起听 / 陪伴一样，不占聊天气泡）；
      结束（看完了 / 先停在这儿）往聊天落一条 `SYSTEM`（`isQuietKind()`，不再触发回复引擎）：
      **有真实进度才带时长**（「🎞️ 和黎深一起看了《…》 · 42 分钟」），B 站 / 只有片名的只写片名。
    - 「这一场真的看了多久」= 收尾时的 `playedSec` − 开始时的 `playedSec`（**不是墙上时间**）——
      把页面挂后台、停在别的屏幕都不影响这个数。
    - 顺手修的两个真问题：① 收尾时先摘播放器再收尾（否则「暂停」会被当成「按了播放」又开一场）；
      ② 老数据里红包金额是字符串时 `amount.toFixed` 会炸（`timeline.ts` 与 `MessageBubble` 都改成 `Number()`）。
 11.5 ~~阅读室（一起读）~~ ✅ **已完成**：`screens/hub/ReadRoomScreen.tsx` + `lib/read.ts` + `lib/engine/read.ts`
    - 书写源三类：**本机 txt / md / html / epub**（正文解析成段落数组，只存本机 IndexedDB `book:<id>`）·
      **粘一段正文** · **只有书名**（他随口推的）。前两类有真进度，第三类没有。
    - **红线一：进度与「读了多久」都是真的**。「读到第几段」是我们自己数出来的（按段分页，百分比 = 段号 / 总段数）；
      「一起读了多久」**不是墙上时间** —— 三条同时成立才走表：阅读室开着 + 页面在前台 + 最近 45 秒内翻过页 / 滚过，
      每 10 秒落盘。「只有书名」的书**一秒都不记时长**（没有可测的进度就不编时长），也**一处批注都不写**。
    - epub 自己拆 zip（`lib/read.ts` 读 `META-INF/container.xml` 与 OPF，正文走 `DecompressionStream('deflate-raw')`），
      不引第三方库；解不开会明说，不会给你一本空书。
    - **红线二：他写什么、写在第几段是抽出来的**。`readRoom.*` 8 项（见 `docs/rule-engine.md`），**种子 = 这一次共读的 id** →
      刷新 / 关机重进不重掷，待办全从数据推导。他进房间（1~6 秒 / 「一会儿过来」）、
      **到场那一刻一次排完这一本的批注与短句**（处数抽一次，段落号 = 总段数的 5%~95% 种子散开、**当场落库**，
      界面只在**你真的读到那一段**时才让它出现在页边 → 刷新还是同一批、同一段）、按读到的进率说一句、
      中途先走（书照读，他不出声）、房间里回我一句。
    - 段落少于 4 段的短文本不排批注；一整本不重复同一句。页边清单可以点开看（写明「会剧透」）——
      他的抽签结果不怕给你看。
    - 房间对话独立成一段（`state.readRoom.messages`，跟一起听 / 陪伴 / 观影室一样，不占聊天气泡）；
      结束（读完了 / 先停在这儿）往聊天落一条 `SYSTEM`：**有真实进度才带时长**（「📖 和黎深一起读了《…》 · 1 分钟」），
      「只有书名」的只写书名。
  11.6 ~~日记~~ ✅ **已完成**：`screens/hub/DiaryScreen.tsx` + `lib/diary.ts` + `lib/engine/diary.ts`
    - **我的日记不限条数**：同一天可以写很多条，不写也可以；每条各自改（记 `editedAt`）、各自选公开 / 私密。
      **他自动写的那条每天最多一次**（避免刷屏），他写过就不会自动再写第二条。
    - **红线：他提到的事必须今天真的发生过**。`lib/diary.ts#collectFacts()` 从**今天的记录**里一条条数：
      聊天条数（安静类消息不算）· 语音 · 通话（只认真的接通了、带真实时长）· 红包（分谁给谁）· 礼物 · 一起听 ·
      一起看片 / 一起读（读收尾那条 `SYSTEM` 的 `payload`，带真实时长）· 陪伴多久（按 `startedAt` 归属、
      同模式取最长的一次）· 他在我朋友圈点赞评论了几条 · 他寄来的信。一条都没有就一条都不提。
    - **他写不写 / 几点写 / 提不提真事 / 写几句 / 会不会顺着我的留言写，全是抽签**，`diary.*` 5 项，
      **种子 = 日期**（`YYYY-MM-DD`）→ 早上看和晚上看是同一个答案。**「几点写」不存定时任务表**：
      用日期当种子从 `diary.atTime`（默认 21:00~23:30）里抽一个点，每次开 App 现算、结果一样；
      到点之前界面明说「他今天还没写，一般在你睡前那段」，不是「在加载」。
    - 他今天会写但还没到点的时候，界面上给一个「现在就写（本来就是今天他写）」的按钮 —— 只是**把他今晚那条提前**，
      不会凭空多一条（抽签结果是「今天不写」时，这个按钮不给）。
    - 顺手去伪：主界面「今日小卡」原来写死过一句假话（「他今天已经给你发了 12 条字卡…」），
      改成**今天的真实数字现算**；主界面新增一张「黎深 的留言」小卡，点进日记。
  11.7 ~~世界感知（时间差 / 状态）~~ ✅ **已完成**：`screens/hub/WorldScreen.tsx` + `lib/world.ts` + `lib/engine/world.ts`
    - **三类东西分开摆、分开标**：① **真的** —— 他那边的钟点（`我这边现在 + 时差` 真换算），
      时差是**我设的设定**（界面上明说「你设的，不是测出来的」）；② **抽的** —— 他的状态与「正在做的事」，
      **种子 = 日期 + 采样槽**（槽长 = 当天从 `world.intervalMin` 抽出的间隔）→ 同一段时间里反复看是**同一个答案**，
      刷新不重掷、跨槽才变；③ **没有的** —— 天气，没接天气源 → `weather` 恒为 `null`，**一个字都不编**。
    - 状态**按时段分池**（他那边半夜不抽「在开会」、早上不抽「准备睡了」），跨日会标「（他那边是明天）」。
    - 采样台账 `state.world.samples`（最多 40 条，可单条删 / 清空）；到点自动采（60 秒一趟的钟，间隔不是任务表，是现算的）。
    - 「顺手在聊天里说一句」（`world.toChat`）**每天最多一条**，判据是**聊天记录本身**（消息带 `payload.world`），
      不是采样里的标记 —— 采样会被裁掉 / 手动删，但「今天说过没有」必须以聊天记录为真；免打扰时段不说。
  11.8 ~~查岗~~ ✅ **已完成**：`screens/hub/CheckScreen.tsx` + `lib/check.ts` + `lib/engine/check.ts`
    - **红线**：我们**拿不到他的定位、也看不到他的手机**。所以报告分两栏，栏标题就是「真的」和「抽的」：
      **真的**那栏全部从本机记录现算（他那边的钟点 / 最后一条消息多久前 / 今天发来几条 / 最近一次陪你做了什么 /
      今天写没写日记 / 从你这儿拾走过几句话 / 字卡库多少张）；**抽的**那栏是定位与「手机屏幕上看到的东西」
      （种子 = 请求 id，`checkPhone.fakeInfoP` 命中还标「修饰过的版本」）；真的截图与坐标**永远不给**（我们没有）。
    - 冷却是**真的**（从上次发起的时刻现算 `checkPhone.cooldownMin`，清记录就松掉）；他回应 3~12 秒，
      `respondAt` 存在记录里，1 秒的钟到点结算（不存任务表）。
    - 反方向：他**每天最多来查你 `checkPhone.dailyLimit` 次**（1~5，默认 1，上限 5；每个名额按 `askMeP` 独立抽签，种子 = 日期），到点在查岗页挂卡（功能页图标带红点），
      你「给他看 / 不给看」；他先在聊天里问一句，你回完他再回一句。`EXPIRED` 保留但本机版不产生。
  11.9 ~~联网搜索推送（博查）~~ ✅ **已完成**：`lib/engine/search.ts` + `lib/search.ts` + `apps/server/bocha.mjs` + `apps/server/media.mjs` + `screens/settings/IntegrationScreen.tsx`
    - **红线**：这个模块最容易造假 —— 编一条「他上网看到……」谁也查不出来。所以规矩立在最前面：
      **搜到才推**（那张 `SEARCH_PUSH` 卡的标题 / 链接 / 站点 / 摘要**都是搜索服务真返回的**）；
      **搜不到就一条消息都不发**（没配 Key / 断网 / 被限流 / 一条结果都没有 / 上游格式看不懂），
      只在「搜索轨迹」里记一条失败，界面上能看见「上次为什么没搜到」。
    - **独立排程，不挂在「回你」那条链上**（60 秒一趟的钟）：一个间隔里最多试一次
      （`search.pushIntervalMin`，上一次试过的时刻从**轨迹 + 聊天记录**里现算），
      试不试 = **种子 = 日期 + 间隔槽**掷 `search.p`（同一槽刷新不重掷、跨槽才变），
      搜什么 = 同种子从 `search.topics` 抽一个主题，免打扰时段这一槽不推。**不存任务表。**
    - 请求走**我们自己的后端**（`POST /api/v1/search` → `apps/server/bocha.mjs` → 博查
      `POST https://api.bochaai.com/v1/web-search`）：浏览器直连会被 CORS 挡，Key 也不该下发到前端。
      归一化认两种外层形状（`{code,data:{webPages}}` 与 `{webPages}`），**读不懂就当失败，绝不猜一条出来**。
    - Key 存后端、只回尾号（和 MiniMax 一个路子）：设置 → 接入 → **联网搜索推送（博查）**，
      可填 Key / 选时效（一天内 ~ 不限）/ 选一次取几条，有「搜一下（测试连通）」显示真实结果与失败原因，
      还有「现在推一条」（不走排程、不看免打扰 —— 人说了算），下面是**搜索轨迹**（成败都记、可单条删 / 清空）。
     - **三种形态，形态由内容说了算**（不是随机贴标签）：
       ① 首位结果本身就是**视频页** → 视频卡（封面 + ▶ + 真时长 + 「视频」角标）；
       ② 否则服务端**验过**有可用图 & 掷中 `search.imageP` → 图片卡（真图 + 「图源：哪个页面」）；
       ③ 再不然 → 链接卡（真 favicon + 标题/摘要/链接，有图就带封面）。
       图片一律来自上游页面，**验不过就没有** —— 不合成、不占位。
     - **图先验再用**：博查 `images` 容器里那批图一半是垃圾（logo / 防盗链 403 / 404）。
       服务端 `media.mjs` 真去取一遍：取得到 + `image/*` + ≥20KB + 短边 ≥320px + 不是超宽横幅 → 才算数；
       被丢掉的每一张都写清原因（进轨迹，能回头看「这次为什么没配图」）。
     - **图走代理**：有些图服务端能取、浏览器直连是 403 空白 → 走 `GET /api/v1/image?u=…` 代取 + 落盘缓存。
     - **视频不靠上游**：博查这个接口 `videos` 容器**永远是空的**（拿真 Key 探过），所以视频只能靠
       「这条结果是不是视频页」判，而且只认两路硬信号：**域名是视频站 / 页面自带 `og:video`**。
       曾经还有第三路「标题里写着预告片·在线观看」，**实测被拿掉了** —— 它把新浪那篇《看了预告片好期待》的
       **报道**判成了视频页；宁可视频卡少见，也不要给一篇文章挂个 ▶。
       代价说清楚：**实测十几次搜索，视频页一张都没出现**（博查总返回百科 / 新闻 / 聚合页，不返回播放页）。
       想要「他真发视频」得另接一个视频源，那是另一件事。
     - 安静类：`SEARCH_PUSH` 与 `SYSTEM` / `CALL_EVENT` 一样不触发回复引擎、也不算进「今天聊了几句」。
12. 剩下的真机联调：`content.ts` 的模板换成真生成（LLM）。
