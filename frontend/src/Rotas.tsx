import { Route, Routes } from 'react-router-dom'
import type { Catalog, Lang, Me } from './lib/api'
import { Layout, useDadosDoPainel } from './pages/Layout'
import { Dashboard } from './pages/Dashboard'
import { WalletsPage } from './pages/WalletsPage'
import { WalletPage } from './pages/WalletPage'
import { AlertsPage } from './pages/AlertsPage'
import { SettingsPage } from './pages/SettingsPage'
import { AccessPage } from './pages/AccessPage'
import { AcessoPage } from './pages/AcessoPage'

/** O painel lê catálogo e idioma do contexto, como as outras páginas. */
function Painel() {
  const { catalog, lang } = useDadosDoPainel()
  return <Dashboard catalog={catalog} lang={lang} />
}

export function Rotas({
  me,
  catalog,
  lang,
  onLang,
  onSaiu,
}: {
  me: Me
  catalog: Catalog
  lang: Lang
  onLang: (l: Lang) => void
  onSaiu: () => void
}) {
  return (
    <Routes>
      <Route
        element={
          <Layout me={me} catalog={catalog} lang={lang} onLang={onLang} onSaiu={onSaiu} />
        }
      >
        <Route path="/" element={<Painel />} />
        <Route path="/carteiras" element={<WalletsPage />} />
        <Route path="/carteiras/:id" element={<WalletPage />} />
        <Route path="/alertas" element={<AlertsPage />} />
        <Route path="/configuracoes" element={<SettingsPage />} />
        <Route path="/acessos" element={<AccessPage />} />
        <Route path="/acessos/:caminho" element={<AcessoPage />} />
        {/* Rota desconhecida cai no painel: melhor a tela cheia que um vazio. */}
        <Route path="*" element={<Painel />} />
      </Route>
    </Routes>
  )
}
