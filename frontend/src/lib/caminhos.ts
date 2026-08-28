/**
 * Os três caminhos externos, descritos uma vez só.
 *
 * A página de cada caminho é a mesma componente lida três vezes: o que muda
 * entre elas é este objeto. Um quarto caminho é uma entrada aqui e um punhado
 * de frases no catálogo, e não uma quarta tela para manter em dia.
 *
 * **Comando não mora no catálogo.** `docker compose --profile tor up -d` não é
 * prosa: ele não se traduz, e uma tradução dele seria um comando que não roda.
 * Frase fica no catálogo, comando fica aqui.
 */
export type Caminho = 'tor' | 'tailscale' | 'cloudflare'

export interface Passo {
  /** chave do catálogo com a frase do passo */
  chave: string
  /** o comando que este passo executa, quando ele tem um */
  comando?: string
}

export interface DescricaoDoCaminho {
  caminho: Caminho
  /**
   * O perfil do compose. Não é o mesmo nome do caminho: o serviço da Cloudflare
   * chama `cloudflared`, e é esse nome que vai para o `--profile` e para a
   * lista branca do backend.
   */
  perfil: 'tor' | 'tailscale' | 'cloudflared'
  passos: Passo[]
  /** quantas frases de "quando não funciona" este caminho tem */
  problemas: number
  /** `https` só na Cloudflare, que é a única que termina TLS */
  esquema: 'http' | 'https'
  /** o arquivo em `docs/acessos/`, ligado do rodapé da página */
  doc: string
}

export const CAMINHOS: Record<Caminho, DescricaoDoCaminho> = {
  tor: {
    caminho: 'tor',
    perfil: 'tor',
    passos: [
      { chave: 'access.tor.step1', comando: 'docker compose --profile tor up -d' },
      { chave: 'access.tor.step2' },
      { chave: 'access.tor.step3' },
    ],
    problemas: 3,
    esquema: 'http',
    doc: 'docs/acessos/tor.md',
  },
  tailscale: {
    caminho: 'tailscale',
    perfil: 'tailscale',
    passos: [
      { chave: 'access.tailscale.step1' },
      {
        chave: 'access.tailscale.step2',
        comando: 'docker compose --profile tailscale up -d',
      },
      { chave: 'access.tailscale.step3' },
      { chave: 'access.tailscale.step4' },
    ],
    problemas: 3,
    esquema: 'http',
    doc: 'docs/acessos/tailscale.md',
  },
  cloudflare: {
    caminho: 'cloudflare',
    perfil: 'cloudflared',
    passos: [
      { chave: 'access.cloudflare.step1' },
      {
        chave: 'access.cloudflare.step2',
        comando: 'docker compose --profile cloudflared up -d',
      },
      { chave: 'access.cloudflare.step3' },
    ],
    problemas: 3,
    esquema: 'https',
    doc: 'docs/acessos/cloudflare.md',
  },
}

/**
 * O endereço de um caminho, que mora com nome diferente no Tor e nos outros.
 *
 * `onion` e `hostname` são campos distintos de propósito na API: um vem de um
 * arquivo no volume do hidden service, o outro do `.env`. O nome diferente
 * lembra que as duas coisas não são a mesma.
 */
export function enderecoDoCaminho(
  estado: {
    tor: { onion?: string }
    tailscale: { hostname?: string }
    cloudflare: { hostname?: string }
  },
  caminho: Caminho,
): string | null {
  if (caminho === 'tor') return estado.tor.onion ?? null
  return estado[caminho].hostname ?? null
}

export function ehCaminho(v: string | undefined): v is Caminho {
  return v !== undefined && v in CAMINHOS
}

/**
 * A URL que o QR e o link precisam ter.
 *
 * A porta é a que o navegador está usando **agora**: quem chegou aqui pelo
 * `:8080` alcança os outros caminhos no `:8080` também, porque é o mesmo nginx
 * atrás dos três. Chutar `:80` faria o QR do celular abrir em lugar nenhum na
 * instalação padrão, que publica em `8080`.
 *
 * A exceção é a Cloudflare: ela termina TLS na borda e entrega o domínio na
 * 443, sem porta nenhuma na URL.
 */
export function urlDoCaminho(
  desc: DescricaoDoCaminho,
  host: string,
  portaAtual = typeof window === 'undefined' ? '' : window.location.port,
): string {
  if (desc.esquema === 'https') return `https://${host}`
  // O hidden service publica na 80: o `torrc` mapeia `80 nginx:80`.
  if (desc.caminho === 'tor') return `http://${host}`
  return portaAtual ? `http://${host}:${portaAtual}` : `http://${host}`
}
