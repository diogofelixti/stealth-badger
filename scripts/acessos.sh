#!/usr/bin/env sh
#
# Os acessos externos, sem decorar comando.
#
# O painel liga e desliga container que **existe**; ele não sabe o que o
# `docker-compose.yml` diz, porque a API do Docker Engine não lê arquivo de
# compose. `preparar` é o que fecha essa distância: cria os containers dos três
# perfis uma vez, e daí em diante a tela controla sozinha.
#
#   ./scripts/acessos.sh preparar            cria os três, sem subir nenhum
#   ./scripts/acessos.sh estado              o que existe e o que está de pé
#   ./scripts/acessos.sh tor up              sobe um caminho
#   ./scripts/acessos.sh cloudflared down    desce um caminho
#   ./scripts/acessos.sh controle            sobe o painel podendo controlar
#
# Nenhum comando aqui publica nada por conta própria: `preparar` cria e para,
# e subir um caminho continua sendo uma linha que você digita.

set -eu

PERFIS='tor tailscale cloudflared'
RAIZ=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$RAIZ"

vermelho() { printf '\033[31m%s\033[0m\n' "$1" >&2; }
titulo()   { printf '\n\033[1m%s\033[0m\n' "$1"; }

perfil_valido() {
  for p in $PERFIS; do [ "$p" = "$1" ] && return 0; done
  return 1
}

uso() {
  # o próprio cabeçalho deste arquivo é a ajuda: para no primeiro não-comentário
  awk 'NR>2 && /^#/ { sub(/^# ?/, ""); print; next } NR>2 { exit }' "$0"
  exit "${1:-1}"
}

case "${1:-}" in
  preparar)
    titulo 'Criando os containers dos três caminhos, sem subir nenhum'
    for p in $PERFIS; do
      printf '  %-12s ' "$p"
      if docker compose --profile "$p" create "$p" >/dev/null 2>&1; then
        echo 'pronto'
      else
        echo 'falhou'
        vermelho "    rode 'docker compose --profile $p create $p' para ver o erro"
      fi
    done
    echo
    echo 'Agora o painel liga e desliga cada um pela tela, se ele subiu com o'
    echo 'socket montado:  ./scripts/acessos.sh controle'
    ;;

  estado)
    titulo 'Caminhos externos'
    printf '  %-12s %-10s %s\n' PERFIL ESTADO CONTAINER
    for p in $PERFIS; do
      id=$(docker compose --profile "$p" ps -aq "$p" 2>/dev/null | head -1)
      if [ -z "$id" ]; then
        printf '  %-12s %-10s %s\n' "$p" 'não criado' '·'
      else
        estado=$(docker inspect -f '{{.State.Status}}' "$id" 2>/dev/null || echo '?')
        printf '  %-12s %-10s %s\n' "$p" "$estado" "$(echo "$id" | cut -c1-12)"
      fi
    done
    echo
    echo "não criado?  ./scripts/acessos.sh preparar"
    ;;

  controle)
    titulo 'Subindo o painel com o socket do Docker montado'
    vermelho 'Quem alcança o socket do Docker é root nesta máquina. Com ele montado,'
    vermelho 'uma sessão do painel vale execução de código aqui. Só o admin da'
    vermelho 'instância alcança os botões, e só três perfis e dois verbos passam.'
    echo
    docker compose -f docker-compose.yml -f docker-compose.controle.yml up -d
    ;;

  ''|-h|--help|ajuda)
    uso 0
    ;;

  *)
    perfil="$1"
    acao="${2:-}"
    perfil_valido "$perfil" || { vermelho "perfil desconhecido: $perfil"; uso; }
    case "$acao" in
      up)
        titulo "Subindo $perfil"
        docker compose --profile "$perfil" up -d "$perfil"
        ;;
      down)
        titulo "Parando $perfil"
        docker compose --profile "$perfil" stop "$perfil"
        ;;
      status)
        docker compose --profile "$perfil" ps -a "$perfil"
        ;;
      *)
        vermelho "ação desconhecida: ${acao:-<vazia>}. Use up, down ou status."
        uso
        ;;
    esac
    ;;
esac
