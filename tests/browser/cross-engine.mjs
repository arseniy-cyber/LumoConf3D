import assert from 'node:assert/strict'
import { chromium, firefox, webkit } from '@playwright/test'

const address = process.env.LUMO_BROWSER_URL ?? 'http://127.0.0.1:3000/'
const engines = [['Chromium', chromium], ['Firefox', firefox], ['WebKit Linux', webkit]]
let failures = 0
for (const [name, engine] of engines) {
  let browser
  try {
    const chromiumPath = engine === chromium ? process.env.LUMO_CHROMIUM : undefined
    browser = await engine.launch({
      executablePath: chromiumPath,
      args: engine === chromium ? ['--disable-webgl'] : [],
    })
    const version = browser.version()
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(address, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.locator('.part-row').first().waitFor()
    assert.equal(await page.locator('.part-row').count(), 9)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390)
    await page.getByRole('button', { name: 'Каталог', exact: true }).click()
    await page.getByRole('textbox', { name: 'Поиск комплектующих' }).fill('Ryzen 5 7600')
    assert.equal(await page.locator('.catalog-item').count(), 1)
    await page.getByRole('button', { name: 'Выбрать', exact: true }).click()
    assert.match(await page.getByRole('button', { name: /^Процессор:/ }).getAttribute('aria-label'), /Ryzen 5 7600/)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /Процессор: AMD Ryzen 5 7600/ }).waitFor()
    assert.deepEqual(errors, [])
    console.log(`${name} ${version}: viewport, catalog, selection, persisted state OK`)
  } catch (error) {
    failures++
    console.error(name, error.message)
  } finally {
    await browser?.close()
  }
}
process.exitCode = failures ? 1 : 0
