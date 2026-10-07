// 模擬撮合與部位計算（純函式，方便日後換成真實券商回報時沿用與測試）
import { FUTURES_TAX_RATE, type Instrument, type SymbolCode } from './instruments'

export type Side = 'BUY' | 'SELL'
export type OrderType = 'MKT' | 'LMT' | 'STP'
export type OrderStatus = 'WORKING' | 'FILLED' | 'CANCELLED' | 'REJECTED'

export interface Order {
  id: string
  symbol: SymbolCode
  side: Side
  type: OrderType
  /** LMT 為限價、STP 為觸發價、MKT 為 null */
  price: number | null
  qty: number
  status: OrderStatus
  fillPrice: number | null
  createdAt: number
  updatedAt: number
  reason?: string
}

export interface Fill {
  id: string
  orderId: string
  symbol: SymbolCode
  side: Side
  price: number
  qty: number
  fee: number
  realizedPnl: number
  time: number
}

export interface Position {
  symbol: SymbolCode
  /** 正數為多單、負數為空單 */
  qty: number
  avgPrice: number
}

export const sideSign = (side: Side) => (side === 'BUY' ? 1 : -1)

/** 手續費 + 期交稅 */
export function calcFee(inst: Instrument, price: number, qty: number) {
  return inst.commission * qty + Math.round(price * inst.pointValue * qty * FUTURES_TAX_RATE)
}

/** 成交後的新部位與已實現損益 */
export function applyFill(
  position: Position | undefined,
  symbol: SymbolCode,
  side: Side,
  qty: number,
  price: number,
  inst: Instrument,
): { position: Position; realizedPnl: number } {
  const prevQty = position?.qty ?? 0
  const prevAvg = position?.avgPrice ?? 0
  const delta = sideSign(side) * qty
  const nextQty = prevQty + delta

  // 同方向加碼（或原本無部位）：加權平均成本
  if (prevQty === 0 || Math.sign(prevQty) === Math.sign(delta)) {
    const avgPrice = (prevAvg * Math.abs(prevQty) + price * qty) / Math.abs(nextQty)
    return { position: { symbol, qty: nextQty, avgPrice }, realizedPnl: 0 }
  }

  // 反向：先平倉，超出的部分反手建倉
  const closedQty = Math.min(qty, Math.abs(prevQty))
  const realizedPnl = (price - prevAvg) * Math.sign(prevQty) * closedQty * inst.pointValue
  if (nextQty === 0) return { position: { symbol, qty: 0, avgPrice: 0 }, realizedPnl }
  const flipped = Math.sign(nextQty) !== Math.sign(prevQty)
  return {
    position: { symbol, qty: nextQty, avgPrice: flipped ? price : prevAvg },
    realizedPnl,
  }
}

export function unrealizedPnl(position: Position, last: number, inst: Instrument) {
  return (last - position.avgPrice) * position.qty * inst.pointValue
}

/**
 * 檢查委託在目前報價下是否成交，回傳成交價或 null。
 * bid / ask 為模擬的一檔買賣價。
 */
export function matchPrice(order: Order, bid: number, ask: number): number | null {
  if (order.status !== 'WORKING') return null
  const isBuy = order.side === 'BUY'
  switch (order.type) {
    case 'MKT':
      return isBuy ? ask : bid
    case 'LMT': {
      const limit = order.price!
      if (isBuy) return ask <= limit ? ask : null
      return bid >= limit ? bid : null
    }
    case 'STP': {
      const stop = order.price!
      // 觸發後以市價成交
      if (isBuy) return ask >= stop ? ask : null
      return bid <= stop ? bid : null
    }
  }
}

/** 此委託是否會增加曝險（需要佔用保證金） */
export function increasesExposure(positionQty: number, side: Side, qty: number) {
  const delta = sideSign(side) * qty
  return Math.abs(positionQty + delta) > Math.abs(positionQty)
}
