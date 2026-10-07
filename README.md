# StockPrototype

台灣期貨交易介面原型（台指期／小台／微台），目標是提供類似 TradingView／幣圈交易所的操作體驗。

**線上 Demo：** https://arvinyang1995.github.io/StockPrototype/

> 目前為階段 1：全部為假行情與模擬撮合，不會送出任何真實委託。

## 專案結構

| 資料夾 | 內容 |
|---|---|
| `web/` | 前端交易介面（React + Vite + KLineChart + Zustand + TanStack Query + AG Grid），說明見 [web/README.md](web/README.md) |

## 開發階段

1. ✅ Mock UI：假資料、模擬撮合，給客戶測試 UX
2. ⬜ 接期貨商模擬環境（待確認期貨商：凱基／永豐／富邦）
3. ⬜ 小量實單（1 口微台）

## 部署

推送到 `main` 後，GitHub Actions 會自動測試、建置並部署到 GitHub Pages（`.github/workflows/deploy-pages.yml`）。
