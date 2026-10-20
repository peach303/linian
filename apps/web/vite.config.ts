import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  /**
   * GitHub Pages 的项目页会挂在 `/仓库名/` 下，构建时用 VITE_BASE_PATH 指定；
   * 本机开发 / Render 根路径不用传，默认还是 `/`。
   */
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    /**
     * 监听所有网卡：手机连同一个 Wi-Fi 时可以直接开 http://<电脑IP>:5173
     * （/api 由这台电脑上的 vite 代理到 3001，所以语音 / 搜索推送在手机上也是通的）
     */
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/rt': { target: 'http://localhost:3001', ws: true },
    },
  },
})
