import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import App from './App.tsx'
import { market } from './sim/market'
import { useTradingStore } from './store/tradingStore'
import './styles.css'

ModuleRegistry.registerModules([AllCommunityModule])

// 啟動模擬行情：從上次的價格接續，讓重新整理後持倉損益不會大幅跳動
market.start(useTradingStore.getState().quote.last)
market.onTick((tick) => useTradingStore.getState().onTick(tick, market.getDayOpen()))

const queryClient = new QueryClient({
  defaultOptions: { mutations: { retry: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
