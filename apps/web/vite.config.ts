import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
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
