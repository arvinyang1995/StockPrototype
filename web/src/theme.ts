// 台灣習慣：紅漲綠跌、買進紅色、賣出綠色（與歐美／幣圈相反）
export const UP = '#f6465d'
export const DOWN = '#0ecb81'
export const BUY = UP
export const SELL = DOWN

export const CHART_BG = '#0b0e11'
export const GRID = '#1b2028'
export const TEXT_DIM = '#848e9c'
export const TEXT = '#eaecef'
export const ACCENT = '#f0b90b'

export const pnlColor = (value: number) => (value > 0 ? UP : value < 0 ? DOWN : TEXT_DIM)

export const fmt = (value: number, digits = 0) =>
  value.toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const fmtSigned = (value: number, digits = 0) => `${value > 0 ? '+' : ''}${fmt(value, digits)}`
