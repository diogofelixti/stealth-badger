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
    // faz `npm run dev` falar com o backend sem depender do nginx.
    // O alvo é configurável porque a 3000 é porta disputada: se outro
    // serviço a ocupar, o proxy responde 404 em HTML e a interface parece
    // quebrada sem nenhum erro que aponte para o motivo.
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
