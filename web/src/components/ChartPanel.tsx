import { useEffect, useRef, useState } from 'react'
import { dispose, init, registerLocale, type Chart, type DataLoader, type DeepPartial, type Styles } from 'klinecharts'
import { registerTradingOverlays, type OrderLineData, type PositionLineData } from '../chart/overlays'
import { market } from '../sim/market'
import { INSTRUMENTS, roundToTick } from '../sim/instruments'
import { unrealizedPnl } from '../sim/exchange'
import { PERIODS, useTradingStore, type PeriodKey } from '../store/tradingStore'
import { useCancelOrder, useModifyOrder, useRequestOrder } from '../api/hooks'
import { BUY, DOWN, GRID, SELL, TEXT_DIM, UP, fmt, fmtSigned, pnlColor } from '../theme'

registerTradingOverlays()
registerLocale('zh-TW', {
  time: '時間：',
  open: '開：',
  high: '高：',
  low: '低：',
  close: '收：',
  volume: '量：',
  change: '漲跌：',
  turnover: '成交額：',
  second: '秒',
  minute: '分',
  hour: '時',
  day: '日',
  week: '週',
  month: '月',
  year: '年',
})

const CANDLE_PANE = 'candle_pane'

const DRAW_TOOLS = [
  { name: 'horizontalStraightLine', label: '水平線', icon: '─' },
  { name: 'verticalStraightLine', label: '垂直線', icon: '│' },
  { name: 'straightLine', label: '趨勢線', icon: '╱' },
  { name: 'rayLine', label: '射線', icon: '↗' },
  { name: 'segment', label: '線段', icon: '⟋' },
  { name: 'priceLine', label: '價格標記', icon: '⊢' },
  { name: 'parallelStraightLine', label: '平行通道', icon: '⫽' },
  { name: 'fibonacciLine', label: '費波那契', icon: 'φ' },
] as const

const ORDER_TYPE_TEXT = { LMT: '限價', STP: '停損', MKT: '市價' } as const

const chartStyles: DeepPartial<Styles> = {
  grid: { horizontal: { color: GRID }, vertical: { color: GRID } },
  candle: {
    bar: {
      upColor: UP,
      downColor: DOWN,
      noChangeColor: TEXT_DIM,
      upBorderColor: UP,
      downBorderColor: DOWN,
      noChangeBorderColor: TEXT_DIM,
      upWickColor: UP,
      downWickColor: DOWN,
      noChangeWickColor: TEXT_DIM,
    },
    priceMark: {
      last: { upColor: UP, downColor: DOWN, noChangeColor: TEXT_DIM },
    },
    tooltip: { title: { show: false } },
  },
  indicator: {
    bars: [{ upColor: 'rgba(246,70,93,0.5)', downColor: 'rgba(14,203,129,0.5)', noChangeColor: TEXT_DIM }],
  },
  xAxis: { axisLine: { color: GRID }, tickText: { color: TEXT_DIM } },
  yAxis: { axisLine: { color: GRID }, tickText: { color: TEXT_DIM } },
  separator: { color: GRID },
  crosshair: {
    horizontal: { text: { backgroundColor: '#2b3139' } },
    vertical: { text: { backgroundColor: '#2b3139' } },
  },
}

const dataLoader: DataLoader = {
  getBars: ({ type, timestamp, period, callback }) => {
    if (type === 'backward' || type === 'update') return callback([], false)
    const { bars, hasMore } = market.getBars(period, type === 'forward' ? timestamp : null, 600)
    // 模擬後端延遲
    setTimeout(() => callback(bars, { forward: hasMore, backward: false }), 150)
  },
  subscribeBar: ({ period, callback }) => {
    unsubscribe?.()
    unsubscribe = market.onTick(() => {
      const bar = market.getCurrentBar(period)
      if (bar) callback(bar)
    })
  },
  unsubscribeBar: () => {
    unsubscribe?.()
    unsubscribe = null
  },
}
let unsubscribe: (() => void) | null = null

interface ContextMenu {
  x: number
  y: number
  price: number
}

export function ChartPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const draggingRef = useRef<string | null>(null)
  const [chartReady, setChartReady] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [magnet, setMagnet] = useState(true)
  const [menu, setMenu] = useState<ContextMenu | null>(null)
  const [syncTick, setSyncTick] = useState(0)

  const symbol = useTradingStore((s) => s.symbol)
  const period = useTradingStore((s) => s.period)
  const setPeriod = useTradingStore((s) => s.setPeriod)
  const orders = useTradingStore((s) => s.orders)
  const position = useTradingStore((s) => s.positions[s.symbol])
  const last = useTradingStore((s) => s.quote.last)
  const formQty = useTradingStore((s) => s.form.qty)

  // TanStack Query 的 mutate 是穩定參照，可安全地在 overlay 事件回呼中使用
  const { mutate: modifyOrder } = useModifyOrder()
  const { mutate: cancelOrder } = useCancelOrder()
  const requestOrder = useRequestOrder()

  // 初始化圖表
  useEffect(() => {
    const el = containerRef.current!
    const chart = init(el, { locale: 'zh-TW', timezone: 'Asia/Taipei', styles: chartStyles })
    if (!chart) return
    chartRef.current = chart
    chart.setDataLoader(dataLoader)
    chart.createIndicator({ name: 'MA', paneId: CANDLE_PANE, calcParams: [5, 20, 60] }, true)
    chart.createIndicator({ name: 'VOL' }, false)
    setChartReady(true)

    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      dispose(el)
      chartRef.current = null
      setChartReady(false)
    }
  }, [])

  // 切換商品／週期
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setSymbol({ ticker: symbol, pricePrecision: 0, volumePrecision: 0 })
    chart.setPeriod(PERIODS[period])
  }, [chartReady, symbol, period])

  // 同步委託線：新增／更新／移除
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const working = orders.filter((o) => o.symbol === symbol && o.status === 'WORKING' && o.price !== null)
    const wanted = new Set(working.map((o) => `ord_${o.id}`))
    chart.getOverlays({ groupId: 'orders' }).forEach((ov) => {
      if (!wanted.has(ov.id)) chart.removeOverlay({ id: ov.id })
    })
    const existing = new Set(chart.getOverlays({ groupId: 'orders' }).map((ov) => ov.id))
    const ts = Date.now()

    working.forEach((order) => {
      const id = `ord_${order.id}`
      if (draggingRef.current === order.id) return
      const extendData: OrderLineData = {
        orderId: order.id,
        label: `${ORDER_TYPE_TEXT[order.type]}${order.side === 'BUY' ? '買' : '賣'} ${order.qty}`,
        color: order.side === 'BUY' ? BUY : SELL,
      }
      const points = [{ timestamp: ts, value: order.price! }]
      if (existing.has(id)) {
        chart.overrideOverlay({ id, points, extendData })
        return
      }
      chart.createOverlay({
        id,
        name: 'orderLine',
        groupId: 'orders',
        zLevel: 10,
        points,
        extendData,
        onPressedMoveStart: () => {
          draggingRef.current = order.id
        },
        onPressedMoveEnd: (e) => {
          draggingRef.current = null
          const current = useTradingStore.getState().orders.find((o) => o.id === order.id)
          const value = e.overlay.points[0].value
          if (!current || current.price === null || value === undefined) return
          const newPrice = roundToTick(value, INSTRUMENTS[current.symbol].tickSize)
          if (newPrice === current.price) {
            setSyncTick((n) => n + 1)
            return
          }
          modifyOrder(
            { id: order.id, price: newPrice },
            { onSettled: () => setSyncTick((n) => n + 1) },
          )
        },
        onClick: (e) => {
          if (e.figure?.key === 'cancel') cancelOrder(order.id)
        },
      })
    })
  }, [chartReady, orders, symbol, syncTick, modifyOrder, cancelOrder])

  // 同步持倉線（每個 tick 更新未實現損益）
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    if (!position) {
      chart.removeOverlay({ id: 'position' })
      return
    }
    const inst = INSTRUMENTS[position.symbol]
    const pnl = unrealizedPnl(position, last, inst)
    const extendData: PositionLineData = {
      label: `${position.qty > 0 ? '多' : '空'} ${Math.abs(position.qty)} @ ${fmt(position.avgPrice, 1)}   ${fmtSigned(pnl)}`,
      color: pnlColor(pnl) === TEXT_DIM ? '#5e6673' : pnlColor(pnl),
    }
    const points = [{ timestamp: Date.now(), value: position.avgPrice }]
    if (chart.getOverlays({ id: 'position' }).length) chart.overrideOverlay({ id: 'position', points, extendData })
    else chart.createOverlay({ id: 'position', name: 'positionLine', zLevel: 5, points, extendData })
  }, [chartReady, position, last])

  const selectTool = (name: string) => {
    const chart = chartRef.current
    if (!chart) return
    setActiveTool(name)
    chart.createOverlay({
      name,
      groupId: 'drawings',
      mode: magnet ? 'weak_magnet' : 'normal',
      onDrawEnd: () => setActiveTool(null),
    })
  }

  const clearDrawings = () => {
    chartRef.current?.removeOverlay({ groupId: 'drawings' })
    setActiveTool(null)
  }

  /** 由滑鼠位置換算 K 線區的價格；不在 K 線區時回傳 null */
  const priceAt = (clientX: number, clientY: number) => {
    const chart = chartRef.current
    const el = containerRef.current
    if (!chart || !el) return null
    const rect = el.getBoundingClientRect()
    const pane = chart.getSize(CANDLE_PANE)
    const y = clientY - rect.top
    const x = clientX - rect.left
    if (!pane || y < pane.top || y > pane.top + pane.height || x > pane.width) return null
    const point = chart.convertFromPixel([{ y }], { paneId: CANDLE_PANE, absolute: true }) as Array<{ value?: number }>
    const value = point[0]?.value
    return value === undefined ? null : roundToTick(value, INSTRUMENTS[symbol].tickSize)
  }

  const onContextMenu = (e: React.MouseEvent) => {
    const price = priceAt(e.clientX, e.clientY)
    if (price === null) return
    e.preventDefault()
    const rect = containerRef.current!.getBoundingClientRect()
    setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, price })
  }

  const onClick = (e: React.MouseEvent) => {
    setMenu(null)
    // Alt + 點擊：把該價位帶入下單面板
    if (!e.altKey) return
    const price = priceAt(e.clientX, e.clientY)
    if (price !== null) useTradingStore.getState().updateForm({ price, type: 'LMT' })
  }

  const menuOrder = (side: 'BUY' | 'SELL', type: 'LMT' | 'STP') => {
    if (!menu) return
    requestOrder({ symbol, side, type, price: menu.price, qty: formQty })
    setMenu(null)
  }

  const renderMenu = (m: ContextMenu) => {
    const below = m.price < last
    const items: Array<{ label: string; color?: string; onClick: () => void }> = below
      ? [
          { label: `限價買進 ${formQty} 口 @ ${fmt(m.price)}`, color: BUY, onClick: () => menuOrder('BUY', 'LMT') },
          { label: `停損賣出 ${formQty} 口 @ ${fmt(m.price)}`, color: SELL, onClick: () => menuOrder('SELL', 'STP') },
        ]
      : [
          { label: `限價賣出 ${formQty} 口 @ ${fmt(m.price)}`, color: SELL, onClick: () => menuOrder('SELL', 'LMT') },
          { label: `停損買進 ${formQty} 口 @ ${fmt(m.price)}`, color: BUY, onClick: () => menuOrder('BUY', 'STP') },
        ]
    items.push(
      {
        label: `帶入下單價格 ${fmt(m.price)}`,
        onClick: () => {
          useTradingStore.getState().updateForm({ price: m.price, type: 'LMT' })
          setMenu(null)
        },
      },
      {
        label: '在此價位畫水平線',
        onClick: () => {
          chartRef.current?.createOverlay({
            name: 'horizontalStraightLine',
            groupId: 'drawings',
            points: [{ timestamp: Date.now(), value: m.price }],
          })
          setMenu(null)
        },
      },
    )
    return (
      <div className="ctx-menu" style={{ left: m.x, top: m.y }} onClick={(e) => e.stopPropagation()}>
        {items.map((item) => (
          <button key={item.label} onClick={item.onClick} style={item.color ? { color: item.color } : undefined}>
            {item.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <section className="chart-panel">
      <div className="chart-toolbar">
        <div className="seg">
          {(Object.keys(PERIODS) as PeriodKey[]).map((p) => (
            <button key={p} className={p === period ? 'active' : ''} onClick={() => setPeriod(p)}>
              {p}
            </button>
          ))}
        </div>
        <span className="hint">右鍵：在圖上下單 · Alt+點擊：帶入價格 · 拖曳委託線：改價</span>
      </div>
      <div className="chart-body">
        <div className="draw-toolbar">
          {DRAW_TOOLS.map((t) => (
            <button
              key={t.name}
              title={t.label}
              className={activeTool === t.name ? 'active' : ''}
              onClick={() => selectTool(t.name)}
            >
              {t.icon}
            </button>
          ))}
          <div className="divider" />
          <button title={magnet ? '磁吸：開' : '磁吸：關'} className={magnet ? 'active' : ''} onClick={() => setMagnet((m) => !m)}>
            🧲
          </button>
          <button title="清除所有畫線" onClick={clearDrawings}>
            🗑
          </button>
        </div>
        <div className="chart-canvas-wrap" onContextMenu={onContextMenu} onClick={onClick}>
          <div className="chart-canvas" ref={containerRef} />
          {menu && renderMenu(menu)}
        </div>
      </div>
    </section>
  )
}

