import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('loads all nine slots, price, and the WebGL fallback', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Конфигуратор ПК' })).toBeVisible()
  await expect(page.locator('.part-row')).toHaveCount(9)
  await expect(page.locator('.total-line strong')).toHaveText(/204\s410\s₽/)
  await expect(page.getByText('3D недоступно')).toBeVisible()
})

test('searches and displays product evidence', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Каталог', exact: true }).click()
  await page.getByRole('textbox', { name: 'Поиск комплектующих' }).fill('990 PRO')
  await expect(page.locator('.catalog-item')).toHaveCount(1)
  await page.locator('.catalog-item-title button').click()
  await expect(page.getByRole('link', { name: 'Характеристики производителя' })).toHaveAttribute('href', /samsung/)
  await expect(page.getByRole('button', { name: 'Осмотреть в 3D' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('supports favorites and compares two components', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Процессор:/ }).click()
  await page.getByRole('button', { name: 'Избранное: AMD Ryzen 5 7600', exact: true }).click()
  await page.getByRole('button', { name: 'Избранное', exact: true }).click()
  await expect(page.locator('.catalog-item')).toHaveCount(1)
  await page.getByRole('button', { name: 'Все', exact: true }).click()
  await page.getByRole('button', { name: 'Сравнить: AMD Ryzen 5 7600', exact: true }).click()
  await page.getByRole('button', { name: 'Сравнить: AMD Ryzen 7 7800X3D', exact: true }).click()
  await page.getByRole('button', { name: 'Сравнить (2)', exact: true }).click()
  await expect(page.locator('.compare-column')).toHaveCount(2)
})

test('updates price, supports undo/redo and restores a changed build', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Процессор:/ }).click()
  await page.getByRole('textbox', { name: 'Поиск комплектующих' }).fill('Ryzen 5 7600')
  await page.getByRole('button', { name: 'Выбрать', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Процессор:/ })).toHaveAccessibleName(/Ryzen 5 7600/)
  await expect(page.locator('.total-line strong')).not.toHaveText(/204\s410/)
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Процессор:/ })).toHaveAccessibleName(/7800X3D/)
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: /^Процессор:/ })).toHaveAccessibleName(/Ryzen 5 7600/)
})

test('explains socket incompatibility before selection', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Процессор:/ }).click()
  await page.getByRole('textbox', { name: 'Поиск комплектующих' }).fill('12400F')
  await page.getByRole('button', { name: 'Выбрать', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Обнаружена несовместимость' })).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText(/LGA1700/)
  await page.getByRole('button', { name: 'Выбрать для сравнения' }).click()
  await expect(page.locator('.fit-label')).toContainText('Конфликты')
  await page.getByRole('button', { name: 'К итогам сборки' }).click()
  await expect(page.getByText(/устраните конфликты совместимости/)).toBeVisible()
})

test('saves named configurations and restores a preset after reset', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Мои сборки' }).click()
  await page.getByLabel('Название сборки').fill('Тестовая конфигурация')
  await page.getByRole('button', { name: 'Сохранить текущую' }).click()
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
  await page.getByRole('button', { name: 'Очистить сборку' }).click()
  await expect(page.locator('.part-count')).toHaveText('0/9')
  await page.getByRole('button', { name: 'Мои сборки' }).click()
  await expect(page.getByText('Тестовая конфигурация')).toBeVisible()
  await page.getByRole('button', { name: 'Открыть', exact: true }).click()
  await expect(page.locator('.part-count')).toHaveText('9/9')
})

test('provides reference performance and distinguishes demo pricing', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Анализ', exact: true }).click()
  await expect(page.getByText('Рекомендация БП')).toBeVisible()
  await expect(page.locator('.benchmark').first()).toBeAttached()
  await expect(page.getByRole('link', { name: 'Опубликованный тест' }).first()).toHaveAttribute('href', /techspot/)
  await page.getByRole('button', { name: 'К итогам сборки' }).click()
  await expect(page.getByText(/демонстрационные цены и остатки/)).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать PDF' }).click()
  const pdf = await download
  expect(pdf.suggestedFilename()).toBe('lumo-build.pdf')
  const bytes = await readFile((await pdf.path())!)
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  expect(bytes.length).toBeGreaterThan(5_000)
})

test('exports a part list and opens a portable sharing link', async ({ page, context }) => {
  await page.goto('/')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('lumo-build.txt')
  await page.getByRole('combobox', { name: 'Окружение сцены' }).selectOption('technical')
  await page.getByRole('button', { name: 'Ссылка на сборку' }).click()
  const url = await page.getByRole('textbox', { name: 'Ссылка на сборку' }).inputValue()
  const other = await context.newPage()
  await other.goto(url)
  await expect(other.locator('.part-count')).toHaveText('9/9')
  await expect(other.getByRole('combobox', { name: 'Окружение сцены' })).toHaveValue('technical')
})

test('filters presets by budget and supports an empty assembly', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Готовые сборки', exact: true }).click()
  await page.getByLabel('Бюджет').fill('1')
  await expect(page.getByText(/В этом бюджете готовых сборок пока нет/)).toBeVisible()
  await page.getByLabel('Бюджет').clear()
  await page.locator('.preset-grid article').filter({ hasText: 'Пустой корпус' }).getByRole('button', { name: 'Открыть' }).click()
  await expect(page.locator('.part-count')).toHaveText('1/9')
})

for (const width of [320, 390, 540, 768, 1024]) {
  test(`fits a ${width}px viewport without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 845 })
    await page.goto('/')
    await expect(page.locator('.viewport')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.getByRole('button', { name: 'Каталог', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await page.locator('.modal').evaluate(node => node.scrollWidth)).toBeLessThanOrEqual(await page.locator('.modal').evaluate(node => node.clientWidth))
  })
}
