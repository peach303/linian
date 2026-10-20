# 黎念 LiNian · 字卡传讯 & 梦角陪伴

> 一个「小手机 OS」形态的互动网站：用字卡与虚构角色（梦角）传讯、写朋友圈、通信、一起听歌。
> 视觉：浅蓝 + 白，高度仿微信交互；底部五个入口（聊天 / 朋友圈 / 信箱 / 功能 / 设置）常驻，桌面是手机外壳、手机上是全屏 App。

---

## 1. 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 前端框架 | **React 18 + TypeScript + Vite** | 手机外壳是纯 UI 容器，SPA 体验最贴近「OS」 |
| 样式 | **Tailwind CSS 3** + CSS Variables | 主题色通过 CSS 变量切换，支持无限配色 |
| 状态 | **Zustand**（本地 UI 态）+ **TanStack Query**（服务端态） | 聊天流用 Zustand + WebSocket 增量合并 |
| 路由 | **React Router 6**（`MemoryRouter`） | 模拟 App 内栈式导航，保留「返回」动效 |
| 动效 | **Framer Motion** | 页面推入/推出、消息气泡入场 |
| 实时 | **Socket.IO** | 模拟打字、语音、通话、陪伴、观影室同步 |
| 后端 | **NestJS（Node 20+）** | 模块化，天然适配「模块化一坨功能」 |
| ORM | **Prisma** | 见 `packages/db/schema.prisma` |
| 主库 | **PostgreSQL 16** | 关系数据 + `JSONB` 存规则配置 |
| 缓存/队列 | **Redis + BullMQ** | 主动发消息定时器、回复延迟调度、冷却计数 |
| 对象存储 | **S3 兼容（MinIO / 阿里云 OSS）** | 头像、表情包、信纸、礼物图、陪伴背景视频 |
| AI 编排 | **LLM Provider 适配层**（OpenAI / DeepSeek / 通义 / 自建） | 字卡拼接、拼音造句、歌词抽取、情绪分析 |
| 语音 | **MiniMax T2A / Speech API** | 已接通：设置页（或 `.env`）填 Key → 命中时后端代理合成，音频存进消息 |
| 搜索 | **搜索适配层**（Bing / SerpAPI / RSS） | 联网抓取后推送新闻/链接到聊天 |
| 部署 | Docker Compose（web / server / pg / redis / minio） | |

---

## 2. 目录树（按模块划分）

```
传讯/
├─ README.md
├─ .env.example
├─ package.json                     # npm workspaces 根（dev:api / start / build:web / font / icons / pack:public）
├─ docker-compose.yml
├─ Dockerfile                       # ★ 一个容器同时出页面 + API（手机要的语音/推送全靠它）
├─ render.yaml                      # ★ Render Blueprint：仓库连上去就有能用的链接
├─ .dockerignore                    # ★ 挡掉 .data / .env / node_modules / dist（别把 Key 打进镜像）
├─ scripts/
│  └─ make-public-copy.mjs          # ★ 传 GitHub 前打一份干净副本（去掉 .data / .env / 构建产物，并复查没有 Key）
├─ docs/
│  ├─ architecture.md               # 分层架构 & 数据流
│  ├─ rule-engine.md                # 概率调节引擎（深度拟真）全量字段
│  └─ modules.md                    # 18 个功能模块清单与状态机
│
├─ packages/
│  ├─ shared/                       # 前后端共享：类型 + zod 校验 + 常量
│  │  └─ src/
│  │     ├─ types/                  # Message / Card / RuleConfig ...
│  │     ├─ schema/                 # zod：ruleConfigSchema、cardSchema
│  │     └─ constants/              # 卡片类型、情绪标签、主题预设
│  └─ db/
│     ├─ schema.prisma              # 数据库 Schema（见 §3）
│     └─ seed.ts
│
└─ apps/
   ├─ web/                          # 前端
   │  ├─ index.html                 # ★ viewport / PWA meta / theme-color（手机全屏）
   │  ├─ public/
   │  │  ├─ manifest.webmanifest    # ★ 装到桌面的清单（standalone / 竖屏 / 图标）
   │  │  ├─ icons/                  # ★ PWA 图标（192 / 512 / maskable / apple-touch）
   │  │  └─ fonts/mashanzheng/      # ★ 手写体「马善政」92 片 woff2（断网也能显示）
   │  ├─ scripts/make-icons.mjs     # ★ 图标是怎么来的：零依赖 PNG 生成器（`npm run icons`）
   │  ├─ scripts/fetch-hand-font.mjs# ★ 手写体怎么来的：抓 Google Fonts 并按 unicode-range 切片（`npm run font`）
   │  └─ src/
   │     ├─ main.tsx  App.tsx                       # 路由骨架
   │     ├─ styles/index.css                        # Tailwind + 主题变量 + ★「手机适配」全屏段
   │     ├─ styles/hand-font.css                    # ★ 92 条 @font-face（脚本生成，别手改）
   │     ├─ types/index.ts  types/appearance.ts  types/rules.ts
   │     ├─ lib/
   │     │  ├─ theme.ts                             # 配色预设（可改配色）
   │     │  ├─ time.ts                              # 纪念日 / 时间差计算
   │     │  ├─ appearance.ts                        # ★ 美化：预设资源 + 写入 CSS 变量
   │     │  ├─ entries.ts                           # 主界面五大入口定义
   │     │  ├─ db.ts                                # ★ 本地存储：IndexedDB（kv/messages/outbox）
   │     │  ├─ repo.ts                              # ★ 数据仓库：本地优先 + 离线补发队列
   │     │  ├─ rules.ts                             # ★ 概率字段元数据（133 项 / 12 组）
   │     │  ├─ pats.ts                              # ★ 拍一拍库：预设后缀 + 抽签取值 + 整句拼装
   │     │  ├─ music.ts                             # ★ 一起听：歌单 / 网易云 id 解析 / 播放方式判定
   │     │  ├─ audio.ts                             # ★ 真播放器（`<audio>` 单例：load/play/seek/音量）
   │     │  ├─ voice.ts                             # ★ MiniMax 语音：音色表 / 合成 / 缓存 / 接入读写
   │     │  ├─ voiceFav.ts                          # ★ 语音收藏：收藏一段语音 / 变成语音字卡 / 解绑 / 删除
   │     │  ├─ companion.ts                         # ★ 陪伴：模式预设（睡觉/学习/工作）+ 时长格式化 + 统计现值
   │     │  ├─ stats.ts                             # ★ 统计 / 适应度：全都从真实记录现算（按轮切对话 / 抽到的卡 / 高频词粗切）
   │     │  ├─ watch.ts                             # ★ 观影室：B 站 bvid 解析 / 片源判定（本机·直链·B站·只有片名）/ 封面 / 时长
   │     │  ├─ videoEl.ts                           # ★ 真播放器（`<video>` 单例：真播放 / 真进度 / 真 seek / 本机 Blob）
   │     │  ├─ read.ts                              # ★ 阅读室：书源判定（本机·粘贴·只有书名）/ txt·md·html·epub 解析成段落 / 封面 / 字数
   │     │  ├─ diary.ts                             # ★ 日记：日期口径（归属日期）/ 心情表 / 今天真发生过什么（从聊天与记录里数）
   │     │  ├─ world.ts                             # ★ 世界感知：他那边的钟点真换算（时差是你设的）/ 时段分池的状态与「正在做的事」（抽的）
   │     │  ├─ check.ts                             # ★ 查岗：冷却（现算）/ 报告的「真的」那栏从本机记录现算 / 定位与手机屏是抽的
   │     │  ├─ integrations.ts                      # ★ 引擎可用的接入开关（INTEGRATIONS：tts / search / llm）
   │     │  ├─ backup.ts                            # ★ 导入 / 导出：全量 JSON 打包、解析、合并去重（不含 Key）
   │     │  ├─ keepAlive.ts                         # ★ 通话的「尽力保活」：Wake Lock / 静音音频会话 / 锁屏挂断 + 为什么网页做不到系统级保活
   │     │  ├─ gifts.ts                              # 礼物预设（礼物柜）
   │     │  ├─ ids.ts                               # 本地 id 生成（动态 / 信件 / 评论 / 批注）
   │     │  ├─ simulate.ts                          # ★ 前端抽签链路模拟（概率引擎预览）
   │     │  ├─ engine/                              # ★ 拟真引擎（本机出稿，离线可用）
   │     │  │  ├─ planner.ts                        # 抽签：规则+字卡+我的上一句 → 要发哪几条（reply / proactive 两种模式）
   │     │  │  ├─ compose.ts                        # 自由组句 / 连词 / 标点 / 拼音 / 情绪打标（本地兜底）
   │     │  │  ├─ proactive.ts                      # ★ 主动消息：间隔抽签 / 每日额度 / 免打扰 / 被打断窗口（纯计算）
   │     │  │  ├─ timeline.ts                       # ★ 朋友圈 / 信箱排程：发动态、点赞评论、写信回信、蓝笔批注
   │     │  │  ├─ content.ts                        # ★ 朋友圈 / 信件内容生成（无 LLM 时：模板 + 他的字卡库）
   │     │  │  ├─ seed.ts                           # ★ 带种子的伪随机（让「他的行为」可复现，刷新不重掷）
   │     │  │  ├─ room.ts                           # ★ 一起听房间排程（他进房间 / 聊一句 / 加歌 / 先走 + 真实秒数）
   │     │  │  ├─ companion.ts                      # ★ 陪伴排程（他到场 / 中途说话 / 先走 / 到点收尾，按真实时间）
   │     │  │  ├─ watch.ts                          # ★ 观影室排程（到场 / 排这一场弹幕 / 按进度说一句 / 先走 / 房间回话）
   │     │  │  ├─ read.ts                           # ★ 阅读室排程（读秒是真的 / 到场那一刻排完这一本批注 / 按段落进度说一句 / 先走 / 房间回话）
   │     │  │  ├─ diary.ts                          # ★ 日记排程（他每天最多自动一条：到点写不写 / 提不提今天真事 / 顺着我的留言写）
   │     │  │  ├─ world.ts                          # ★ 世界感知排程（到点采一条 / 种子 = 日期 + 采样槽 / 顺手在聊天里说一句）
   │     │  │  ├─ check.ts                          # ★ 查岗（我发起 → 他 3~12 秒回；报告分「真的 / 抽的」；他每天最多来查你 N 次，N 可调 1~5）
   │     │  │  └─ runtime.ts                        # 排程：延迟、正在输入、撤回、语音合成、落库 + 主动消息定时器
   │     ├─ store/
   │     │  ├─ bootstrap.ts                         # ★ 启动引导：本地 → 渲染 → 后台拉远端
   │     │  ├─ useAppStore.ts                       # 手机 OS 状态：当前屏、主题、形象、纪念日、一起听房间、陪伴
   │     │  ├─ useAppearanceStore.ts                # ★ 美化配置（图标/背景/相框/气泡）
   │     │  ├─ useChatStore.ts                      # 会话、消息、输入态、打字中（写入即落库）
   │     │  ├─ useCardsStore.ts                     # 字卡库（本地优先 + 整包推送）
   │     │  ├─ useIntegrationsStore.ts              # ★ 接入状态（MiniMax Key 读回后同步给引擎，只拿尾号）
   │     │  └─ useRulesStore.ts                     # 概率草稿 / 版本 / 保存
   │     ├─ api/                                    # TanStack Query hooks
   │     ├─ components/
   │     │  ├─ phone/         PhoneShell（★ 桌面=小手机 / 手机=全屏）/ StatusBar（真机全屏时隐藏）
   │     │  ├─ common/        Avatar / NavBar / PromptSheet（改一行字的弹层）
   │     │  ├─ music/         MusicMiniPlayer（★ 音乐悬浮窗：离开页面继续放 / 可关 / 锁屏播控）
   │     │  └─ chat/          MessageBubble（含已读 / 已读不回角标）/ ChatInputBar
   │     │                    / CallOverlay（★ 通话：全屏 + 收起小窗，挂在 App 上跨页面不中断）
   │     │                    / ExtendPanel（含 9 个子面板）/ TypingIndicator
   │     │                    / MessageActionSheet（长按菜单 + 看抽签）
   │     │                    / PatPanel（★ 拍一拍库：我的 / 他的）
   │     │                    / VoiceBubble（★ 语音气泡：真播放 / 转文字）
   │     │                    / VoiceRecorderButton（★ 按住说话，MediaRecorder）
   │     │                    / messageStyles（微信气泡尾巴）
   │     ├─ screens/
   │     │  ├─ HomeScreen.tsx                       # ★ 小手机主界面（已完成）
   │     │  ├─ chat/ChatScreen.tsx                  # ★ 聊天界面（已完成）
   │     │  ├─ moments/MomentsScreen.tsx            # ★ 朋友圈（完成：双方发动态 + 点赞 + 评论）
   │     │  ├─ mailbox/MailboxScreen.tsx            # ★ 信箱（完成：写信 / 回信 / 蓝色手写批注）
   │     │  ├─ cards/CardLibraryScreen.tsx          # ★ 字卡库（已完成）
   │     │  ├─ hub/HubScreen.tsx                    # 功能 Hub
   │     │  ├─ hub/GiftCabinetScreen.tsx            # ★ 礼物柜（已完成）
   │     │  ├─ hub/MusicRoomScreen.tsx              # ★ 一起听（真播放器 + 歌单 + 房间对话）
   │     │  ├─ hub/VoiceFavoritesScreen.tsx         # ★ 收藏 ⭐（我收藏的 / 他收藏我的；聊天 / 字卡 / 推送 / 语音 / 信件 / 朋友圈分类；语音可转语音卡）
   │     │  ├─ hub/SurveyScreen.tsx                  # ★ 问卷 📋（题库 / 文本与 JSON 导入 / 他挑一套来问我 / 默契问卷与默契度）
   │     │  ├─ hub/CompanionScreen.tsx               # ★ 陪伴 🌙（睡觉 / 学习 / 工作：真计时 + 他到场/说话/先走）
   │     │  ├─ hub/StatsScreen.tsx                   # ★ 统计 📊（消息 / 通话 / 红包 / 一起听 / 陪伴 / 高频词，全部现算）
   │     │  ├─ hub/FitnessScreen.tsx                 # ★ 适应度 🧭（他抽过我哪些卡 · 配置 vs 实际 · 拾取 · 说话习惯）
   │     │  ├─ hub/WatchRoomScreen.tsx               # ★ 观影室 🎬（片单 + 房间：真播放器 / 弹幕按真实进度飘 / 房间对话）
   │     │  ├─ hub/ReadRoomScreen.tsx                # ★ 阅读室 📖（书单 + 阅读器：段落分页 / 页边批注锚到那一段 / 房间对话）
   │     │  ├─ hub/DiaryScreen.tsx                   # ★ 日记 📔（公开 / 私密；私密 30% 概率被他破解；历史上的每一天）
   │     │  ├─ hub/WorldScreen.tsx                   # ★ 世界感知 🌍（他那边几点 / 时差设置 / 采样记录）
   │     │  ├─ hub/CheckScreen.tsx                   # ★ 查岗 🔍（发起 / 冷却 / 报告分「真的 · 抽的」两栏 / 他来问你）
   │     │  ├─ hub/AnniversaryScreen.tsx             # ★ 纪念日 💙（增删改 / 每年重复 / 上主界面 / 卡片背景图）
   │     │  ├─ hub/EmotionScreen.tsx                 # ★ 情绪意图 🏷️（内置标签开关 / 自定义标签 + 触发词 / 用过几次）
   │     │  └─ settings/
   │     │     ├─ SettingsScreen.tsx                # 设置首页（含「美化」「接口与扩展」入口）
   │     │     ├─ RuleEngineScreen.tsx              # ★ 概率调节引擎（已完成）
   │     │     │  ↑ 元数据驱动：lib/rules.ts(RULE_GROUPS) + components/settings/controls.tsx
   │     │     │  ↑ 抽签模拟：lib/simulate.ts + store/useRulesStore.ts
   │     │     ├─ AppearanceScreen.tsx              # ★ 美化（已完成）
   │     │     │  ↑ 应用图标 / 主界面背景 / 照片墙与那句话 / 聊天背景 / 气泡样式（含导入 CSS） / 五大入口图标
   │     │     ├─ IntegrationScreen.tsx             # ★ 接入（MiniMax 语音 Key / 配置 / 测试发音 / 引擎开关）
   │     │     └─ DataScreen.tsx                    # ★ 导入 / 导出（全量 JSON 备份 · 换设备搬家）
   │     └─ mock/                                   # 本地假数据（无记录时的演示会话）
   │
   └─ server/                       # 后端
      ├─ dev-server.mjs             # ★ 零依赖开发后端（JSON 文件持久化，可无 Postgres 跑通；含 /integrations、/voice/tts、/music/resolve、/search、/image 代理；★ dist 存在时顺便托管前端 → 手机一个地址全通）
      ├─ bocha.mjs                  # 博查封装 + 归一化（webPages / images / videos 三个容器都读；videos 实测恒空）
      ├─ media.mjs                  # 搜索结果的形态判定 + 图片验证（真取一遍才作数，**只验证不生成**）
      └─ src/
         ├─ main.ts
         ├─ modules/
         │  ├─ auth/ user/ couple/                   # 用户 & 关系
         │  ├─ chat/                                 # 会话/消息/已读
         │  ├─ cards/                                # 字卡库 CRUD + 查重 + 导入
         │  ├─ moments/  mailbox/  gift/  music/
         │  ├─ companion/  diary/  anniversary/  stats/  fitness/
         │  ├─ favorite/  checkphone/  room/         # 观影室/阅读室
         │  ├─ emotion/  pickup/  question/  redpacket/
         │  └─ rules/                                # 概率配置读写
         ├─ engine/                                  # ★ 拟真核心
         │  ├─ reply-engine.ts        # 回复编排：占比抽签 → 延迟 → 句数 → 撤回/引用/语音（多端权威顺序）
         │  │                          #   注意：联网搜索推送**不在**这条链上（它有自己的排程）
         │  ├─ proactive.module.ts    # 主动消息调度（BullMQ，多端用；本机版已实现，见 web 的 lib/engine/proactive.ts）
         │  ├─ timeline.module.ts     # 待实现：朋友圈 / 信箱排程（本机版已见 web 的 lib/engine/timeline.ts）
         │  ├─ card-mixer.ts          # 待实现：多字卡拼接 / 自由组句（本机版本已见 web 的 lib/engine/compose.ts）
         │  ├─ pinyin.ts              # 多端版未实现：完整拼音拼句；本机版已在 web/lib/engine/compose.ts 真实现（默认关闭）
         │  └─ emotion.ts             # 待实现：情绪/意图打标（本机用关键词兜底）
         ├─ integrations/
         │  ├─ llm/                   # LLM 适配层（字卡拼接/造句/歌词/情绪）
         │  ├─ minimax/               # 语音合成
         │  ├─ search/                # 联网搜索推送
         │  └─ storage/
         ├─ realtime/                 # Socket.IO 网关
         └─ common/                   # 守卫、拦截器、prisma 服务
```

---

## 3. 核心数据表

完整定义见 `packages/db/schema.prisma`，摘要：

| 域 | 表 |
| --- | --- |
| 用户关系 | `users` `couples` `couple_members` `anniversaries` |
| 字卡 | `card_decks`（牌组）`cards` `emotion_tags` `card_tag_links` `pickup_logs` |
| 聊天 | `conversations` `messages` `message_cards` `reads` `call_records` `red_packets` |
| 互动卡片 | `questions` `question_options` `question_answers` `choices` `doodles` `gifts` `gift_orders` |
| 朋友圈 | `moments` `moment_media` `moment_likes` `moment_comments` |
| 信箱 | `letters` `letter_annotations` |
| 功能 | `music_sessions` `companion_sessions` `diary_entries` `watch_rooms` `watch_room_items` `watch_danmaku` `read_rooms` `check_requests` `search_pushes` `favorites` `world_sense_logs` |
| 分析 | `word_stats` `fitness_scores` `usage_events` |
| 引擎 | `rule_configs` `integration_configs` `proactive_jobs` |

关键设计点：
1. **`messages.payload JSONB`**：一条消息可承载文字/字卡/语音/红包/礼物/问卷等任意载荷，避免宽表爆炸。
2. **`messages.latency_ms` + `plan`**：记录引擎抽签结果（用了哪张卡、延迟多少），使「拟真」可复盘、可调参。
3. **`rule_configs.data JSONB` + `version`**：所有概率项集中一个版本化 JSON，由 `zod` 校验，改规则即新增版本，便于回滚。
4. **`cards` 有三来源**：`SYSTEM`（AI 生成预设，可开关/调权重、禁自由造句）、`CUSTOM`（全类型）、`PICKED`（拾取我说过的话）。
5. **`cards.embedding`**：预留向量列，自动查重（当前前端用 Dice 二元组相似度，阈值 0.85）。

---

## 4. 快速开始

```bash
npm install                 # 已在本机验证：npm install --workspace @linian/web

# ① 零依赖开发后端（推荐先跑这个：不需要 Postgres / Redis）
npm run dev:api             # http://localhost:3001/api/v1  ← 数据落 apps/server/.data/db.json
# ② 前端
npm run dev:web             # http://localhost:5173  ← 主界面 / 聊天 / 设置 / 概率引擎 / 美化

# 想用「一个地址」给手机跑（语音 / 搜索推送也能通）
npm run build:web           # 构建到 apps/web/dist
npm start                   # http://localhost:3001/  ← 前端 + /api 同一个端口（详见下一节）

# 生产后端（可选，与 dev:api 同一套 REST 契约）
docker compose up -d pg redis minio
npm run dev:server          # NestJS + Prisma
```

URL hash 可直达任意屏幕，方便调试：`#home` `#chat` `#settings` `#rule-engine` `#appearance` `#card-library`。

数据库（生产路径）：

```bash
cd packages/db
# 建议为 packages/db 建 package.json（name: @linian/db，scripts.push = prisma db push）
npx prisma db push
npx prisma studio
```

> 前端在无后端时读取 `apps/web/src/mock`，**主界面与聊天界面可直接跑起来看效果**。
> 已验证：`tsc -p apps/web/tsconfig.json` 零错误，`vite build` 成功产出 `apps/web/dist`。
> 若 npm 提示 `install-scripts not yet covered by allowScripts`，对 esbuild 执行 `npm install-scripts approve esbuild`。

### 手机上用：全屏 + 装到桌面（PWA）

同一套代码，两种形态自动切换，不用改配置：

| 打开方式 | 看到的 |
| --- | --- |
| 电脑浏览器（宽 > 520px） | 屏幕中间一台 390×844 的小手机：圆角机身、刘海、假状态栏、Home Indicator |
| 手机浏览器（宽 ≤ 520px） | **全屏**：外壳拆掉，去掉圆角 / 阴影 / 刘海 / 假状态栏，铺满整屏 |
| 手机桌面图标（standalone） | 同上，而且没有浏览器地址栏，和原生 App 一样 |

- 判定在 `apps/web/src/styles/index.css` 的「手机适配」段；外壳的挂钩 class（`phone-stage` / `phone-body` / `phone-screen` / `phone-notch` / `phone-home`）在 `components/phone/PhoneShell.tsx`。
- 安全区（刘海 / 挖孔 / 手势条）走 `env(safe-area-inset-*)`：**标题栏自己长高填自己的底色**、滚动区底部留白、从底部升起的面板统一垫高 —— 这样刘海下面不会出现一条颜色不一样的接缝。
- 键盘：viewport 带 `interactive-widget=resizes-content`（Android 键盘把视口一起顶小）；iOS 那种浮层键盘用 `visualViewport` 的差值给外壳补 `padding-bottom`，输入框不会被盖住。
- 手势：关了双击缩放 / 点按蓝框 / 橡皮筋（`user-scalable=no`、`-webkit-tap-highlight-color`、`overscroll-behavior`）。
- 返回键：屏栈会镜像到浏览器历史（`App.tsx` 的 `useSystemBack`）—— 安卓的返回键 / 返回手势是**退一屏**，在主界面才退出应用；地址栏 hash 也跟着当前屏走，刷新留在原地、也能当深链用。
- 图标：`apps/web/public/icons/*.png` 由 `npm run icons` 现画（零依赖 PNG 编码器：蓝底 + 白气泡 + 三个点）。想换形状改 `apps/web/scripts/make-icons.mjs` 再跑一次。
- 系统状态栏颜色（`<meta name="theme-color">`）跟着 App 主题实时变，深夜蓝主题下自动变深色。

**装到桌面**：手机浏览器打开链接 → 菜单 → 「添加到主屏幕 / 添加到桌面」→ 桌面出现「黎念」→ 点开就是全屏、没有地址栏。

> 手写体：信箱里那条蓝色批注用的「马善政」已经**打包进仓库**（`apps/web/public/fonts/mashanzheng/`，92 片 unicode-range 子集，浏览器只下用到的那几片）。
> 原来挂的是 fonts.googleapis.com，国内手机上经常加载不出来会退化成楷体 —— 现在断网也能显示。想重新抓：`npm run font`。

### 手机上要用语音 / 联网搜索：让 App 和 API 在同一个地址

先说结论，免得白折腾：

| 你打算怎么放 | 语音（TTS） | 联网搜索推送 | 原因 |
| --- | --- | --- | --- |
| **GitHub Pages 静态版（`npm run build:web:static`）** | ❌ | ❌ | 页面和本地引擎都能用，但静态托管只有文件，没有进程能替你拿 Key 去调 MiniMax / 博查；这个构建会主动不连 `/api` |
| **任意静态托管 + 自己的 `/api` 反代** | ✅ | ✅ | 前端可以放静态托管，但域名下必须有 `/api` 指向一台真的在跑的后端 |
| 自己电脑跑后端 + 手机连同一个 Wi-Fi | ✅ | ✅ | 手机访问 `http://<电脑IP>:3001/` 就行，见下 |
| 一台云服务器 / NAS / 能跑 Node 的容器 | ✅ | ✅ | 同一个地址同时出前端和 API，最省事 |
| 内网穿透（cloudflared / ngrok） | ✅ | ✅ | 电脑上照常跑，隧道给个公网地址；关电脑就没了 |

**最省事的一条路（单进程，一个地址）**：

```bash
npm run build:web      # 构建前端到 apps/web/dist
npm start              # 起后端；dist 存在就顺手一起托管
```

- 电脑上开：`http://localhost:3001/`
- 手机上开：`http://<这台电脑的局域网 IP>:3001/`（同一个 Wi-Fi；**电脑得一直开着**；防火墙放行 3001）
- 这时前端和 `/api` **同源**，语音、语音卡、搜索推送、图片代理全都不用跨域，Key 也始终只在后端。

> 端口想换：`PORT=8080 npm start`。想跨域部署（前端在 Vercel、后端在别处）：启动后端时设 `WEB_ORIGIN=https://你的前端域名`（CORS 白名单），并且前端那边要能把 `/api` 反代到后端。

> ⚠️ 现在这套后端是**单用户**的（会话固定 `c_1`，没有登录）：把地址发给别人，人家和你共用同一份聊天记录 / 字卡库 / 接入配置。自己用、或者只发给信任的人；要公开就得先加多用户。

> 换设备不怕丢卡库：全新设备第一次打开会先拉远端卡库，只有「本地和服务端都没有」时才落预设卡（以前会拿内存里的预设整包覆盖上去，把 useCount 和自定义卡清掉）。

### 把 GitHub 仓库变成「能用的链接」：三条现成的路

仓库里已经准备好三个部署配方，**不用改代码**：

**① Render（有免费额度，最接近「传上去就有链接」）**

1. 先 `npm run pack:public`，把 `../linian-public` 里的东西推到 GitHub（别带 Key）。
2. 打开 [render.com](https://render.com) → New → **Blueprint** → 选这个仓库 → Apply。
3. 它按 `render.yaml` 建服务（`npm install && npm run build:web` → `npm start`），给你一个
   `https://linian-xxxx.onrender.com`：页面和 `/api` 同一个域名，**手机打开就能用语音和联网推送**。
   **部署完之后电脑可以关机**，手机用流量也能开（局域网那种才要求电脑一直开着、同一个 Wi-Fi）。
4. 第一次打开去「设置 → 接入」填你自己的两个 Key（Key 只进那个实例的 `.data`）；
   也可以直接在 Render 的 Environment 里填（见下面「Key / 声音 ID 到底放在哪」）。

> 免费实例：15 分钟没人访问会休眠，冷启动几十秒；**没有持久盘**，重新部署会清空服务端数据
>（手机本地那份聊天还在，打开会自动补回去）。要长期保存就换付费 plan，按 `render.yaml` 里注释的那段挂盘。
>
> 新部署是空库，**旧记录不会自己跟过去**：在旧地址「设置 → 数据 → 导出备份」，到新地址导入一次即可
>（见下面「备份 / 换设备搬家」）。

**② GitHub Pages（免卡、纯静态，最省事）**

仓库里带了 `.github/workflows/deploy-pages.yml` 和 `npm run build:web:static`。它会构建一份**不连后端**的静态站：
聊天、字卡、日记、朋友圈、信箱、功能、陪伴这些本地引擎照常跑；语音合成、联网搜索推送、跨设备同步不会假装能用。

1. 把仓库推到 GitHub 的 `main` 分支。
2. 打开仓库 → Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。
3. 回到 Actions 看 `Deploy static site to GitHub Pages` 跑完，地址是
   `https://peach303.github.io/linian/`（仓库名不是 `linian` 时，把 workflow 里的 `VITE_BASE_PATH` 改成 `/你的仓库名/`）。
4. 不用绑卡，不用开电脑，也没有服务端 `.data`。聊天记录只存在当前浏览器（IndexedDB），
   换设备 / 清缓存前在「设置 → 数据 → 导出备份」留一份 JSON。

> GitHub Pages 在国内偶尔会慢或打不开，和代码无关；能打开 GitHub 一般就能打开它。
> 静态版没有 `APP_PASSWORD`：别人打开只会看到自己浏览器里的空白 / 演示数据，看不到你手机上的记录；
> 但页面本身是公开的。要连页面都锁，GitHub Pages 做不到，得再加 Cloudflare Access 之类的门。
> Key 不会进静态站 —— 也不该进。

**③ 自己的机器 / NAS / 云服务器（Docker）**

```bash
docker build -t linian .
docker run -d -p 3001:3001 -v linian-data:/app/apps/server/.data --name linian linian
# 手机开 http://<这台机器的IP>:3001/
```

镜像里**没有 node_modules**（后端只用 Node 内置模块），`.dockerignore` 也把 `.data` / `.env` 挡住了 ——
Key 只存在于你挂的那个卷里。

**静态版和完整版的区别**：静态版有链接、有本地聊天，但没有进程替你拿 Key 调 MiniMax / 博查，
`/api` 不会假装成功；完整版（Render / Docker / 自己电脑）才有语音和联网推送。
GitHub 本身只是存代码的地方，仓库链接是代码页，不是网站；Pages 才是把 `dist` 变成网站的那一层。

### 别人拿到链接会看到什么？（部署到公网前必看）

这套后端是**单用户**的：会话固定 `c_1`，没有账号体系。所以——

| 情况 | 别人能看到什么 |
| --- | --- |
| 局域网地址（`http://<电脑IP>:3001`） | 只有连你家 Wi-Fi 的设备能开；同一 Wi-Fi 下的人都能看到你的聊天 / 朋友圈 / 信件 |
| 公网链接且**没设密码** | 任何拿到链接的人都能看到同样这些，还能用你的 Key 合成语音（花你的钱）、改设置 |

所以加了一道门：`APP_PASSWORD`。

```bash
# 本机试（写进 apps/server/.env 也行，那一行是 KEY=VALUE）
APP_PASSWORD=你自己想的一串 npm start
```

- 设了以后，**页面、`/api`、字体、图片代理全部要登录**：手机第一次打开会弹浏览器自带的登录框，
  用户名随便填，密码就是 `APP_PASSWORD`；之后浏览器自己记着。
- 用的是标准 Basic Auth，不引入任何依赖；密码走 HTTPS 才安全（Render 默认就是 HTTPS）。
- 不设 = 裸奔，启动日志会打一行 ⚠️ 警告。
- 实测：无密码请求 → `401` + `WWW-Authenticate`；正确密码 → `200`；错误密码 → `401`。

`render.yaml` 里已经默认 `generateValue: true`：部署完去 Dashboard → Environment 抄那串密码，手机上填一次。

### Key / 声音 ID 到底放在哪（都不在代码里）

| 东西 | 存在哪 | 会不会到前端 |
| --- | --- | --- |
| MiniMax Key、GroupId、**你的声音 ID**、模型、语速 | 服务端：`apps/server/.data/db.json` 的 `integrations`，或部署平台的环境变量 | `/api/v1/integrations` 只回「配没配 + Key 尾号 + 当前声音 ID」（前端合成语音时要用）；没有 Key 明文 |
| 博查 Key | 同上 | 只回尾号 |
| 仓库源码 / `dist` / `pack:public` 副本 | —— | 扫过 `Zaynelishen`、groupId、Key 尾号：**0 处** |

- 前端那张音色表（`male-qn-qingse` 等）是 MiniMax 的**公共预置音色**，不是你的；
  你的自定义音色（克隆/复刻那个 ID）只在服务端。
- 部署时想再干净一点：把 Key 填进平台的环境变量
  （`MINIMAX_API_KEY` / `MINIMAX_GROUP_ID` / `MINIMAX_VOICE_ID` / `BOCHA_API_KEY`），
  别输进 App —— 那样 `.data` 里就只剩聊天记录。
- 有密码之后，「声音 ID 会被谁看到」也就只剩你自己了。


### 传到 GitHub 之前：别把 Key 带上

- 代码里**没有任何 Key**：MiniMax / 博查 的 Key 只在你本地的 `apps/server/.data/db.json`（「设置 → 接入」里填的）。
- `.gitignore` 已经挡掉 `node_modules/`、`dist/`、`.data/`、`.env`；但 **GitHub 网页版「拖文件夹上传」不读 .gitignore**。
- 所以用这个：`npm run pack:public` → 在 `../linian-public` 生成一份干净副本（不含 `.data` / `.env` / 构建产物），复制完**再扫一遍**：发现 `sk-` 开头的串直接报错，不让你传。
- 别人 clone 后跑起来，要在「设置 → 接入」里填**他们自己的** Key；Key 只留在**他们的**后端，前端拿到的一直只有尾号。

---

## 5. 本地保存与后端接入（本地优先 / local-first）

**聊天记录保存在本机**（IndexedDB），刷新、关浏览器都不丢；有后端时再同步上去。

```
写：本地 IndexedDB（立刻成功，离线也 OK） → 尝试推后端 → 失败进 outbox 队列 → 联网后自动补发
读：启动只读本地（秒开、不闪烁） → 渲染完成后后台拉远端 → 聊天记录**并集合并**（同 id 以远端为准，本地独有的保留）
```

> 聊天记录为什么是**并集**而不是覆盖：本地可能有还没推上去的（outbox 里）、远端可能有别的设备上发的。
> 同一条消息以远端为准（撤回 / 已读角标在那边更权威），本地独有的留下 —— 否则一联网就把刚发的话吞了。
> （`useChatStore.mergeMessages()`，见 `store/bootstrap.ts`）

| 存储区 | 内容 | 说明 |
| --- | --- | --- |
| `kv` | `state`（形象 / 纪念日 / 主题 / 美化）、`rules`、`rulesVersion`、`cards`、`cardsVersion` | 小对象，读起来快 |
| `messages` | 聊天记录 | 按 `[conversationId, createdAt]` 建复合索引，支持游标分页 |
| `outbox` | 待补发的请求 | 顺序补发，失败即停，避免乱序 |

> 为什么不用 localStorage：聊天记录很快就超过 5MB 上限；IndexedDB 容量按磁盘走。
> 隐私模式下 IndexedDB 不可用时自动回落到 localStorage（见 `lib/db.ts`）。

### 备份 / 换设备搬家（设置 → 数据 → 导入 / 导出，`#data`）

换手机、或者从一个部署地址换到另一个（本地 → Render），靠一份全量 JSON：

| 动作 | 包含什么 | 规则 |
| --- | --- | --- |
| **导出** | 聊天记录、字卡库、概率设置、昵称头像、纪念日、美化、朋友圈、信箱、日记、世界感知、陪伴/观影/阅读记录 | 纯本机读取，不碰网络；文件名 `linian-backup-YYYYMMDD-HHmm.json` |
| **导入** | 同上 | 聊天记录按 `id`、字卡按 `hash` **合并去重**（不会删掉你导入后新收的消息）；设置和规则**整包覆盖** |

- **不含 Key / 声音 ID**：接入配置不属于备份（有意为之），导出文件里扫不到 `sk-`、`apiKey`、你的音色 ID。换到新后端后去「设置 → 接入」再填一次即可。
- 也**不含**本机的音频 / 视频 / 书的正文本体（IndexedDB Blob），这些跟着设备走。
- 导入后立刻写本机 + 推后端；后端没连上就进离线队列，联网后由「立即同步到后端」补发。
- 实测（用一个空后端模拟新部署）：导入 31 条消息 → 新增 31 条、52 张字卡全部判重、规则恢复；再导入一次 → 新增 0 条（幂等）。
- 代码：`apps/web/src/lib/backup.ts`（打包 / 解析 / 合并）、`screens/settings/DataScreen.tsx`（界面）。


### REST 契约（`apps/server/dev-server.mjs` 与 NestJS 实现一致）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/health` | 健康检查（消息数 / 规则版本） |
| `GET` `PUT` | `/api/v1/state` | 设置 / 形象 / 纪念日 / 美化（PUT 传局部补丁） |
| `GET` `PUT` | `/api/v1/rules` | 概率配置；GET 返回 `{ version, data }`，PUT 版本 +1 |
| `GET` `PUT` | `/api/v1/cards` | 字卡库整包；GET 未存过卡时 `data: null`，PUT 全量替换并版本 +1 |
| `POST` | `/api/v1/cards/:id/use` | 引擎抽中一次（`useCount + 1`，供统计/权重衰减用） |
| `GET` `POST` | `/api/v1/conversations/:id/messages` | 聊天记录（POST 按 id 幂等 upsert） |
| `DELETE` | `/api/v1/conversations/:id/messages` | 清空该会话（「设置 → 清空聊天记录」会连后端一起清，否则下次启动又会并回来） |
| `POST` | `/api/v1/messages/:id/recall` | 撤回 |
| `GET` | `/api/v1/music/resolve?input=…` | 网易云分享链接 / 歌曲 id → `{ songId, title, artist, cover }`（**只有元信息**，音频不经过后端；短链 163cn.tv 会在服务端跟跳转） |
| `GET` `PUT` | `/api/v1/integrations` | 接入状态 / 写入 Key。**GET 只回「配没配 + Key 尾号」**，明文永远不出后端 |
| `POST` | `/api/v1/voice/tts` | MiniMax 语音合成代理（`{ text, voiceId?, model?, speed?, emotion? }` → `audio/mpeg` 字节；响应头带 `X-Audio-Duration-Ms`） |
| `POST` | `/api/v1/search` | 联网搜索代理（`{ query, count?, freshness?, enrich? }`）。`enrich: true` 顺带给首条备素材 → 回 `media: { video, pics[] }`；**搜不到就回 `ok:false` + 原因，绝不编一条** |
| `GET` | `/api/v1/image?u=<b64url>&ref=<b64url>` | 图片代理（有些图浏览器直连被防盗链挡）：服务端代取 + 落盘缓存 `apps/server/.data/images/` |

前端相关实现：`lib/db.ts`（存储）、`lib/repo.ts`（仓库 + 同步队列）、`store/bootstrap.ts`（启动引导）。
换设备 / 搬家：`lib/backup.ts` + `screens/settings/DataScreen.tsx`（见上面「备份 / 换设备搬家」）。
设置 → 数据 里可以看记录条数、手动「立即同步到后端」、清空聊天记录。

### 字卡库（设置 → 字卡库，`#card-library`）

字卡的抽取是**三层概率**，改哪一层都立刻在列表上看到「综合命中率」：

```
① 类型占比   概率引擎 chat.weights（文字 / 颜文字 / 表情包 / 图片）→ 归一化，和为 100%
② 卡内权重   每张卡的 weight，同「占比池」内归一化（权重全部相等 = 平均分）
③ 综合命中率 ① × ②        emoji 与文字共用「文字」池
```

| 能力 | 说明 |
| --- | --- |
| 系统预设（49 张） | 可开关、可调权重、可改分类、可「禁自由造句」；文字内容锁定（防手滑改坏预设），可用「恢复系统预设」重置 |
| 自定义 / 拾取 | 全类型 CRUD（文字 / 颜文字 / emoji / 表情包 / 图片），图片卡支持本地上传（存 dataURL） |
| 批量导入 | 一行一张卡，支持 `1. 内容` / `- 内容` / `"内容"` 写法，`#` 开头为注释；导入前**查重预览**（指纹相同=重复，Dice 相似度 ≥ 0.85=疑似，阈值可调），逐条勾选、可「仅新增」 |
| 管理 | 多选批量启用 / 停用 / 删除 |
| 试发到聊天 | 把卡直接发进聊天（写入消息 + `useCount + 1`），用来预览不同卡型的渲染效果 |

代码：`types/cards.ts`（数据模型）、`lib/cards.ts`（预设 / 归一化命名 / Dice 查重 / 命中率）、`store/useCardsStore.ts`（本地优先 + 防抖整包推送）、`screens/cards/CardLibraryScreen.tsx` + `components/cards/{CardEditSheet,ImportSheet}.tsx`。

### 拟真引擎：他到底会怎么回你（`lib/engine/*`）

你发一条消息，他不会秒回 —— 中间隔多久、发几条、发文字还是表情包、会不会撤回、会不会引用你、会不会干脆已读不回，全部按你在**概率调节引擎**里配的那套概率抽签决定。

> 设置里只保留「概率调节引擎」一个一级入口：情绪标签改在「功能 → 情绪意图」管，拼音造句在引擎的「聊天回复」组里（`chat.pinyinSentence`）。不再有「情绪模拟」「拼音造句」两个重复入口。

```
我发消息 → planner 跑一遍抽签（20+ 个抽签点）→ runtime 按抽签结果定时上屏
          ↓                                          ↓
        命中「拾取」：把我这句话收进他的字卡库      提前 0.9s 显示「正在输入」→ 落 IndexedDB → 推后端
```

| 升级点 | 说明 |
| --- | --- |
| 真的出稿 | 不再是写死的演示回复：抽签 → 从**字卡库**里按三层概率取卡 → 按 `replyInterval` / `replySentences` 逐句发 |
| 拼音造句是真的 | `chat.pinyinSentence` 打开后，抽中的那一句会尝试转成拼音（如 `wo xiang ni`）。用内置常用字表，覆盖率不足 80% 时**宁可不发拼音**，也不发半截乱码；全 ASCII 的「拼音卡」会被优先使用。默认关闭（5%）。设置里不再单列一级入口，统一在 概率调节引擎 → 聊天回复 |
| 离线可用 | 引擎在浏览器本地跑（和字卡库同一份数据），断网照常回复；回复同样先落本地再推后端 |
| 可复盘 | **长按任意一条消息 →「看抽签」**，逐步显示「已读不回 / 拍一拍 / 载体抽签 / 多字卡拼接 / 撤回 / 引用 / 拼音 / 语音 / 搜索 / 拾取」的命中情况、用了哪张卡、为什么跳过，刷新后仍在（存在 `messages.plan`） |
| 看得见已读 | 他「点开看了」之后，**我那条气泡下面出现「✓✓ 已读」小角标**；命中已读不回时角标变「已读不回」（微信本身没有已读回执，这是给梦角单独加的拟真件）。他对我这条的抽签轨迹也挂在我这条上，长按我自己的消息同样能看 |
| 他会自己来找你 | 安静够了之后**他主动发消息过来**（气泡左上角 ❤️）。间隔 / 每天几条 / 免打扰时段 / 「你刚回过话就取消」四个旋钮都在 设置 → 概率调节引擎 → **主动行为**；引擎页顶部还会写「⏰ 下一条主动消息：…」。想马上看效果：引擎页点 **「现在就来一条」** |
| 朋友圈 / 信箱也会自己动 | 他会**主动发动态**（❤️）、给你发的动态**点赞 / 评论**、回复你的评论、给你点赞**回赞**、**主动写信**、回你的信、还会用**蓝笔在你的信上写批注**。全部按 `moment.*` / `mail.*` / `proactive.moment` / `proactive.letter` 抽签，刷新不重掷。想马上看效果：引擎页点 **「🌈 让他发条朋友圈」「✉️ 让他写封信」** |
| 不穿帮 | 连发几条消息时，他只会对着**最新的那句**回一次（旧排程取消）；撤回后会换另一张卡补发，不会「撤回又发同一条」 |
| 不伪造 | 语音（MiniMax）没配 Key 时**只记录命中、不发假内容**，在「看抽签」里标明「未配置 → 跳过」；**联网搜索更硬 —— 搜不到就一条消息都不发**，只记一条失败轨迹；**图也是一样：上游那批图先真取一遍，验不过就不配图**（退回纯链接卡，绝不放占位图、更不会合成一张「他拍的图」）。见「联网搜索推送」一节 |
| 他真的会出声 | 接通 MiniMax 后命中「发语音」时，这一轮**本来就要说的某一句**会被合成成真语音（不是平白多一句）。挑句子会避开拼音串、避开超过 `voice.maxCharsPerVoice` 的长句；合成失败就**退回文字**，并把原因写进轨迹。**没接通也能有语音**：把一段已发过的语音「变成语音字卡」，抽到那张卡就直接发它、分文不花（见下一节） |

### MiniMax 真实语音（设置 → 接口与扩展 → 接入，`#integration`）

命中的那一条会真的变成语音气泡：点一下就能播，右边写着用了哪把音色。

| 步骤 | 怎么做 |
| --- | --- |
| 1. 填 Key | 设置 → 接入：**API Key + GroupId**（MiniMax 控制台）。也可以写进 `apps/server/.env` 的 `MINIMAX_API_KEY` / `MINIMAX_GROUP_ID`；**两处都有时以设置页为准** |
| 2. 试听 | 点「测试发音」——用当前音色真合成一句并播放，能听见才算接通 |
| 3. 打开开关 | 设置 → 概率调节引擎 → **语音**：`voice.enabled` 打开（接入页有一键「打开并保存」），再调发语音概率 / 字数上限 / 语速 / 按情绪变调 |

| 设计点 | 说明 |
| --- | --- |
| Key 不出后端 | 浏览器只调自己的后端代理（`POST /api/v1/voice/tts`），`GET /api/v1/integrations` 只回「配没配 + Key 尾号」（`sk-…mnop`）。明文 Key 待在 `apps/server/.data/db.json`，不随 `state` 同步到别处 |
| 音频跟着消息走 | 合成结果转 dataURL 存在消息 `payload.url` 里，配 `audioDurationMs` 与 `payload.via = 'MiniMax'`；换设备、清缓存也还放得出来 |
| 不重复计费 | 按「文本 + 音色 + 模型 + 语速 + 情绪」缓存（IndexedDB `tts:*`），同一句话只合成一次；接入页可「清空语音缓存」 |
| 情绪变调 | `voice.emotionMapping` 打开时，把情绪标签映射成 MiniMax 的 `emotion`（开心 / 难过 / 生气 / 担心 / 惊讶 / 平静），映射不上就用默认语气 |
| 我的语音 | 输入栏 🎙 切到「按住 说话」：**真的录**（MediaRecorder）→ 语音气泡可回放；不支持录音 / 没给麦克风权限会直说，不发空语音 |

代码：`lib/voice.ts`（音色表 / 合成 / 缓存 / 接入读写）、`store/useIntegrationsStore.ts`（读状态并同步 `INTEGRATIONS.tts`）、`screens/settings/IntegrationScreen.tsx`（接入页）、`components/chat/VoiceBubble.tsx`（语音气泡）、`components/chat/VoiceRecorderButton.tsx`（按住说话）、`apps/server/dev-server.mjs`（`/integrations`、`/voice/tts` 代理）。

### 联网搜索推送（设置 → 接口与扩展 → 接入，`#integration`）

他会自己上网看点东西，然后把**真的搜到的**那一条推成一张卡。

推给你的卡有三种形态，**形态由内容说了算，不是随机贴个标签**：

| 形态 | 什么时候是它 | 卡上有什么 |
| --- | --- | --- |
| **链接卡** | 默认 | 站点真 favicon（博查的 `siteIcon`）+ 真标题 / 摘要 / 链接；能取到封面就带封面 |
| **图片卡** | 服务端验过有可用图，且掷中 `search.imageP` | 真图（点开能放大）+「图源：哪个页面」—— 图是**上游页面自己的图**，不是我画的 |
| **视频卡** | 首位结果本身就是视频页（域名是视频站，或页面自己声明了 `og:video`） | 封面 + ▶ + **真时长**（`00:38` 这种，从标题/摘要原文里读的）+ 一个「视频」角标；点开去原站看。**但说清楚：博查实测几乎不返回视频站结果，所以这张卡很少见**（见下面「视频怎么判」） |

还会顺带配一句真人口吻的话（`search.captionP`）：「刚刷到这个，给你看看。」—— **只说不评价内容**，
卡片上的字全是上游的，我一个字都不替它说。

| 步骤 | 怎么做 |
| --- | --- |
| 1. 填 Key | 设置 → 接入 → **联网搜索推送（博查）**：填 API Key（博查开放平台 <https://open.bochaai.com>）。也可以写进 `apps/server/.env` 的 `SEARCH_API_KEY`；**两处都有时以设置页为准** |
| 2. 试搜 | 点「搜一下（测试连通）」——真去搜一次，下面列出**真实结果**（标题 / 站点 / 摘要 / 链接）；搜不到就显示人话原因 |
| 3. 打开开关 | 同页一键「打开（并保存）」打开 `search.enabled`，再去概率调节引擎调推送概率 / 主题 / 推送间隔 |
| 想马上看 | 同页「**现在推一条**」：不走排程、不看免打扰，但**规矩一样** —— 搜到才推卡，搜不到只记一条失败 |

**红线：搜到的才是真的，搜不到就一条都不推。**

| 情况 | 会怎样 |
| --- | --- |
| 搜到了 | 推一张 `SEARCH_PUSH` 卡，标题 / 链接 / 站点 / 摘要**全是搜索服务真返回的**，同时记一条成功轨迹 |
| 搜不到（没配 Key / 断网 / 被限流 / 一条结果都没有 / 上游格式看不懂） | **一条消息都不发**（连「他试着搜了一下但没搜到」都不发），只在下面的**搜索轨迹**里记一条失败：人话原因 + 上游原话 |
| 上游返回的东西读不懂 | 当成失败（`BAD_RESPONSE`）—— **绝不猜一条出来** |

| 设计点 | 说明 |
| --- | --- |
| 独立排程 | 联网搜索推送**不在「回你」这条链上**：一个 `search.pushIntervalMin` 的间隔里最多试一次，试不试按 `search.p` 掷签（**种子 = 日期 + 间隔槽** → 同一槽刷新不重掷），搜什么按同一种子从 `search.topics` 抽；**不存任务表** |
| 免打扰 | 正处在主动消息的免打扰时段，这一槽就不推 |
| Key 不出后端 | 浏览器只调自己的后端代理（`POST /api/v1/search`），`GET /api/v1/integrations` 只回「配没配 + Key 尾号」。后端再调博查 `POST https://api.bochaai.com/v1/web-search`（浏览器直连会被 CORS 挡） |
| 搜索轨迹 | `state.searchPush.logs`（最多 40 条，可单条删 / 清空）：**成功和失败都记** —— 失败的那几条正是用来回答「上次为什么没推」的。成功那条还会写清形态（「图片卡」「视频页 00:38（域名是视频站）」「纯链接（图都没验过：防盗链）」） |
| 图**先验再用** | 上游 `images` 里那批图**一半是垃圾**（网站 logo / 防盗链 403 / 404 / 连不上）。所以服务端会真去取一遍：能取到 + 是 `image/*` + 够大（≥20KB）+ 短边 ≥320px（200×200 的「微信分享图」、180×180 的 app 图标都栽在这条上）+ 不是超宽横幅 → 才算数。**验不过就不配图**，退回纯链接卡（绝不放占位图） |
| 图走代理 | 有些图**服务端能取、浏览器直连会被防盗链挡**（403 空白）。所以图片走我们自己的代理 `GET /api/v1/image?u=…`（服务端取回来转给页面 + 落盘缓存 `apps/server/.data/images/`），卡片 `<img>` 直接指过去 |
| 视频怎么判 | 博查这个接口**根本不返回视频数据**（`videos` 容器 8/8 都是空的，拿真 Key 探过），所以视频只能靠「这条结果是不是视频页」判，而且**只认两路硬信号**：① 域名是视频站（B 站 / 优酷 / 爱奇艺 / 抖音…）② 页面自己的 `og:video`。曾经还认「标题里写着预告片 / 在线观看」这一路，**实测被拿掉了** —— 它把新浪那篇《看了预告片好期待》的**报道**打成了「视频卡」，宁可视频卡少见，也不要给一篇文章挂个 ▶。**结果就是：实测十几次搜索，视频页一张没出现**（博查总返回百科 / 新闻 / 聚合页，不返回播放页）。想要「他真发视频」的话得另接一个视频源（比如 B 站搜索接口），那是另一件事 |
| 安静类 | `SEARCH_PUSH` 与 `SYSTEM` / `CALL_EVENT` 一样**不触发**回复引擎，也不算进「今天聊了几句」 |

代码：`lib/search.ts`（前端这一侧）、`lib/engine/search.ts`（排程 / 选形态 / 出卡）、`apps/server/bocha.mjs`（博查封装 + 归一化）、
`apps/server/media.mjs`（形态判定 + 图片验证 + 抓网页封面）、`apps/server/dev-server.mjs`（`/integrations`、`/search`、`/image` 代理）、
`screens/settings/IntegrationScreen.tsx`（接入页 + 搜索轨迹）、`components/chat/MessageBubble.tsx`（`SEARCH_PUSH` 卡 + `SearchCover` / `SearchFavicon`）。

### 语音卡：把一段语音绑到字卡上，以后抽到就直接发（不再花钱）

已发过的语音**就在消息里**（`payload.url` 是 dataURL），所以重听永远免费；但「他下次主动说这句话」不会白白发生 ——
除非把那段音频绑到字卡上。这就是 **收藏 ⭐**：

| 步骤 | 怎么做 |
| --- | --- |
| 1. 收藏 | 聊天里**长按他发的语音 → ⭐ 收藏这段语音**（我按住说话发出去的也能收藏）。存在 `state.voices`，音频跟着 `state` 同步，换设备也听得到 |
| 2. 变成语音字卡 | **功能 → 收藏 ⭐** → 那条上点「🎙 变成语音字卡」：字卡库里已有**同句**的文字卡就直接给它配上这段音频，没有就**新建一张**（文字 = 这段语音说的话，`category: 语音`，自动**禁组句**） |
| 3. 抽到就发它 | 之后引擎抽到那张卡时，会比对「这一轮要说的原话」和卡上语音的文字（忽略标点）：一致 → **直接发这段现成音频**（`payload.via = '语音卡'`，轨迹里多一步「语音卡」），**不调 MiniMax、不花钱**；对不上（比如被组句改写了）就当普通文字卡用 |
| 解绑 / 删除 | 「解绑」只清掉卡上的音频（卡留着）；「删除」会连卡上的音频一起清掉，卡本身还在字卡库里。字卡库那张卡上会显示 **🎙 语音卡** 角标 |

两个要点：**「语音卡」和 `voice.enabled` 总开关无关**（花不花钱是另一件事，这条路根本不合成）；
**文案和声音永远对得上**（卡的文字就是这段语音说的话，并禁止被造句改写）。

代码：`lib/voiceFav.ts`（收藏 / 变成语音字卡 / 解绑 / 删除）、`screens/hub/VoiceFavoritesScreen.tsx`（收藏页）、
`components/chat/MessageActionSheet.tsx`（长按 → ⭐ 收藏）、`lib/cards.ts`（`bareSentence` 忽略标点比对）、
`lib/engine/planner.ts`（第 5 步 `bindCardVoice` + 第 9 步前置分支）、`lib/engine/runtime.ts`（直接用自带音频）。

### 收藏夹：我收藏的 / 他收藏我的，按类别分开

收藏的是**快照**，不是引用 —— 原消息撤回、原信删掉之后，收藏里那句话还在。数据落在 `state.favorites`
（`FavoriteItem`），`owner` 区分「我收藏的 / 他收藏我的」，`author` 区分内容是谁写的；列表再按
**聊天 / 字卡 / 推送 / 语音 / 信件 / 朋友圈** 分类筛选。

| 方向 | 怎么收 | 存在哪 |
| --- | --- | --- |
| 我收藏他的 | 聊天里长按消息 → ⭐；语音 / 信件 / 朋友圈各有收藏按钮；我自己的消息可以点「让他收藏这条」 | `owner: 'me'` |
| 他收藏我的 | 引擎按 `favorite.collect` 对每条内容独立抽签（种子 = 内容 id，刷新不重掷），命中后写进「他收藏我的」 | `owner: 'his'`，并带一句原因 |

他收藏时写的原因从 `state.favoriteReasons` 里抽：默认 6 条（「想留着你这句话」「以后翻到会笑」…），
可以在 功能 → 收藏 ⭐ → 「他收藏我的」页里删改、再加新的。冷却 `favorite.cooldownMin` 防止一口气收一堆。

代码：`lib/favorites.ts`（快照 / 分类 / 默认原因）、`lib/engine/timeline.ts#hisFavoriteOpportunity`
（自动收藏）、`components/chat/MessageActionSheet.tsx`（长按收藏）、`screens/hub/VoiceFavoritesScreen.tsx`（收藏页）。

**拍一拍库**（聊天「+」→ 拍一拍 / 点他的头像 / 双击他的头像）：两边都能自定义 ——

| | 谁拍谁 | 显示 | 谁在管 |
| --- | --- | --- | --- |
| 我的拍一拍 | 我拍他 | 「你」拍了拍「梦角」的**小脑袋** | 点一下就发；系统送 6 条，可加可删 |
| 他的拍一拍 | 他拍我 | 「梦角」拍了拍我的**后脑勺** | 引擎在 `chat.pat` 命中时**从启用的后缀里随机抽一条**；可逐条开关 / 新增 |

拍一拍是「动作」，**不占 `replySentences` 的句数额度**（配置 1 句时他照样会拍一下再说一句）。

**主动消息**（`rules.proactive.message`）：不是「回你」，是**他到点自己来一句** —— 同一个抽签引擎，
第 1 步从「已读不回」换成「主动触发」，跳过引用与拾取，不显示「正在输入」，发出的消息气泡左上角带 ❤️。

| 旋钮 | 什么时候轮到他主动 |
| --- | --- |
| `interval [min,max]` | 距**最后一次说话**多久后发（秒）。每次有新消息就重排 → 你们在聊，他不会插嘴；安静下来了才轮到他 |
| `dailyLimit [min,max]` | 每天主动几条：按日期稳定抽一个额度（今天说得多、明天说得少），数聊天记录里今天已发的主动条数，用完顺延到明天 |
| `cancelIfRepliedWithin` | 被打断窗口（秒）：要发的那一刻你刚说过话 → 这条取消，重新计时 |
| `quietHours [起,止]` | 免打扰时段（支持跨零点）：落进去就顺延到时段结束，再抖 0~15 分钟 |

时间基准是「最后一条消息」而不是「打开 App 的时刻」（刷新 / 关机再开不会重新数一遍）；
排到的时间已经过去（关机很久）时，会等 30 秒再冒出来，不会一开 App 就弹。

抽签顺序、字段含义、本机与多端（`engine/reply-engine.ts`）的差异见 👉 `docs/rule-engine.md`。
相关文件：`lib/engine/planner.ts`（抽签，`mode: reply | proactive`）、`lib/engine/compose.ts`（组句/连词/标点/拼音/情绪）、`lib/engine/proactive.ts`（主动消息的间隔 / 额度 / 免打扰计算）、`lib/engine/runtime.ts`（排程与落库 + 主动定时器，`INTEGRATIONS` 开关）、`components/chat/MessageActionSheet.tsx`（复盘面板）、`lib/pats.ts` + `components/chat/PatPanel.tsx`（拍一拍库）。

### 聊天「+」里递给他的每样东西（都是真的）

点开「+」，一共九个入口，**没有一个只是摆样子** —— 递过去的东西会变成一张有状态的卡片，他按概率、按延迟回应，回应完卡片就地变样：

| 「+」里的入口 | 递过去之后 |
| --- | --- |
| 📞 语音通话 | 真的响铃、真的计时：按 `call.*` 抽「接不接」→ 接通就走进通话界面（秒表跟着时间走）→ 挂断后在聊天里留下「通话时长 mm:ss」的记录（他先挂会写「他先挂了」）；忙线 / 拒绝 / 无人接听也各有自己的样子 |
| 🖼 图片 | 选本机图片（dataURL，只在你的设备上）／拍照（手机浏览器会真调起相机，桌面浏览器会忽略 `capture`，所以文案不写「正在拍照」）；发出去就是一张图，按普通消息触发回复 |
| 👋 拍一拍 | 「你」拍了拍「梦角」的×××（后缀库可自定义） |
| 🤔 抉择 | 他挑一个选项（可带理由），并在聊天里**引用你那张卡**说一句；没掷中就一直停在「等他选…」 |
| 📋 问卷 | 他逐题作答（每题都可能留空、可以写备注），卡片上显示「他填了 N/M 题」 |
| 🧧 红包 | 他领取（卡片变「已被领取 ¥x」+ 一条系统提示）；**再独立掷一次签**决定要不要回你一个红包 —— 他回的那个要你点开才看得到金额 |
| 🎵 音乐邀请 | 他加入一起听（回填「他准备待多久」）、说一句关于这首歌的话，还可能回推一首给你；想真的听，点卡片上的「进房间一起听 ›」 |
| 🎁 礼物柜 | 从礼物柜里挑一件送他（柜子可加自定义礼物：名字 / 定价 / emoji / 本地图片 / 卡片文案）；他收下后会说谢谢，也会自己主动送你 |
| 🖌 涂鸦 | 手画一张递给他；他会回一句话，还可能**画一张回给你**（从他的图案模板里挑，同一张卡永远同一个图）。**他也会主动画给你**：`doodle.proactive` 按冷却掷签，不等你先画 |
| 🎙 按住说话 | 输入栏切到语音键，**真的用 MediaRecorder 录**（最长 60 秒）→ 发出去是一条能回放的语音气泡；浏览器不支持 / 没给麦克风权限会直说，不发空语音 |
| 🔊 他的语音 | 接通 MiniMax 后按 `voice.*` 命中，他会发**真语音**（点一下能放，还能「转文字」看他说了什么）；没接通就只记录命中、不发假语音 |

礼物柜在 **功能 → 礼物**（`#gift-cabinet`）：预设 6 件、可改价可删、可加自己的；
**送出记录不另存表**，就是聊天里那些 GIFT 卡片 → 柜子和聊天永远一致。

**问卷有两套，别混在一起：**

| 入口 | 是谁问谁 | 怎么用 |
| --- | --- | --- |
| 聊天「+」→ 📋 问卷 | **我出卷问他** | 选一套题递过去，他逐题作答（每题可能留空、可以写备注），卡片显示「他填了 N/M 题」；认真填的概率在 `question.p` |
| 功能 → 问卷 📋（`#survey`） | **他挑一套来问我** | 我自己建题 / 改题 / 删题，或直接粘贴文本、导入 JSON；他每天按 `question.askMeP` 从题库里挑一套，到点在聊天里发来，我点选交卷 |

同一页还有**默契问卷**：两个人做同一套题，交卷后按选项一致率算默契度并给总结；他的答案是**抽签模拟**的，
界面上会明说，不假装他真的坐在对面。`question.seriousP` 控制他认真做还是随机选。

代码：`screens/hub/SurveyScreen.tsx`（题库 / 导入 / 他问我 / 默契问卷）、`components/chat/HisQuestionCard.tsx`
（聊天内交卷）、`lib/engine/timeline.ts#hisQuestionOpportunity`（他主动来问）、`store/useChatStore.ts`
（`sendQuestion` / `askQuestionFromDream` / `answerQuestionAsMe`）。

**一起听**在 **功能 → 音乐**（`#music-room`，`screens/hub/MusicRoomScreen.tsx`）——
**这里是真的能出声的**，不是歌单摆设。歌从三条路进来，各播各的：

| 来源 | 怎么播 | 说明 |
| --- | --- | --- |
| 本机音频文件 | `lib/audio.ts` 的 `<audio>` 真播 | mp3 / flac / m4a / wav…，文件以 **Blob 存在 IndexedDB**（只在这台设备上，**不上传服务器**；换设备 / 清浏览器数据要重新导入） |
| 音频直链 | 同上 | 任何能直接播的 `http(s)` 音频地址；需要登录 / 有防盗链的会播不出来，界面上会**直接说**，不会假装在放 |
| 网易云 | **官方外链播放器**（`music.163.com/outchain/player` 的 iframe） | 贴分享链接 / 歌曲 id，后端（`GET /api/v1/music/resolve`）只解析歌名·歌手·封面；**版权和播放都在网易云那边**，VIP / 地区受限时它只给试听，我们不接管它的进度 |

进度条、时长、音量、拖动 seek、上一首 / 下一首、单曲 / 顺序循环都是真的；
顶上是「我和他」的头像和状态，**「一起听了多久」= `<audio>` 真的走出来的秒数**（`state.musicRoom.playedSec`，每 10 秒落一次盘）——
网易云曲目和只有歌名的曲目不计数，Hub 上的数字也从这里来，不再把「他答应加入了」当成听过。

房间里他会自己待着：进来（`music.join`）、在歌放到 20%~40% 时说一句（`music.say`）、
50%~80% 时往歌单加一首（`music.shareBack`）、待够 `music.listenMin` 分钟后说一句「先去忙了」——
**种子 = 曲目 id + 10 分钟节拍**，同一节拍内刷新不会重掷。中途他加进来的歌只有歌名（放不出声），
列表里会写「只有歌名」，不糊弄。

> 一条铁律：**递过去的卡片只由时间轴回应**（`lib/engine/cards.ts` 的 `CARD_KINDS`）。
> 聊天回复引擎会跳过它们，否则同一张卡会同时触发「他随口回一句」和「他认真答这张卡」两套排程。
> 抽签种子 = 那条消息的 id → 一张卡只掷一次签，刷新 / 关机 / 换设备都不会重掷。

### 朋友圈与信箱：他也会自己发、自己来

**朋友圈**（`moments` / `moment_comments`）和**信箱**（`letters` / `letter_annotations`）不再是写死的假数据：
两个屏幕读的是本机存的 `state.moments` / `state.letters`（随 `state` 一起推后端，换设备也在），我发的、他发的都落在同一份数据里。

| 我会看到什么 | 谁决定的 |
| --- | --- |
| 他**主动发一条动态**（卡片左上角 ❤️） | `proactive.moment`（开关 / 概率 / 冷却），每个 20 分钟节拍掷一次签 |
| 我发动态后，他的**点赞 / 评论** | `moment.like.p` + `moment.like.delay`、`moment.comment.p` + `moment.comment.delay` |
| 我在他的动态下评论 → 他**回复我的评论**；我点赞 → 他**回赞** | `moment.replyMyReply.p`、`moment.likeBackIfILiked.p` |
| 他**主动寄一封信**（列表里 ❤️ + 未读红点） | `proactive.letter`（开关 / 概率 / 冷却） |
| 我寄信 → 他**回信**（信箱里多一封「回信 · 原标题」，我那封变「已回信」） | `mail.reply.enabled` / `.p` + `mail.replyDelayH` |
| 他读我的信时，用**蓝笔在信纸上写批注**（锚定到某一句，手写体显示在那一行底下） | `mail.annotation.enabled` / `.p` —— **和回信是两件独立抽签的事** |
| 信多长、句号会不会被省掉 | `mail.length` / `mail.replyLength`、`mail.randomPunctuation` |

三个不穿帮的细节：

1. **掷签用种子随机**（`lib/engine/seed.ts`，种子 = 那条动态 / 那封信 / 那条评论的 id）：刷新一次不会多掷一次，
   同一件事的结果永远一致 —— 否则每刷一次页就等于把概率偷偷放大一次。
2. **`proactive.moment` / `proactive.letter` 只有「概率 + 冷却」没有间隔**，所以给它们一个 20 分钟**节拍**：
   每个节拍掷一次签，冷却没到直接跳过，同一节拍只发一条。
3. **时间基准是那条记录自己的时间**（不是「打开 App 的时刻」）：信是昨晚寄出的、回信延迟 6 小时，今天开机就能看到回信；
   已经到点的事件会等 20~90 秒再发生，不会一开 App 全弹出来。
4. **自己发的能自己删**：动态卡片右下角的「删除」、读完信底部的「删除这封信」（都只能删自己的）；
   删掉之后，跟他那条记录绑定的待办也跟着消失，不会「删了还来点赞」。
5. **「回信」和「蓝笔批注」是两件独立的事**（`mail.reply.p` 和 `mail.annotation.p` 各自掷签），所以三种都看得到：
   ① 只回信不批注 ② **只批注不回信** —— 信箱里没有新信，但我那封状态变成「他读了 · 写了批注」、行间多了蓝字
   ③ 又回信又批注。时间基准都是 `mail.replyDelayH`（从我寄出那一刻算），同一封信托他的两件事会一起发生。

内容生成在 `lib/engine/content.ts`：没配 LLM 就用「模板 + 他自己的字卡库」拼（会自然引用我上一句话、偶尔配图或分享音乐），
**不假装 AI 生成**；接上 LLM 后把 `makeMoment` / `makeLetter` 换成真生成即可，上层拿的还是同一个 `Moment` / `Letter`。

排程在 `lib/engine/timeline.ts`，和聊天的 `runtime.ts` 分开：所有待办都**从数据推导**，不存定时任务表。
引擎页顶部会写「⏰ 朋友圈 / 信箱：他接下来要做什么 · 几点」，语义与字段见 👉 `docs/rule-engine.md`。

### 陪伴：睡觉 / 学习 / 工作，计时是真的（功能 → 🌙，`#companion`）

不是「进度条动画」——**陪伴时长就是从开始到收尾的真实秒数**（挂在别的页面、切到后台都在走），
`state.companion` 里存的是 `startedAt` / `endedAt`，写记录时才结算，所以刷新、关掉页面重进都不会变。

| 我会看到什么 | 谁决定的 |
| --- | --- |
| 他一叫就来（1~6 秒内到场 + 开场一句） | `companion.join` |
| 他这会儿没空 → 先说「一会儿过去陪你」，N 分钟后才真的到场 | `companion.join` 没命中 + `companion.joinDelay` |
| 中途他偶尔说一句（「还有 20 分钟，撑住」/ 睡觉模式是「还醒着吗」） | `companion.say`，**每 10 分钟一个节拍**掷一次签 |
| 他在房间里回我一句（我说的话他大概率接） | `companion.replyMe` |
| 他先走了（留下「我先走一步」）—— 之后陪伴继续计时，只是他不出声了 | `companion.leave` + `companion.leaveAfterMin` |
| 到点自动收尾 / 我点「结束」；结束的判定：到点=完成，提前=提前结束 | 目标时长 `plannedMin`（0 = 不定时） |

四个不穿帮的细节：

1. **到点收尾按目标时长封顶**：把页面关了 8 小时再回来，不会记成「陪了 8 小时」。
2. **掷签全用种子随机**（种子 = 这一次陪伴的 id + 节拍号）：刷新不会重掷，同一个节拍永远同一个结果。
3. **他先走的那些，不出声就是不出声**（他不会一边走了还在房间里回你），记录里会标注「他先走了」。
4. **结束时聊天里留一条居中的小字**（`kind: SYSTEM`）：「📚 和黎深一起学 · 45 分钟」——`SYSTEM` 是安静类型，
   不会再触发回复引擎（不会因为这条又回你一句）。

背景图每个模式各存一张（`state.companion.backgrounds`，dataURL 跟着 `state` 同步）；三种模式各自记着上次设的时长。
「今天 / 连续 / 一共」三个数字都是从记录里**现算**的（没陪过就是 0 秒，不留假数字）。

代码：`lib/engine/companion.ts`（到场 / 说话 / 先走 / 收尾的抽签与每秒 tick）、`lib/companion.ts`（模式预设 + 时长格式化）、
`screens/hub/CompanionScreen.tsx`（页面）、`lib/engine/content.ts`（他的台词）、`state.companion`（进行中 + 记录 + 背景）。

### 统计 / 适应度：这一页的每个数字都能追到一条记录（功能 → 📊 / 🧭）

这一页没有「演示数据」，也没有为了好看凑出来的百分比。所有数字都由 `lib/stats.ts` 从**真实数据现算**：

| 看到的东西 | 从哪儿算出来的 |
| --- | --- |
| 消息构成 / 最近 14 天 / 他的活跃时段 | 每条 `messages` 的 `kind` / `createdAt`（按你本机时间） |
| 我发了多少轮 / 他回了多少轮 / 已读不回 | 把消息切成「一轮一轮」（我发一句 → 他回的那几条），已读不回读的是 `plan.silent` |
| 平均回复间隔 | 他每条消息上的 `latencyMs`（引擎排程时真实等的那几秒） |
| 字卡熟练度（他抽过哪些卡） | `messages.plan.cardIds`，**按轮去重** —— 一次抽签发 3 条只算 1 次 |
| 通话次数 / 接通率 / 总时长 / 他先挂 | `CALL_EVENT` 消息的 payload（`phase` / `outcome` / `durationSec`） |
| 红包 / 礼物 | 消息 payload 里的金额与礼物信息 |
| 一起听「真的听了多久」 | `state.musicRoom.playedSec` = `<audio>` 真的走出来的秒数（网易云曲目拿不到进度，不计） |
| 陪伴三模式合计 | `state.companion.sessions` 的 `durationSec` |
| 高频词 | 按**相邻两字粗切**统计（没有分词库，界面会写明；出现次数 < 2 的不上榜） |

适应度页只回答一个能测的问题：**「他适应我了吗」**——综合分 = 字卡覆盖 + 回应率 + 拾取率 的**平均**，公式就印在页面上，
三项的原始数字（`6/52 张`、`5/7 轮`、`3 张`）都摆着，随时能自己核；另外把「配置占比 vs 实际占比」并排给你看。

> 刻意**不用**字卡的 `useCount` 当熟练度：那个数现在只有手动编辑卡片时才会动，不是引擎的真实命中数 —— 拿它当熟练度就是伪造。

代码：`lib/stats.ts`（纯计算：`buildTurns` / `computeStats` / `computeFitness` / `topWords`）、
`screens/hub/StatsScreen.tsx`、`screens/hub/FitnessScreen.tsx`（Hub 两个入口的文案也是现算的）。

### 观影室：进度是真的，他的弹幕才是抽出来的（功能 → 🎬，`#watch-room`）

这个模块只有两条规矩，都写在明面上：

**① 进度骗不了人。** 片源四类 —— 本机视频文件 · 视频直链 · B 站链接 · 只有片名（他推给你的片）：

| 片源 | 怎么放 | 计不计时长 | 有没有弹幕 |
| --- | --- | --- | --- |
| 本机视频文件（Blob 只存 IndexedDB，不上传） | 我们自己的 `<video>` | ✅ 真的播出来的秒数 | ✅ |
| 视频直链 | 我们自己的 `<video>` | ✅ 真的播出来的秒数 | ✅ |
| B 站链接 | **官方 iframe 播放器**（`player.bilibili.com`） | ❌ 跨域读不到进度 | ❌ 一条都不飘 |
| 只有片名 | 播不了，就明说 | ❌ | ❌ |

「一起看了多久」= 只算 `<video>` **真在走**的秒数（每秒结算、每 10 秒落盘）——
你把页面切走、把播放器暂停，它就停在那儿；B 站那种读不到进度的**一秒都不记**，
它上面**一条弹幕都不发**（不在假进度上飘字），他的房间发言改按「一起待了多久」的真实分钟数。
卡片底下也写着：「这里没有模拟进度条：`<video>` 没在走，秒数就不加。」

**② 他说什么、第几秒说，是抽出来的。** 规则组 `watchRoom.*`（设置 → 概率调节引擎 → 观影室），
**种子 = 这一次观影的 id**，刷新 / 关机重进不会重掷：他进不进房间（没空就先说「N 分钟后过来」，到点才真的进来）、
这一场发几条弹幕、**每条弹幕落在片长的第几秒**（5%~95% 里种子散开，**到场那一刻一次排完并落库**，
界面只在播放进度越过那个时间点时才让它飘出来 → 刷新看到的永远是同一批、同一时刻）、按播放进度说一句、
中途先走（走了之后片照放，他只是不出声）、我在房间里说话他接不接。

弹幕清单可以点开看（页面上会写明「会剧透」）——**他的抽签结果不怕给你看**；片长拿不到（直播流那种）就不排弹幕，
不到 15 秒的片子也不飘，一整场不重复同一句。结束时聊天里落一条 `SYSTEM` 系统小字，
**有真实进度才带时长**（「🎞️ 和黎深一起看了《…》 · 42 分钟」），B 站 / 只有片名的就只写片名。

代码：`lib/videoEl.ts`（`<video>` 单例：真播放 / 真进度 / 真 seek）、`lib/watch.ts`（B 站 bvid 解析 / 片源判定 / 封面 / 时长显示）、
`lib/engine/watch.ts`（排程：到场 / 排弹幕 / 按进度说一句 / 先走 / 房间回话 / 「这一场真的看了多久」）、
`screens/hub/WatchRoomScreen.tsx`（片单与房间）。数据在 `state.watchRoom`（视频文件本身只在本机 IndexedDB 的 `video:*` 键下）。

### 阅读室：读到第几段是真的，他写的那几处才是抽出来的（功能 → 📖，`#read-room`）

跟观影室同一套规矩，只是「进度」在读书这件事上更含糊，所以这边的口径先说死：

**① 「读了多久」不是墙上时间。** 三条同时成立才走表 —— 阅读室开着（屏幕挂着）· 页面在前台（切走了不算）·
最近 45 秒内翻过页 / 滚过 / 点过。倒杯水回来接着读不算断，挂机刷手机就不走表；每 10 秒落一次盘。
所以聊天里那条「一起读了多久」是**真的读出来的秒数**，不是两个人一起挂着的时间。

**② 书源三类，只有前两类有真进度。** 正文解析成**段落数组**存本机 IndexedDB（`book:<id>`），
「读到第几段」是我们自己数出来的，百分比 = 段号 / 总段数：

| 书源 | 怎么读 | 有进度吗 | 他也写批注吗 |
| --- | --- | --- | --- |
| 本机文件 txt / md / html / epub（正文只存本机） | 自己的阅读器（按段分页） | ✅ 真段号 | ✅ 锚在具体那一段 |
| 粘一段正文 | 自己的阅读器 | ✅ 真段号 | ✅ |
| 只有书名（他随口推的） | 播不了正文就明说 | ❌ 没有「读到第几页」 | ❌ 一处都不写 |

「只有书名」的书**一秒都不记时长**（没有可测的进度就不编时长），页边也不写字 —— 就是他陪着你待一会儿，
房间里照样能说话。epub 是自己拆 zip（`DecompressionStream('deflate-raw')`，不引第三方库），解不开会明说，不会给你一本空书。

**③ 他写什么、写在第几段，是抽出来的。** 规则组 `readRoom.*`（设置 → 概率调节引擎 → 阅读室），
**种子 = 这一次共读的 id**，刷新 / 关机重进不会重掷：他进不进房间（没空就先说「N 分钟后过来」，到点才真的进来）、
这一本写几处、**每处落在第几段**（总段数的 5%~95% 里种子散开，**到场那一刻一次排完并落库**，
界面只在你真的读到那一段时才让它出现在页边 → 刷新看到的永远是同一批、同一段）、按读到的进率说一句、
中途先走（走了之后书照读，他只是不出声）、我在房间里说话他接不接。

页边那一栏可以点开看清单（写明「会剧透」）——**他的抽签结果不怕给你看**；段落少于 4 段的短文本不排批注，
一整本不重复同一句。结束时聊天里落一条 `SYSTEM` 系统小字，**有真实进度才带时长**
（「📖 和黎深一起读了《…》 · 1 分钟」），「只有书名」的就只写书名。

代码：`lib/read.ts`（书源判定 / txt·md·html·epub 解析成段落 / 封面 / 字数）、
`lib/engine/read.ts`（排程：真读秒 / 到场那一刻排完这一本批注 / 按段落进度说一句 / 先走 / 房间回话 / 「这一场真的读了多久」）、
`screens/hub/ReadRoomScreen.tsx`（书单与阅读器）。数据在 `state.readRoom`（正文本体只在本机 IndexedDB 的 `book:*` 键下）。

### 日记：想写就写、不限条数，提的每一件事都真的发生过（功能 → 📔，`#diary`）

**我的日记不限制条数**：同一天可以写很多条，不写也可以，没有「一天必须一条」。
每条各自选公开 / 私密，各自改、各自删；「以前」那栏按天倒序列出当天所有条目。
**他自动写的那条每天最多一次**（避免刷屏），这是他的排程，不是对我的限制。三件事说清楚：

**① 他的那条是抽出来的，种子是「日期」。** 规则组 `diary.*`（设置 → 概率调节引擎 → 日记）：
今天写不写、大概几点写、提不提今天真发生过的事、写几句、我写完之后他会不会也写一条。
种子 = `YYYY-MM-DD`，所以**今天他到底写不写，你早上看和晚上看是同一个答案**，刷新更不会重掷。

**② 「几点写」不存定时任务表。** 他的时间点是用日期当种子从 `diary.atTime`（默认 21:00~23:30）里抽出来的，
每次开 App 现算一遍、结果永远一样 —— 到点之前界面上明说「他今天还没写，一般在你睡前那段」，
**不是「在加载」，是真的还没到点**。他自动写的那条写下去后不会再来第二条。

**③ 他提到的事，全部来自今天的真实记录。** 今天的聊天条数、通话、红包、语音、礼物、一起听、一起看片、
一起读的书、陪伴多久、他在我朋友圈点赞评论了几句、他寄来的信 —— 都是 `lib/diary.ts#collectFacts()`
从**今天的聊天记录与记录表里一条条数出来的**（安静类消息不算「聊天条数」），一条都没有就一条都不提。
界面会把取材的那几件事列出来（「取材自今天的真实记录（不是我编的）」）。

他今天还没写的时候，界面上有一个「现在就写（本来就是今天他写）」的按钮 —— 只在抽签结果为「今天会写」时才给，
等于把他今晚那条提前，不会凭空多出一条。

**我的每一条都可以单独选公开 / 私密。** 公开就是他看得到；私密默认只有我能看，但有 **30% 概率被他破解**。
这个 30% 是**写死的**（不在概率调节引擎里，避免把「私密」调成摆设）：每条第一次保存成私密时各掷一次，
结果存进各自的 `entry.cracked`；之后改字、改心情都**不重掷**。界面上会照实说「这一条没有」或「他破解了这一条」，
历史里也分别用 🔒 / 🔓 标出来。代码：`store/useAppStore.ts#saveMyDiary`、`screens/hub/DiaryScreen.tsx`。

首页上也有一张「黎深 的留言」小卡（点进日记），「今日小卡」那句也顺手改成了**今天的真实数字**
（以前这里写死过一句假话：「他今天已经给你发了 12 条字卡…」）。

代码：`lib/diary.ts`（日期口径 / 心情表 / 今天真发生过什么）、`lib/engine/diary.ts`
（他自动那条的判定：到点 / 我写完之后隔一会儿，种子 = 日期）、`screens/hub/DiaryScreen.tsx`。
数据在 `state.diary`。

### 世界感知：他那边的几点是真的，天气一个都不编（功能 → 🌍，`#world`）

这一页最容易滑向「编」—— 天气、他此刻在做什么，这台设备上**没有任何真实来源**。所以把三类东西分开摆、分开标：

| | 内容 | 怎么来的 |
| --- | --- | --- |
| **真的** | 他那边的钟点（大钟 + 每个采样里的时刻） | `我这边现在 + 时差` **真换算**；时差是**你自己设的**（界面上写着「你设的，不是测出来的」） |
| **抽的** | 他的状态（在忙 / 刚起床…）与「正在做的事」 | 规则组 `world.*`，**种子 = 日期 + 采样槽** → 同一段时间里反复看是**同一个答案**（刷新不重掷），跨槽才变 |
| **没有的** | 天气 | 这台设备没接天气源 → 采样里的 `weather` 恒为 `null`，界面写「没接源，不显示」，**一个字都不编** |

状态不是乱抽的：按**他那边的时段**分池（他那边半夜抽不到「在开会」，早上也不会「准备睡了」），
跨日的时候界面上会说一句「（他那边是明天）」。采样台账在 `state.world.samples`（最多留 40 条，可单条删 / 清空）。

「顺手在聊天里说一句」（`world.toChat`，默认 35%）**每天最多一条**，判据是**聊天记录本身**
（那条消息带 `payload.world`），不是采样里的标记 —— 采样会被裁掉、会被手动删，但「今天说过没有」必须以聊天记录为真，
否则删掉采样他会把同一句再说一遍。你正处在免打扰时段就不说。

代码：`lib/world.ts`（时差换算 / 时段分池 / 状态池）、`lib/engine/world.ts`（排程 60 秒一趟）、
`screens/hub/WorldScreen.tsx`。数据在 `state.world`（对应多端设计里的 `world_sense_logs`）。

### 查岗：报告一半是真的，一半明说是抽的（功能 → 🔍，`#check`）

**我们拿不到他的定位，也看不到他的手机。** 所以报告不糊成一团，直接分两栏摆 —— 栏标题就是「真的」和「抽的」：

| | 内容 | 怎么来的 |
| --- | --- | --- |
| **真的** | 他那边现在几点 / 他最后一条消息多久前 / 他今天发来几条 / 他最近一次陪你做了什么 / 他今天写没写日记 / 他从你这儿拾走过几句话 / 他的字卡库多少张 | 全部从**这台手机的记录**现算（消息 / 日记 / 字卡库 / 世界感知），数字都对得上 |
| **抽的** | 定位（「在公司楼下的便利店」…）/ 手机屏幕上看到的东西 | 种子 = 请求 id；命中 `checkPhone.fakeInfoP` 还会标「他给的是**修饰过**的版本」，并附一句他露的马脚 |
| **没有的** | 真的截图与坐标 | 这台设备上没有这种来源 → **永远不会给你一张假截图** |

冷却是**真的**：从你上一次发起的时刻算起（`checkPhone.cooldownMin`，默认 720 分钟），剩多久显示多久，
清掉记录就跟着松掉。他回应不是秒回：`respondAt` 是种子定的（3~12 秒）**存在记录里**，1 秒的钟到点才结算（不存定时任务表）。

反方向也有：他**每天最多来查你 N 次**（`checkPhone.dailyLimit`，可调 1~5，默认 1；上限就是 5 条，
不是固定一天一条）。每个名额用 `checkPhone.askMeP` 独立抽签（种子 = 日期），到点会在查岗页挂一张
「他想看你手机」的卡（功能页那颗图标上会有红点），你点「给他看 / 不给看」—— 他会先在聊天里问一句，
你回完之后他再回一句。同意 / 拒绝都落一条记录 + 聊天里一条安静的系统小字。

代码：`lib/check.ts`（冷却 / 事实现算 / 定位与手机屏的候选池）、`lib/engine/check.ts`（排程与结算）、
`screens/hub/CheckScreen.tsx`。数据在 `state.checkPhone`（对应多端设计里的 `check_requests`；
`EXPIRED` 保留但本机版不产生 —— 他几秒内就回，不存在没人看见的超时）。

### 主界面：一句话 · 两个人 · 照片墙 · 纪念日卡 · 五入口（`#home`）

按「小手机」的样子重排了一遍，从上到下：

1. **一句话**：两个人上面那句（默认「两颗缠绕的心，会走同一条路」）。点一下就能改，存在
   `appearance.homeNote`；空着保存会保留原来那句，不会变成空白。
2. **两个头像**：他在左、我在右；头像下面直接显示昵称（默认「我 / 黎深」，改名后同步），
   不再另挂「我」「他」小字。名字下面的时间：他那边是 `我这边现在 + 时差` 真换算的
   （时差在「功能 → 🌍 世界感知」里设），我这边就是本机时间 —— **两个都不是装饰数字**。
3. **中间那条波**：SVG 画的正弦线 + CSS 平移（两层反向）+ 一颗心跳的心；开了「减少动态效果」
   的系统会自动停掉动画。做不了动态时它就是一条静态曲线 + 爱心。
4. **照片墙三张**：叠着摆，可以**用手指拖**换位置、**点一下**拿到最上层；位置存
   `appearance.photos`（跟着设置同步，换设备也在）。空相框点一下直接选图，换图 / 清图在
   「设置 → 美化 → 主界面照片墙」。
5. **纪念日卡**：右边那张竖卡，数字按日期现算，显示的是「显示在主界面」里的第一张；点它进纪念日页。
6. **底部五个入口**：聊天 / 朋友圈 / 信箱 / 功能 / 设置 **固定在最下面**，不再跟着内容滚走；
   上面那块内容自己滚（真机上由 `safe-bottom` 让开手势条）。
7. 两张小卡：今日小卡（今天的真实条数 / 字卡数）、他的留言（点进日记）。

代码：`screens/HomeScreen.tsx`、`store/useAppearanceStore.ts`（`photosOf()` 会把老数据的
照片墙补齐成三张）、`styles/index.css` 里 `ln-wave-*` / `ln-heart` 三段动画。

### 美化：气泡可以导入自己的 CSS（设置 → 美化 → 气泡样式）

除了配色 / 圆角 / 尾巴，气泡还能直接贴 CSS 或选一个 `.css` 文件。应用后代码注入到独立的
`<style id="ln-custom-bubble-css">`，只影响聊天页，不动全局样式；点「清空」会同时清掉输入框和这个 `<style>`。

选择器约定：`.ln-bubble`（所有气泡）、`.ln-bubble-me`（我的）、`.ln-bubble-peer`（他的）。
改完立刻能看到上面那条预览气泡变化，不需要刷新。代码：`lib/appearance.ts#applyAppearance`、
`screens/settings/AppearanceScreen.tsx`。

### 纪念日：真的能加、能改、能换背景图（功能 → 💙，`#anniversary`）

之前功能页里这个按钮是「展示位」，点不进去。现在是完整的一页：

- **增删改**：名字、日期、图标（emoji）、每年重复（生日 / 周年）、是否显示在主界面、卡片底部小字、
  备注、卡片背景图。
- **背景图**：从本机选一张（存成 base64 放进 `state.anniversaries[].bg`），铺在主界面那张竖卡上；
  换设备跟着走 —— 代价是别放太大的原图（几百 KB 就够了）。
- **主界面只显示一张**：`showOnHome` 为真的第一张是主卡；一张都没有时主界面会显示「＋ 添加纪念日」，
  不会拿假日期充数。
- **天数现算**：`已过天数 = 今天 - 日期`；每年重复的再算「还有 N 天」。数字会随日期自己变。

代码：`screens/hub/AnniversaryScreen.tsx`、`lib/time.ts`（`daysSince` / `daysUntil` / `formatDate`）。
数据在 `state.anniversaries`。

### 情绪意图：内置标签可以关，也能加自己的词（功能 → 🏷️，`#emotion`）

聊天气泡上那几个小标签（`message.emotionTags`）就是这里管的：

| 栏 | 是什么 | 能不能改 |
| --- | --- | --- |
| 最近真的出现过 | 从聊天记录里数出来的标签与次数 | 只读（现算，不是写死的统计） |
| 系统默认 | 七条内置正则推出来的标签（心动 / 心疼 / 温柔 / 同频…） | 可以逐个**关掉**，关掉就不再推 |
| 我加的标签 | 名字 + 类型（情绪 / 意图 / 心意）+ 触发词 + 颜色 | 增 / 改 / 删 / 关 |

自定义标签是**真参与推断**的：`compose.ts#inferEmotion()` 先扫你给的触发词（例如「宝宝、抱抱」→
「亲昵」），命中就打上你的标签，再走内置正则。没命中任何词时仍走内置规则；内置也全关了、自定义也没命中，
就返回空 —— 气泡上不显示标签，而不是硬塞一个「温柔」。

旧消息上已经打过的标签不会因为后来关掉/删掉而消失（那是当时的记录）。数据在 `state.emotionTags`。

### 通话：全屏 + 收起小窗，切页面不挂断（聊天「+」→ 📞）

- **全屏**：响铃 / 通话中（秒表跟真实时间走）/ 挂断 / 收起小窗。
- **小窗**：点「收起小窗」或**切到别的页面时自动收起**，浮在右下角；点一下展开回全屏，通话不断。
  小窗上有秒表和挂断按钮；主界面会自动给它让开底部五入口和音乐小窗的位置。
- **挂断后**照旧在聊天里留一条 `CALL_EVENT` 记录（接通 / 未接 / 时长），刷新不会重掷。
- 通话界面挂在 `App.tsx` 上（不在聊天页里），所以去朋友圈、信箱、功能页逛都不会把通话弄丢。

**切后台的保活：能做的是「尽力」，不是「保证」。** `lib/keepAlive.ts` 做了四件真事：

1. **Wake Lock**：通话时屏幕不休眠（页面可见时才有效，回前台会自动重新申请）。
2. **静音音频会话**：让浏览器把这一页当成「正在播放」，安卓 Chrome 切后台后不容易立刻挂起。
3. **Media Session**：锁屏 / 通知栏显示「和 XX 通话中」和计时，可以直接挂断。
4. **时间戳补齐**：所有时长都按 `Date.now()` 算 —— 后台定时器被节流到一分钟一次也不会少算，
   回前台看到的秒数是对的。

**做不到的部分**（不装样子）：安卓 / iOS 在内存紧张、省电模式或后台太久时会冻结、甚至回收整个标签页；
网页没有前台服务，被杀掉之后通话就是没了，任何 JS 都救不回来。要真正的系统级保活只能打包成原生 App
（例如 Capacitor + 前台服务）。装成 PWA（添加到主屏幕）比浏览器标签页稳一些，这是目前网页端的上限。

### 音乐悬浮窗：离开一起听也继续放（可关）

- 歌本来就由一个 `<audio>` 单例在放；以前离开页面会 `pause()`，现在**不停声**，改成收成一个小条。
- 小条：封面 / 歌名 / 进度（真的跟着播放走）/ 播放暂停 / 下一首 / 关闭；点歌名回到一起听页。
- **开关**在「功能 → 🎧 音乐」右上角：`悬浮窗开 / 关`。偏好只存在这台设备（`localStorage` 的
  `linian:ui:v1`），不跟聊天记录一起同步 —— 换设备各自决定。
- 主界面上小条会自动落在五入口上面；别的页面落在底部。通话小窗会再往上让一格，两个不打架。
- **锁屏播控**：Media Session 会显示歌名，能播放 / 暂停 / 上一首 / 下一首（真的出声的后台播放）。
  下一首只跳「本机能播」的曲目；网易云曲目走官方外链 iframe，不参与这里的切歌。
- 关掉小窗（✕）等于停止播放；下次进一起听重新点播放即可。

代码：`components/music/MusicMiniPlayer.tsx`、`lib/audio.ts`（单例播放器）、
`lib/music.ts#neighbourTrack()`（跳过播不了的曲目）、`store/useUIStore.ts`（本机偏好）。
