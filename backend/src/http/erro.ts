/**
 * Erro de API com código.
 *
 * A interface é bilíngue e as mensagens saíam só em português. O código é o que
 * permite a tela escolher o idioma; a mensagem continua na resposta como texto
 * de reserva, para quem consome a API direto e para código que ainda não tem
 * frase no catálogo.
 *
 * Os parâmetros viajam separados porque frases como "esta chave é de {chave},
 * mas este watchtower vigia {rede}" precisam deles para serem úteis — sem eles
 * a tradução vira um aviso genérico que não ajuda ninguém a corrigir.
 */
export interface ErroDaApi {
  error: string
  code: string
  params?: Record<string, unknown>
}

export function erro(
  code: string,
  mensagem: string,
  params?: Record<string, unknown>,
): ErroDaApi {
  return params ? { error: mensagem, code, params } : { error: mensagem, code }
}
