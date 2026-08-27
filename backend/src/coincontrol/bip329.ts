import type { Marca } from './marks'

/**
 * BIP-329 — formato de rótulos de carteira, em JSON Lines.
 *
 * Interopera com Sparrow, Nunchuk, BlueWallet e Jade. Uma linha por objeto,
 * `type` e `ref` obrigatórios; para saídas, `ref` é `txid:vout`, e
 * `spendable: false` é como a spec diz "não gaste este UTXO" — que é o nosso
 * congelamento.
 *
 * A spec não tem campo de tag. Elas são anexadas ao rótulo como `#tag`, o que
 * mantém a ida e a volta sem perda e continua legível numa carteira que só
 * saiba mostrar o rótulo.
 *
 * Cuidado com `spendable`: **omitir não quer dizer "gastável"**. A spec diz que
 * omitir manda a carteira de destino preservar o que já tinha. Por isso a
 * exportação sempre escreve o campo, e a importação distingue "não mencionado"
 * de "gastável".
 */

interface LinhaBip329 {
  type?: string
  ref?: string
  label?: string
  spendable?: boolean
}

/**
 * O que uma linha do arquivo diz sobre uma saída.
 *
 * `frozen` é opcional porque a spec permite não dizer nada a respeito, e
 * ausência é diferente de negação: tratar "não mencionado" como "gastável"
 * descongelaria em silêncio tudo que o usuário congelou, ao importar um
 * arquivo de carteira que não escreve o campo.
 */
export interface MarcaImportada {
  txid: string
  vout: number
  label: string | null
  tags: string[]
  frozen?: boolean
}

const REF_DE_SAIDA = /^([0-9a-fA-F]{64}):(\d+)$/
const TAG_NO_ROTULO = /\s#([^\s#]+)/g

export function rotuloComTags(label: string | null, tags: string[]): string {
  const marcadores = tags.map(t => '#' + t).join(' ')
  if (!label) return marcadores
  return marcadores ? `${label} ${marcadores}` : label
}

export function separarTags(label: string): { label: string | null; tags: string[] } {
  const tags: string[] = []
  // ` #tag` só é tag quando vem depois de espaço: um `#` colado numa palavra
  // faz parte do texto que a pessoa escreveu.
  const limpo = (' ' + label).replace(TAG_NO_ROTULO, (_, tag: string) => {
    tags.push(tag)
    return ''
  })
  const texto = limpo.trim()
  return { label: texto || null, tags }
}

export function exportarBip329(marcas: Marca[]): string {
  const linhas: string[] = []

  for (const m of marcas) {
    const label = rotuloComTags(m.label, m.tags)
    // Marca que não diz nada não vira linha: um arquivo cheio de saídas sem
    // rótulo nem congelamento não é exportação, é ruído.
    if (!label && !m.frozen) continue

    // Sempre explícito. Omitir mandaria a carteira de destino preservar o
    // congelamento que ela já tivesse, e o nosso "não está congelado" nunca
    // chegaria lá.
    linhas.push(
      JSON.stringify({
        type: 'output',
        ref: `${m.txid}:${m.vout}`,
        label,
        spendable: !m.frozen,
      } satisfies LinhaBip329),
    )
  }

  return linhas.length ? linhas.join('\n') + '\n' : ''
}

export interface ImportacaoBip329 {
  marcas: MarcaImportada[]
  /** linhas que não viraram marca: outro tipo, JSON inválido, ref estranha */
  ignoradas: number
}

export function interpretarBip329(texto: string): ImportacaoBip329 {
  const marcas: MarcaImportada[] = []
  let ignoradas = 0

  for (const bruta of texto.split('\n')) {
    const linha = bruta.trim()
    if (!linha) continue

    let obj: LinhaBip329
    try {
      obj = JSON.parse(linha)
    } catch {
      // Uma linha corrompida no meio não pode custar as outras mil.
      ignoradas += 1
      continue
    }

    // Arquivo de outra carteira traz tx, addr, pubkey e xpub junto. Não são
    // erro: são tipos que este projeto ainda não usa.
    if (obj.type !== 'output') {
      ignoradas += 1
      continue
    }

    const ref = REF_DE_SAIDA.exec(obj.ref ?? '')
    if (!ref) {
      ignoradas += 1
      continue
    }

    const { label, tags } = separarTags(obj.label ?? '')
    marcas.push({
      txid: ref[1]!,
      vout: Number(ref[2]),
      label,
      tags,
      // ausente fica ausente: quem importa decide preservar o que já tinha
      ...(obj.spendable === undefined ? {} : { frozen: obj.spendable === false }),
    })
  }

  return { marcas, ignoradas }
}
