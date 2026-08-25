import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // escuta em todas as interfaces: o painel é conferido de outra máquina
    // da rede local, não só do host que roda o dev server
    host: true,
    port: 5173,
    strictPort: true,
    // faz `npm run dev` falar com o backend sem depender do nginx
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
