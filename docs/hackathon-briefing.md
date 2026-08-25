# Briefing do Hackathon — Bitcoin Vibe Builder

Análise da aula de abertura (`Aula 9 - Semana 3 - Bitcoin Vibe Builder.pdf`,
Prof. Rafael Penna). Registro do que é regra oficial e do que isso muda no plano do
**Stealth Badger**.

---

## 1. Dados oficiais

| | |
|---|---|
| Evento | Hackathon Bitcoin Vibe Builder — projeto final do curso |
| Período | 24/08 a 28/08 de 2026 |
| Equipes | 1 ou 2 alunos |
| **Acompanhamento** | **26/08, 19h às 20h, Zoom** |
| **Apresentação final** | **28/08, 19h às 22h, Zoom** |
| Tempo de pitch | **10 minutos** |
| Execução | servidor ou computador pessoal |
| Entrega oficial | **link do repositório no GitHub** |
| Prêmio | **150.000 satoshis** ao melhor conjunto |

## 2. Objetivo declarado

> "Transformar o aprendizado do curso em uma solução funcional. Construir um produto
> real, protótipo funcional ou automação útil para o ecossistema Bitcoin."

E o aviso que vale mais que o objetivo:

> **"Não vence quem faz mais coisa. Vence quem define bem o problema, entrega um fluxo
> real e demonstra com clareza."**
> **"Pequeno + funcional + bem compreendido."**
> "Evitem o 'projeto gigante incompleto'. Foquem no menor fluxo capaz de demonstrar valor."

Formatos aceitos: app web, CLI, dashboard, bot, agente, automação, **monitoramento**,
pagamentos, análise de dados, educacional. "Formato é meio, não fim."

Requisitos de qualquer formato:
1. problema e público definidos
2. fluxo principal executável
3. integração funcional com Bitcoin

## 3. Integração real com Bitcoin

> "Bitcoin precisa fazer parte do funcionamento, não só do tema. **Onde o Bitcoin
> participa do fluxo?**"

Componentes citados: RPC Bitcoin Core · Lightning/invoices · APIs públicas · blocos e
transações · **UTXOs/mempool** · wallets/serviços.

> "Não precisa usar node + Lightning + carteira + banco ao mesmo tempo. Escolham apenas
> os componentes necessários ao problema."

## 4. Arquitetura

> "A arquitetura é uma justificativa, não uma lista obrigatória. Alguns projetos podem
> não precisar de frontend, banco, IA no produto ou servidor permanente. **Durante a
> apresentação, expliquem a função de cada componente escolhido.**"
> "Boa arquitetura = peças suficientes para o fluxo funcionar."

## 5. IA como acelerador

> "A equipe continua responsável pelas decisões. A IA ajuda a construir. A equipe decide,
> revisa, testa e explica."
> **"Não publiquem segredos. Não entreguem código que ninguém entendeu."**

## 6. Entregas mínimas obrigatórias

```
projeto/
├── README.md              → entender e executar
├── docs/specification.md  → comportamento esperado
├── código
├── testes essenciais      → proteger regras
├── .env.example           → documentar configs
└── .gitignore             → evitar segredos
```

## 7. Estrutura obrigatória do pitch (10 min)

1. problema + solução
2. arquitetura
3. **demonstração ao vivo**
4. limitações + próximos passos

> "Mostrem o produto funcionando."

## 8. Critérios de avaliação

| | |
|---|---|
| clareza do problema | utilidade Bitcoin |
| fluxo funcionando | integração real |
| arquitetura coerente | uso responsável da IA |
| **testes e validação** | documentação |
| demo clara | **limitações honestas** |

> "Complexidade por si só não é critério de qualidade."

---

## 9. O que isso muda no nosso plano

Cinco mudanças concretas em relação ao design escrito em 24/08.

### 9.1 Ganhamos quase um dia — a entrega é sexta às 19h

O design assumia entrega na manhã de sexta. É **28/08 das 19h às 22h**. Isso libera
sexta-feira inteira para testes, documentação e ensaio, em vez de virar corrida.

### 9.2 Existe um checkpoint na quarta, 26/08 às 19h

Sessão de acompanhamento no Zoom. Precisamos de **algo demonstrável na quarta à noite** —
não slides. O alvo natural é o fluxo do watchtower ponta a ponta: cadastrar carteira,
sincronizar, disparar um alerta real.

### 9.3 Testes deixam de ser opcionais

`testes e validação` é critério de avaliação **e** entrega mínima obrigatória. O plano
original não os previa. Passam a ser contínuos, não uma tarefa de sexta-feira — TDD nas
regras de negócio que importam: deduplicação de alerta, detecção de reorg, gap limit,
projeção de UTXO, parsing BIP-329.

### 9.4 O caminho `docs/specification.md` é esperado pelo avaliador

Nosso design vive em `docs/superpowers/specs/`. Precisamos de `docs/specification.md`
como documento canônico do comportamento esperado, no caminho que o briefing pede.

### 9.5 O repositório precisa terminar público

A entrega oficial é o link do GitHub. Começa privado por escolha nossa, mas **tem que ser
tornado público antes de 28/08 às 19h**. Item de checklist, não detalhe.

### 9.6 O pitch é de 10 minutos, não 5

O roteiro de demonstração foi dimensionado para cerca de 5 minutos. Há espaço para as
quatro partes obrigatórias com folga — e a parte de "limitações + próximos passos" é
critério pontuado, não preenchimento de tempo.

---

## 10. Onde estamos fortes

- **Integração real com Bitcoin** é o critério onde mais pontuamos. O produto vive de
  UTXOs, mempool, blocos, transações, RPC do Core e APIs públicas — praticamente toda a
  lista do slide 5, e não como tema, mas como funcionamento.
- **Limitações honestas** é critério pontuado, e nosso design já as trata como recurso de
  produto: o badge de aviso de privacidade quando se usa explorador público, e o estado
  `degraded` de carteira. Isso deixa de ser ressalva e vira argumento.
- **Clareza do problema.** "Reutilização de endereço e má gestão de UTXO destroem a
  privacidade de quem usa Bitcoin, e ninguém avisa você" é um problema nítido, com público
  definido.
- **Formato "monitoramento"** está explicitamente na lista de formatos aceitos.

## 11. Onde estamos expostos

- **Escopo.** O briefing repete três vezes que projeto grande e incompleto perde. Nosso
  recorte já é agressivo, e mesmo assim é a nossa maior ameaça. A regra sob pressão é
  cortar da lista "se sobrar tempo" da §4 do design, nunca do "deve entrar".
- **Justificar cada peça da arquitetura.** Escolhemos Postgres, frontend separado, backend,
  nginx e containers. O slide 6 pede explicitamente que cada componente seja justificado no
  pitch. Precisamos de uma frase pronta para cada um — em especial para o Postgres, cuja
  justificativa real é `LISTEN/NOTIFY`, `JSONB` no log de eventos e isolamento multi-tenant.
- **Testes.** Entramos devendo. Ver §9.3.
- **"Não entreguem código que ninguém entendeu."** Se o avaliador perguntar como o
  tratamento de reorg funciona, ou por que o adapter declara capacidades, tem que haver
  resposta imediata.

---

## 12. Checklist de conformidade

- [ ] `README.md` que permita entender e executar
- [ ] `docs/specification.md` com o comportamento esperado
- [ ] Testes essenciais protegendo as regras de negócio
- [ ] `.env.example` documentando todas as configurações
- [ ] `.gitignore` sem nenhum segredo versionado
- [ ] Repositório **tornado público** antes de 28/08 19h
- [ ] Algo demonstrável no acompanhamento de 26/08 19h
- [ ] Pitch de 10 min ensaiado, com as 4 partes obrigatórias
- [ ] Justificativa de uma frase para cada componente da arquitetura
- [ ] Seção de limitações honestas escrita, não improvisada
- [ ] Demonstração ao vivo com plano B gravado
