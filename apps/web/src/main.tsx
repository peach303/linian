import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { bootstrap } from '@/store/bootstrap'
import { initNotifications } from '@/lib/notify'
import './styles/hand-font.css'
import './styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
})

/** 先注入本地数据（主题 / 美化 / 规则 / 聊天记录），再渲染，避免首屏闪烁 */
void bootstrap().finally(() => {
  void initNotifications()
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  )
})
