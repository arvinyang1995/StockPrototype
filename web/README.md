# 期貨交易台 — 階段 1 Mock UI

台指期／小台／微台的交易介面原型。**全部為假資料與模擬撮合，不會送出任何真實委託。**

## 指令

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 撮合／部位計算單元測試
npm run build    # 輸出到 dist/
```

## 部署（給客戶測 UX）

推送到 `main` 後由 GitHub Actions 自動部署到 GitHub Pages：https://arvinyang1995.github.io/StockPrototype/
（建置時設定 `GITHUB_PAGES=true`，讓資源路徑帶上 `/StockPrototype/` 子路徑。）

帳戶狀態存在瀏覽器 localStorage，每位測試者各自獨立；右上角「重設帳戶」可清空。

## 功能

- K 線：1m / 5m / 15m / 1H / 4H / 1D、MA、成交量、縮放拖曳、十字線
- 畫線：水平線、垂直線、趨勢線、射線、線段、價格標記、平行通道、費波那契、磁吸
- 圖上交易：右鍵選單下限價／停損單、拖曳委託線改價、點 ✕ 刪單、持倉線即時顯示損益、Alt+點擊帶入價格
- 下單面板：限價／市價／停損、口數快捷鍵、預估保證金、下單確認視窗（Enter／Esc）、單筆口數上限
- 五檔、持倉／委託中（雙擊價格可改價）／成交回報／歷史委託

## 架構（之後接券商要換的地方）

```
src/
  sim/market.ts        模擬行情（之後換成後端 WebSocket 推送）
  sim/exchange.ts      撮合與部位計算（純函式，有單元測試）
  store/tradingStore.ts 目前兼任「模擬期貨商」；之後改為接收後端委託／成交回報
  api/broker.ts        BrokerAdapter 介面，新增 Shioaji／富邦 Neo adapter 後替換 mockBroker
  api/hooks.ts         TanStack Query mutation（下單、刪單、改價、平倉）
  chart/overlays.ts    KLineChart 自訂委託線／持倉線
  components/          UI
```

顏色採台灣習慣：紅漲綠跌、買進紅、賣出綠（`src/theme.ts` 可調整）。
保證金、手續費為 mock 值，實際以期交所與期貨商公告為準。
