import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En développement (npm run dev), /api est redirigé vers le serveur Node.js local.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
})
