import { useMemo } from 'react'
import { useTradingStore } from '../store/tradingStore'
import { BUY, SELL, fmt, pnlColor } from '../theme'

const LEVELS = 5

/** 依價格產生穩定的假委託量，避免每個 tick 全部亂跳 */
function mockSize(price: number, time: number) {
  const seed = Math.sin(price * 12.9898 + Math.floor(time / 2000) * 78.233) * 43758.5453
  return 5 + Math.floor((seed - Math.floor(seed)) * 80)
}

export function OrderBook() {
  const quote = useTradingStore((s) => s.quote)
  const updateForm = useTradingStore((s) => s.updateForm)

  const { asks, bids, maxSize } = useMemo(() => {
    const asks = Array.from({ length: LEVELS }, (_, i) => {
      const price = quote.ask + (LEVELS - 1 - i)
      return { price, size: mockSize(price, quote.time) }
    })
    const bids = Array.from({ length: LEVELS }, (_, i) => {
      const price = quote.bid - i
      return { price, size: mockSize(price, quote.time) }
    })
    const maxSize = Math.max(...asks.map((a) => a.size), ...bids.map((b) => b.size))
    return { asks, bids, maxSize }
  }, [quote])

  const change = quote.last - quote.dayOpen
  const changePct = (change / quote.dayOpen) * 100

  const row = (level: { price: number; size: number }, color: string, bg: string) => (
    <button key={level.price} className="book-row" onClick={() => updateForm({ price: level.price, type: 'LMT' })}>
      <span className="depth" style={{ width: `${(level.size / maxSize) * 100}%`, background: bg }} />
      <span style={{ color }}>{fmt(level.price)}</span>
      <span>{level.size}</span>
    </button>
  )

  return (
    <section className="order-book">
      <header>
        <span>五檔</span>
        <span className="dim">點擊帶價</span>
      </header>
      <div className="book-head">
        <span>價格</span>
        <span>委託量</span>
      </div>
      {asks.map((a) => row(a, SELL, 'rgba(14,203,129,0.12)'))}
      <div className="book-last" style={{ color: pnlColor(change) }}>
        {fmt(quote.last)}
        <small>
          {change >= 0 ? '▲' : '▼'} {fmt(Math.abs(change))} ({changePct.toFixed(2)}%)
        </small>
      </div>
      {bids.map((b) => row(b, BUY, 'rgba(246,70,93,0.12)'))}
    </section>
  )
}
