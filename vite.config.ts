import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The API worker does not expose CORS headers, so the app talks to it
// same-origin. In dev/preview we proxy those routes to the live worker; in
// production the built assets are served from the same host as the API.
const API_TARGET = 'https://amra-signal.devusimple.workers.dev'

const proxy = {
  '/api': { target: API_TARGET, changeOrigin: true, secure: true },
  '/ws': { target: API_TARGET.replace('https:', 'wss:'), changeOrigin: true, ws: true },
  '/openapi.json': { target: API_TARGET, changeOrigin: true, secure: true },
  '/docs': { target: API_TARGET, changeOrigin: true, secure: true },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
})
