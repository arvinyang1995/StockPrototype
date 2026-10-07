import { useEffect } from 'react'
import { INSTRUMENTS } from '../sim/instruments'
import { useTradingStore } from '../store/tradingStore'
import { usePlaceOrder } from '../api/hooks'
import { BUY, SELL, fmt } from '../theme'

const TYPE_TEXT = { LMT: '限價', MKT: '市價', STP: '停損' } as const

export function ConfirmDialog() {
  const pending = useTradingStore((s) => s.pendingOrder)
  const setPending = useTradingStore((s) => s.setPendingOrder)
  const mode = useTradingStore((s) => s.mode)
  const place = usePlaceOrder()

  const confirm = () => {
    if (!pending) return
    place.mutate(pending)
    setPending(null)
  }

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPending(null)
      if (e.key === 'Enter') confirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!pending) return null
  const inst = INSTRUMENTS[pending.symbol]
  const isBuy = pending.side === 'BUY'
  const color = isBuy ? BUY : SELL

  return (
    <div className="modal-backdrop" onClick={() => setPending(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>確認委託</h3>
        <div className={`mode-badge mode-${mode.toLowerCase()}`}>{mode === 'DEMO' ? 'DEMO 模擬單，不會真實成交' : mode}</div>
        <dl className="order-info big">
          <dt>商品</dt>
          <dd>
            {inst.name} ({inst.code})
          </dd>
          <dt>買賣</dt>
          <dd style={{ color, fontWeight: 700 }}>{isBuy ? '買進' : '賣出'}</dd>
          <dt>類型</dt>
          <dd>{TYPE_TEXT[pending.type]}</dd>
          <dt>{pending.type === 'STP' ? '觸發價' : '價格'}</dt>
          <dd>{pending.price === null ? '市價' : fmt(pending.price)}</dd>
          <dt>口數</dt>
          <dd>{pending.qty} 口</dd>
          <dt>保證金</dt>
          <dd>約 {fmt(pending.qty * inst.initialMargin)} 元</dd>
        </dl>
        <div className="modal-actions">
          <button className="ghost" onClick={() => setPending(null)}>
            取消 (Esc)
          </button>
          <button className="submit" style={{ background: color }} onClick={confirm} autoFocus>
            確認{isBuy ? '買進' : '賣出'} (Enter)
          </button>
        </div>
      </div>
    </div>
  )
}

export function Toasts() {
  const toasts = useTradingStore((s) => s.toasts)
  const dismiss = useTradingStore((s) => s.dismissToast)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
