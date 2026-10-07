// 券商介面層。UI 只透過 BrokerAdapter 下單，之後接 Shioaji / 富邦 Neo 時，
// 只需新增一個呼叫自家 backend 的 adapter，替換 mockBroker 即可。
import { INSTRUMENTS, SYMBOLS, type Instrument, type SymbolCode } from '../sim/instruments'
import type { Order } from '../sim/exchange'
import { useTradingStore, type PlaceOrderInput } from '../store/tradingStore'

export interface BrokerAdapter {
  getContracts: () => Promise<Instrument[]>
  placeOrder: (input: PlaceOrderInput) => Promise<Order>
  cancelOrder: (id: string) => Promise<void>
  modifyOrder: (id: string, price: number) => Promise<Order>
  /** 市價平倉指定商品 */
  closePosition: (symbol: SymbolCode) => Promise<Order>
  cancelAll: () => Promise<number>
}

/** 模擬網路延遲，讓 UI 的 loading 狀態更接近真實情況 */
const latency = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 80))

const store = () => useTradingStore.getState()

export const mockBroker: BrokerAdapter = {
  async getContracts() {
    await latency(300)
    return SYMBOLS.map((s) => INSTRUMENTS[s])
  },

  async placeOrder(input) {
    await latency()
    const order = store().submitOrder(input)
    if (order.status === 'REJECTED') throw new Error(`委託失敗：${order.reason}`)
    return order
  },

  async cancelOrder(id) {
    await latency()
    store().cancelOrder(id)
  },

  async modifyOrder(id, price) {
    await latency()
    return store().modifyOrder(id, price)
  },

  async closePosition(symbol) {
    const pos = store().positions[symbol]
    if (!pos || pos.qty === 0) throw new Error('沒有可平倉的部位')
    return mockBroker.placeOrder({
      symbol,
      side: pos.qty > 0 ? 'SELL' : 'BUY',
      type: 'MKT',
      price: null,
      qty: Math.abs(pos.qty),
    })
  },

  async cancelAll() {
    await latency()
    const working = store().orders.filter((o) => o.status === 'WORKING')
    working.forEach((o) => store().cancelOrder(o.id))
    return working.length
  },
}

export const broker: BrokerAdapter = mockBroker
