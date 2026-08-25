import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { api, type Catalog, type Lang, type Me } from './lib/api'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import './styles/index.css'

const IDIOMA_SALVO = 'sb_lang'

function idiomaInicial(): Lang {
  const salvo = localStorage.getItem(IDIOMA_SALVO)
  if (salvo === 'pt' || salvo === 'en') return salvo
  return navigator.language.startsWith('pt') ? 'pt' : 'en'
}

function App() {
  const [me, setMe] = useState<Me | null>(null)
  const [carregado, setCarregado] = useState(false)
  const [lang, setLang] = useState<Lang>(idiomaInicial)
  const [catalog, setCatalog] = useState<Catalog>({})

  // O idioma vive no usuário, porque o push é renderizado no servidor; o
  // localStorage só cobre a tela de entrada, antes de haver usuário.
  const trocarIdioma = useCallback(
    (novo: Lang) => {
      setLang(novo)
      localStorage.setItem(IDIOMA_SALVO, novo)
      if (me) void api.setLanguage(novo).catch(() => undefined)
    },
    [me],
  )

  const identificar = useCallback(async () => {
    try {
      const usuario = await api.me()
      setMe(usuario)
      setLang(usuario.language)
    } catch {
      setMe(null)
    } finally {
      setCarregado(true)
    }
  }, [])

  useEffect(() => {
    void identificar()
  }, [identificar])

  useEffect(() => {
    void api
      .catalog(lang)
      .then(setCatalog)
      .catch(() => setCatalog({}))
  }, [lang])

  if (!carregado) return null

  return me ? (
    <Dashboard
      me={me}
      catalog={catalog}
      lang={lang}
      onLang={trocarIdioma}
      onSaiu={() => setMe(null)}
    />
  ) : (
    <Login
      catalog={catalog}
      lang={lang}
      onLang={trocarIdioma}
      onEntrou={() => void identificar()}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
