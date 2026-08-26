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
    'feed.empty': 'Nenhum alerta ainda. O watchtower avisa assim que algo se mexer.',
    'feed.tip': 'altura {height}',
    'balance.total': 'Saldo total',
    'balance.wallets': '{n} carteiras',
    'balance.utxos': '{n} UTXOs',
    'balance.frozen': '{n} congelado',
    'wallets.title': 'Carteiras',
    'wallets.empty': 'Nenhuma carteira vigiada ainda.',
    'wallets.emptyHint':
      'Cole a chave pública estendida da carteira que você quer vigiar. ' +
      'O Stealth Badger passa a avisar sobre movimentação e, principalmente, ' +
      'sobre vazamento de privacidade.',
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
    'wallets.submit': 'Começar a vigiar',
    'wallets.submitting': 'cadastrando...',
    'wallet.coins': 'Moedas',
    'wallet.frozen': 'congelado',
    'wallet.importing': 'Importando {progress}%',
    'wallet.importingNote':
      'Varrendo a cadeia de change. O saldo total acima ainda não inclui esta carteira.',
    'wallet.syncError': 'Falha na sincronização',
    'wallet.syncDegraded': 'Vigiando em parte',
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
    'privacy.findings': 'O que o scanner viu',
    'channels.title': 'Avisar no celular',
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
    'utxos.labelPlaceholder': 'rótulo',
    'utxos.export': 'Exportar rótulos',
    'utxos.import': 'Importar rótulos',
    'utxos.dust': 'dust',
    'utxos.empty': 'Nenhum UTXO à vista nesta carteira.',
    'utxos.imported': '{imported} rótulos importados, {ignored} ignorados',
    'backends.title': 'Vigiar por',
    'backends.global': 'configurado no servidor',
    'backends.own': 'seu',
    'backends.addToggle': '+ outro backend',
    'backends.urlPlaceholder': 'https://... ou electrum://host:50001',
    'backends.isPublic': 'É um serviço público de terceiro',
    'backends.publicNote':
      'Um backend público enxerga quais endereços você consulta. O aviso no topo fica aceso enquanto qualquer carteira usar um.',
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
    'feed.empty': 'No alerts yet. The watchtower speaks up the moment something moves.',
    'feed.tip': 'height {height}',
    'balance.total': 'Total balance',
    'balance.wallets': '{n} wallets',
    'balance.utxos': '{n} UTXOs',
    'balance.frozen': '{n} frozen',
    'wallets.title': 'Wallets',
    'wallets.empty': 'No wallet watched yet.',
    'wallets.emptyHint':
      'Paste the extended public key of the wallet you want to watch. ' +
      'Stealth Badger will alert you about movement and, above all, about ' +
      'privacy leaks.',
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
    'wallets.submit': 'Start watching',
    'wallets.submitting': 'adding...',
    'wallet.coins': 'Coins',
    'wallet.frozen': 'frozen',
    'wallet.importing': 'Importing {progress}%',
    'wallet.importingNote':
      'Scanning the change chain. The total above does not include this wallet yet.',
    'wallet.syncError': 'Sync failed',
    'wallet.syncDegraded': 'Watching partially',
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
    'privacy.findings': 'What the scanner saw',
    'channels.title': 'Notify my phone',
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
    'utxos.labelPlaceholder': 'label',
    'utxos.export': 'Export labels',
    'utxos.import': 'Import labels',
    'utxos.dust': 'dust',
    'utxos.empty': 'No UTXO in sight for this wallet.',
    'utxos.imported': '{imported} labels imported, {ignored} ignored',
    'backends.title': 'Watch through',
    'backends.global': 'server default',
    'backends.own': 'yours',
    'backends.addToggle': '+ another backend',
    'backends.urlPlaceholder': 'https://... or electrum://host:50001',
    'backends.isPublic': "It is someone else's public service",
    'backends.publicNote':
      'A public backend sees which addresses you look up. The banner at the top stays lit while any wallet uses one.',
    'backends.save': 'Add backend',
  },
}
