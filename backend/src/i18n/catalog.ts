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
    'wallets.add': '+ Vigiar carteira',
    'wallets.formTitle': 'Vigiar uma carteira',
    'wallets.labelPlaceholder': 'Rótulo, por exemplo Cold wallet',
    'wallets.keyPlaceholder': 'xpub, ypub, zpub, tpub, upub ou vpub',
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
    'auth.tagline': 'Watchtower de privacidade para Bitcoin',
    'auth.email': 'e-mail',
    'auth.password': 'senha (mínimo 12 caracteres)',
    'auth.login': 'Entrar',
    'auth.register': 'Criar conta',
    'auth.logout': 'Sair',
    'privacy.public': 'Explorador público',
    'privacy.sovereign': 'Soberano',
  },
  en: {
    'alert.funds_received.title': 'Funds received',
    'alert.funds_received.body': '{value} sats, {state}.',
    'alert.funds_spent.title': 'Funds spent',
    'alert.funds_spent.body': 'UTXO {txid}:{vout} was consumed.',
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
    'wallets.add': '+ Watch a wallet',
    'wallets.formTitle': 'Watch a wallet',
    'wallets.labelPlaceholder': 'Label, for example Cold wallet',
    'wallets.keyPlaceholder': 'xpub, ypub, zpub, tpub, upub or vpub',
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
    'auth.tagline': 'Bitcoin privacy watchtower',
    'auth.email': 'email',
    'auth.password': 'password (at least 12 characters)',
    'auth.login': 'Sign in',
    'auth.register': 'Create account',
    'auth.logout': 'Sign out',
    'privacy.public': 'Public explorer',
    'privacy.sovereign': 'Sovereign',
  },
}
