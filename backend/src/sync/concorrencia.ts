/**
 * Aplica `fn` a cada item, com no máximo `limite` em andamento.
 *
 * A varredura fazia uma consulta de cada vez. Com 77 endereços e uns 230 ms de
 * latência por consulta contra o explorador público, isso são 18 segundos de
 * relógio para uma volta em que o processo passa o tempo todo esperando.
 *
 * O limite não é enfeite: disparar as 77 de uma vez é exatamente a rajada que
 * faz o explorador responder `429`, e o watchtower não pode resolver a própria
 * lentidão criando o problema seguinte.
 *
 * A ordem do resultado acompanha a da entrada, e não a de quem terminou antes —
 * quem chama depende de índice para casar resposta com endereço.
 */
export async function mapComLimite<T, R>(
  itens: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  if (itens.length === 0) return []

  const resultados = new Array<R>(itens.length)
  let proximo = 0

  async function frente(): Promise<void> {
    for (;;) {
      const indice = proximo++
      if (indice >= itens.length) return
      resultados[indice] = await fn(itens[indice]!, indice)
    }
  }

  const frentes = Array.from({ length: Math.min(limite, itens.length) }, () => frente())
  await Promise.all(frentes)
  return resultados
}
