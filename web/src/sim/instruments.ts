// 台灣期交所期貨商品規格（保證金為 mock 值，實際以期交所公告為準）
export type SymbolCode = 'TXF' | 'MXF' | 'TMF'

export interface Instrument {
  code: SymbolCode
  name: string
  /** 每點價值（新台幣） */
  pointValue: number
  /** 最小跳動點 */
  tickSize: number
  /** 原始保證金（mock） */
  initialMargin: number
  /** 手續費（每口單邊，mock） */
  commission: number
}

export const INSTRUMENTS: Record<SymbolCode, Instrument> = {
  TXF: { code: 'TXF', name: '台指期', pointValue: 200, tickSize: 1, initialMargin: 322_000, commission: 50 },
  MXF: { code: 'MXF', name: '小台指', pointValue: 50, tickSize: 1, initialMargin: 80_500, commission: 30 },
  TMF: { code: 'TMF', name: '微台指', pointValue: 10, tickSize: 1, initialMargin: 16_100, commission: 15 },
}

export const SYMBOLS = Object.keys(INSTRUMENTS) as SymbolCode[]

/** 期交稅：契約金額 × 十萬分之二 */
export const FUTURES_TAX_RATE = 0.00002

export function roundToTick(price: number, tickSize: number) {
  return Math.round(price / tickSize) * tickSize
}
