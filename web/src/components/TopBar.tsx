import { useEffect, useState } from 'react'
import { useContracts } from '../api/hooks'
import { calcEquity, calcMarginUsed, INITIAL_CASH, useTradingStore } from '../store/tradingStore'
import { fmt, fmtSigned, pnlColor } from '../theme'

const MODE_TEXT = {
  DEMO: { label: 'DEMO 模擬', desc: '假資料・假撮合，不會送出真實委託' },
  PAPER: { label: 'PAPER 券商模擬盤', desc: '連線券商模擬環境' },
  LIVE: { label: 'LIVE 真實交易', desc: '委託將送往交易所' },
} as const

export function TopBar() {
  const mode = useTradingStore((s) => s.mode)
  const symbol = useTradingStore((s) => s.symbol)
  const setSymbol = useTradingStore((s) => s.setSymbol)
  const quote = useTradingStore((s) => s.quote)
  const cash = useTradingStore((s) => s.cash)
  const equity = useTradingStore((s) => calcEquity(s).equity)
  const unrealized = useTradingStore((s) => calcEquity(s).unrealized)
  const marginUsed = useTradingStore((s) => calcMarginUsed(s))
  const resetAccount = useTradingStore((s) => s.resetAccount)
  const contracts = useContracts()
  const [confirmReset, setConfirmReset] = useState(false)

  // 「確定重設？」3 秒後自動復原，避免誤觸
  useEffect(() => {
    if (!confirmReset) return
    const t = setTimeout(() => setConfirmReset(false), 3000)
    return () => clearTimeout(t)
  }, [confirmReset])

  const change = quote.last - quote.dayOpen
  const realizedTotal = cash - INITIAL_CASH

  const onReset = () => {
    if (!confirmReset) return setConfirmReset(true)
    resetAccount()
    setConfirmReset(false)
  }

  return (
    <header className="top-bar">
      <div className="brand">
        <span className="logo">◆</span> 期貨交易台
      </div>

      <div className={`mode-badge mode-${mode.toLowerCase()}`} title={MODE_TEXT[mode].desc}>
        {MODE_TEXT[mode].label}
      </div>

      <nav className="symbols">
        {contracts.isPending && <span className="dim">載入商品中…</span>}
        {contracts.data?.map((c) => (
          <button key={c.code} className={c.code === symbol ? 'active' : ''} onClick={() => setSymbol(c.code)}>
            <strong>{c.name}</strong>
            <span className="dim">{c.code}</span>
          </button>
        ))}
      </nav>

      <div className="ticker">
        <span className="last" style={{ color: pnlColor(change) }}>
          {fmt(quote.last)}
        </span>
        <span style={{ color: pnlColor(change) }}>{fmtSigned(change)}</span>
      </div>

      <div className="account">
        <div>
          <span className="dim">權益數</span>
          <strong>{fmt(equity)}</strong>
        </div>
        <div>
          <span className="dim">未實現</span>
          <strong style={{ color: pnlColor(unrealized) }}>{fmtSigned(unrealized)}</strong>
        </div>
        <div>
          <span className="dim">已實現(含費)</span>
          <strong style={{ color: pnlColor(realizedTotal) }}>{fmtSigned(realizedTotal)}</strong>
        </div>
        <div>
          <span className="dim">已用保證金</span>
          <strong>{fmt(marginUsed)}</strong>
        </div>
        <button className={confirmReset ? 'ghost danger' : 'ghost'} onClick={onReset}>
          {confirmReset ? '確定重設？' : '重設帳戶'}
        </button>
      </div>
    </header>
  )
}
