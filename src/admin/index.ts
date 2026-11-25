import './admin.css'
import { AdminApi, AdminRequestError, errorMessage, orderStatuses } from './api'
import type { Order, Stats, User } from './api'
import { button, empty, field, html, icon, loading, money, notice, submit, textInput } from './components'
import type { Icon } from './components'
import { auditView } from './audit-view'
import { catalogView } from './catalog-view'
import { openOrder, orderTable, ordersView } from './orders-view'
import { presetsView } from './presets-view'
import { settingsView } from './settings-view'
import { roleLabels, usersView } from './users-view'

type Route = 'overview' | 'products' | 'orders' | 'presets' | 'settings' | 'users' | 'audit'
const routes: Record<Route, { title: string; detail: string; icon: Icon }> = {
  overview: { title: 'Обзор', detail: 'Каталог и активность магазина.', icon: 'home' },
  products: { title: 'Каталог', detail: 'Комплектующие, цены, наличие и параметры установки.', icon: 'products' },
  orders: { title: 'Заявки', detail: 'Сборки и контакты покупателей.', icon: 'orders' },
  presets: { title: 'Готовые сборки', detail: 'Конфигурации, с которых покупатель может начать сборку.', icon: 'presets' },
  settings: { title: 'Настройки', detail: 'Оформление, услуги и настройки магазина.', icon: 'settings' },
  users: { title: 'Пользователи', detail: 'Доступ сотрудников к панели управления.', icon: 'users' },
  audit: { title: 'Журнал', detail: 'Последние действия сотрудников магазина.', icon: 'shield' },
}

function readRoute(): Route {
  const hash = location.hash.slice(1)
  return Object.hasOwn(routes, hash) ? hash as Route : 'overview'
}

function storeLink(label: string): HTMLAnchorElement {
  const link = html('a', 'lumo-admin-quiet-link', icon('arrow'), label)
  const store = new URLSearchParams(location.search).get('store')
  const url = new URL('/', location.origin)
  if (store) url.searchParams.set('store', store)
  link.href = url.pathname + url.search
  return link
}

function brand(): HTMLElement {
  const mark = html('img', 'lumo-admin-brand-mark')
  mark.src = '/lumo.svg'
  mark.alt = ''
  mark.width = 35
  mark.height = 35
  return html('div', 'lumo-admin-brand', mark,
    html('div', '', html('strong', '', 'LUMO'), html('small', '', 'PC BUILDER')))
}

function overview(stats: Stats, orders: Order[], openOrders: () => void, inspect: (order: Order) => void): HTMLElement {
  const metrics: Array<{ title: string; value: string; symbol: Icon }> = [
    { title: 'Комплектующих', value: stats.products.toLocaleString('ru-RU'), symbol: 'products' },
    { title: 'В наличии', value: stats.available.toLocaleString('ru-RU'), symbol: 'check' },
    { title: 'Всего заявок', value: stats.orders.toLocaleString('ru-RU'), symbol: 'orders' },
    { title: 'Подтверждено и завершено', value: money(stats.total, stats.currency), symbol: 'home' },
  ]
  const states = Object.entries(orderStatuses).map(([key, label]) => {
    const count = orders.filter(({ status }) => status === key).length
    const progress = html('progress')
    progress.value = count
    progress.max = Math.max(1, orders.length)
    progress.setAttribute('aria-label', label)
    return html('div', 'lumo-admin-progress-row',
      html('div', '', html('small', 'lumo-admin-muted', label), html('strong', '', String(count))), progress)
  })
  return html('div', 'lumo-admin-stack',
    html('div', 'lumo-admin-metrics', ...metrics.map(({ title, value, symbol }) => html('article', 'lumo-admin-panel lumo-admin-metric',
      html('span', 'lumo-admin-part-icon', icon(symbol)), html('span', 'lumo-admin-muted', title), html('strong', '', value)))),
    orders.length > 0 && html('section', 'lumo-admin-panel lumo-admin-overview-states',
      html('header', 'lumo-admin-panel-header', html('h2', '', 'Статусы загруженных заявок')),
      html('div', 'lumo-admin-progress-grid', ...states)),
    html('section', 'lumo-admin-panel',
      html('header', 'lumo-admin-panel-header', html('h2', '', 'Последние заявки'),
        button('Все заявки', openOrders, 'plain', 'right')),
      orderTable(orders.slice(0, 8), inspect)))
}

export function mountAdmin(container: HTMLElement): void {
  const app = html('div', 'lumo-admin')
  container.replaceChildren(app)
  const api = new AdminApi()
  let user: User | undefined
  let route = readRoute()
  let version = 0
  let ordersOffset = 0

  const permission = (view: Route): boolean => {
    if (!user) return false
    if (view === 'overview' || view === 'orders') return true
    if (view === 'products' || view === 'presets') return user.role === 'owner' || user.role === 'manager'
    return user.role === 'owner'
  }

  const login = (message?: string) => {
    version++
    user = undefined
    const email = textInput('email', '', { type: 'email', autocomplete: 'username', required: true, placeholder: 'admin@store.ru' })
    const password = textInput('password', '', { type: 'password', autocomplete: 'current-password', required: true })
    const code = textInput('code', '', {
      autocomplete: 'one-time-code', inputMode: 'numeric', required: true, pattern: '[0-9]{6}', maxLength: 6, placeholder: '000000',
    })
    const feedback = html('div', '', message && notice(message, 'error'))
    const enter = submit('Войти в панель', 'right')
    const form = html('form', 'lumo-admin-form',
      field('Почта', email), field('Пароль', password), field('Код подтверждения', code, 'Шесть цифр из приложения-аутентификатора.'),
      feedback, enter)
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      enter.disabled = true
      feedback.replaceChildren()
      try {
        user = await api.login(email.value.trim(), password.value, code.value)
        password.value = ''
        code.value = ''
        show(permission(route) ? route : 'overview')
      } catch (error) {
        code.value = ''
        feedback.replaceChildren(notice(error instanceof AdminRequestError && error.status === 401
          ? 'Проверьте почту, пароль и код подтверждения.' : errorMessage(error), 'error'))
      } finally {
        enter.disabled = false
      }
    })
    app.replaceChildren(html('div', 'lumo-admin-login',
      html('header', 'lumo-admin-login-bar', brand(), storeLink('Конфигуратор')),
      html('main', 'lumo-admin-login-main',
        html('section', 'lumo-admin-panel lumo-admin-login-card',
          html('span', 'lumo-admin-login-shield', icon('shield')),
          html('h1', '', 'Управление магазином'),
          html('p', 'lumo-admin-muted', 'Войдите, чтобы работать с каталогом и заявками.'),
          form))))
  }

  const navigate = (view: Route) => {
    if (!permission(view)) return
    if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`)
    show(view)
  }

  const show = (view: Route, message?: string) => {
    const current = user
    if (!current || !app.isConnected) return
    route = permission(view) ? view : 'overview'
    const target = route
    const renderVersion = ++version
    const title = routes[target].title
    document.title = `${title} · LUMO PC BUILDER`
    const changed = (status: string) => {
      if (target === route && user === current) show(target, status)
    }
    const nav = html('nav', 'lumo-admin-navigation')
    nav.setAttribute('aria-label', 'Разделы управления')
    for (const [key, value] of Object.entries(routes) as [Route, typeof routes[Route]][]) {
      if (!permission(key)) continue
      const control = button(value.title, () => navigate(key), 'quiet', value.icon)
      if (key === route) control.setAttribute('aria-current', 'page')
      nav.append(control)
    }
    const state = html('div', '', message && notice(message, 'success'))
    const logout = button('Выйти', async () => {
      logout.disabled = true
      try {
        await api.logout()
        login()
      } catch (error) {
        if (error instanceof AdminRequestError && error.status === 401) login()
        else state.replaceChildren(notice(errorMessage(error), 'error'))
      } finally {
        logout.disabled = false
      }
    }, 'quiet', 'logout')
    const sidebar = html('aside', 'lumo-admin-sidebar', brand(), nav,
      html('footer', 'lumo-admin-sidebar-footer', storeLink('Конфигуратор'), logout))
    const content = html('div', 'lumo-admin-content', loading())
    content.setAttribute('aria-busy', 'true')
    const refresh = button('Обновить', () => show(target), 'plain', 'refresh')
    const headline = html('header', 'lumo-admin-headline',
      html('div', '', html('h1', '', title), html('p', 'lumo-admin-muted', routes[target].detail)), refresh)
    app.replaceChildren(html('div', 'lumo-admin-layout', sidebar,
      html('div', 'lumo-admin-workspace',
        html('header', 'lumo-admin-topbar', html('span', 'lumo-admin-store-tag', html('i'), api.storeSlug),
          html('div', 'lumo-admin-user', html('span', 'lumo-admin-avatar', current.email[0]?.toUpperCase() ?? 'L'),
            html('div', '', html('strong', '', current.email),
              html('small', 'lumo-admin-muted', roleLabels[current.role] ?? current.role)))),
        html('main', 'lumo-admin-main', headline, state, content))))
    const inspect = (order: Order) => openOrder(app, api, order, changed)
    const load = async (): Promise<HTMLElement> => {
      switch (target) {
        case 'overview': {
          const [stats, { orders }] = await Promise.all([api.stats(), api.orders()])
          return overview(stats, orders, () => navigate('orders'), inspect)
        }
        case 'products':
          return catalogView(app, api, await api.products(), changed)
        case 'orders': {
          const { orders, nextOffset } = await api.orders(ordersOffset)
          return ordersView(orders, inspect, {
            offset: ordersOffset, nextOffset,
            changeOffset: (next) => { ordersOffset = next; show('orders') },
          })
        }
        case 'presets': {
          const [presets, { products, archivedIds }] = await Promise.all([api.presets(), api.products()])
          const archived = new Set(archivedIds)
          return presetsView({ host: app, api, parts: products.filter(({ id }) => !archived.has(id)), changed }, presets)
        }
        case 'settings':
          return settingsView(api, await api.settings())
        case 'users':
          return usersView(app, api, await api.users(), current, changed)
        case 'audit':
          return auditView(await api.audit())
      }
    }
    const currentView = () => renderVersion === version && app.isConnected
    void load().then((viewContent) => {
      if (currentView()) content.replaceChildren(viewContent)
    }).catch((error: unknown) => {
      if (!currentView()) return
      if (error instanceof AdminRequestError && error.status === 401) {
        login('Сеанс закончился. Войдите снова.')
        return
      }
      content.replaceChildren(html('section', 'lumo-admin-panel', empty('Не удалось загрузить раздел',
        errorMessage(error), 'refresh', button('Повторить', () => show(target), 'plain', 'refresh'))))
    }).finally(() => { content.removeAttribute('aria-busy') })
  }

  app.replaceChildren(html('main', 'lumo-admin-login-main', loading('Проверяем сеанс')))
  void api.session().then((currentUser) => {
    if (!app.isConnected) return
    user = currentUser
    show(route)
  }).catch((error: unknown) => {
    if (!app.isConnected) return
    document.title = 'Вход · LUMO PC BUILDER'
    login(error instanceof AdminRequestError && error.status === 401 ? undefined : errorMessage(error))
  })
  window.addEventListener('hashchange', () => {
    if (app.isConnected && user) show(readRoute())
  })
}
