/**
 * Passagem de regressão pela interface, contra a stack de pé.
 *
 * Existe porque metade dos defeitos desta semana só apareceu na tela: o aviso
 * de privacidade que a rolagem levava embora, a unidade duplicada, o botão de
 * sair quebrado por um cabeçalho. Teste de unidade não pega nenhum dos três.
 *
 * Requer Playwright e a stack rodando em http://localhost:8080, com o usuário
 * de demonstração já cadastrado.
 */
import { chromium } from 'playwright'

const falhas = []
const erros = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('response', r => {
  if (r.url().includes('/api/') && r.status() >= 400 && !r.url().includes('/auth/me')) {
    falhas.push(`${r.status()} ${r.url().replace('http://localhost:8080', '')}`)
  }
})
page.on('pageerror', e => erros.push(e.message))
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('401')) erros.push(m.text()) })

function ok(rotulo, cond) { console.log((cond ? '✓' : '✗') + ' ' + rotulo) }

await page.goto('http://localhost:8080', { waitUntil: 'networkidle' })
ok('login carrega', await page.locator('input[type="password"]').isVisible())

await page.fill('input[type="email"]', 'estreia@teste.local')
await page.fill('input[type="password"]', 'senha-bem-longa-de-teste')
await page.getByRole('button').filter({ hasNotText: /^(pt|en)$/i }).first().click()
await page.waitForSelector('[role="status"][data-posture]')
await page.waitForTimeout(1500)

ok('selo de privacidade presente', (await page.locator('[role="status"][data-posture]').count()) === 1)
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
await page.waitForTimeout(400)
ok('aviso sobrevive à rolagem', await page.locator('[role="status"][data-posture]').evaluate(
  el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight }))
await page.evaluate(() => window.scrollTo(0, 0))

const cartoes = await page.locator('article[data-wallet-kind]').count()
ok(`${cartoes} carteiras listadas`, cartoes >= 2)
ok('endereço avulso distinguido', (await page.locator('article[data-wallet-kind="address"]').count()) >= 1)
ok('carteira degradada avisa em parte', await page.getByText(/vigiando em parte/i).first().isVisible().catch(() => false))
ok('seção de canais presente', await page.getByText(/avisar no celular/i).isVisible())

await page.getByRole('button', { name: /o que o scanner viu/i }).first().click()
await page.waitForTimeout(1200)
ok('achados do scanner abrem', await page.getByText(/reused|no address reuse|dust/i).first().isVisible().catch(() => false))

await page.getByRole('button', { name: /moedas e rótulos/i }).first().click()
await page.waitForTimeout(1500)
ok('tabela de UTXO abre', (await page.locator('li[data-dust]').count()) > 0)
ok('exportar rótulos disponível', await page.getByRole('link', { name: /exportar rótulos/i }).first().isVisible())

await page.getByRole('button', { name: /^en$/i }).click()
await page.waitForTimeout(1200)
ok('alterna para inglês', await page.getByText(/public explorer/i).isVisible().catch(() => false))
await page.getByRole('button', { name: /^pt$/i }).click()
await page.waitForTimeout(800)

console.log('\nrespostas 4xx/5xx:', falhas.length ? falhas : 'nenhuma')
console.log('erros de página  :', erros.length ? erros.slice(0, 3) : 'nenhum')
await page.screenshot({ path: 'capturas/17-regressao.png', fullPage: false })
await browser.close()
