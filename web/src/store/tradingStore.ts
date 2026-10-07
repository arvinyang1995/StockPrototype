// 全域交易狀態。目前扮演「模擬期貨商」：委託、撮合、部位、資金都在這裡計算。
// 之後接真實券商時，這裡改為接收後端推送的委託／成交回報即可，UI 不需要改。
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { Period } from 'klinecharts'
import { INSTRUMENTS, roundToTick, SYMBOLS, type SymbolCode } from '../sim/instruments'
import {
  applyFill,
  calcFee,
  increasesExposure,
  matchPrice,
  unrealizedPnl,
  type Fill,
  type Order,
  type OrderType,
  type Position,
  type Side,
} from '../sim/exchange'
import type { Tick } from '../sim/market'

export type TradingMode = 'DEMO' | 'PAPER' | 'LIVE'

export const PERIODS = {
  '1m': { type: 'minute', span: 1 },
  '5m': { type: 'minute', span: 5 },
  '15m': { type: 'minute', span: 15 },
  '1H': { type: 'hour', span: 1 },
  '4H': { type: 'hour', span: 4 },
  '1D': { type: 'day', span: 1 },
} satisfies Record<string, Period>
export type PeriodKey = keyof typeof PERIODS

export const INITIAL_CASH = 1_000_000
const DEFAULT_PRICE = 23_000
const MAX_FILLS = 300

export interface Quote {
  last: number
  bid: number
  ask: number
  dayOpen: number
  time: number
}

export interface OrderForm {
  side: Side
  type: OrderType
  price: number | null
  qty: number
}

export interface PlaceOrderInput {
  symbol: SymbolCode
  side: Side
  type: OrderType
  price: number | null
  qty: number
}

export interface Toast {
  id: string
  kind: 'info' | 'success' | 'error'
  text: string
}

interface TradingState {
  mode: TradingMode
  symbol: SymbolCode
  period: PeriodKey
  quote: Quote
  orders: Order[]
  fills: Fill[]
  positions: Partial<Record<SymbolCode, Position>>
  cash: number
  settings: { confirmOrders: boolean; maxQtyPerOrder: number }
  form: OrderForm
  toasts: Toast[]
  /** 等待使用者確認的委託（開啟下單確認時使用） */
  pendingOrder: PlaceOrderInput | null

  setSymbol: (symbol: SymbolCode) => void
  setPeriod: (period: PeriodKey) => void
  updateForm: (patch: Partial<OrderForm>) => void
  updateSettings: (patch: Partial<TradingState['settings']>) => void
  pushToast: (kind: Toast['kind'], text: string) => void
  dismissToast: (id: string) => void
  setPendingOrder: (input: PlaceOrderInput | null) => void

  // 以下為模擬期貨商端的動作，由 api/broker.ts 呼叫
  submitOrder: (input: PlaceOrderInput) => Order
  cancelOrder: (id: string) => void
  modifyOrder: (id: string, price: number) => Order
  onTick: (tick: Tick, dayOpen: number) => void
  resetAccount: () => void
}

const uid = () => Math.random().toString(36).slice(2, 10).toUpperCase()

const SIDE_TEXT: Record<Side, string> = { BUY: '買進', SELL: '賣出' }

function quoteFromLast(last: number, dayOpen: number, tickSize = 1): Quote {
  return { last, bid: last - tickSize, ask: last + tickSize, dayOpen, time: Date.now() }
}

type AccountSlice = Pick<TradingState, 'orders' | 'fills' | 'positions' | 'cash'>

/** 以指定價格讓委託全部成交，回傳新的帳戶狀態與成交紀錄 */
function executeOrder(state: AccountSlice, order: Order, price: number) {
  const inst = INSTRUMENTS[order.symbol]
  const { position, realizedPnl } = applyFill(state.positions[order.symbol], order.symbol, order.side, order.qty, price, inst)
  const fee = calcFee(inst, price, order.qty)
  const now = Date.now()
  const fill: Fill = {
    id: uid(),
    orderId: order.id,
    symbol: order.symbol,
    side: order.side,
    price,
    qty: order.qty,
    fee,
    realizedPnl,
    time: now,
  }
  const filledOrder: Order = { ...order, status: 'FILLED', fillPrice: price, updatedAt: now }
  const positions = { ...state.positions }
  if (position.qty === 0) delete positions[order.symbol]
  else positions[order.symbol] = position
  return {
    slice: {
      orders: state.orders.some((o) => o.id === order.id)
        ? state.orders.map((o) => (o.id === order.id ? filledOrder : o))
        : [filledOrder, ...state.orders],
      fills: [fill, ...state.fills].slice(0, MAX_FILLS),
      positions,
      cash: state.cash + realizedPnl - fee,
    } satisfies AccountSlice,
    fill,
  }
}

export function calcEquity(state: Pick<TradingState, 'cash' | 'positions' | 'quote'>) {
  let unrealized = 0
  for (const pos of Object.values(state.positions)) {
    if (pos) unrealized += unrealizedPnl(pos, state.quote.last, INSTRUMENTS[pos.symbol])
  }
  return { unrealized, equity: state.cash + unrealized }
}

/** 已用保證金：持倉 + 會增加曝險的掛單 */
export function calcMarginUsed(state: Pick<TradingState, 'positions' | 'orders'>) {
  let used = 0
  for (const symbol of SYMBOLS) {
    const inst = INSTRUMENTS[symbol]
    const posQty = state.positions[symbol]?.qty ?? 0
    used += Math.abs(posQty) * inst.initialMargin
    for (const o of state.orders) {
      if (o.symbol === symbol && o.status === 'WORKING' && increasesExposure(posQty, o.side, o.qty)) {
        used += o.qty * inst.initialMargin
      }
    }
  }
  return used
}

function describeFill(fill: Fill) {
  return `${SIDE_TEXT[fill.side]} ${INSTRUMENTS[fill.symbol].name} ${fill.qty} 口 成交 @ ${fill.price.toLocaleString()}`
}

const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      // 無痕模式或儲存空間被封鎖時忽略，頁面仍可正常運作
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // ignore
    }
  },
}

export const useTradingStore = create<TradingState>()(
  persist(
    (set, get) => ({
      mode: 'DEMO',
      symbol: 'MXF',
      period: '1m',
      quote: quoteFromLast(DEFAULT_PRICE, DEFAULT_PRICE),
      orders: [],
      fills: [],
      positions: {},
      cash: INITIAL_CASH,
      settings: { confirmOrders: true, maxQtyPerOrder: 10 },
      form: { side: 'BUY', type: 'LMT', price: null, qty: 1 },
      toasts: [],
      pendingOrder: null,

      setSymbol: (symbol) => set({ symbol }),
      setPeriod: (period) => set({ period }),
      updateForm: (patch) => set((s) => ({ form: { ...s.form, ...patch } })),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      pushToast: (kind, text) => {
        const id = uid()
        set((s) => ({ toasts: [...s.toasts.slice(-4), { id, kind, text }] }))
        setTimeout(() => get().dismissToast(id), 3500)
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      setPendingOrder: (pendingOrder) => set({ pendingOrder }),

      submitOrder: (input) => {
        const state = get()
        const inst = INSTRUMENTS[input.symbol]
        const now = Date.now()
        const order: Order = {
          id: uid(),
          symbol: input.symbol,
          side: input.side,
          type: input.type,
          price: input.type === 'MKT' || input.price === null ? null : roundToTick(input.price, inst.tickSize),
          qty: input.qty,
          status: 'WORKING',
          fillPrice: null,
          createdAt: now,
          updatedAt: now,
        }

        const reject = (reason: string): Order => {
          const rejected: Order = { ...order, status: 'REJECTED', reason }
          set((s) => ({ orders: [rejected, ...s.orders] }))
          return rejected
        }

        if (!Number.isInteger(input.qty) || input.qty <= 0) return reject('口數必須為正整數')
        if (order.type !== 'MKT' && (order.price === null || order.price <= 0)) return reject('請輸入價格')

        // 防呆只限制「加碼／新倉」，平倉不受單筆上限影響
        const posQty = state.positions[input.symbol]?.qty ?? 0
        if (increasesExposure(posQty, input.side, input.qty)) {
          if (input.qty > state.settings.maxQtyPerOrder) return reject(`超過單筆上限 ${state.settings.maxQtyPerOrder} 口`)
          const { equity } = calcEquity(state)
          const required = calcMarginUsed(state) + input.qty * inst.initialMargin
          if (required > equity) return reject('保證金不足')
        }

        // 市價單或可立即成交的限價單直接成交
        const price = matchPrice(order, state.quote.bid, state.quote.ask)
        if (price !== null) {
          const { slice, fill } = executeOrder(state, order, price)
          set(slice)
          get().pushToast('success', describeFill(fill))
          return slice.orders[0]
        }
        set((s) => ({ orders: [order, ...s.orders] }))
        return order
      },

      cancelOrder: (id) => {
        const order = get().orders.find((o) => o.id === id)
        if (!order || order.status !== 'WORKING') throw new Error('委託已成交或不存在，無法刪單')
        set((s) => ({
          orders: s.orders.map((o) => (o.id === id ? { ...o, status: 'CANCELLED', updatedAt: Date.now() } : o)),
        }))
      },

      modifyOrder: (id, price) => {
        const state = get()
        const order = state.orders.find((o) => o.id === id)
        if (!order || order.status !== 'WORKING') throw new Error('委託已成交或不存在，無法改價')
        if (order.type === 'MKT') throw new Error('市價單無法改價')
        const next: Order = {
          ...order,
          price: roundToTick(price, INSTRUMENTS[order.symbol].tickSize),
          updatedAt: Date.now(),
        }
        // 改價後若可立即成交（例如限價買單拖到市價之上）則直接成交
        const fillPrice = matchPrice(next, state.quote.bid, state.quote.ask)
        if (fillPrice !== null) {
          const { slice, fill } = executeOrder({ ...state, orders: state.orders.map((o) => (o.id === id ? next : o)) }, next, fillPrice)
          set(slice)
          get().pushToast('success', describeFill(fill))
          return { ...next, status: 'FILLED', fillPrice }
        }
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? next : o)) }))
        return next
      },

      onTick: (tick, dayOpen) => {
        let state = get()
        const quote = quoteFromLast(tick.price, dayOpen)
        let slice: AccountSlice = state
        const fills: Fill[] = []
        for (const order of state.orders) {
          if (order.status !== 'WORKING') continue
          const price = matchPrice(order, quote.bid, quote.ask)
          if (price === null) continue
          const result = executeOrder(slice, order, price)
          slice = result.slice
          fills.push(result.fill)
        }
        set(fills.length ? { ...slice, quote } : { quote })
        state = get()
        fills.forEach((f) => state.pushToast('success', describeFill(f)))
      },

      resetAccount: () =>
        set({ orders: [], fills: [], positions: {}, cash: INITIAL_CASH }),
    }),
    {
      name: 'tw-futures-demo',
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({
        symbol: s.symbol,
        period: s.period,
        orders: s.orders.slice(0, 200),
        fills: s.fills,
        positions: s.positions,
        cash: s.cash,
        settings: s.settings,
        quote: s.quote,
      }),
    },
  ),
)
