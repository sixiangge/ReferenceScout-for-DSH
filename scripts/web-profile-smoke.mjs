import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.argv[2]
if (!baseUrl) throw new Error('usage: pnpm run test:web -- <authenticated DSH Web URL>')

const artifacts = resolve('artifacts/web-profile-test')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', locale: 'zh-CN' })
const errors = []
page.on('pageerror', error => { errors.push(`pageerror: ${error.message}`) })
page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })

function contrastRatio(foreground, background) {
  const channels = color => color.match(/[\d.]+/g).slice(0, 3).map(value => {
    const channel = Number(value) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  const luminance = color => {
    const [red, green, blue] = channels(color)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
  }
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  if (await page.title() !== 'DeepSeek Harness') throw new Error(`unexpected title: ${await page.title()}`)

  await page.getByRole('button', { name: /设置|Settings/i }).click()
  await page.waitForTimeout(1200)
  await page.getByText(/^插件$|^Plugins$/i).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: resolve(artifacts, 'settings-light.png'), fullPage: true })

  const card = page.getByRole('listitem').filter({ hasText: 'Reference Scout' })
  await card.waitFor({ state: 'visible' })
  const cardText = await card.innerText()
  for (const expected of ['Reference Scout', '执行模式', 'GitHub 凭据', '研究预算', '证据与策略', '清除研究缓存']) {
    if (!cardText.includes(expected)) throw new Error(`settings card missing: ${expected}`)
  }
  const checkboxes = card.getByRole('checkbox')
  const checkboxCount = await checkboxes.count()
  const radioCount = await card.getByRole('radio').count()
  const numberInputCount = await card.locator('input[type=number]').count()
  if (checkboxCount < 4) throw new Error('settings card is missing expected checkbox controls')
  if (radioCount !== 2) throw new Error('settings card must expose two enforcement modes')
  if (numberInputCount < 8) throw new Error('settings card is missing budget controls')
  if (await card.locator('[aria-live="polite"]').count() < 1) throw new Error('settings card is missing an aria-live status region')

  await card.getByRole('button', { name: /清除研究缓存|Clear research cache/i }).click()
  const dialog = page.locator('dialog.rs-dialog')
  await dialog.waitFor({ state: 'visible' })
  const cancel = dialog.getByRole('button', { name: /取消|Cancel/i })
  if (!await cancel.isVisible()) throw new Error('cache confirmation has no cancel action')
  await cancel.click()

  await page.emulateMedia({ colorScheme: 'dark' })
  const primaryButtonColors = await card.locator('.rs-button-primary').first().evaluate(element => {
    const style = getComputedStyle(element)
    return { color: style.color, backgroundColor: style.backgroundColor }
  })
  const primaryButtonContrast = contrastRatio(primaryButtonColors.color, primaryButtonColors.backgroundColor)
  if (primaryButtonContrast < 4.5) throw new Error(`dark primary button contrast is ${primaryButtonContrast.toFixed(2)}:1`)
  await page.screenshot({ path: resolve(artifacts, 'settings-dark.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: resolve(artifacts, 'settings-mobile.png'), fullPage: true })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.keyboard.press('Escape')
  await page.getByText('作业解答与详解', { exact: true }).first().click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /打开右侧边栏|Open right sidebar/i }).click()
  await page.waitForTimeout(500)
  const referenceGuide = page.getByText(/^参考研究$|^References$/i)
  if (await referenceGuide.count() === 0) {
    const newTab = page.getByRole('button', { name: /新标签页|New tab/i })
    if (await newTab.count() > 0) await newTab.click()
  }
  await referenceGuide.last().click()
  const panel = page.locator('.rs-panel')
  await panel.waitFor({ state: 'visible' })
  if (!await panel.getByText(/本会话尚无参考研究|No reference research/i).isVisible()) throw new Error('empty reference panel state is missing')
  const emptyTask = panel.getByRole('textbox', { name: /^任务$|^Task$/i })
  await emptyTask.fill('临时任务')
  if (await panel.getByRole('button', { name: /重新研究|Research again/i }).isDisabled()) throw new Error('manual panel research remains disabled after a task is entered')
  await panel.getByRole('button', { name: /为此任务跳过|Skip for this task/i }).click()
  const skipDialog = page.locator('dialog.rs-dialog[open]')
  await skipDialog.waitFor({ state: 'visible' })
  if (await skipDialog.locator('textarea').count() !== 1) throw new Error('strict skip dialog is missing its reason field')
  await skipDialog.getByRole('button', { name: /取消|Cancel/i }).click()
  await page.screenshot({ path: resolve(artifacts, 'panel-empty-light.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  const mobilePanelBox = await panel.boundingBox()
  const mobilePanelFits = mobilePanelBox !== null && mobilePanelBox.x >= -1 && mobilePanelBox.x + mobilePanelBox.width <= 391
  await page.screenshot({ path: resolve(artifacts, 'panel-empty-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.getByRole('button', { name: /新建会话|New session/i }).first().click()
  const editor = page.locator('[contenteditable=true][role=textbox]')
  await editor.fill('/reference {"action":"skip","query":"Reference Scout WebUI 临时回归测试","reason":"自动化测试，不调用模型"}')
  await page.getByRole('button', { name: /发送消息|Send message/i }).click()
  await page.getByText(/Reference research skipped: 0 selected/).first().waitFor({ state: 'visible' })
  const headerAction = page.getByRole('button', { name: /打开参考研究|Open reference research/i })
  await headerAction.waitFor({ state: 'visible' })
  await headerAction.click()
  await page.locator('.rs-panel:visible').getByText('Reference Scout WebUI 临时回归测试', { exact: true }).first().waitFor({ state: 'visible' })
  await page.screenshot({ path: resolve(artifacts, 'panel-result-light.png'), fullPage: true })

  const browserErrors = errors.filter(message => !/favicon|ResizeObserver loop/i.test(message))
  if (browserErrors.length > 0) throw new Error(`browser errors:\n${browserErrors.join('\n')}`)
  console.log(JSON.stringify({
    status: 'passed', title: await page.title(),
    settings: { checkboxes: checkboxCount, radios: radioCount, numberInputs: numberInputCount, darkPrimaryContrast: Number(primaryButtonContrast.toFixed(2)) },
    session: { guide: true, emptyPanel: true, mobilePanelFits, command: true, inlineNotice: true, headerAction: true, resultPanel: true },
    screenshots: ['settings-light.png', 'settings-dark.png', 'settings-mobile.png', 'panel-empty-light.png', 'panel-empty-mobile.png', 'panel-result-light.png'],
  }, null, 2))
} finally {
  await browser.close()
}
