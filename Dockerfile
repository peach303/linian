# syntax=docker/dockerfile:1
#
# 黎念 · 一个容器同时出「页面 + API」
#
#   docker build -t linian .
#   docker run -d -p 3001:3001 -v linian-data:/app/apps/server/.data --name linian linian
#
# 然后手机打开 http://<这台机器的IP>:3001/ —— 页面和 /api 同源，
# 所以语音合成、语音卡、联网搜索推送、图片代理全都是通的（Key 只在这个进程里）。
#
# ⚠️ 不挂 -v 卷的话，容器一删/一重启，apps/server/.data/db.json 就没了
#    （聊天记录在你手机本地那份还在，重新打开会把历史补回去；卡库会重新落预设）。

# ── 构建前端 ──
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build:web

# ── 跑起来：后端是零依赖的（只用 Node 内置模块），镜像里不需要 node_modules ──
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001
COPY --from=build /app/apps/server/*.mjs ./apps/server/
COPY --from=build /app/apps/web/dist ./apps/web/dist
EXPOSE 3001
CMD ["node", "apps/server/dev-server.mjs"]
