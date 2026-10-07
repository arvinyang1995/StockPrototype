import { TopBar } from './components/TopBar'
import { ChartPanel } from './components/ChartPanel'
import { OrderBook } from './components/OrderBook'
import { OrderPanel } from './components/OrderPanel'
import { BottomPanel } from './components/BottomPanel'
import { ConfirmDialog, Toasts } from './components/Overlays'

export default function App() {
  return (
    <div className="app">
      <TopBar />
      <main className="workspace">
        <ChartPanel />
        <OrderBook />
        <OrderPanel />
        <BottomPanel />
      </main>
      <ConfirmDialog />
      <Toasts />
    </div>
  )
}
