# 架构说明

## 1. 分层

```
┌──────────────────────── web (React SPA) ────────────────────────┐
│ PhoneShell 手机外壳                                             │
│  ├─ HomeScreen  桌面（双人头像 / 纪念日 / 配色 / 相框 / 5 大入口）│
│  ├─ ChatScreen  聊天（字卡 / 语音 / 扩展面板 8 项）             │
│  ├─ Moments / Mailbox / Hub(18) / Settings(RuleEngine)          │
│  └─ Zustand(本地态) + Query(服务端态) + Socket(推送)            │
└───────────────────────────────┬─────────────────────────────────┘
                     REST /api/v1  +  WS /rt
┌───────────────────────────────┴─────────────────────────────────┐
│ server (NestJS)                                                 │
│  modules/*  业务模块（薄，只做校验与持久化）                     │
│  engine/*   ★ 拟真引擎（厚，所有「人味」在此）                  │
│     reply-engine:  抽签占比 → 算延迟 → 定句数 → 组装            │
│     card-mixer:    多字卡拼接 / LLM 自由组句 / 拼音             │
│     proactive:     BullMQ 定时器，主动发消息带爱心标识          │
│  integrations/*  LLM / MiniMax / Search / Storage 适配层        │
└───────────────┬───────────────────────┬─────────────────────────┘
          PostgreSQL(Prisma)          Redis(BullMQ)
```

## 2. 一次「梦角回你消息」的完整数据流

```
用户发送 text
  → POST /api/v1/conversations/:id/messages
  → 存 messages(sender=self)，WS 广播
  → engine.reply-engine.plan(context)
       ├─ 读 rule_configs（最新 version）
       ├─ 抽样：本次用 文字/颜文字/表情包/图片 哪一类（不强制和为 100%）
       ├─ 抽样：连词？标点？拼音造句？多字卡拼接 1~N 张？
       ├─ 若自由组句 → integrations/llm.generateSentence(cards, emotion)
       ├─ 计算延迟 = rand(minInterval, maxInterval)（长文本加成）
       ├─ 抽样：已读不回 / 引用 / 撤回 / 撤回后补发 / 拍一拍
       └─ 写 messages.latency_ms + plan(JSONB)
  → BullMQ 延迟投递 job
  → 到点 WS 推送："梦角正在输入…" → 逐句下发
  → 若开启 MiniMax 且抽中语音 → integrations/minimax.synthesize → 音频 URL（本机版：`planner` 只标记，
     `runtime.startVoices()` 在拟真延迟里提前合成 → `VOICE` 气泡内嵌 dataURL；合成失败退回文字，不伪造）
  → 若开启拾取（我→他）→ pickup_logs → 写入梦角字卡库(cards.source=PICKED)
```

## 3. 状态机（关键）

- **通话**：`IDLE → CALLING(拨出) → TALKING → ENDED`，另含 `MISSED`（含 `busy / reject / miss` 三种理由），全部由 `rule_configs.call` 概率决定。
  本机版（`web/lib/engine/call.ts`）把一通电话存成**一条 `CALL_EVENT` 消息**（payload 记 `phase / outcome / durationSec / calledAt / answeredAt / endedAt`）：
  拨出先落 `CALLING`，按 `call.connect.p` 掷「接不接」，接了就真的计时（`components/chat/CallOverlay.tsx` 的秒表跟着墙上时间走），
  挂断回填时长与「谁先挂」；关机 / 刷新时中断的通话由 `finalizeStaleCalls()` 按已挂断收尾。通话界面只有挂断键（不做点了没用的假按钮）。
- **陪伴**：`invite → accepted → running(可聊天) → ended(产出时长统计)`，双向发起，期间消息带 `context=COMPANION`。
  本机版（`web/lib/engine/companion.ts`）按同一套状态走，数据全落 `state.companion`（`active` / `messages` / `sessions` / `backgrounds` / `plannedMin`）：
  时长 = `active.startedAt` → 收尾那一刻的**真实秒数**（到点收尾按目标时长封顶），记录落 `sessions`（对应多端版的 `companion_sessions`，
  含 `mode / durationSec / interrupted / heJoined / heLeftEarly`）。他的表现同样**从数据推导 + 种子随机**（种子 = 陪伴 id）：
  一叫就来 / 没空则 `heComingAt` 到场、每 10 分钟一个节拍说话（`saidBuckets`）、`heLeavesAt` 先走（走了不再出声，但计时继续）。
  房间内对话存在 `messages`（跟一起听一样）；结束时往主聊天落一条 `SYSTEM` 居中小字（`isQuietKind()`，不触发回复引擎）。
- **统计 / 适应度**：**没有独立数据表**，也不存快照 —— `web/lib/stats.ts` 每次进页面都把聊天记录现算一遍
  （对应多端设计里的 `word_stats` / `fitness_scores` 是两个**物化视图**的角色，本机版用纯函数代替）。
  口径固定：一轮 = 我发一句 + 他回的那几条（`buildTurns`），抽到的卡读 `messages.plan.cardIds` 并**按轮去重**
  （一次抽签发 3 条只算 1 次）；通话读 `CALL_EVENT` 的 payload；一起听只算 `musicRoom.playedSec`（真实播放秒数）；
  高频词用相邻两字粗切（没有分词库）。适应度综合分 = 字卡覆盖 / 回应率 / 拾取率的平均，公式与各项原始数字都印在页面上。
  刻意不用 `cards.useCount` 当熟练度（那个数只有手动编辑卡片时才会动，不是引擎命中数）。
- **观影室**：数据落 `state.watchRoom`（片单 / 房间对话 / 弹幕 / 一起看秒数 / 每部的播放位置 / 这一次的 `active`，随 `state` 推后端），
  **视频文件本身不进 `state`** —— 本机视频以 Blob 存 IndexedDB 的 `video:<片目 id>` 键下，只在这台设备上播，换设备要重新导入。
  本机版（`web/lib/videoEl.ts` + `web/lib/watch.ts` + `web/lib/engine/watch.ts`）把「进度」和「他的表现」彻底分开：
  「本机视频 / 视频直链」走 `<video>` 真播（位置、时长、seek 都是真的，`playedSec` 只在它真在走时累加、每 10 秒落盘）；
  「B 站」用官方 iframe 播放器（跨域读不到 `currentTime`）、「只有片名」根本没画面 —— 这两种**一秒都不计**，
  也**一条弹幕都不发**（不在假进度上飘字），他的房间发言改按「一起待了多久」的真实分钟数。
  他的表现同样是**从数据推导 + 种子随机**（种子 = 这一次观影的 id）：进房间（1~6 秒 / `heComingAt` 一会儿再来）、
  **到场那一刻一次排完这一场的弹幕**（位置 = 片长的 5%~95% 种子散开，当场落库 → 界面只在进度越过 `atSec` 时才飘，
  刷新还是同一批同一时刻）、按播放进度说一句、`heLeavesAt` 先走（片照放，他只是不出声）、房间回话。
  结束时往主聊天落一条 `SYSTEM`（`isQuietKind()`）：**有真实进度才带时长**，拿不到进度的只写片名
  （对应多端设计里的 `watch_rooms` 与 WS 进度同步；本机版把「同步」换成了「谁在放谁说了算」）。
- **阅读室**：数据落 `state.readRoom`（书单 / 房间对话 / 页边批注 / 一起读秒数 / 读到第几段 / 这一次的 `active`，随 `state` 推后端），
  **正文本体不进 `state`** —— 解析出来的段落数组存 IndexedDB 的 `book:<书目 id>` 键下，只在这台设备上读，换设备要重新导入
  （对应多端设计里的 `read_rooms` 与 `read_annotations`）。本机版（`web/lib/read.ts` + `web/lib/engine/read.ts`）
  同样把「进度」和「他的表现」分开：「读到第几段」是我们自己数出来的（按段分页，百分比 = 段号 / 总段数），
  「一起读了多久」**不是墙上时间** —— 阅读室开着 + 页面在前台 + 最近 45 秒内翻过页 / 滚过，三条同时成立才走表（每 10 秒落盘）；
  「只有书名」的书没有正文 → **没有进度、一秒不计时长、页边一处不写**（不在假进度上写字），就是他陪着你待一会儿。
  他的表现同样是**从数据推导 + 种子随机**（种子 = 这一次共读的 id）：进房间（1~6 秒 / `heComingAt` 一会儿过来）、
  **到场那一刻一次排完这一本的批注与短句**（段落号 = 总段数的 5%~95% 种子散开，当场落库 → 界面只在**你真的读到那一段**时才显示，
  刷新还是同一批同一段）、按读到的进率说一句、`heLeavesAt` 先走（书照读，他只是不出声）、房间回话。
  结束时往主聊天落一条 `SYSTEM`（`isQuietKind()`）：**有真实进度才带时长**，只有书名的只写书名。
- **日记**：数据落 `state.diary`（`entries[]`，对应多端设计里的 `diary_entries`）。
  **我的日记不限条数**：同一天可以写很多条，不写也可以；每条按 `id` 独立改（记 `editedAt`）、独立删、独立选公开 / 私密。
  **他自动写的那条每天最多一次**（避免刷屏）：他写过了就不再自动写第二条。
  本机版（`web/lib/diary.ts` + `web/lib/engine/diary.ts`）把「他的排程」和「他写什么」分开：
  他写不写 / 几点写 / 提不提今天真发生的事 / 写几句 / 会不会顺着我的留言写，全是**种子随机**
  （种子 = 日期的 `YYYY-MM-DD`）→ 今天写不写**早上看和晚上看是同一个答案**，刷新不重掷。
  他的「几点写」不存定时任务表：用日期当种子从 `diary.atTime`（默认 21:00~23:30）里抽一个点，每次开 App 现算、结果永远一样。
  他留言里提到的每件事都由 `collectFacts()` 从**今天的记录**里真数出来（聊了几句 / 通话 / 红包 / 语音 / 礼物 / 一起听 /
  一起看片读书 / 陪伴多久 / 朋友圈互动 / 来信），**一条都没有就一条都不提** —— 宁可少写一句，也不编一天。
  **私密日记**：我的每一条带 `visibility: 'public' | 'private'`。每条私密第一次保存时各掷一次 30% 的「被他破解」并写进
  自己的 `entry.cracked`，之后编辑**不重掷**；这个 30% 写死在 `saveMyDiary()`，不进 `rule_configs`，避免把「私密」调成摆设。
- **世界感知**：数据落 `state.world`（`offsetMin` + `samples[]`，对应多端设计里的 `world_sense_logs`）。
  本机版（`web/lib/world.ts` + `web/lib/engine/world.ts`）把它分成三类：
  **能算的** —— 他那边的钟点 = `我这边现在 + 时差`（时差是**用户设的设定**，界面上写明「不是测出来的」）；
  **测不到的** —— 他的状态与「正在做的事」，按时段分池、**种子 = 日期 + 采样槽**（槽长 = 当天抽出的采样间隔）
  → 同一段时间里反复看是同一个答案，刷新不重掷；**没有的** —— 天气（没有天气源 → `weather` 恒为 `null`，
  界面写「没接源，不显示」，不编）。「顺手在聊天里说一句」每天最多一条，判据是**聊天记录本身**。
- **查岗**：多端版 `requested → agreed(回传定位/截图) | refused`（`enum CheckStatus` 另有 `EXPIRED`），
  冷却由 `rule_configs.checkPhone.cooldownMin` 控制。本机版（`web/lib/check.ts` + `web/lib/engine/check.ts`）数据落 `state.checkPhone`，
  红线是**拿不到他的定位、也看不到他的手机**，所以报告分两栏：**「真的」**那栏全部从本机记录现算
  （他那边的钟点 / 最后一条消息多久前 / 今天发来几条 / 最近一次陪你做了什么 / 今天写没写日记 / 拾走过什么 / 字卡库多少张），
  **「抽的」**那栏是定位与手机屏（种子 = 请求 id，`fakeInfoP` 命中还标「修饰过的版本」），**真的截图与坐标永远不给**。
  冷却也是现算的（从上次发起的时刻）；他回应 3~12 秒，`respondAt` 存记录里由钟结算。
  他主动来查我的次数由 `checkPhone.dailyLimit` 控制（**1~5，默认 1，上限 5**，不是固定一天一条）：
  每个名额独立按 `checkPhone.askMeP` 抽签，种子 = 日期，到点没有挂起的请求才发；界面上写明「每天最多 N 条，不超过 5 条」。
- **联网搜索推送（博查）**：数据落 `state.searchPush.logs`（对应多端设计里的 `search_pushes`，
  **一次尝试一条、成功和失败都记**），他推出去的那张 `SEARCH_PUSH` 卡本身就是一条普通消息（安静类）。
  本机版（`web/lib/search.ts` + `web/lib/engine/search.ts` + `apps/server/bocha.mjs` + `apps/server/media.mjs`）的规矩：
  **搜到才推**（卡上的标题 / 链接 / 站点 / 摘要 / 图都是搜索服务与上游页面**真返回的**）；
  **搜不到（没配 Key / 断网 / 被限流 / 一条结果都没有 / 上游格式读不懂）就一条消息都不发**，只落一条失败轨迹 ——
  界面上「上次为什么没搜到」必须答得出来。排程同样是**从数据推导 + 种子随机**：一个 `search.pushIntervalMin` 的间隔里最多试一次
  （上一次试过多久以前，从轨迹与聊天记录现算），试不试与搜什么都用**种子 = 日期 + 间隔槽**；
  免打扰时段这一槽不推。请求走我们自己的后端（`POST /api/v1/search`）—— 浏览器直连博查会被 CORS 挡，Key 也不该下发到前端
  （和 MiniMax 一个路子：Key 存后端，`/integrations` 只回尾号）。
- **搜索结果里的图与视频**：博查 `web-search` 的**原始响应**里其实有三个容器 —— `webPages` / `images` / `videos`，
  但 `videos` **永远是空的**（拿真 Key 探过 8 个词，全是 `null`：它官网说的「包括视频」不在这个接口里），
  `images`（0~5 张）里那批图**一半不能用**（网站 logo / 防盗链 403 / 404 / 连不上）。
  于是 `media.mjs` 只做**验证**不做**生成**：图要真取一遍（`image/*` + ≥20KB + 短边 ≥320px + 不是超宽横幅）才算数，
  取不到就**不配图**（退回纯链接卡，绝不放占位图）；视频只认两路硬信号：**域名是视频站 / 页面自带 `og:video`**
  （「标题里写着预告片·在线观看」那一路实测会把新闻报道判成视频页，已拿掉）。
  有些图服务端能取、浏览器直连是 403 空白，所以图片走我们自己的代理 `GET /api/v1/image?u=…`（代取 + 落盘缓存）。
- **主动消息**：多端版由 `proactive_jobs` 表驱动，`status: SCHEDULED → SENT → CANCELLED`，对方在窗口期内回话则取消，避免「自说自话」。
  本机版（`web/lib/engine/proactive.ts` + `runtime.ts`）用同样的 `rule_configs.proactive.message` 规则跑本地定时器：
  以「最后一条消息」为计时基准抽 `interval`，「每日额度」按日期稳定抽一个数、从聊天记录里数已发条数，
  `cancelIfRepliedWithin` 是取消窗口，`quietHours` 免打扰时段（支持跨零点）；产出 `messages.proactive = true` → 气泡左上角 ❤️。
- **朋友圈 / 信箱**：数据落 `state.moments` / `state.letters`（对应多端版的 `moments` / `moment_comments` / `letters` / `letter_annotations`），
  随 `state` 一起推后端。本机排程在 `web/lib/engine/timeline.ts`：**所有待办从数据推导**（由「那条动态 / 那封信的时间 + 规则延迟」算出，
  掷签用记录 id 做种子 → 刷新不重掷），不存定时任务表；事件类型 = 他主动发动态 / 写信、给我的动态点赞评论、回复我的评论、回赞、
  回我的信，以及在**我写给他的信上用蓝笔写批注**（批注锚定到信里的某一句，`letter_annotations.anchor`）。
  「回信」与「批注」是**两次独立抽签**，因此可能只回信、只批注（读了却没写回信）、或两者都有。
  `proactive.moment` / `proactive.letter` 只有「概率 + 冷却」没有间隔，因此引入 20 分钟**节拍**：每个节拍给一次机会，冷却没到直接跳过。

- **一起听（音乐房间）**：数据落 `state.musicRoom`（歌单 / 一起听秒数 / 房间对话，随 `state` 推后端），
  **音频文件本身不进 `state`** —— 本机文件以 Blob 存 IndexedDB 的 `audio:<曲目 id>` 键下，只在这台设备上播，换设备要重新导入。
  本机版（`web/lib/audio.ts` + `web/lib/engine/room.ts`）：
  「本机文件 / 音频直链」走 `<audio>` 真播（进度、时长、seek 都是真的），「网易云」用官方外链播放器 iframe 播（版权与进度都归网易云）；
  `playedSec` 只在 `<audio>` 真的在走时累加（每 10 秒落盘），网易云 / 只有歌名的曲目不计数。
  房间排程同样是**从数据推导 + 种子随机**（种子 = 曲目 id + 10 分钟节拍）：他进房间 / 说一句 / 加一首 / 到点先走，刷新不重掷。

- **真实语音（MiniMax T2A）**：Key 存后端（`apps/server/.data/db.json` 的 `integrations`，或 `apps/server/.env`；**设置页填的优先**），
  `GET /api/v1/integrations` 只回「配没配 + Key 尾号」。合成走 `POST /api/v1/voice/tts`（后端代取，绕开 CORS），返回 `audio/mpeg` 字节 + `X-Audio-Duration-Ms`。
  本机版（`web/lib/voice.ts`）：合成结果转 dataURL 存进消息 `payload.url`（跟着消息同步，换设备也放得出来），
  键 = 文本 + 音色 + 模型 + 语速 + 情绪 → 命中缓存不重复计费；`INTEGRATIONS.tts` 由 `store/useIntegrationsStore.ts` 在启动时按接入状态写入，
  没接通就只写 `trace.skipped`，绝不发假语音。

- **语音卡（收藏 → 变成语音字卡：不花钱的那条路）**：数据落 `state.voices`（收藏的语音，音频是 dataURL、随 `state` 同步）
  + `cards.voice`（卡自带的语音）。`lib/voiceFav.ts` 把一段收藏变成字卡上的一段音频：字卡库里已有同句的文字卡就直接配上，
  没有就新建一张（文字 = 这段语音说的话，并**自动禁组句**）。`planner` 抽到这张卡时会比对「这一轮说的原话」与 `cards.voice.text`
  （`bareSentence` 忽略标点）：一致就把这段现成音频挂到 `PlannedItem.voice.url` → `runtime` **直接用它，不调 MiniMax、不花钱**；
  对不上（比如被组句改写了）就照常当普通文字卡用，绝不张冠李戴。长按他的语音 → ⭐ 收藏；入口：功能 → 收藏 ⭐。

- **收藏夹（快照模型）**：数据落 `state.favorites`（`FavoriteItem[]`），`owner` 区分「我收藏的 / 他收藏我的」，
  `author` 区分内容归属，`kind` 区分 MESSAGE / VOICE / LETTER / MOMENT，列表再按聊天 / 字卡 / 推送 / 语音 / 信件 / 朋友圈筛选。
  收藏存的是**内容快照**（文字、图片、音频 dataURL、卡片类型等），不是消息外键 —— 原消息撤回或删除后收藏仍在。
  他收藏我的东西由 `timeline.ts#hisFavoriteOpportunity` 按 `favorite.collect` 逐条抽签（种子 = 内容 id，刷新不重掷），
  原因从 `state.favoriteReasons` 抽；默认 6 条可在收藏页增删，冷却 `favorite.cooldownMin` 防止一次收一堆。
- **问卷（两套，分开记录）**：聊天「+」里的 `QUESTION` 消息表示**我出卷问他**，答案回填在 `message.payload`；
  功能 → 问卷（`#survey`）的 `QuestionPack[]` 是题库，他只负责按 `question.askMeP` 挑一套来**问我**。
  默契问卷单独存 `state.quizSessions`（`QuizSession`）：两人做同一套题，交卷后按选项一致率算默契度；
  他的答案由抽签模拟并在结果里明说，不伪造「他真的做了」。
- **气泡自定义 CSS**：`appearance.bubble.customCss` 由 `lib/appearance.ts#applyAppearance` 注入/移除独立的
  `<style id="ln-custom-bubble-css">`，选择器约定 `.ln-bubble` / `.ln-bubble-me` / `.ln-bubble-peer`；
  点「应用」立即生效，点「清空」同时清空草稿并移除 `<style>`。CSS 只影响聊天页，不写进全局样式。
- **涂鸦主动发送**：`doodle.proactive`（默认关闭，3%；冷却 `doodle.proactive.cooldownMin` 默认 1440 分钟）
  由 `timeline.ts#hisDoodleOpportunity` 排程：不等我先画，命中后用他的图案模板生成 `DOODLE` 消息；
  与「我画 → 他回话 / 回画」的 `doodle.reply` 链互不冲突。

## 4. 安全与隐私

- MiniMax Key / 搜索授权以 AES-256 加密存 `integration_configs.secret`，仅服务端解密。
  （本机 dev-server 是零依赖 JSON 存储：Key 待在 `apps/server/.data/db.json` 的 `integrations` 里，接口不回明文，只回尾号。）
- 查岗、观影室、收藏均为双人可见域，接口按 `coupleId` 强制隔离。
- 字卡导入文件限制 5MB / 10k 行，先清洗再查重再入库。
- **Key 不进代码、不进仓库**：前端产物里没有任何 Key（构建后扫过，零命中）；`.gitignore` 挡掉 `.data/` / `.env`。
  要上传 GitHub 用 `npm run pack:public` 打干净副本（复制后再扫一遍 `sk-`，命中就报错退出）——
  因为 GitHub 网页版拖文件夹上传**不读 .gitignore**。
- **单用户没有账号体系**：会话固定 `c_1`。所以部署到公网必须设 `APP_PASSWORD`（`dev-server.mjs` 里的
  `authorized()`，标准 Basic Auth，在路由最前面拦一次）—— 不设就是「拿到地址就能看你的聊天、用你的 Key」。
  页面 / API / 字体 / 图片代理一起挡；OPTIONS 预检放行（跨域部署要）。

## 5. 外壳：桌面是「小手机」，手机上是全屏 App

同一份代码，靠一条媒体查询切换形态（`apps/web/src/styles/index.css` 的「手机适配」段）：

| 条件 | 形态 |
| --- | --- |
| `min-width: 521px` 且非 standalone | 390×844 机身：圆角 + 阴影 + 刘海 + 假状态栏 + Home Indicator |
| `max-width: 520px` 或 `display-mode: standalone` | 全屏：机身铺满 `100dvh`，圆角/阴影/刘海/假状态栏全部撤掉 |

- 判定基准：荣耀 200 Pro 的逻辑宽度 = 1224 / 3 = **408px**，落在 ≤520 这一档。
- 安全区：不靠外壳垫白边，而是**哪块有底色就让哪块自己长高** —— `NavBar` 加 `.ln-navbar`
  （`height: calc(3.5rem + env(safe-area-inset-top))`），无标题栏的屏幕（主界面）用 `.safe-top`，
  底部升起的面板统一由 `.inset-0.justify-end` 垫 `env(safe-area-inset-bottom)`。
- 键盘：`interactive-widget=resizes-content`（Android 顶小视口）+ `visualViewport` 差值补 `padding-bottom`（iOS 浮层键盘）。
- 安装：`public/manifest.webmanifest` + `public/icons/*`（`npm run icons` 现场生成）+ `theme-color` 跟着主题变
  → 加到桌面后是 `standalone`，无地址栏。
- 系统返回键：`App.tsx` 的 `useSystemBack` 把屏栈镜像进浏览器历史（每条 state 存 `{ screen, history }`）：
  栈变深 push，应用内返回 `history.go(-n)` 对齐，系统返回（popstate）直接把 store 摆回那条记录。
  于是在手机上按返回是退一屏，退到主界面再按才退出 —— 同时 hash 跟着屏幕走，刷新不丢位置。

### 5.1 部署形态：完整版与纯静态版

前端所有请求都是**同源**的相对路径（`/api/v1/…`：`api/client.ts`、`lib/repo.ts`、`lib/voice.ts`、`lib/search.ts`、`lib/music.ts`）。
纯静态构建用 `VITE_STATIC_ONLY=true`（`npm run build:web:static`）把 `/api` 这条路主动关掉：
`lib/deploy.ts` 的 `STATIC_ONLY` 会让 bootstrap 不挂搜索、不同步、不读接入状态，`repo.ts` 的 push/flush 直接只留本地。

| 形态 | 语音 / 搜索推送 | 说明 |
| --- | --- | --- |
| 纯静态托管（GitHub Pages 等） | ❌ | 页面和本地引擎能开；没有进程能拿 Key 去调 MiniMax / 博查。静态构建不请求 `/api`，不会显示成「后端坏了」 |
| `npm start` 单进程（dist + API 同端口） | ✅ | `dev-server.mjs` 里的 `serveStatic`：dist 存在就托管，非 `/api/` 的 GET 走静态，找不到回落 `index.html` |
| 静态 + 反代 `/api` | ✅ | 前端域名下要有 `/api`；跨域则后端设 `WEB_ORIGIN`（CORS 白名单） |

`serveStatic` 的两个细节：`index.html` 发 `no-cache`（发版立刻生效），带 hash 的 `assets/` 与字体发一年 `immutable`；
路径先 `resolve` 再校验前缀，挡 `../` 穿越。

仓库里的三个配方：`render.yaml`（Blueprint：`npm install && npm run build:web` → `npm start`，免费实例无持久盘）、
`.github/workflows/deploy-pages.yml`（GitHub Pages 静态版；`VITE_STATIC_ONLY=true` + `VITE_BASE_PATH=/linian/`）
与 `Dockerfile`（多阶段；运行阶段只拷 `apps/server/*.mjs` + `dist` —— 后端零依赖，镜像里没有 `node_modules`）。
`.dockerignore` 挡住 `.data` / `.env`，Key 不会被打进镜像。

> 单用户红线：后端固定会话 `c_1`，没有登录。地址发给别人 = 共用同一份数据（聊天 / 字卡 / 接入配置）。

### 5.2 手写体：本地 92 片 unicode-range 子集

信箱里的蓝色批注是 `font-hand`（`'Ma Shan Zheng'`）。原来挂 `fonts.googleapis.com`，国内手机常加载不出来 → 退化成楷体。
现在用 `apps/web/scripts/fetch-hand-font.mjs`（`npm run font`）抓成 `public/fonts/mashanzheng/*.woff2` +
生成 `src/styles/hand-font.css`（92 条 `@font-face`，脚本产物，别手改）。

- 为什么切片而不是一个 4MB 的 TTF：浏览器只下载页面真用到的那几片（实测首页只拉 2 片），首屏省流量。
- 实测：`document.fonts` 里 92 条 face、命中即 `loaded`；同一串拉丁文，手写体 185.54px vs 衬线 277.17px → 确实生效。
- 授权 SIL OFL 1.1（同目录 `OFL.txt`），可商用可再分发。

### 5.3 换设备不覆盖卡库

`loadCardsLocal()` 在本地没存过卡时返回 `defaultCards()`（**每次生成的新 id**）。早先 `bootstrap()` 会马上 `seedIfEmpty()` 落库，
于是手机第一次打开（新域名 = 空 IndexedDB）时，这套预设卡会整包 `PUT /cards` 上去，把服务端已有的卡库覆盖掉
（`useCount`、自定义卡、拾取卡全没了）。

现在：本地阶段只把预设放进内存；`syncFromRemote()` 拉到远端卡库就以远端为准，
**只有远端也没有卡库**时才 `seedIfEmpty({ remoteChecked: true })`。`seedIfEmpty` 自己也留了一道保险 ——
没传 `remoteChecked` 会先 `pullCards()` 再看一眼。

### 5.4 备份：导出 / 导入（`lib/backup.ts` + `screens/settings/DataScreen.tsx`）

一份全量 JSON（`linian-backup-YYYYMMDD-HHmm.json`）：`{ app, kind, version, exportedAt, counts, state, rules, cards, messages }`。

| 数据 | 导入时的语义 |
| --- | --- |
| `messages` | 按 `id` **合并**（只补本地没有的；`SENDING` 归位成 `SENT`） |
| `cards` | 按 `hash` **合并**（同内容只留一张，保留本地那张的 useCount） |
| `state` / `rules` | **整包覆盖**（备份就是快照） |

- 写入顺序：先本地（界面立刻可用）→ 再 `push` 后端；推不上进 outbox。
- 最后再 `pullMessages()` 并一次，避免「另一端在导出后又聊了两句，导入后界面看着变少」。
- **不含 Key / 声音 ID / 音色**：`state` 本来就没有 `integrations`，备份里扫不到 `sk-` / `apiKey`；
  本机音频、视频、书的正文本体（IndexedDB Blob）也不在备份里。
- 空后端实测：导入 31 条 → 新增 31、52 张卡全部判重、规则恢复；重复导入 → 新增 0（幂等）。
- 备份里会带上这两轮新加的状态：`appearance.homeNote` / `appearance.photos`（主界面那句话与照片墙）、
  `state.emotionTags`（自定义情绪 / 意图标签）、`anniversaries[].bg`（纪念日卡片背景图）。
  解析老备份（没有这些字段）时用默认值补齐，不会把本机已经摆好的照片墙冲掉
  （`repo.ts#mergeAppearance` / `backup.ts#parseBackup`）。

### 5.5 浮层：跨页面不中断的通话与音乐

两个浮层都挂在 `App.tsx` 的同一层（手机壳内、页面栈之上），所以切屏不会卸载它们：

| 浮层 | 组件 | 数据/状态 | 说明 |
| --- | --- | --- | --- |
| 通话（全屏 + 小窗） | `components/chat/CallOverlay.tsx` | `store/useCallStore.ts`（只存 UI 阶段） | 通话结果仍是一条 `CALL_EVENT` 消息；小窗只是 `minimized: true` |
| 音乐小窗 | `components/music/MusicMiniPlayer.tsx` | `lib/audio.ts` 单例 + `store/useUIStore.ts` | 开关只存本机 `localStorage`，不随 `state` 同步 |

- **自动收小窗**：屏幕从 `chat` 切走时把通话收成小窗；只在「屏幕真的变了」时触发，否则从小窗点开会被
  立刻收回（`CallOverlay` 里用 `prevScreen` 记录上一屏）。
- **音乐不停**：`MusicRoomScreen` 卸载时只 `leaveRoomScreen()`（补时长），不再 `pause()`；声音交给小窗。
- **保活**：`lib/keepAlive.ts`。Wake Lock + 静音音频会话 + Media Session + `Date.now()` 补齐时长。
  这是网页端的上限；系统回收标签页之后无法恢复（要原生前台服务），界面与文档都不承诺做不到的事。
- **锁屏播控**：通话绑 `hangup/stop/pause`，音乐绑 `play/pause/next/prev/stop`；音乐停了会 `clearMedia()`，
  但只清「之前确实有过音乐」的情况，避免把正在通话的锁屏信息清掉。
