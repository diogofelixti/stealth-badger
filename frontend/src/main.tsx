import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Shell } from './components/Shell'
import './styles/index.css'

/**
 * Casca sem telas: a Task 12 troca este arquivo pelo roteamento entre login e
 * painel. Até lá, a aplicação sobe mostrando a postura do backend de cadeia e
 * o convite para a primeira carteira.
 */
function App() {
  return (
    <Shell backend={{ isPublic: true, host: 'mempool.space' }}>
      <section className="mx-auto max-w-2xl px-4 py-16 sm:px-8">
        <h1 className="text-lg font-semibold uppercase tracking-label">
          Nada sob vigília
        </h1>
        <p className="mt-3 max-w-prose font-prose text-sm leading-relaxed text-muted">
          O Stealth Badger acompanha carteiras watch-only e avisa quando um
          movimento expõe você — endereço reutilizado, poeira plantada, troco
          entregando quanto você tem. Cadastre uma chave pública estendida para
          começar.
        </p>
        <p className="mt-6 font-mono text-xs uppercase tracking-label text-faint">
          Chave pública apenas · nenhuma capacidade de gasto entra aqui
        </p>
      </section>
    </Shell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
