// 自訂 KLineChart overlay：委託線（可拖曳改價、可點 ✕ 刪單）與持倉線
import { registerOverlay, utils, type OverlayFigure } from 'klinecharts'

export interface OrderLineData {
  orderId: string
  /** 例如「限價買 2」 */
  label: string
  color: string
}

export interface PositionLineData {
  label: string
  color: string
}

const LABEL_SIZE = 12
const LABEL_PADDING = { paddingLeft: 6, paddingRight: 6, paddingTop: 4, paddingBottom: 4 }

function labelStyle(color: string) {
  return {
    style: 'fill',
    color: '#fff',
    size: LABEL_SIZE,
    weight: 600,
    backgroundColor: color,
    borderColor: color,
    borderSize: 1,
    borderRadius: 3,
    ...LABEL_PADDING,
  }
}

const textWidth = (text: string) => utils.calcTextWidth(text, LABEL_SIZE, 600) + LABEL_PADDING.paddingLeft + LABEL_PADDING.paddingRight

let registered = false

export function registerTradingOverlays() {
  if (registered) return
  registered = true

  registerOverlay<OrderLineData>({
    name: 'orderLine',
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const data = overlay.extendData
      const y = coordinates[0].y
      const price = Math.round(overlay.points[0].value ?? 0).toLocaleString()
      const label = `${data.label} @ ${price}`
      const labelX = 8
      const cancelX = labelX + textWidth(label) + 2
      const figures: OverlayFigure[] = [
        {
          key: 'line',
          type: 'line',
          attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] },
          styles: { style: 'dashed', color: data.color, size: 1, dashedValue: [6, 4] },
        },
        {
          // 加寬的透明感應區，讓虛線比較好抓
          key: 'hit',
          type: 'rect',
          attrs: { x: 0, y: y - 5, width: bounding.width, height: 10 },
          styles: { style: 'fill', color: 'rgba(0,0,0,0)', borderSize: 0 },
        },
        { key: 'label', type: 'text', attrs: { x: labelX, y, text: label, baseline: 'middle' }, styles: labelStyle(data.color) },
        {
          key: 'cancel',
          type: 'text',
          attrs: { x: cancelX, y, text: '✕', baseline: 'middle' },
          styles: { ...labelStyle('#1e2329'), color: data.color },
        },
      ]
      return figures
    },
    createYAxisFigures: ({ coordinates, bounding, overlay, yAxis }) => {
      const isFromZero = yAxis?.isFromZero() ?? false
      return {
        type: 'text',
        attrs: {
          x: isFromZero ? 0 : bounding.width,
          y: coordinates[0].y,
          text: Math.round(overlay.points[0].value ?? 0).toLocaleString(),
          align: isFromZero ? 'left' : 'right',
          baseline: 'middle',
        },
        styles: labelStyle(overlay.extendData.color),
      }
    },
  })

  registerOverlay<PositionLineData>({
    name: 'positionLine',
    totalStep: 2,
    lock: true,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const data = overlay.extendData
      const y = coordinates[0].y
      return [
        {
          type: 'line',
          attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] },
          styles: { style: 'solid', color: data.color, size: 1 },
          ignoreEvent: true,
        },
        {
          type: 'text',
          attrs: { x: bounding.width * 0.35, y, text: data.label, baseline: 'middle' },
          styles: labelStyle(data.color),
          ignoreEvent: true,
        },
      ]
    },
  })
}
