import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 網址為 https://<user>.github.io/StockPrototype/，需要子路徑
  base: process.env.GITHUB_PAGES ? '/StockPrototype/' : '/',
  plugins: [react()],
})
