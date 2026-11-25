import { AdminApi, errorMessage, orderStatuses } from './api'
import type { Order, OrderStatus } from './api'
import { badge, button, categoryNames, cells, date, empty, field, html, icon, labelValue, money, notice, select, showDialog, submit, table, textInput } from './components'

const statusChoices = Object.entries(orderStatuses)
const statusColors = {
  new: 'purple', review: 'orange', confirmed: 'green', completed: 'green', cancelled: 'gray',
} as const

export function orderBadge(status: OrderStatus): HTMLElement {
  return badge(orderStatuses[status] ?? status, statusColors[status] ?? 'gray')
}

export function openOrder(host: HTMLElement, api: AdminApi, order: Order, changed: (message: string) => void): void {
  const { body, close } = showDialog(host, `Заявка ${order.id.slice(0, 8)}`, date(order.createdAt))
  const customer = order.customer ?? { name: '—' }
  const status = select('status', statusChoices, order.status)
  const feedback = html('div')
  const save = submit('Обновить статус', 'check')
  save.disabled = true
  status.addEventListener('change', () => { save.disabled = status.value === order.status })
  const form = html('form', 'lumo-admin-form',
    html('div', 'lumo-admin-order-info',
      labelValue('Клиент', customer.name), labelValue('Стоимость', money(order.total, order.currency)),
      customer.email && labelValue('Почта', customer.email), customer.phone && labelValue('Телефон', customer.phone)),
    customer.comment && html('div', 'lumo-admin-comment', html('span', 'lumo-admin-muted', 'Комментарий'), html('p', '', customer.comment)),
    html('section', 'lumo-admin-editor-section', html('h3', '', 'Комплектующие и услуги'),
      html('ul', 'lumo-admin-import-list',
        ...order.parts.map((part) => html('li', '', html('div', 'lumo-admin-cell-price', html('strong', '', part.name),
          html('small', 'lumo-admin-muted', categoryNames[part.category], part.priceStatus === 'demo' ? ' · демо-цена' : '')),
        html('small', 'lumo-admin-muted', money(part.price, order.currency)))),
        ...order.services.map((service) => html('li', '', html('span', '', service.name),
          html('small', 'lumo-admin-muted', money(service.price, order.currency)))))),
    order.pricing.discount > 0 && labelValue(
      order.pricing.promoCode ? `Скидка · ${order.pricing.promoCode}` : 'Скидка', money(order.pricing.discount, order.currency)),
    feedback,
    html('div', 'lumo-admin-dialog-footer', field('Статус', status), html('span', 'lumo-admin-spacer'), save))
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    save.disabled = true
    try {
      await api.setOrderStatus(order.id, status.value as OrderStatus)
      close()
      changed('Статус заявки обновлён.')
    } catch (error) {
      feedback.replaceChildren(notice(errorMessage(error), 'error'))
      save.disabled = false
    }
  })
  body.append(form)
}

export function orderTable(
  orders: Order[], open: (order: Order) => void,
): HTMLElement {
  if (!orders.length) return empty('Заявок пока нет', 'Новые заявки появятся после отправки сборки из конфигуратора.', 'orders')
  const rows = orders.map((order) => {
    const control = button('Открыть', () => open(order), 'quiet', 'chevron')
    control.setAttribute('aria-label', `Открыть заявку ${order.id.slice(0, 8)}`)
    return cells(html('strong', 'lumo-admin-mono', order.id.slice(0, 8)), date(order.createdAt),
      html('div', 'lumo-admin-cell-price', html('strong', '', order.customer?.name ?? '—'),
        html('small', 'lumo-admin-muted', order.customer?.email ?? order.customer?.phone ?? '')),
      money(order.total, order.currency), orderBadge(order.status), control)
  })
  return table(['Заявка', 'Дата', 'Клиент', 'Стоимость', 'Статус', ''], rows)
}

const pageSize = 20

export function ordersView(
  orders: Order[], open: (order: Order) => void,
  paging: { offset: number; nextOffset: number | null; changeOffset: (next: number) => void },
): HTMLElement {
  const list = html('div')
  const search = textInput('order-text', '', { type: 'search', placeholder: 'Номер, клиент, почта' })
  const filter = select('order-filter', [['', 'Все статусы'], ...statusChoices], '')
  search.setAttribute('aria-label', 'Поиск заявки')
  filter.setAttribute('aria-label', 'Статус заявки')
  let currentPage = 0
  const update = () => {
    const query = search.value.trim().toLocaleLowerCase('ru')
    const matched = orders.filter((order) => (!filter.value || order.status === filter.value)
      && (!query || [order.id, order.customer?.name, order.customer?.email, order.customer?.phone]
        .some((value) => value?.toLocaleLowerCase('ru').includes(query))))
    if (orders.length && !matched.length) {
      list.replaceChildren(empty('Подходящих заявок нет', 'Измените запрос или выберите другой статус.', 'orders'))
      return
    }
    const page = matched.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
    const results = orderTable(page, open)
    if (matched.length <= pageSize) {
      list.replaceChildren(results)
      return
    }
    const prev = button('Назад', () => { currentPage--; update() }, 'plain', 'arrow')
    const next = button('Далее', () => { currentPage++; update() }, 'plain', 'right')
    prev.disabled = currentPage === 0
    next.disabled = (currentPage + 1) * pageSize >= matched.length
    list.replaceChildren(results, html('div', 'lumo-admin-list-footer',
      html('span', 'lumo-admin-muted', `Показано ${currentPage * pageSize + 1}–${currentPage * pageSize + page.length} из ${matched.length}`),
      html('div', 'lumo-admin-actions', prev, next)))
  }
  const reset = () => { currentPage = 0; update() }
  search.addEventListener('input', reset)
  filter.addEventListener('change', reset)
  update()
  return html('div', 'lumo-admin-stack', html('div', 'lumo-admin-toolbar',
    html('div', 'lumo-admin-actions lumo-admin-filters', html('div', 'lumo-admin-search', icon('search'), search), filter)),
    html('section', 'lumo-admin-panel', list),
    (paging.offset > 0 || Boolean(paging.nextOffset)) && html('div', 'lumo-admin-toolbar',
      html('small', 'lumo-admin-muted', `Заявки ${paging.offset + 1}–${paging.offset + orders.length}. Поиск по текущей группе.`),
      html('div', 'lumo-admin-actions',
        paging.offset > 0 && button('Предыдущая группа', () => paging.changeOffset(Math.max(0, paging.offset - 100)), 'plain', 'arrow'),
        paging.nextOffset ? button('Следующая группа', () => paging.changeOffset(paging.nextOffset ?? 0), 'plain', 'right') : null)))
}
