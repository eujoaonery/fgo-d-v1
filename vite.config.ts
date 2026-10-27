import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

/** Vale no HTML publicado. O dev do Vite fica de fora para o HMR continuar. */
const PRODUCTION_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' https://challenges.cloudflare.com",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://images.unsplash.com",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ')

function productionCsp(): Plugin {
  return {
    name: 'fogo-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const meta = `<meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`
      return html.replace('<head>', `<head>\n    ${meta}`)
    },
  }
}

const mapTilesProxy = {
  '/api': {
    target: 'http://localhost:8787',
    changeOrigin: true,
  },
  '/map-tiles': {
    target: 'https://tile.openstreetmap.de',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/map-tiles/, ''),
    headers: {
      'User-Agent': 'FOGO-CCO/1.0 (+https://fgo.criativfy.com.br)',
    },
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), productionCsp()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: mapTilesProxy,
  },
  preview: {
    port: 4173,
    proxy: mapTilesProxy,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
