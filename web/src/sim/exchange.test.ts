import { describe, expect, it } from 'vitest'
import { applyFill, calcFee, increasesExposure, matchPrice, type Order } from './exchange'
import { INSTRUMENTS } from './instruments'

const TXF = INSTRUMENTS.TXF

function order(partial: Partial<Order>): Order {
  return {
    id: 'o1',
    symbol: 'TXF',
    side: 'BUY',
    type: 'LMT',
    price: 100,
    qty: 1,
    status: 'WORKING',
    fillPrice: null,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

describe('applyFill', () => {
  it('opens and averages into a long position', () => {
    const a = applyFill(undefined, 'TXF', 'BUY', 1, 100, TXF)
    const b = applyFill(a.position, 'TXF', 'BUY', 3, 120, TXF)
    expect(b.position).toEqual({ symbol: 'TXF', qty: 4, avgPrice: 115 })
    expect(b.realizedPnl).toBe(0)
  })

  it('realizes P&L when closing a long', () => {
    const { position, realizedPnl } = applyFill({ symbol: 'TXF', qty: 2, avgPrice: 100 }, 'TXF', 'SELL', 2, 110, TXF)
    expect(position.qty).toBe(0)
    expect(realizedPnl).toBe(10 * 2 * 200)
  })

  it('realizes P&L when closing a short', () => {
    const { realizedPnl } = applyFill({ symbol: 'TXF', qty: -1, avgPrice: 100 }, 'TXF', 'BUY', 1, 90, TXF)
    expect(realizedPnl).toBe(10 * 200)
  })

  it('keeps average price on a partial close', () => {
    const { position, realizedPnl } = applyFill({ symbol: 'TXF', qty: 3, avgPrice: 100 }, 'TXF', 'SELL', 1, 95, TXF)
    expect(position).toEqual({ symbol: 'TXF', qty: 2, avgPrice: 100 })
    expect(realizedPnl).toBe(-5 * 200)
  })

  it('flips a position and resets the average price', () => {
    const { position, realizedPnl } = applyFill({ symbol: 'TXF', qty: 1, avgPrice: 100 }, 'TXF', 'SELL', 3, 105, TXF)
    expect(position).toEqual({ symbol: 'TXF', qty: -2, avgPrice: 105 })
    expect(realizedPnl).toBe(5 * 200)
  })
})

describe('matchPrice', () => {
  it('fills market orders at the opposite side', () => {
    expect(matchPrice(order({ type: 'MKT', price: null }), 99, 101)).toBe(101)
    expect(matchPrice(order({ type: 'MKT', side: 'SELL', price: null }), 99, 101)).toBe(99)
  })

  it('fills limit orders only when marketable', () => {
    expect(matchPrice(order({ price: 100 }), 99, 101)).toBeNull()
    expect(matchPrice(order({ price: 101 }), 99, 101)).toBe(101)
    expect(matchPrice(order({ side: 'SELL', price: 99 }), 99, 101)).toBe(99)
    expect(matchPrice(order({ side: 'SELL', price: 100 }), 99, 101)).toBeNull()
  })

  it('triggers stop orders when price crosses the stop', () => {
    expect(matchPrice(order({ type: 'STP', price: 105 }), 99, 101)).toBeNull()
    expect(matchPrice(order({ type: 'STP', price: 101 }), 99, 101)).toBe(101)
    expect(matchPrice(order({ type: 'STP', side: 'SELL', price: 99 }), 99, 101)).toBe(99)
  })

  it('ignores orders that are not working', () => {
    expect(matchPrice(order({ status: 'CANCELLED', price: 200 }), 99, 101)).toBeNull()
  })
})

describe('fees and exposure', () => {
  it('charges commission plus futures tax', () => {
    // 23000 × 200 × 0.00002 = 92
    expect(calcFee(TXF, 23000, 1)).toBe(50 + 92)
  })

  it('detects whether an order adds exposure', () => {
    expect(increasesExposure(0, 'BUY', 1)).toBe(true)
    expect(increasesExposure(2, 'SELL', 1)).toBe(false)
    expect(increasesExposure(2, 'SELL', 2)).toBe(false)
    expect(increasesExposure(2, 'SELL', 5)).toBe(true)
  })
})
