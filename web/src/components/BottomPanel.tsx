import { useMemo, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { colorSchemeDark, themeQuartz, type ColDef, type ICellRendererParams } from 'ag-grid-community'
import { INSTRUMENTS } from '../sim/instruments'
import { unrealizedPnl, type Fill, type Order, type Position } from '../sim/exchange'
import { useTradingStore } from '../store/tradingStore'
import { useCancelOrder, useClosePosition, useModifyOrder } from '../api/hooks'
import { ACCENT, BUY, CHART_BG, GRID, SELL, TEXT, fmt, fmtSigned, pnlColor } from '../theme'

const gridTheme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: CHART_BG,
  foregroundColor: TEXT,
  headerBackgroundColor: '#11161c',
  borderColor: GRID,
  accentColor: ACCENT,
  fontSize: 12,
  headerFontSize: 12,
  spacing: 4,
  wrapperBorderRadius: 0,
  wrapperBorder: false,
})

type Tab = 'positions' | 'working' | 'fills' | 'history'

const SIDE_TEXT = { BUY: '買進', SELL: '賣出' } as const
const TYPE_TEXT = { LMT: '限價', MKT: '市價', STP: '停損' } as const
const STATUS_TEXT = { WORKING: '委託中', FILLED: '已成交', CANCELLED: '已刪單', REJECTED: '失敗' } as const

const time = (ts: number) =>
  new Date(ts).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })

const sideCell = { cellStyle: (p: { value: string }) => ({ color: p.value === 'BUY' ? BUY : SELL, fontWeight: 600 }) }
const symbolCol: ColDef = { field: 'symbol', headerName: '商品', valueFormatter: (p) => INSTRUMENTS[p.value as keyof typeof INSTRUMENTS].name, maxWidth: 110 }

interface PositionRow extends Position {
  last: number
  pnlPoints: number
  pnl: number
}

function PositionActions({ data }: ICellRendererParams<PositionRow>) {
  const close = useClosePosition()
  if (!data) return null
  return (
    <button className="cell-btn" disabled={close.isPending} onClick={() => close.mutate(data.symbol)}>
      市價平倉
    </button>
  )
}

function OrderActions({ data }: ICellRendererParams<Order>) {
  const cancel = useCancelOrder()
  if (!data) return null
  return (
    <button className="cell-btn" disabled={cancel.isPending} onClick={() => cancel.mutate(data.id)}>
      刪單
    </button>
  )
}

export function BottomPanel() {
  const [tab, setTab] = useState<Tab>('positions')
  const positions = useTradingStore((s) => s.positions)
  const last = useTradingStore((s) => s.quote.last)
  const orders = useTradingStore((s) => s.orders)
  const fills = useTradingStore((s) => s.fills)
  const { mutate: modifyOrder } = useModifyOrder()

  const positionRows = useMemo<PositionRow[]>(
    () =>
      Object.values(positions)
        .filter((p): p is Position => !!p && p.qty !== 0)
        .map((p) => {
          const inst = INSTRUMENTS[p.symbol]
          return {
            ...p,
            last,
            pnlPoints: (last - p.avgPrice) * Math.sign(p.qty),
            pnl: unrealizedPnl(p, last, inst),
          }
        }),
    [positions, last],
  )
  const working = useMemo(() => orders.filter((o) => o.status === 'WORKING'), [orders])
  const history = useMemo(() => orders.filter((o) => o.status !== 'WORKING'), [orders])

  const positionCols = useMemo<ColDef<PositionRow>[]>(
    () => [
      symbolCol,
      {
        headerName: '方向',
        valueGetter: (p) => (p.data!.qty > 0 ? '多單' : '空單'),
        cellStyle: (p) => ({ color: p.data!.qty > 0 ? BUY : SELL, fontWeight: 600 }),
        maxWidth: 90,
      },
      { headerName: '口數', valueGetter: (p) => Math.abs(p.data!.qty), maxWidth: 90 },
      { field: 'avgPrice', headerName: '均價', valueFormatter: (p) => fmt(p.value, 1) },
      { field: 'last', headerName: '現價', valueFormatter: (p) => fmt(p.value) },
      {
        field: 'pnlPoints',
        headerName: '損益(點)',
        valueFormatter: (p) => fmtSigned(p.value, 1),
        cellStyle: (p) => ({ color: pnlColor(p.value) }),
      },
      {
        field: 'pnl',
        headerName: '未實現損益(元)',
        valueFormatter: (p) => fmtSigned(p.value),
        cellStyle: (p) => ({ color: pnlColor(p.value), fontWeight: 600 }),
        flex: 1,
      },
      { headerName: '', cellRenderer: PositionActions, minWidth: 110, maxWidth: 120, sortable: false },
    ],
    [],
  )

  const workingCols = useMemo<ColDef<Order>[]>(
    () => [
      { field: 'createdAt', headerName: '時間', valueFormatter: (p) => time(p.value), minWidth: 90, sort: 'desc' },
      symbolCol,
      { field: 'side', headerName: '買賣', valueFormatter: (p) => SIDE_TEXT[p.value as Order['side']], maxWidth: 90, ...sideCell },
      { field: 'type', headerName: '類型', valueFormatter: (p) => TYPE_TEXT[p.value as Order['type']], maxWidth: 90 },
      {
        field: 'price',
        headerName: '價格 ✎',
        headerTooltip: '雙擊可直接改價',
        valueFormatter: (p) => (p.value === null ? '市價' : fmt(p.value)),
        editable: (p) => p.data?.type !== 'MKT',
        cellEditor: 'agNumberCellEditor',
        // 不直接改 row 資料，改送改價委託，等回報後由 store 更新
        valueSetter: (p) => {
          if (typeof p.newValue === 'number' && p.newValue > 0 && p.newValue !== p.oldValue) {
            modifyOrder({ id: p.data.id, price: p.newValue })
          }
          return false
        },
      },
      { field: 'qty', headerName: '口數', maxWidth: 90 },
      { field: 'id', headerName: '委託書號', flex: 1 },
      { headerName: '', cellRenderer: OrderActions, maxWidth: 100, sortable: false },
    ],
    [modifyOrder],
  )

  const fillCols = useMemo<ColDef<Fill>[]>(
    () => [
      { field: 'time', headerName: '時間', valueFormatter: (p) => time(p.value), minWidth: 90, sort: 'desc' },
      symbolCol,
      { field: 'side', headerName: '買賣', valueFormatter: (p) => SIDE_TEXT[p.value as Fill['side']], maxWidth: 90, ...sideCell },
      { field: 'price', headerName: '成交價', valueFormatter: (p) => fmt(p.value) },
      { field: 'qty', headerName: '口數', maxWidth: 90 },
      { field: 'fee', headerName: '手續費+稅', valueFormatter: (p) => fmt(p.value) },
      {
        field: 'realizedPnl',
        headerName: '平倉損益',
        valueFormatter: (p) => (p.value === 0 ? '—' : fmtSigned(p.value)),
        cellStyle: (p) => ({ color: pnlColor(p.value) }),
        flex: 1,
      },
    ],
    [],
  )

  const historyCols = useMemo<ColDef<Order>[]>(
    () => [
      { field: 'updatedAt', headerName: '時間', valueFormatter: (p) => time(p.value), minWidth: 90, sort: 'desc' },
      symbolCol,
      { field: 'side', headerName: '買賣', valueFormatter: (p) => SIDE_TEXT[p.value as Order['side']], maxWidth: 90, ...sideCell },
      { field: 'type', headerName: '類型', valueFormatter: (p) => TYPE_TEXT[p.value as Order['type']], maxWidth: 90 },
      { field: 'price', headerName: '委託價', valueFormatter: (p) => (p.value === null ? '市價' : fmt(p.value)) },
      { field: 'fillPrice', headerName: '成交價', valueFormatter: (p) => (p.value === null ? '—' : fmt(p.value)) },
      { field: 'qty', headerName: '口數', maxWidth: 90 },
      { field: 'status', headerName: '狀態', valueFormatter: (p) => STATUS_TEXT[p.value as Order['status']], maxWidth: 110 },
      { field: 'reason', headerName: '備註', flex: 1 },
    ],
    [],
  )

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'positions', label: '持倉', count: positionRows.length },
    { key: 'working', label: '委託中', count: working.length },
    { key: 'fills', label: '成交回報', count: fills.length },
    { key: 'history', label: '歷史委託', count: history.length },
  ]

  const common = {
    theme: gridTheme,
    rowHeight: 32,
    headerHeight: 30,
    defaultColDef: { sortable: true, resizable: true, suppressMovable: true, flex: 1, minWidth: 70 },
    animateRows: false,
  }

  return (
    <section className="bottom-panel">
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
            {t.count > 0 && <span className="count">{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="grid-wrap">
        {tab === 'positions' && (
          <AgGridReact<PositionRow>
            {...common}
            rowData={positionRows}
            columnDefs={positionCols}
            getRowId={(p) => p.data.symbol}
            overlayNoRowsTemplate="目前沒有持倉"
          />
        )}
        {tab === 'working' && (
          <AgGridReact<Order>
            {...common}
            rowData={working}
            columnDefs={workingCols}
            getRowId={(p) => p.data.id}
            overlayNoRowsTemplate="目前沒有委託"
          />
        )}
        {tab === 'fills' && (
          <AgGridReact<Fill>
            {...common}
            rowData={fills}
            columnDefs={fillCols}
            getRowId={(p) => p.data.id}
            overlayNoRowsTemplate="尚無成交"
          />
        )}
        {tab === 'history' && (
          <AgGridReact<Order>
            {...common}
            rowData={history}
            columnDefs={historyCols}
            getRowId={(p) => p.data.id}
            overlayNoRowsTemplate="尚無歷史委託"
          />
        )}
      </div>
    </section>
  )
}
