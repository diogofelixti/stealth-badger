export type Lang = 'pt' | 'en'

export const LANGS: Lang[] = ['pt', 'en']

export function isLang(v: string): v is Lang {
  return (LANGS as string[]).includes(v)
}

export const CATALOG: Record<Lang, Record<string, string>> = {
  pt: {
    'alert.funds_received.title': 'Fundos recebidos',
    'alert.funds_received.body': '{value} sats, {state}.',
    'alert.funds_spent.title': 'Fundos gastos',
    'alert.funds_spent.body': 'O UTXO {txid}:{vout} foi consumido.',
    'alert.kyc_origin.title': 'Origem dos fundos',
    'alert.kyc_origin.body':
      'A transação {txid} {basis} {kind}. Confiança declarada pelo scanner: ' +
      '{confidence}. Fundos de origem conhecida ligam sua identidade a tudo que ' +
      'você gastar junto com eles.',
    'alert.privacy_tx_type.title': 'Transação de privacidade detectada',
    'alert.privacy_tx_type.body':
      'A transação {txid} foi classificada pelo scanner como {txType}. {meaning}',
    'tx_type.coinjoin.received':
      'Para quem fez, coinjoin costuma melhorar a privacidade. Para você, que recebeu, trate este UTXO como contexto sensível antes de misturar com outros.',
    'tx_type.payjoin.received':
      'Payjoin costuma proteger os dois lados contra heurísticas simples. Mesmo assim, este UTXO merece atenção antes de ser gasto junto com outros.',
    'basis.database': 'foi reconhecida pela base de entidades do scanner como',
    'basis.behavior': 'tem forma compatível com',
    'entity.exchange': 'saque em lote de exchange',
    'entity.darknet': 'serviço de darknet',
    'entity.gambling': 'serviço de gambling',
    'entity.ofac': 'endereço em lista de sanções (OFAC)',
    'entity.known': 'entidade conhecida',
    'confidence.high': 'alta',
    'confidence.medium': 'média',
    'confidence.low': 'baixa',
    'confidence.deterministic': 'determinística',
    'alert.score_dropped.title': 'Privacidade piorou',
    'alert.score_dropped.body':
      'O score desta carteira caiu de {from} para {to}, {drop} pontos, e a nota ' +
      'passou a {grade}. Abra a análise para ver o que mudou antes de gastar.',
    'alert.dust_received.title': 'Possível dust attack',
    'alert.dust_received.body':
      'Chegaram {value} sats de origem desconhecida em {address}, abaixo do limiar ' +
      'de {threshold} sats. Dust é plantado para rastrear você no instante em que ' +
      'gastar. Congele este UTXO.',
    'alert.address_reused.title': 'Address reuse detectado',
    'alert.address_reused.body':
      'O endereço {address} recebeu de novo. Os dois pagamentos passam a estar ' +
      'publicamente ligados; é a maior causa isolada de perda de privacidade.',
    'alert.reorg_detected.title': 'Reorg detectado',
    'alert.reorg_detected.body':
      'Transações a partir da altura {height} foram revertidas e o saldo recalculado.',
    'state.mempool': 'ainda no mempool',
    'state.conf1': 'confirmado',
    'state.conf6': 'confirmado com 6 blocos',
    'severity.info': 'informativo',
    'severity.warning': 'atenção',
    'severity.critical': 'crítico',
    'feed.title': 'Registro',
    'feed.live': 'ao vivo',
    'feed.loadMore': 'Carregar mais',
    'feed.tipBehind': 'ponta em {height} · sua carteira em {wallet}',
    'prefs.theme': 'Tema',
    'theme.sett': 'sett · terra quente, escuro',
    'theme.bone': 'bone · claro',
    'theme.carvao': 'carvão · escuro neutro',
    'theme.contraste': 'contraste · alto contraste',
    'theme.cypherpunk': 'cypherpunk · fósforo sobre preto',
    'prefs.price': 'Preço do BTC',
    'prefs.priceNote':
      'Desligado de fábrica. É uma consulta pública: ela leva só o par de moedas, e ' +
      'expõe o IP deste servidor. Nenhum endereço Bitcoin sai daqui.',
    'prefs.currency': 'Moeda',
    'prefs.fees': 'Estimativa de taxa',
    'prefs.feeOff': 'desligada',
    'prefs.feeNode': 'pelo seu nó',
    'prefs.feeMempool': 'pelo mempool.space',
    'prefs.save': 'Salvar preferências',
    'prefs.saving': 'salvando…',
    'prefs.saved': 'salvo, e o topo já está mostrando',
    'prefs.unsaved': 'há mudanças não salvas',
    'fees.blocks': '{n} blocos',
    'fees.next': 'próximo bloco',
    'error.fees.needsCoreBackend':
      'A estimativa pelo nó precisa de uma fonte Bitcoin Core cadastrada. Cadastre o seu nó em Configurações, ou escolha outra fonte.',
    'error.fees.sourceFailed': 'A fonte pública de taxas não respondeu.',
    'error.chain.tipFailed': 'A fonte não respondeu a altura da ponta.',
    'error.preferences.unknownPriceSource':
      'Não conheço a fonte de preço "{fonte}". Aceito {aceitas}.',
    'error.preferences.unknownFeeSource':
      'Não conheço a fonte de taxa "{fonte}". Aceito {aceitas}.',
    'nav.panel': 'Painel',
    'nav.wallets': 'Carteiras',
    'nav.addresses': 'Endereços',
    'nav.alerts': 'Alertas',
    'nav.privacy': 'Privacidade',
    'nav.settings': 'Configurações',
    'nav.access': 'Acesso Externo',
    'alerts.filterType': 'Todos os tipos',
    'alerts.filterSeverity': 'Todas as severidades',
    'alerts.filterWallet': 'Todas as carteiras',
    'wallet.alerts': 'Alertas desta carteira',
    'wallet.notFoundOnScreen': 'Esta carteira não existe, ou não é sua.',
    'wallets.loading': 'carregando...',
    'backends.hasCredentials': 'com credencial guardada',
    'backends.whatYouHave': 'O que você tem?',
    'backends.group.no': 'Um nó Bitcoin Core meu',
    'backends.group.servidor': 'Um servidor Electrum ou Esplora meu',
    'backends.group.publico': 'Nenhum dos dois: usar um explorador público',
    'backends.network': 'Rede',
    'backends.up': 'responde',
    'backends.down': 'não respondeu',
    'backends.unknownState': 'ainda não medida',
    'backends.measuredAt': 'medido {when}',
    'backends.hiddenDown':
      '{n} fonte(s) fora desta lista porque não responderam. Elas continuam em ' +
      'Configurações, com o motivo.',
    'backends.test': 'Testar',
    'backends.testing': 'testando…',
    'backends.testOk': 'responde · bloco {height}',
    'backends.testFail': 'não respondeu: {reason}',
    'settings.session': 'Sessão',
    'settings.sessionNote':
      'A sessão vive num cookie de sessão, e sair a encerra neste navegador.',
    'access.roadmap':
      'Por onde o painel pode ser alcançado de fora, e o que cada caminho enxerga. Abra um caminho para ver o passo a passo, o endereço com QR e o que fazer quando ele não responde. Por padrão, ligar e desligar é na máquina que hospeda: um painel que liga túnel sozinho é um painel que se publica sem ninguém mandar.',
    'access.tor': 'Tor',
    'access.torNote':
      'O mais soberano: ninguém no meio vê o tráfego nem o destino. O endereço onion abre no Tor Browser, e o QR evita digitar 56 caracteres no celular.',
    'access.tailscale': 'Tailscale',
    'access.tailscaleNote':
      'Rede privada entre os seus aparelhos. A Tailscale vê metadado de conexão, não o conteúdo.',
    'access.cloudflare': 'Cloudflare Tunnel',
    'access.cloudflareWarning':
      'A Cloudflare termina o TLS e enxerga o seu tráfego em claro. É uma escolha legítima, e este produto existe para que ela seja feita sabendo.',
    'access.off': 'não configurado',
    'access.howTo': 'ligar é {comando}, na máquina que hospeda',
    'access.steps': 'Passo a passo',
    'access.sees': 'O que este caminho enxerga',
    'access.trouble': 'Quando não funciona',
    'access.address': 'Endereço',
    'access.up': 'de pé',
    'access.down': 'desligado',
    'access.unknown': 'não medido',
    'access.by.docker': 'medido pelo estado do container',
    'access.by.dns': 'medido pelo nome na MagicDNS',
    'access.by.http': 'medido pela prontidão do cloudflared',
    'access.by.none': 'esta instância não tem como olhar daqui, e por isso não afirma nada',
    'access.copy': 'copiar',
    'access.copied': 'copiado',
    'access.copyFailed': 'o navegador não deixou copiar; selecione e copie na mão',
    'access.open': 'abrir',
    'access.all': 'todos os acessos',
    'access.docs': 'documentação completa deste caminho',
    'access.details': 'passo a passo, estado e QR deste caminho',
    'access.script':
      'Ou o caminho curto, que não exige decorar as flags do compose. O mesmo script cria os containers dos três perfis de uma vez, com preparar, que é o passo único de que o painel precisa para poder ligar e desligar sozinho depois.',
    'access.activate': 'Ativar',
    'access.deactivate': 'Desativar',
    'access.configure': 'Configurar',
    'access.configTitle': 'Configurar acesso',
    'access.hostname': 'Hostname',
    'access.authKey': 'TS_AUTHKEY',
    'access.tunnelToken': 'TUNNEL_TOKEN',
    'access.saveConfig': 'Salvar configuração',
    'access.configSaved': 'configuração salva cifrada',
    'access.configured': 'configurado',
    'access.notConfigured': 'não configurado',
    'access.working': 'falando com o Docker…',
    'access.creating':
      'Criando o container deste caminho. Na primeira vez isto puxa a imagem e ' +
      'pode levar alguns minutos; o estado acima muda sozinho quando terminar.',
    'access.createFailed': 'Não deu para criar o container: {reason}',
    'access.controlTitle': 'Ligar e desligar por aqui',
    'access.socketNote':
      'Esta instância subiu com o socket do Docker montado. Enquanto ele estiver aí, uma sessão do painel vale execução de código na máquina que hospeda; se o painel estiver publicado num túnel, isso vale para quem obtiver uma sessão de fora. O que estreita isso: só o admin da instância chega aqui, e só três perfis e dois verbos atravessam, montados pelo backend e nunca recebidos prontos.',
    'access.socketOff':
      'Esta instância lê os acessos e não os controla: ela subiu sem DOCKER_SOCKET. Ligar e desligar é na máquina que hospeda, com os comandos acima.',
    'access.adminOnlyNote':
      'Ligar e desligar acesso externo é do admin da instância. Você continua vendo o estado de cada caminho.',
    'access.runOnce':
      'Este perfil nunca subiu nesta máquina, então não há container para ligar. Rode o comando abaixo uma vez; depois dele, o painel liga e desliga sozinho.',
    'access.tor.sees':
      'Ninguém no meio vê o tráfego nem o destino, e não há terceiro envolvido. O endereço é a credencial de alcance: quem o tem chega à tela de login, e a sua senha continua sendo a única barreira depois disso.',
    'access.tor.step1':
      'Suba o perfil na máquina que hospeda. Na primeira vez, o Tor gera a chave e o endereço.',
    'access.tor.step2':
      'O endereço aparece aqui em alguns segundos. Ele vem do arquivo hostname, montado em modo leitura: o backend nunca enxerga a chave privada do endereço.',
    'access.tor.step3':
      'Abra o endereço no Tor Browser, ou leia o QR no celular com o Tor Browser instalado.',
    'access.tor.trouble1':
      'Endereço vazio depois de subir: o volume tor-data não chegou ao backend. Confira o volume em modo leitura no serviço backend, e TOR_HOSTNAME_PATH no .env.',
    'access.tor.trouble2':
      'Endereço aparece e não abre: o serviço parou depois de gerar a chave. O endereço sobrevive ao container, então ele continua na tela mesmo com o Tor fora do ar.',
    'access.tor.trouble3':
      'Sem o socket do Docker, esta página não tem como ver se o processo do Tor está de pé, e por isso ela diz "não medido" em vez de pintar um verde que não mediu.',
    'access.tailscale.sees':
      'Uma rede privada entre os seus aparelhos. A Tailscale vê metadado de conexão, e não o conteúdo. Só quem está na sua tailnet alcança o endereço, o que faz deste o caminho mais fechado dos três que não exige Tor.',
    'access.tailscale.step1':
      'Gere uma auth key no admin da Tailscale e ponha em TS_AUTHKEY, no .env.',
    'access.tailscale.step2': 'Suba o perfil na máquina que hospeda.',
    'access.tailscale.step3':
      'Aprove a máquina no admin da Tailscale, se a sua tailnet exigir aprovação.',
    'access.tailscale.step4':
      'Copie o nome da MagicDNS que apareceu no admin para TAILSCALE_HOSTNAME, no .env. É ele que esta página resolve para dizer se a máquina entrou na tailnet.',
    'access.tailscale.trouble1':
      'Nome não resolve: a máquina não entrou na tailnet. Auth key vencida e aprovação pendente são as duas causas comuns.',
    'access.tailscale.trouble2':
      'Nome resolve e a página não abre: o aparelho de onde você está não está na tailnet. O nome é público, o endereço 100.x não é alcançável de fora dela.',
    'access.tailscale.trouble3':
      'O endereço da Tailscale é http, e não https: o navegador não o considera contexto seguro, e o botão de copiar cai no caminho de reserva. Ele continua copiando.',
    'access.cloudflare.sees':
      'A Cloudflare termina o TLS e enxerga o seu tráfego em claro, inclusive os endereços que você vigia. É uma escolha legítima, e este produto existe para que ela seja feita sabendo. Em compensação, é o único caminho que abre em qualquer navegador, sem instalar nada.',
    'access.cloudflare.step1':
      'Crie o túnel no painel da Cloudflare e copie o token para TUNNEL_TOKEN, no .env.',
    'access.cloudflare.step2': 'Suba o perfil na máquina que hospeda.',
    'access.cloudflare.step3':
      'No painel da Cloudflare, aponte o hostname público para o serviço nginx na porta 80, e ponha o domínio em CLOUDFLARE_HOSTNAME.',
    'access.cloudflare.trouble1':
      'Túnel sem conexão nenhuma: token errado, ou a saída da máquina bloqueia a porta 7844. O estado aqui vem da prontidão do próprio cloudflared.',
    'access.cloudflare.trouble2':
      'O domínio abre e o painel não responde: a rota do túnel está apontando para outro serviço. Ela precisa apontar para nginx na 80, que é quem serve a interface.',
    'access.cloudflare.trouble3':
      'Sem a porta de métricas no compose não há a quem perguntar, e o estado fica "não medido". O túnel pode estar perfeitamente de pé.',
    'error.access.adminOnly':
      'Ligar e desligar acesso externo é do admin da instância.',
    'error.access.noSocket':
      'Esta instância subiu sem DOCKER_SOCKET: o painel lê os acessos, e não os controla.',
    'error.access.badRequest': 'Perfil ou ação fora da lista branca.',
    'error.access.badConfig': 'Configuração incompleta: {motivo}.',
    'error.privacy.needsAnalysisSource':
      'A análise profunda precisa de uma fonte tipo Esplora. A fonte de cadeia desta carteira é um {chainKind}, que sincroniza saldo e UTXO mas não responde REST, e o scanner não sabe falar com ele. Escolha uma fonte de análise para esta rede; ela é perguntada uma vez só.',
    'error.privacy.analysisSource.notEsplora':
      'Esta fonte não é um Esplora. O scanner só fala REST nesse formato, e não conversa com Bitcoin Core nem com Electrum.',
    'error.privacy.analysisSource.wrongNetwork':
      'Esta fonte é de outra rede. A fonte de análise é escolhida por rede.',
    'error.privacy.analysisSource.notFound': 'Esta fonte não existe, ou não é sua.',
    'error.privacy.badAnalysisSource': 'Informe a fonte escolhida.',
    'error.privacy.blindScan':
      'A análise não conseguiu consultar a cadeia: o scanner respondeu que esta carteira não tem endereço, transação nem UTXO, e o watchtower já sincronizou UTXO nela. O resultado foi descartado em vez de guardado, porque um score que não mediu nada parece um diagnóstico e não é. Confira a fonte de análise desta rede.',
    'privacy.analysisSource': 'Fonte de análise',
    'privacy.analysisSourceNote':
      'Qual Esplora roda a análise de privacidade. O scanner só fala esse formato: Bitcoin Core e Electrum sincronizam saldo e UTXO, e não servem para analisar. Quem vigia por um Esplora não precisa escolher nada aqui, porque a fonte da carteira já serve.',
    'privacy.analysisNone':
      'Nenhuma fonte tipo Esplora nesta rede. Cadastre uma em Fontes de consulta, acima.',
    'privacy.analysisBy': 'análise por {host}',
    'privacy.analysisChoose': 'Escolher e analisar',
    'privacy.analysisNote':
      'Este host passa a ver os endereços desta carteira quando a análise roda. A escolha vale para esta rede e é perguntada uma vez só; dá para trocar depois em Configurações.',
    'privacy.analysisOwn': 'sua',
    'privacy.analysisPublic': 'pública',
    'alert.txid': 'Transação',
    'alert.height': 'Altura',
    'alert.blockHash': 'Hash do bloco',
    'alert.wallet': 'Carteira',
    'alert.confirmations': '{n} confirmações',
    'alert.inMempool': 'na mempool, ainda sem confirmação',
    'alert.siblings': 'Outros alertas desta transação',
    'alert.noEvent': 'Este alerta não veio de uma transação.',
    'alert.fetchOnChain': 'Buscar na cadeia',
    'alert.fetchNote':
      'A consulta vai para {fonte}, que passa a saber que você procurou esta transação. Nada é consultado até você clicar.',
    'alert.inputs': 'Entradas',
    'alert.outputs': 'Saídas',
    'alert.fee': 'fee de {value} sats',
    'alert.txPrivacy': 'Privacidade da transação',
    'alert.txPrivacyRunning': 'análise da transação em andamento...',
    'alert.txType': 'tipo',
    'alert.boltzmann': 'Matriz de Boltzmann',
    'alert.close': 'Fechar',
    'error.alert.notFound': 'Este alerta não existe, ou não é seu.',
    'error.tx.unsupportedByBackend':
      'A fonte desta carteira não sabe contar a transação inteira. O que está acima veio do log, e o resto não foi consultado.',
    'error.tx.backendFailed': 'A fonte recusou a consulta: {motivo}',
    'error.tx.notFound': 'A fonte não conhece esta transação.',
    'feed.empty': 'Nenhum alerta ainda. O watchtower avisa assim que algo se mexer.',
    'feed.tip': 'altura {height}',
    'balance.total': 'Saldo total',
    'balance.totalByNetwork': 'Saldo {network}',
    'network.mainnet': 'mainnet',
    'network.signet': 'signet',
    'network.testnet': 'testnet',
    'balance.wallets': '{n} carteiras',
    'balance.utxos': '{n} UTXOs',
    'balance.frozen': '{n} congelado',
    'addresses.title': 'Endereços avulsos',
    'addresses.add': '+ Vigiar endereço',
    'addresses.empty': 'Nenhum endereço avulso vigiado ainda.',
    'addresses.note':
      'Um endereço solto, sem chave estendida. Ele não deriva endereço novo e ' +
      'não tem gap limit: o que se vigia é exatamente o que está aqui.',
    'wallets.title': 'Carteiras',
    'wallets.empty': 'Nenhuma carteira vigiada ainda.',
    'wallets.emptyHint':
      'Cole a chave pública estendida da carteira que você quer vigiar. ' +
      'O Stealth Badger passa a avisar sobre movimentação e, principalmente, ' +
      'sobre vazamento de privacidade.',
    'onboarding.stepSource': 'Escolha por onde vigiar',
    'onboarding.stepWallet': 'Cole a chave',
    'wallets.add': '+ Vigiar carteira',
    'wallets.formTitle': 'Vigiar uma carteira',
    'wallets.labelPlaceholder': 'Rótulo, por exemplo Cold wallet',
    'wallets.keyPlaceholder': 'xpub, ypub, zpub, tpub, upub ou vpub',
    'wallets.modeKey': 'Carteira inteira',
    'wallets.modeAddress': 'Um endereço',
    'wallets.addressPlaceholder': 'bc1..., tb1..., 3... ou 1...',
    'wallets.addressNote':
      'Vigia só este endereço, e nada mais da carteira de onde ele veio.',
    'wallet.watchedAddress': 'endereço avulso',
    'wallets.watchOnly':
      'Somente chaves públicas. O Stealth Badger é watch-only e recusa qualquer ' +
      'material que permita gastar.',
    'wallets.archive': 'Arquivar',
    'wallets.unarchive': 'Desarquivar',
    'wallets.archived': 'arquivada',
    'wallets.archivedToggle': 'Ver arquivadas',
    'wallets.archivedEmpty': 'Nenhuma carteira arquivada.',
    'wallets.delete': 'Apagar de vez',
    'wallets.deleteTitle': 'Apagar {label}?',
    'wallets.deleteNote':
      'Apaga a chave, o log de eventos e os alertas desta carteira. Não dá para ' +
      'voltar atrás. Arquivar já tira a carteira da tela e do worker, e é reversível.',
    'wallets.deleteConfirmLabel': 'Digite o rótulo exato para confirmar',
    'wallets.cancel': 'Cancelar',
    'wallets.scriptType': 'Tipo de script',
    'wallets.scriptTypeAuto': 'descobrir pela cadeia',
    'wallets.scriptTypeNote':
      'Esta chave não diz o tipo de script: xpub e tpub servem a legacy, ' +
      'nested segwit e native segwit. Quando a fonte escolhida exige registro ' +
      'de descriptor não há a quem perguntar, e o palpite errado mostra saldo ' +
      'zero sem erro nenhum.',
    'wallets.submit': 'Começar a vigiar',
    'wallets.submitting': 'cadastrando...',
    'wallet.coins': 'Moedas',
    'wallet.frozen': 'congelado',
    'wallet.importing': 'Importando {progress}%',
    'wallet.importingNote':
      'Varrendo a cadeia de change. O saldo total acima ainda não inclui esta carteira.',
    'wallet.importingNode': 'Rescan no seu nó',
    'wallet.importingCoreNote':
      'O seu nó está varrendo a cadeia desde o gênesis para achar o histórico desta carteira. Leva minutos, e não há barra porque o Bitcoin Core não reporta andamento enquanto rescaneia: ele responde quando termina. Acompanhe pelo nó com getwalletinfo, no campo scanning. O saldo total acima ainda não inclui esta carteira.',
    'wallet.syncError': 'Falha na sincronização',
    'wallet.syncSourceFailed': 'Fonte {host} falhou',
    'wallet.syncSourceFailedNote':
      'A fonte {host} não respondeu: {reason}. Troque a fonte desta carteira ou espere ela voltar antes de ler saldo como definitivo.',
    'wallet.syncDegraded': 'Vigiando em parte',
    'wallet.historyOnly': 'Sem UTXO ativo, com histórico',
    'wallet.historyOnlyNote':
      '{addresses} endereço(s) com histórico e {spent} UTXO gasto(s) nesta carteira.',
    'auth.tagline': 'Watchtower de privacidade para Bitcoin',
    'auth.email': 'e-mail',
    'auth.password': 'senha (mínimo 12 caracteres)',
    'auth.login': 'Entrar',
    'auth.register': 'Criar conta',
    'auth.logout': 'Sair',
    'privacy.public': 'Explorador público',
    'privacy.sovereign': 'Soberano',
    'privacy.severalHosts': '{n} backends',
    'privacy.score': 'Privacidade {score}/100 · {grade}',
    'privacy.scan': 'Analisar privacidade',
    'privacy.scanning': 'analisando...',
    'privacy.never': 'privacidade ainda não analisada',
    'privacy.measuredHere': 'Medido aqui, sem sair para a rede',
    'privacy.measuredHereNote':
      'Estes números vêm do que este watchtower sincronizou pela fonte de cadeia ' +
      'desta carteira. Nenhuma consulta a terceiro foi feita para calculá-los. O ' +
      'scanner acrescenta o que só ele tem: base de entidades conhecidas, ' +
      'heurísticas de transação e a matriz de Boltzmann.',
    'privacy.findings': 'O que o scanner viu',
    'privacy.pageTitle': 'Privacidade',
    'privacy.pageNote':
      'Mostra o que este servidor já mediu no banco. Abrir endereço mostra análise salva; quando não houver, a tela diz que não sabe.',
    'privacy.walletSelect': 'Carteira',
    'privacy.generalScore': 'Score médio',
    'privacy.generalAlerts': 'Alertas',
    'privacy.address': 'Endereço',
    'privacy.path': 'Caminho',
    'privacy.balance': 'Saldo',
    'privacy.addressScoreShort': 'Score',
    'privacy.noAddresses': 'Nenhum endereço sincronizado ainda.',
    'privacy.addressDetail': 'Detalhe do endereço',
    'privacy.addressUnknown': 'Ainda não há análise salva para este endereço.',
    'privacy.addressScore': 'Privacidade do endereço {score}/100 · {grade}',
    'privacy.scanUsedAddresses': 'Analisar endereços usados',
    'privacy.addressScanQueued': '{n} endereços na fila',
    'privacy.chartScore': 'Score',
    'privacy.chartHistory': 'Histórico',
    'privacy.chartSeverity': 'Severidade',
    'privacy.chartUtxos': 'Faixas de UTXO',
    'privacy.chartReuse': 'Reuso de endereço',
    'privacy.chartCounterparties': 'Contrapartes recorrentes',
    'privacy.reusedAddresses': '{reused} de {total} endereços usados de novo',
    'privacy.utxoTotal': 'total no histograma: {value}',
    'error.auth.invalidInput': 'E-mail inválido, ou senha com menos de 12 caracteres.',
    'error.auth.emailTaken': 'Este e-mail já tem conta.',
    'error.auth.invalidCredentials': 'E-mail ou senha não conferem.',
    'error.wallet.labelRequired': 'Dê um rótulo à carteira.',
    'error.wallet.keyOrAddress': 'Informe uma chave estendida ou um endereço, não os dois.',
    'error.wallet.keyOrAddressRequired':
      'Informe a chave estendida da carteira, ou um endereço avulso a vigiar.',
    'error.wallet.wrongNetwork':
      'Esta chave é de {chave}, e este watchtower vigia {rede}. Use uma chave de {rede}.',
    'error.wallet.networkMismatch':
      'Esta chave ou endereço é de {rede_da_chave}, e a fonte escolhida {nome_do_backend} vigia {rede_do_backend}.',
    'error.wallet.backendNotFound': 'O backend escolhido não existe, ou não é seu.',
    'backends.preset': 'Fonte',
    'backends.host': 'Host',
    'backends.port': 'Porta',
    'backends.labelField': 'Apelido (opcional)',
    'backends.auth': 'Autenticação',
    'backends.authCookie': 'arquivo .cookie',
    'backends.authUserPass': 'usuário e senha',
    'backends.cookiePath': 'Caminho do .cookie',
    'backends.user': 'Usuário do RPC',
    'backends.password': 'Senha do RPC',
    'backends.credentialNote':
      'A credencial é cifrada com a chave-mestra do servidor e nunca volta numa ' +
      'resposta da API. Quem alcança o RPC do seu nó pode pará-lo.',
    'backends.datadir': 'Diretório de dados do nó',
    'backends.datadirHint':
      'A pasta que o bitcoind usa. Na instalação padrão é ~/.bitcoin; em pacote de ' +
      'sistema costuma ser /var/lib/bitcoind. Se o seu nó está em disco separado, é ' +
      'o caminho desse disco.',
    'backends.detect': 'Procurar o nó',
    'backends.detectFound': 'Achei um nó de {network} na altura {blocks}.',
    'backends.dockerHint':
      'Este watchtower roda em container: localhost aqui é o próprio container, não a sua máquina. Use host.docker.internal.',
    'error.backend.unknownPreset': 'Não conheço a fonte "{preset}". Escolha uma do catálogo.',
    'error.backend.notFound': 'Esta fonte não existe, ou não é sua.',
    'error.backend.networkMismatch':
      'Esta carteira é de {rede_da_carteira}, e a fonte escolhida {nome_do_backend} vigia {rede_do_backend}.',
    'wallets.changeSource': 'Trocar fonte',
    'wallets.changeSourceNote':
      'O histórico não se perde na troca: a carteira volta a sincronizar pela fonte nova, e o log continua o mesmo.',
    'error.backend.hostRequired': 'Informe o host da fonte.',
    'error.backend.portRequired': 'Informe a porta da fonte.',
    'error.backend.portRange': 'Porta {porta} fora da faixa. Use um número entre 1 e 65535.',
    'error.backend.authRequired':
      'O RPC do Bitcoin Core precisa de autenticação: informe o caminho do arquivo .cookie do nó, ou usuário e senha do rpcauth.',
    'error.wallet.notFound': 'Esta carteira não existe, ou não é sua.',
    'error.wallet.mustArchiveFirst':
      'Arquive a carteira antes de apagá-la. Arquivar já a tira da tela e do worker, e dá para voltar atrás.',
    'error.wallet.confirmMismatch':
      'Para apagar, digite o rótulo exato da carteira: {rotulo}.',
    'error.wallet.unknownScriptType':
      'Não conheço o tipo de script "{tipo}". Aceito {aceitos}.',
    'error.wallet.scriptTypeConflict':
      'Esta chave já declara {tipo_da_chave}, e o cadastro pediu {tipo_pedido}. Use a chave do tipo que quer vigiar.',
    'error.wallet.scriptTypeWithAddress':
      'O endereço já diz o tipo de script dele. Declarar outro só poderia contradizê-lo.',
    'error.channel.unknownKind': 'Não sei entregar por "{tipo}". Aceito ntfy e webhook.',
    'error.channel.topicRequired':
      'Escolha um tópico. É ele que separa as suas notificações das dos outros, então use algo longo e difícil de adivinhar.',
    'error.channel.urlRequired': 'Informe a url do webhook.',
    'error.channel.urlScheme': 'A url do webhook precisa começar com http:// ou https://.',
    'error.channel.notFound': 'Canal não encontrado.',
    'error.backend.unknownKind': 'Não sei falar com "{tipo}". Aceito esplora e electrum.',
    'error.backend.urlRequired': 'Informe o endereço do backend.',
    'error.backend.esploraScheme':
      'O Esplora fala HTTP: o endereço precisa começar com http:// ou https://.',
    'error.backend.coreScheme':
      'O RPC do Bitcoin Core fala HTTP: o endereço precisa começar com http:// ou https://.',
    'error.backend.electrumScheme':
      'O endereço do Electrum precisa começar com electrum://, por exemplo electrum://127.0.0.1:50001.',
    'error.backend.invalidUrl': 'Este endereço de backend não é uma url válida.',
    'error.backend.noHost': 'Este endereço de backend não tem host.',
    'search.placeholder': 'buscar endereço ou carteira',
    'search.empty': 'Nada encontrado entre o que você vigia.',
    'search.used': 'usado',
    'search.unused': 'nunca usado',
    'channels.title': 'Avisar no celular',
    'channels.howTitle': 'Como isto funciona',
    'channels.how1':
      'O ntfy entrega push por tópico, e não por conta: não há cadastro, não há ' +
      'senha. Quem assina um tópico recebe tudo o que for publicado nele.',
    'channels.how2':
      'Instale o app ntfy no celular, pela Play Store, App Store ou F-Droid. ' +
      'Assine um tópico só seu, e cole o mesmo tópico aqui.',
    'channels.how3':
      'Daí em diante este servidor publica cada alerta nesse tópico, e o celular ' +
      'toca. Sem servidor informado, o tópico é publicado no ntfy.sh público.',
    'channels.how4':
      'O que vai na mensagem: o rótulo da carteira, o título e o texto do alerta. ' +
      'Em dust e em address reuse, vai também o endereço envolvido. Quem souber o ' +
      'tópico lê tudo isso: escolha um tópico longo e aleatório, e trate-o como segredo.',
    'channels.empty': 'Nenhum canal. Os alertas só aparecem aqui na tela.',
    'channels.topicPlaceholder': 'tópico do ntfy, longo e difícil de adivinhar',
    'channels.topicHint':
      'Quem souber o tópico recebe seus alertas. Escolha algo que ninguém adivinha, e assine o mesmo tópico no app ntfy do celular.',
    'channels.add': 'Cadastrar canal',
    'channels.test': 'Testar',
    'channels.remove': 'remover',
    'channels.testOk': 'Chegou. O canal funciona.',
    'channels.testFail': 'Não chegou: {error}',
    'utxos.title': 'UTXOs',
    'utxos.toggle': 'Moedas e rótulos',
    'utxos.freeze': 'congelar',
    'utxos.unfreeze': 'descongelar',
    'utxos.frozen': 'congelado',
    'utxos.address': 'Endereço',
    'utxos.labelPlaceholder': 'rótulo',
    'utxos.export': 'Exportar rótulos',
    'utxos.import': 'Importar rótulos',
    'utxos.dust': 'dust',
    'utxos.spent': 'gasto',
    'utxos.empty': 'Nenhum UTXO à vista nesta carteira.',
    'utxos.imported': '{imported} rótulos importados, {ignored} ignorados',
    'backend.networkRequired': 'Rede',
    'backends.title': 'Vigiar por',
    'backends.global': 'configurado no servidor',
    'backends.own': 'seu',
    'backends.addToggle': '+ outro backend',
    'backends.addSource': 'Adicionar fonte',
    'backends.newSource': 'Nova fonte',
    'backends.urlPlaceholder': 'https://... ou electrum://host:50001',
    'backends.isPublic': 'É um serviço público de terceiro',
    'backends.publicNote':
      'Um explorador público responde na hora e não exige instalar nada. Em troca, ele enxerga todos os endereços que você consultar, e consegue ligá-los entre si. É escolha legítima, e o aviso no topo fica aceso enquanto qualquer carteira usar um.',
    'backends.save': 'Adicionar backend',
  },
  en: {
    'alert.funds_received.title': 'Funds received',
    'alert.funds_received.body': '{value} sats, {state}.',
    'alert.funds_spent.title': 'Funds spent',
    'alert.funds_spent.body': 'UTXO {txid}:{vout} was consumed.',
    'alert.kyc_origin.title': 'Where the funds came from',
    'alert.kyc_origin.body':
      'Transaction {txid} {basis} {kind}. Confidence declared by the scanner: ' +
      '{confidence}. Funds with a known origin link your identity to whatever ' +
      'you spend alongside them.',
    'alert.privacy_tx_type.title': 'Privacy transaction detected',
    'alert.privacy_tx_type.body':
      'Transaction {txid} was classified by the scanner as {txType}. {meaning}',
    'tx_type.coinjoin.received':
      'For the sender, coinjoin often improves privacy. For you as the receiver, treat this UTXO as sensitive context before mixing it with others.',
    'tx_type.payjoin.received':
      'Payjoin often protects both sides from simple heuristics. Even so, this UTXO deserves attention before being spent alongside others.',
    'basis.database': 'was matched by the scanner entity database as',
    'basis.behavior': 'has the shape of',
    'entity.exchange': 'an exchange batch withdrawal',
    'entity.darknet': 'a darknet service',
    'entity.gambling': 'a gambling service',
    'entity.ofac': 'an address on a sanctions list (OFAC)',
    'entity.known': 'a known entity',
    'confidence.high': 'high',
    'confidence.medium': 'medium',
    'confidence.low': 'low',
    'confidence.deterministic': 'deterministic',
    'alert.score_dropped.title': 'Privacy got worse',
    'alert.score_dropped.body':
      "This wallet's score fell from {from} to {to}, {drop} points, and the grade " +
      'is now {grade}. Open the analysis to see what changed before you spend.',
    'alert.dust_received.title': 'Possible dust attack',
    'alert.dust_received.body':
      '{value} sats arrived from an unknown source at {address}, below the ' +
      '{threshold} sats threshold. Dust is planted to trace you the moment you ' +
      'spend. Freeze this UTXO.',
    'alert.address_reused.title': 'Address reuse detected',
    'alert.address_reused.body':
      'Address {address} received again. Both payments are now publicly linked; ' +
      'the single largest cause of lost privacy.',
    'alert.reorg_detected.title': 'Reorg detected',
    'alert.reorg_detected.body':
      'Transactions from height {height} were rolled back and the balance recomputed.',
    'state.mempool': 'still in the mempool',
    'state.conf1': 'confirmed',
    'state.conf6': 'confirmed with 6 blocks',
    'severity.info': 'info',
    'severity.warning': 'warning',
    'severity.critical': 'critical',
    'feed.title': 'Log',
    'feed.live': 'live',
    'feed.loadMore': 'Load more',
    'feed.tipBehind': 'tip at {height} · your wallet at {wallet}',
    'prefs.theme': 'Theme',
    'theme.sett': 'sett · warm earth, dark',
    'theme.bone': 'bone · light',
    'theme.carvao': 'carvão · neutral dark',
    'theme.contraste': 'contraste · high contrast',
    'theme.cypherpunk': 'cypherpunk · phosphor on black',
    'prefs.price': 'BTC price',
    'prefs.priceNote':
      'Off out of the box. It is a public query: it carries only the currency pair, and ' +
      'exposes this server\'s IP. No Bitcoin address leaves here.',
    'prefs.currency': 'Currency',
    'prefs.fees': 'Fee estimate',
    'prefs.feeOff': 'off',
    'prefs.feeNode': 'from your node',
    'prefs.feeMempool': 'from mempool.space',
    'prefs.save': 'Save preferences',
    'prefs.saving': 'saving…',
    'prefs.saved': 'saved, and the header already shows it',
    'prefs.unsaved': 'unsaved changes',
    'fees.blocks': '{n} blocks',
    'fees.next': 'next block',
    'error.fees.needsCoreBackend':
      'The node fee estimate needs a Bitcoin Core source registered. Add your node in Settings, or pick another source.',
    'error.fees.sourceFailed': 'The public fee source did not answer.',
    'error.chain.tipFailed': 'The source did not answer the tip height.',
    'error.preferences.unknownPriceSource':
      'I do not know the price source "{fonte}". I accept {aceitas}.',
    'error.preferences.unknownFeeSource':
      'I do not know the fee source "{fonte}". I accept {aceitas}.',
    'nav.panel': 'Panel',
    'nav.wallets': 'Wallets',
    'nav.addresses': 'Addresses',
    'nav.alerts': 'Alerts',
    'nav.privacy': 'Privacy',
    'nav.settings': 'Settings',
    'nav.access': 'External Access',
    'alerts.filterType': 'All types',
    'alerts.filterSeverity': 'All severities',
    'alerts.filterWallet': 'All wallets',
    'wallet.alerts': 'Alerts from this wallet',
    'wallet.notFoundOnScreen': 'That wallet does not exist, or is not yours.',
    'wallets.loading': 'loading...',
    'backends.hasCredentials': 'credential stored',
    'backends.whatYouHave': 'What do you have?',
    'backends.group.no': 'A Bitcoin Core node of my own',
    'backends.group.servidor': 'An Electrum or Esplora server of my own',
    'backends.group.publico': 'Neither: use a public explorer',
    'backends.network': 'Network',
    'backends.up': 'answers',
    'backends.down': 'no answer',
    'backends.unknownState': 'not measured yet',
    'backends.measuredAt': 'measured {when}',
    'backends.hiddenDown':
      '{n} source(s) left out of this list because they did not answer. They are ' +
      'still in Settings, with the reason.',
    'backends.test': 'Test',
    'backends.testing': 'testing…',
    'backends.testOk': 'answers · block {height}',
    'backends.testFail': 'no answer: {reason}',
    'settings.session': 'Session',
    'settings.sessionNote':
      'The session lives in a session cookie, and logging out ends it in this browser.',
    'access.roadmap':
      'How the panel can be reached from outside, and what each path sees. Open a path to get the step by step, the address with a QR, and what to do when it does not answer. By default, turning it on and off happens on the host machine: a panel that opens a tunnel by itself is a panel that publishes itself with nobody asking.',
    'access.tor': 'Tor',
    'access.torNote':
      'The most sovereign: nobody in the middle sees the traffic or the destination. The onion address opens in Tor Browser, and the QR saves typing 56 characters on a phone.',
    'access.tailscale': 'Tailscale',
    'access.tailscaleNote':
      'A private network between your own devices. Tailscale sees connection metadata, not content.',
    'access.cloudflare': 'Cloudflare Tunnel',
    'access.cloudflareWarning':
      'Cloudflare terminates TLS and sees your traffic in the clear. It is a legitimate choice, and this product exists so that it is made knowingly.',
    'access.off': 'not configured',
    'access.howTo': 'turn it on with {comando}, on the host machine',
    'access.steps': 'Step by step',
    'access.sees': 'What this path sees',
    'access.trouble': 'When it does not work',
    'access.address': 'Address',
    'access.up': 'up',
    'access.down': 'off',
    'access.unknown': 'not measured',
    'access.by.docker': 'measured from the container state',
    'access.by.dns': 'measured from the MagicDNS name',
    'access.by.http': 'measured from the cloudflared readiness endpoint',
    'access.by.none': 'this instance has no way to look from here, so it claims nothing',
    'access.copy': 'copy',
    'access.copied': 'copied',
    'access.copyFailed': 'the browser refused to copy; select and copy by hand',
    'access.open': 'open',
    'access.all': 'all access paths',
    'access.docs': 'full documentation for this path',
    'access.details': 'step by step, state and QR for this path',
    'access.script':
      'Or the short way, which saves memorising the compose flags. The same script creates the containers for all three profiles at once, with preparar, which is the one step the panel needs before it can turn them on and off by itself.',
    'access.activate': 'Turn on',
    'access.deactivate': 'Turn off',
    'access.configure': 'Configure',
    'access.configTitle': 'Configure access',
    'access.hostname': 'Hostname',
    'access.authKey': 'TS_AUTHKEY',
    'access.tunnelToken': 'TUNNEL_TOKEN',
    'access.saveConfig': 'Save configuration',
    'access.configSaved': 'configuration saved encrypted',
    'access.configured': 'configured',
    'access.notConfigured': 'not configured',
    'access.working': 'talking to Docker…',
    'access.creating':
      'Creating the container for this path. The first time this pulls the image ' +
      'and can take a few minutes; the state above changes on its own when it is done.',
    'access.createFailed': 'Could not create the container: {reason}',
    'access.controlTitle': 'Turning it on and off from here',
    'access.socketNote':
      'This instance came up with the Docker socket mounted. While it is there, a panel session is worth code execution on the host machine; if the panel is published through a tunnel, that goes for whoever obtains a session from outside. What narrows it: only the instance admin reaches this, and only three profiles and two verbs get through, assembled by the backend and never received ready made.',
    'access.socketOff':
      'This instance reads the access paths and does not control them: it came up without DOCKER_SOCKET. Turning them on and off happens on the host machine, with the commands above.',
    'access.adminOnlyNote':
      'Turning external access on and off belongs to the instance admin. You still see the state of every path.',
    'access.runOnce':
      'This profile has never come up on this machine, so there is no container to start. Run the command below once; after it, the panel turns it on and off by itself.',
    'access.tor.sees':
      'Nobody in the middle sees the traffic or the destination, and no third party is involved. The address is the reach credential: whoever has it gets to the login screen, and your password is the only barrier past that.',
    'access.tor.step1':
      'Bring the profile up on the host machine. The first time, Tor generates the key and the address.',
    'access.tor.step2':
      'The address shows up here within seconds. It comes from the hostname file, mounted read only: the backend never sees the private key of the address.',
    'access.tor.step3':
      'Open the address in Tor Browser, or scan the QR on a phone that has Tor Browser installed.',
    'access.tor.trouble1':
      'Address empty after bringing it up: the tor-data volume never reached the backend. Check the read only volume on the backend service, and TOR_HOSTNAME_PATH in .env.',
    'access.tor.trouble2':
      'Address shows up and does not open: the service stopped after generating the key. The address outlives the container, so it stays on screen even with Tor down.',
    'access.tor.trouble3':
      'Without the Docker socket, this page has no way to see whether the Tor process is up, so it says "not measured" instead of painting a green it never measured.',
    'access.tailscale.sees':
      'A private network between your own devices. Tailscale sees connection metadata, not content. Only someone on your tailnet reaches the address, which makes this the most closed of the paths that do not require Tor.',
    'access.tailscale.step1':
      'Generate an auth key in the Tailscale admin and put it in TS_AUTHKEY, in .env.',
    'access.tailscale.step2': 'Bring the profile up on the host machine.',
    'access.tailscale.step3':
      'Approve the machine in the Tailscale admin, if your tailnet requires approval.',
    'access.tailscale.step4':
      'Copy the MagicDNS name shown in the admin into TAILSCALE_HOSTNAME, in .env. That is the name this page resolves to tell whether the machine joined the tailnet.',
    'access.tailscale.trouble1':
      'Name does not resolve: the machine never joined the tailnet. An expired auth key and a pending approval are the two common causes.',
    'access.tailscale.trouble2':
      'Name resolves and the page does not open: the device you are on is not in the tailnet. The name is public, the 100.x address is not reachable from outside it.',
    'access.tailscale.trouble3':
      'The Tailscale address is http, not https: the browser does not treat it as a secure context, and the copy button falls back to the legacy path. It still copies.',
    'access.cloudflare.sees':
      'Cloudflare terminates TLS and sees your traffic in the clear, including the addresses you watch. It is a legitimate choice, and this product exists so that it is made knowingly. In exchange, it is the only path that opens in any browser with nothing installed.',
    'access.cloudflare.step1':
      'Create the tunnel in the Cloudflare dashboard and copy the token into TUNNEL_TOKEN, in .env.',
    'access.cloudflare.step2': 'Bring the profile up on the host machine.',
    'access.cloudflare.step3':
      'In the Cloudflare dashboard, point the public hostname at the nginx service on port 80, and put the domain in CLOUDFLARE_HOSTNAME.',
    'access.cloudflare.trouble1':
      'Tunnel with no connections: wrong token, or the machine blocks outbound port 7844. The state here comes from cloudflared own readiness endpoint.',
    'access.cloudflare.trouble2':
      'The domain opens and the panel does not answer: the tunnel route points at another service. It has to point at nginx on 80, which is what serves the interface.',
    'access.cloudflare.trouble3':
      'Without the metrics port in the compose file there is nobody to ask, and the state stays "not measured". The tunnel may be perfectly up.',
    'error.access.adminOnly':
      'Turning external access on and off belongs to the instance admin.',
    'error.access.noSocket':
      'This instance came up without DOCKER_SOCKET: the panel reads the access paths, it does not control them.',
    'error.access.badRequest': 'Profile or action outside the allowlist.',
    'error.access.badConfig': 'Incomplete configuration: {motivo}.',
    'error.privacy.needsAnalysisSource':
      'Deep analysis needs an Esplora style source. This wallet chain source is a {chainKind}, which syncs balance and UTXOs but does not answer REST, and the scanner cannot talk to it. Pick an analysis source for this network; you are asked once.',
    'error.privacy.analysisSource.notEsplora':
      'This source is not an Esplora. The scanner only speaks REST in that format, and does not talk to Bitcoin Core or Electrum.',
    'error.privacy.analysisSource.wrongNetwork':
      'This source belongs to another network. The analysis source is chosen per network.',
    'error.privacy.analysisSource.notFound': 'This source does not exist, or is not yours.',
    'error.privacy.badAnalysisSource': 'Name the source you picked.',
    'error.privacy.blindScan':
      'The analysis could not reach the chain: the scanner answered that this wallet has no address, transaction or UTXO, and the watchtower has already synced UTXOs in it. The result was discarded rather than stored, because a score that measured nothing looks like a diagnosis and is not. Check the analysis source for this network.',
    'privacy.analysisSource': 'Analysis source',
    'privacy.analysisSourceNote':
      'Which Esplora runs the privacy analysis. The scanner only speaks that format: Bitcoin Core and Electrum sync balance and UTXOs, and cannot analyse. If you watch through an Esplora you need not choose anything here, because the wallet source already serves.',
    'privacy.analysisNone':
      'No Esplora style source on this network. Add one under query sources, above.',
    'privacy.analysisBy': 'analysed by {host}',
    'privacy.analysisChoose': 'Pick and analyse',
    'privacy.analysisNote':
      'This host gets to see the addresses of this wallet when the analysis runs. The choice applies to this network and is asked once; you can change it later in Settings.',
    'privacy.analysisOwn': 'yours',
    'privacy.analysisPublic': 'public',
    'alert.txid': 'Transaction',
    'alert.height': 'Height',
    'alert.blockHash': 'Block hash',
    'alert.wallet': 'Wallet',
    'alert.confirmations': '{n} confirmations',
    'alert.inMempool': 'in the mempool, no confirmation yet',
    'alert.siblings': 'Other alerts from this transaction',
    'alert.noEvent': 'This alert did not come from a transaction.',
    'alert.fetchOnChain': 'Look it up on chain',
    'alert.fetchNote':
      'The query goes to {fonte}, which then knows you looked this transaction up. Nothing is queried until you click.',
    'alert.inputs': 'Inputs',
    'alert.outputs': 'Outputs',
    'alert.fee': 'fee of {value} sats',
    'alert.txPrivacy': 'Transaction privacy',
    'alert.txPrivacyRunning': 'transaction analysis running...',
    'alert.txType': 'type',
    'alert.boltzmann': 'Boltzmann matrix',
    'alert.close': 'Close',
    'error.alert.notFound': 'That alert does not exist, or is not yours.',
    'error.tx.unsupportedByBackend':
      'The source of this wallet cannot tell the whole transaction. What is above came from the log, and the rest was not queried.',
    'error.tx.backendFailed': 'The source refused the query: {motivo}',
    'error.tx.notFound': 'The source does not know this transaction.',
    'feed.empty': 'No alerts yet. The watchtower speaks up the moment something moves.',
    'feed.tip': 'height {height}',
    'balance.total': 'Total balance',
    'balance.totalByNetwork': '{network} balance',
    'network.mainnet': 'mainnet',
    'network.signet': 'signet',
    'network.testnet': 'testnet',
    'balance.wallets': '{n} wallets',
    'balance.utxos': '{n} UTXOs',
    'balance.frozen': '{n} frozen',
    'addresses.title': 'Standalone addresses',
    'addresses.add': '+ Watch an address',
    'addresses.empty': 'No standalone address watched yet.',
    'addresses.note':
      'A single address, with no extended key. It derives nothing new and has no ' +
      'gap limit: what is watched is exactly what is here.',
    'wallets.title': 'Wallets',
    'wallets.empty': 'No wallet watched yet.',
    'wallets.emptyHint':
      'Paste the extended public key of the wallet you want to watch. ' +
      'Stealth Badger will alert you about movement and, above all, about ' +
      'privacy leaks.',
    'onboarding.stepSource': 'Choose where to watch through',
    'onboarding.stepWallet': 'Paste the key',
    'wallets.add': '+ Watch a wallet',
    'wallets.formTitle': 'Watch a wallet',
    'wallets.labelPlaceholder': 'Label, for example Cold wallet',
    'wallets.keyPlaceholder': 'xpub, ypub, zpub, tpub, upub or vpub',
    'wallets.modeKey': 'Whole wallet',
    'wallets.modeAddress': 'One address',
    'wallets.addressPlaceholder': 'bc1..., tb1..., 3... or 1...',
    'wallets.addressNote':
      'Watches this address only, and nothing else from the wallet it came from.',
    'wallet.watchedAddress': 'single address',
    'wallets.watchOnly':
      'Public keys only. Stealth Badger is watch-only and refuses anything that ' +
      'could spend.',
    'wallets.archive': 'Archive',
    'wallets.unarchive': 'Unarchive',
    'wallets.archived': 'archived',
    'wallets.archivedToggle': 'See archived',
    'wallets.archivedEmpty': 'No archived wallet.',
    'wallets.delete': 'Delete for good',
    'wallets.deleteTitle': 'Delete {label}?',
    'wallets.deleteNote':
      'Deletes the key, the event log and the alerts of this wallet. There is no ' +
      'undo. Archiving already takes the wallet off the screen and off the worker, ' +
      'and can be reversed.',
    'wallets.deleteConfirmLabel': 'Type the exact label to confirm',
    'wallets.cancel': 'Cancel',
    'wallets.scriptType': 'Script type',
    'wallets.scriptTypeAuto': 'discover from the chain',
    'wallets.scriptTypeNote':
      'This key does not say its script type: xpub and tpub serve legacy, ' +
      'nested segwit and native segwit alike. When the chosen source needs a ' +
      'descriptor registered there is no one to ask, and the wrong guess shows ' +
      'a zero balance with no error at all.',
    'wallets.submit': 'Start watching',
    'wallets.submitting': 'adding...',
    'wallet.coins': 'Coins',
    'wallet.frozen': 'frozen',
    'wallet.importing': 'Importing {progress}%',
    'wallet.importingNote':
      'Scanning the change chain. The total above does not include this wallet yet.',
    'wallet.importingNode': 'Rescan on your node',
    'wallet.importingCoreNote':
      'Your node is scanning the chain from genesis to find this wallet history. It takes minutes, and there is no bar because Bitcoin Core reports no progress while it rescans: it answers when it is done. Follow it on the node with getwalletinfo, in the scanning field. The total above does not include this wallet yet.',
    'wallet.syncError': 'Sync failed',
    'wallet.syncSourceFailed': 'Source {host} failed',
    'wallet.syncSourceFailedNote':
      'Source {host} did not respond: {reason}. Change this wallet source or wait for it to return before reading the balance as final.',
    'wallet.syncDegraded': 'Watching partially',
    'wallet.historyOnly': 'No active UTXO, with history',
    'wallet.historyOnlyNote':
      '{addresses} address(es) with history and {spent} spent UTXO(s) in this wallet.',
    'auth.tagline': 'Bitcoin privacy watchtower',
    'auth.email': 'email',
    'auth.password': 'password (at least 12 characters)',
    'auth.login': 'Sign in',
    'auth.register': 'Create account',
    'auth.logout': 'Sign out',
    'privacy.public': 'Public explorer',
    'privacy.sovereign': 'Sovereign',
    'privacy.severalHosts': '{n} backends',
    'privacy.score': 'Privacy {score}/100 · {grade}',
    'privacy.scan': 'Analyze privacy',
    'privacy.scanning': 'analyzing...',
    'privacy.never': 'privacy not analyzed yet',
    'privacy.measuredHere': 'Measured here, without leaving the network',
    'privacy.measuredHereNote':
      'These numbers come from what this watchtower synced through this wallet ' +
      'own chain source. No third party was queried to compute them. The scanner ' +
      'adds what only it has: the known entity database, transaction heuristics ' +
      'and the Boltzmann matrix.',
    'privacy.findings': 'What the scanner saw',
    'privacy.pageTitle': 'Privacy',
    'privacy.pageNote':
      'Shows what this server has already measured in the database. Opening an address shows saved analysis; when there is none, the screen says it does not know.',
    'privacy.walletSelect': 'Wallet',
    'privacy.generalScore': 'Average score',
    'privacy.generalAlerts': 'Alerts',
    'privacy.address': 'Address',
    'privacy.path': 'Path',
    'privacy.balance': 'Balance',
    'privacy.addressScoreShort': 'Score',
    'privacy.noAddresses': 'No synchronized address yet.',
    'privacy.addressDetail': 'Address detail',
    'privacy.addressUnknown': 'There is no saved analysis for this address yet.',
    'privacy.addressScore': 'Address privacy {score}/100 · {grade}',
    'privacy.scanUsedAddresses': 'Analyze used addresses',
    'privacy.addressScanQueued': '{n} addresses queued',
    'privacy.chartScore': 'Score',
    'privacy.chartHistory': 'History',
    'privacy.chartSeverity': 'Severity',
    'privacy.chartUtxos': 'UTXO ranges',
    'privacy.chartReuse': 'Address reuse',
    'privacy.chartCounterparties': 'Recurring counterparties',
    'privacy.reusedAddresses': '{reused} of {total} addresses reused',
    'privacy.utxoTotal': 'histogram total: {value}',
    'error.auth.invalidInput': 'Invalid email, or password shorter than 12 characters.',
    'error.auth.emailTaken': 'That email already has an account.',
    'error.auth.invalidCredentials': 'Email and password do not match.',
    'error.wallet.labelRequired': 'Give the wallet a label.',
    'error.wallet.keyOrAddress': 'Give an extended key or an address, not both.',
    'error.wallet.keyOrAddressRequired':
      "Give the wallet's extended key, or a single address to watch.",
    'error.wallet.wrongNetwork':
      'This key is for {chave}, and this watchtower watches {rede}. Use a {rede} key.',
    'error.wallet.networkMismatch':
      'This key or address is for {rede_da_chave}, and the chosen source {nome_do_backend} watches {rede_do_backend}.',
    'error.wallet.backendNotFound': 'That backend does not exist, or is not yours.',
    'backends.preset': 'Source',
    'backends.host': 'Host',
    'backends.port': 'Port',
    'backends.labelField': 'Nickname (optional)',
    'backends.auth': 'Authentication',
    'backends.authCookie': '.cookie file',
    'backends.authUserPass': 'user and password',
    'backends.cookiePath': 'Path to .cookie',
    'backends.user': 'RPC user',
    'backends.password': 'RPC password',
    'backends.credentialNote':
      'The credential is encrypted with the server master key and never comes back ' +
      'in an API response. Whoever reaches your node RPC can stop it.',
    'backends.datadir': 'Node data directory',
    'backends.datadirHint':
      'The folder bitcoind uses. On a default install it is ~/.bitcoin; from a system ' +
      'package it is usually /var/lib/bitcoind. If your node lives on a separate disk, ' +
      'it is that path.',
    'backends.detect': 'Find the node',
    'backends.detectFound': 'Found a {network} node at height {blocks}.',
    'backends.dockerHint':
      'This watchtower runs in a container: localhost here is the container itself, not your machine. Use host.docker.internal.',
    'error.backend.unknownPreset': 'I do not know the source "{preset}". Pick one from the catalogue.',
    'error.backend.notFound': 'That source does not exist, or is not yours.',
    'error.backend.networkMismatch':
      'This wallet is on {rede_da_carteira}, and the chosen source {nome_do_backend} watches {rede_do_backend}.',
    'wallets.changeSource': 'Change source',
    'wallets.changeSourceNote':
      'History is not lost in the switch: the wallet syncs again through the new source, and the log stays the same.',
    'error.backend.hostRequired': 'Give the host of the source.',
    'error.backend.portRequired': 'Give the port of the source.',
    'error.backend.portRange': 'Port {porta} is out of range. Use a number between 1 and 65535.',
    'error.backend.authRequired':
      'The Bitcoin Core RPC needs authentication: give the path to the node .cookie file, or the rpcauth user and password.',
    'error.wallet.notFound': 'That wallet does not exist, or is not yours.',
    'error.wallet.mustArchiveFirst':
      'Archive the wallet before deleting it. Archiving already takes it off the screen and off the worker, and can be reversed.',
    'error.wallet.confirmMismatch':
      'To delete, type the wallet label exactly: {rotulo}.',
    'error.wallet.unknownScriptType':
      'I do not know the script type "{tipo}". I accept {aceitos}.',
    'error.wallet.scriptTypeConflict':
      'This key already declares {tipo_da_chave}, and the request asked for {tipo_pedido}. Use a key of the type you want to watch.',
    'error.wallet.scriptTypeWithAddress':
      'The address already says its own script type. Declaring another could only contradict it.',
    'error.channel.unknownKind': 'I cannot deliver through "{tipo}". I accept ntfy and webhook.',
    'error.channel.topicRequired':
      'Pick a topic. It is what separates your notifications from everyone else\'s, so make it long and hard to guess.',
    'error.channel.urlRequired': 'Give the webhook url.',
    'error.channel.urlScheme': 'The webhook url must start with http:// or https://.',
    'error.channel.notFound': 'Channel not found.',
    'error.backend.unknownKind': 'I cannot talk to "{tipo}". I accept esplora and electrum.',
    'error.backend.urlRequired': 'Give the backend address.',
    'error.backend.esploraScheme':
      'Esplora speaks HTTP: the address must start with http:// or https://.',
    'error.backend.coreScheme':
      'The Bitcoin Core RPC speaks HTTP: the address must start with http:// or https://.',
    'error.backend.electrumScheme':
      'The Electrum address must start with electrum://, for example electrum://127.0.0.1:50001.',
    'error.backend.invalidUrl': 'That backend address is not a valid url.',
    'error.backend.noHost': 'That backend address has no host.',
    'search.placeholder': 'search address or wallet',
    'search.empty': 'Nothing found among what you watch.',
    'search.used': 'used',
    'search.unused': 'never used',
    'channels.title': 'Notify my phone',
    'channels.howTitle': 'How this works',
    'channels.how1':
      'ntfy delivers push by topic, not by account: no sign-up, no password. ' +
      'Whoever subscribes to a topic receives everything published to it.',
    'channels.how2':
      'Install the ntfy app on your phone, from the Play Store, App Store or F-Droid. ' +
      'Subscribe to a topic of your own, and paste the same topic here.',
    'channels.how3':
      'From then on this server publishes every alert to that topic and your phone ' +
      'rings. With no server given, the topic is published on the public ntfy.sh.',
    'channels.how4':
      'What the message carries: the wallet label, the alert title and body. For dust ' +
      'and for address reuse, the address involved goes too. Anyone who knows the topic ' +
      'reads all of that: pick a long random topic, and treat it as a secret.',
    'channels.empty': 'No channel. Alerts show up on this screen only.',
    'channels.topicPlaceholder': 'ntfy topic, long and hard to guess',
    'channels.topicHint':
      'Anyone who knows the topic receives your alerts. Pick something nobody guesses, and subscribe to the same topic in the ntfy app on your phone.',
    'channels.add': 'Add channel',
    'channels.test': 'Test',
    'channels.remove': 'remove',
    'channels.testOk': 'It arrived. The channel works.',
    'channels.testFail': 'Did not arrive: {error}',
    'utxos.title': 'UTXOs',
    'utxos.toggle': 'Coins and labels',
    'utxos.freeze': 'freeze',
    'utxos.unfreeze': 'unfreeze',
    'utxos.frozen': 'frozen',
    'utxos.address': 'Address',
    'utxos.labelPlaceholder': 'label',
    'utxos.export': 'Export labels',
    'utxos.import': 'Import labels',
    'utxos.dust': 'dust',
    'utxos.spent': 'spent',
    'utxos.empty': 'No UTXO in sight for this wallet.',
    'utxos.imported': '{imported} labels imported, {ignored} ignored',
    'backend.networkRequired': 'Network',
    'backends.title': 'Watch through',
    'backends.global': 'server default',
    'backends.own': 'yours',
    'backends.addToggle': '+ another backend',
    'backends.addSource': 'Add source',
    'backends.newSource': 'New source',
    'backends.urlPlaceholder': 'https://... or electrum://host:50001',
    'backends.isPublic': "It is someone else's public service",
    'backends.publicNote':
      'A public explorer answers right away and needs nothing installed. In exchange, it sees every address you look up, and can link them to each other. It is a legitimate choice, and the banner at the top stays lit while any wallet uses one.',
    'backends.save': 'Add backend',
  },
}
