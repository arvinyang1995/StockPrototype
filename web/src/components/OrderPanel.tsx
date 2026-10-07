import { INSTRUMENTS } from '../sim/instruments'
import type { OrderType, Side } from '../sim/exchange'
import { calcEquity, calcMarginUsed, useTradingStore } from '../store/tradingStore'
import { useCancelAll, useClosePosition, useRequestOrder } from '../api/hooks'
import { BUY, SELL, fmt } from '../theme'

const TYPES: Array<{ value: OrderType; label: string }> = [
  { value: 'LMT', label: '限價' },
  { value: 'MKT', label: '市價' },
  { value: 'STP', label: '停損' },
]

const QUICK_QTY = [1, 2, 5, 10]

export function OrderPanel() {
  const symbol = useTradingStore((s) => s.symbol)
  const form = useTradingStore((s) => s.form)
  const updateForm = useTradingStore((s) => s.updateForm)
  const quote = useTradingStore((s) => s.quote)
  const settings = useTradingStore((s) => s.settings)
  const updateSettings = useTradingStore((s) => s.updateSettings)
  const position = useTradingStore((s) => s.positions[s.symbol])
  const available = useTradingStore((s) => calcEquity(s).equity - calcMarginUsed(s))
  const workingCount = useTradingStore((s) => s.orders.filter((o) => o.status === 'WORKING').length)

  const requestOrder = useRequestOrder()
  const closePosition = useClosePosition()
  const cancelAll = useCancelAll()

  const inst = INSTRUMENTS[symbol]
  const isBuy = form.side === 'BUY'
  const color = isBuy ? BUY : SELL
  const needsPrice = form.type !== 'MKT'
  const price = form.price ?? quote.last
  const margin = form.qty * inst.initialMargin
  const overLimit = form.qty > settings.maxQtyPerOrder

  const setSide = (side: Side) => updateForm({ side })
  const stepPrice = (delta: number) => updateForm({ price: price + delta * inst.tickSize })
  const setQty = (qty: number) => updateForm({ qty: Math.max(1, Math.floor(qty) || 1) })

  const submit = () =>
    requestOrder({
      symbol,
      side: form.side,
      type: form.type,
      price: needsPrice ? price : null,
      qty: form.qty,
    })

  return (
    <section className="order-panel">
      <div className="side-toggle">
        <button className={isBuy ? 'buy active' : 'buy'} onClick={() => setSide('BUY')}>
          買進
        </button>
        <button className={!isBuy ? 'sell active' : 'sell'} onClick={() => setSide('SELL')}>
          賣出
        </button>
      </div>

      <div className="seg full">
        {TYPES.map((t) => (
          <button key={t.value} className={form.type === t.value ? 'active' : ''} onClick={() => updateForm({ type: t.value })}>
            {t.label}
          </button>
        ))}
      </div>

      <label className="field">
        <span>{form.type === 'STP' ? '觸發價' : '價格'}</span>
        {needsPrice ? (
          <div className="stepper">
            <button onClick={() => stepPrice(-1)}>−</button>
            <input
              type="number"
              value={price}
              onChange={(e) => updateForm({ price: Number(e.target.value) })}
            />
            <button onClick={() => stepPrice(1)}>+</button>
          </div>
        ) : (
          <div className="stepper disabled">以市價成交</div>
        )}
      </label>
      {needsPrice && (
        <div className="price-shortcuts">
          <button onClick={() => updateForm({ price: quote.bid })}>買價 {fmt(quote.bid)}</button>
          <button onClick={() => updateForm({ price: quote.last })}>成交 {fmt(quote.last)}</button>
          <button onClick={() => updateForm({ price: quote.ask })}>賣價 {fmt(quote.ask)}</button>
        </div>
      )}

      <label className="field">
        <span>口數</span>
        <div className="stepper">
          <button onClick={() => setQty(form.qty - 1)}>−</button>
          <input type="number" min={1} value={form.qty} onChange={(e) => setQty(Number(e.target.value))} />
          <button onClick={() => setQty(form.qty + 1)}>+</button>
        </div>
      </label>
      <div className="price-shortcuts">
        {QUICK_QTY.map((q) => (
          <button key={q} className={form.qty === q ? 'active' : ''} onClick={() => setQty(q)}>
            {q} 口
          </button>
        ))}
      </div>

      <dl className="order-info">
        <dt>每點價值</dt>
        <dd>{fmt(inst.pointValue)} 元</dd>
        <dt>預估保證金</dt>
        <dd>{fmt(margin)} 元</dd>
        <dt>可用保證金</dt>
        <dd className={available < margin ? 'warn' : ''}>{fmt(available)} 元</dd>
      </dl>

      <button className="submit" style={{ background: color }} onClick={submit}>
        {isBuy ? '買進' : '賣出'} {form.qty} 口 {inst.name}
        {needsPrice && <small> @ {fmt(price)}</small>}
      </button>
      {overLimit && <p className="warn-text">超過單筆上限 {settings.maxQtyPerOrder} 口（僅限新倉）</p>}

      <div className="quick-actions">
        <button disabled={!position || closePosition.isPending} onClick={() => closePosition.mutate(symbol)}>
          市價平倉{position ? ` (${position.qty > 0 ? '多' : '空'} ${Math.abs(position.qty)})` : ''}
        </button>
        <button disabled={workingCount === 0 || cancelAll.isPending} onClick={() => cancelAll.mutate()}>
          全部刪單{workingCount ? ` (${workingCount})` : ''}
        </button>
      </div>

      <div className="settings">
        <label className="check">
          <input
            type="checkbox"
            checked={settings.confirmOrders}
            onChange={(e) => updateSettings({ confirmOrders: e.target.checked })}
          />
          下單前確認
        </label>
        <label className="check">
          單筆上限
          <input
            type="number"
            min={1}
            className="mini"
            value={settings.maxQtyPerOrder}
            onChange={(e) => updateSettings({ maxQtyPerOrder: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
          />
          口
        </label>
      </div>
    </section>
  )
}
