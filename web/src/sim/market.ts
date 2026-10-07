// 模擬行情：以 1 分 K 為基底產生歷史資料，並以固定頻率推送 tick。
// 三個商品共用同一個指數價格（台指／小台／微台價格相同）。
import type { KLineData, Period } from 'klinecharts'

const MINUTE = 60_000
const TAIPEI_OFFSET = 8 * 60 * MINUTE
const HISTORY_MINUTES = 60 * 24 * 60 // 60 天的 1 分 K
const TICK_INTERVAL_MS = 400
const MINUTE_SIGMA = 5 // 每分鐘波動（點）

export interface Tick {
  price: number
  volume: number
  time: number
}

type TickListener = (tick: Tick) => void

export function periodToMs(period: Period) {
  const unit: Record<string, number> = {
    second: 1000,
    minute: MINUTE,
    hour: 60 * MINUTE,
    day: 24 * 60 * MINUTE,
    week: 7 * 24 * 60 * MINUTE,
  }
  return (unit[period.type] ?? MINUTE) * period.span
}

/** 依台北時間切 K 棒區間 */
export function bucketStart(ts: number, periodMs: number) {
  return Math.floor((ts + TAIPEI_OFFSET) / periodMs) * periodMs - TAIPEI_OFFSET
}

function gaussian() {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function randomVolume() {
  return Math.max(1, Math.round(Math.abs(gaussian()) * 3))
}

class MockMarket {
  private bars: KLineData[] = []
  private listeners = new Set<TickListener>()
  private timer: ReturnType<typeof setInterval> | null = null
  private drift = 0
  last = 0

  start(startPrice: number) {
    if (this.timer) return
    this.generateHistory(startPrice)
    this.timer = setInterval(() => this.emitTick(), TICK_INTERVAL_MS)
  }

  /** 由現價往回推算歷史，讓最後一根 K 剛好收在 startPrice */
  private generateHistory(startPrice: number) {
    const nowBucket = bucketStart(Date.now(), MINUTE)
    const closes: number[] = new Array(HISTORY_MINUTES)
    let price = startPrice
    for (let i = HISTORY_MINUTES - 1; i >= 0; i--) {
      closes[i] = price
      price = Math.max(1000, Math.round(price - gaussian() * MINUTE_SIGMA))
    }
    this.bars = closes.map((close, i) => {
      const open = i === 0 ? close : closes[i - 1]
      const wick = Math.abs(gaussian()) * MINUTE_SIGMA * 0.6
      return {
        timestamp: nowBucket - (HISTORY_MINUTES - 1 - i) * MINUTE,
        open,
        close,
        high: Math.round(Math.max(open, close) + wick),
        low: Math.round(Math.min(open, close) - wick),
        volume: randomVolume() * 20,
      }
    })
    this.last = startPrice
  }

  private emitTick() {
    // 緩慢變化的趨勢 + 隨機擾動，讓走勢比純隨機漫步更像真實盤
    this.drift = this.drift * 0.98 + gaussian() * 0.05
    const step = Math.round(gaussian() * 1.6 + this.drift)
    const price = Math.max(1000, this.last + step)
    const tick: Tick = { price, volume: randomVolume(), time: Date.now() }
    this.applyTick(tick)
    this.listeners.forEach((fn) => fn(tick))
  }

  private applyTick(tick: Tick) {
    const bucket = bucketStart(tick.time, MINUTE)
    const lastBar = this.bars[this.bars.length - 1]
    if (lastBar && lastBar.timestamp === bucket) {
      lastBar.high = Math.max(lastBar.high, tick.price)
      lastBar.low = Math.min(lastBar.low, tick.price)
      lastBar.close = tick.price
      lastBar.volume = (lastBar.volume ?? 0) + tick.volume
    } else {
      this.bars.push({
        timestamp: bucket,
        open: this.last,
        high: Math.max(this.last, tick.price),
        low: Math.min(this.last, tick.price),
        close: tick.price,
        volume: tick.volume,
      })
    }
    this.last = tick.price
  }

  onTick(fn: TickListener) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  /** 取得指定週期、指定時間之前（不含）的 K 棒；before 為 null 時取最新 */
  getBars(period: Period, before: number | null, limit: number) {
    const periodMs = periodToMs(period)
    const end = before ?? Infinity
    const result: KLineData[] = []
    let current: KLineData | null = null
    // 由新往舊聚合，湊滿 limit 根即停止
    for (let i = this.bars.length - 1; i >= 0; i--) {
      const bar = this.bars[i]
      const bucket = bucketStart(bar.timestamp, periodMs)
      if (bucket >= end) continue
      if (!current || current.timestamp !== bucket) {
        if (current) {
          if (result.length === limit) break
          result.push(current)
        }
        current = { ...bar, timestamp: bucket }
      } else {
        current.open = bar.open
        current.high = Math.max(current.high, bar.high)
        current.low = Math.min(current.low, bar.low)
        current.volume = (current.volume ?? 0) + (bar.volume ?? 0)
      }
    }
    if (current && result.length < limit) result.push(current)
    const hasMore = result.length === limit && this.bars[0].timestamp < result[result.length - 1].timestamp
    return { bars: result.reverse(), hasMore }
  }

  /** 取得目前正在形成中的 K 棒 */
  getCurrentBar(period: Period): KLineData | null {
    const { bars } = this.getBars(period, null, 1)
    return bars[0] ?? null
  }

  /** 當日（台北時間）開盤參考價，用於計算漲跌 */
  getDayOpen() {
    const dayStart = bucketStart(Date.now(), 24 * 60 * MINUTE)
    if (this.dayOpenCache?.dayStart !== dayStart) {
      let open = this.last
      for (let i = this.bars.length - 1; i >= 0 && this.bars[i].timestamp >= dayStart; i--) open = this.bars[i].open
      this.dayOpenCache = { dayStart, open }
    }
    return this.dayOpenCache.open
  }
  private dayOpenCache: { dayStart: number; open: number } | null = null
}

export const market = new MockMarket()
