import { categories } from '../shared/types'
import type { Part } from '../shared/types'
import { AdminApi, errorMessage } from './api'
import {
  badge, button, categoryNames, cells, downloadJson, empty, html, icon, money, notice, partName,
  select, showDialog, table, textInput,
} from './components'
import { filePicker, openProductEditor } from './product-editor'

const pageSize = 15

function parseImport(raw: string): Part[] {
  const data: unknown = JSON.parse(raw)
  const products = Array.isArray(data) ? data
    : data && typeof data === 'object' && 'products' in data ? data.products : undefined
  if (!Array.isArray(products) || !products.length) {
    throw new Error('Нужен непустой список products в формате JSON.')
  }
  const ids = new Set<string>()
  for (const entry of products) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id || !entry.name) {
      throw new Error('У каждой позиции должны быть заполнены артикул id и название name.')
    }
    if (ids.has(entry.id)) throw new Error(`Артикул ${entry.id} повторяется в файле.`)
    ids.add(entry.id)
  }
  return products as Part[]
}

function importBatches(products: Part[]): Part[][] {
  const limit = 1_000_000
  const bytes = new TextEncoder()
  const batches: Part[][] = [[]]
  let batch = batches[0]
  let size = 16
  for (const product of products) {
    const rowSize = bytes.encode(JSON.stringify(product)).byteLength + 1
    if (rowSize + 16 > limit) throw new Error(`Позиция ${product.id} превышает допустимый размер.`)
    if (batch.length === 100 || size + rowSize > limit) {
      batch = []
      batches.push(batch)
      size = 16
    }
    batch.push(product)
    size += rowSize
  }
  return batches
}

function openImport(host: HTMLElement, api: AdminApi, products: Part[], changed: (message: string) => void): void {
  const batches = importBatches(products)
  const { dialog, body, close } = showDialog(host, 'Импорт каталога', `Позиций в файле: ${products.length}`)
  let index = 0
  let saved = 0
  let pending = false
  const feedback = html('div', '')
  const confirm = button('Импортировать', async () => {
    pending = true
    confirm.disabled = true
    try {
      while (index < batches.length) {
        feedback.replaceChildren(notice(`Проверяем и сохраняем пакет ${index + 1} из ${batches.length}`))
        await api.importProducts(batches[index])
        saved += batches[index].length
        index++
      }
      close()
    } catch (error) {
      feedback.replaceChildren(notice(`Сохранено ${saved} из ${products.length}. ${errorMessage(error)}`, 'error'))
    } finally {
      pending = false
      confirm.disabled = false
    }
  }, 'primary', 'upload')
  dialog.addEventListener('cancel', (event) => { if (pending) event.preventDefault() })
  dialog.querySelector<HTMLButtonElement>('.lumo-admin-icon-action')?.addEventListener('click', (event) => {
    if (pending) event.stopImmediatePropagation()
  }, { capture: true })
  dialog.addEventListener('close', () => {
    if (saved === products.length) changed(`Импорт завершён. Обработано позиций: ${saved}.`)
    else if (saved) changed(`Импорт остановлен. Обработано ${saved} из ${products.length} позиций.`)
  }, { once: true })
  body.append(html('p', 'lumo-admin-muted', 'Совпадающие артикулы будут обновлены и возвращены в каталог. Остальные позиции сохранятся.'),
    batches.length > 1 ? html('p', 'lumo-admin-muted', `Файл будет обработан за ${batches.length} пакета. Каждый пакет сохраняется целиком.`) : '',
    html('ul', 'lumo-admin-import-list', ...products.slice(0, 8).map((part) => html('li', '',
      html('strong', '', String(part.name)), html('small', 'lumo-admin-muted', part.id)))),
    products.length > 8 ? html('p', 'lumo-admin-muted', `И ещё ${products.length - 8}`) : '',
    feedback, html('div', 'lumo-admin-dialog-footer',
      button('Отмена', () => { if (!pending) close() }), confirm))
}

export function catalogView(
  host: HTMLElement, api: AdminApi, data: { products: Part[]; archivedIds: string[] }, changed: (message: string) => void,
): HTMLElement {
  const feedback = html('div')
  const list = html('div')
  const { products, archivedIds } = data
  const archived = new Set(archivedIds)
  const search = textInput('product-search', '', { type: 'search', placeholder: 'Название, бренд или артикул' })
  search.setAttribute('aria-label', 'Поиск позиции')
  const category = select('product-category', [['', 'Все категории'], ...categories.map((key) => [key, categoryNames[key]] as const)], '')
  category.setAttribute('aria-label', 'Категория комплектующего')
  const stock = select('product-stock', [['all', 'Все состояния'], ['stock', 'В наличии'], ['out', 'Нет в наличии'], ['archived', 'В архиве']], 'all')
  stock.setAttribute('aria-label', 'Состояние комплектующего')
  const importCatalog = filePicker(async (file) => {
    feedback.replaceChildren()
    if (file.size > 20_000_000) {
      feedback.replaceChildren(notice('Размер файла каталога должен быть меньше 20 МБ.', 'error'))
      return
    }
    try {
      openImport(host, api, parseImport(await file.text()), changed)
    } catch (error) {
      feedback.replaceChildren(notice(error instanceof SyntaxError ? 'Не удалось прочитать файл JSON.' : errorMessage(error), 'error'))
    }
  })
  let currentPage = 0
  const update = () => {
    const query = search.value.trim().toLocaleLowerCase('ru')
    const matched = products.filter((part) => {
      const state = stock.value
      const removed = archived.has(part.id)
      const matchesStock = state === 'all' || (state === 'archived' ? removed : !removed && part.inStock === (state === 'stock'))
      return matchesStock && (!category.value || part.category === category.value)
        && (!query || [part.name, part.brand, part.id].some((value) => value.toLocaleLowerCase('ru').includes(query)))
    })
    if (!matched.length) {
      list.replaceChildren(empty(products.length ? 'Позиции не найдены' : 'Каталог пуст',
        products.length ? 'Измените запрос или фильтры.' : 'Добавьте комплектующее или импортируйте список.'))
      return
    }
    const maxPage = Math.ceil(matched.length / pageSize) - 1
    currentPage = Math.min(currentPage, maxPage)
    const edit = (part: Part) => openProductEditor({ api, host, changed }, part, archived.has(part.id))
    const rows = matched.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((part) => {
      const archivedPart = archived.has(part.id)
      const show = button('Открыть', () => edit(part), 'quiet', 'chevron')
      show.setAttribute('aria-label', `Редактировать ${part.name}`)
      return cells(partName(part), categoryNames[part.category],
        html('div', 'lumo-admin-cell-price', html('strong', '', money(part.price)),
          part.priceStatus === 'demo' && html('small', 'lumo-admin-muted', 'Демо')),
        archivedPart ? badge('В архиве', 'gray') : part.inStock ? badge('В наличии', 'green') : badge('Нет в наличии', 'orange'),
        show)
    })
    const prev = button('Назад', () => { currentPage--; update() }, 'plain', 'arrow')
    prev.disabled = currentPage === 0
    const next = button('Далее', () => { currentPage++; update() }, 'plain', 'right')
    next.disabled = currentPage >= maxPage
    const start = currentPage * pageSize + 1
    const end = Math.min(matched.length, (currentPage + 1) * pageSize)
    list.replaceChildren(table(['Комплектующее', 'Категория', 'Цена', 'Наличие', ''], rows),
      html('div', 'lumo-admin-list-footer', html('span', 'lumo-admin-muted', `Показано ${start}–${end} из ${matched.length}`),
        maxPage > 0 && html('div', 'lumo-admin-actions', prev, next)))
  }
  const reset = () => { currentPage = 0; update() }
  search.addEventListener('input', reset)
  category.addEventListener('change', reset)
  stock.addEventListener('change', reset)
  update()
  return html('div', 'lumo-admin-stack',
    html('div', 'lumo-admin-toolbar',
      html('div', 'lumo-admin-actions lumo-admin-filters', html('div', 'lumo-admin-search', icon('search'), search), category, stock),
      html('div', 'lumo-admin-actions',
        importCatalog.button, importCatalog.input,
        button('Экспорт JSON', () => downloadJson('lumo-catalog.json', { products: products.filter((part) => !archived.has(part.id)) }), 'plain', 'download'),
        button('Добавить', () => openProductEditor({ api, host, changed }), 'primary', 'plus'))),
    feedback, html('section', 'lumo-admin-panel', list))
}
