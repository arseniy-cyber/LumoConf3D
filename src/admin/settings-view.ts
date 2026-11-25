import { AdminApi, errorMessage } from './api'
import type { StoreSettings } from './api'
import { button, check, field, html, multiline, notice, submit, textInput } from './components'

function section(title: string, content: HTMLElement, description?: string): HTMLElement {
  return html('section', 'lumo-admin-panel lumo-admin-settings-section',
    html('h3', '', title), description && html('p', 'lumo-admin-muted', description), content)
}

function listManager<T>(
  values: T[], title: string, render: (item: T | undefined, remove: () => void) => {
    element: HTMLElement
    value: () => T
  },
): { element: HTMLElement; values: () => T[] } {
  const entries = new Map<HTMLElement, () => T>()
  const list = html('div', 'lumo-admin-small-stack')
  const add = (item?: T) => {
    const row = render(item, () => {
      entries.delete(row.element)
      row.element.remove()
    })
    entries.set(row.element, row.value)
    list.append(row.element)
  }
  values.forEach(add)
  return {
    element: html('div', 'lumo-admin-small-stack', list,
      html('div', '', button(title, () => add(), 'plain', 'plus'))),
    values: () => Array.from(entries.values(), (value) => value()),
  }
}

function parseOrigins(raw: string): string[] {
  return [...new Set(raw.split(/[,\n]/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const url = new URL(line)
    if (url.protocol !== 'https:' || url.origin !== line.replace(/\/$/, '')) throw new Error('Укажите HTTPS-адреса доменов без путей и параметров.')
    return url.origin
  }))]
}

export function settingsView(api: AdminApi, settings: StoreSettings): HTMLElement {
  const form = html('form', 'lumo-admin-stack')
  const name = textInput('store-name', settings.name, { required: true, maxLength: 100 })
  const contact = multiline('store-contact', settings.contact, 3)
  contact.maxLength = 300
  const logoUrl = textInput('logo', settings.logoUrl, { placeholder: '/images/лого.webp', maxLength: 250 })
  const accentText = textInput('accent-hex', settings.accent, { required: true, pattern: '#[a-fA-F0-9]{6}', maxLength: 7 })
  const accentColor = textInput('accent-picker', settings.accent, { type: 'color' })
  accentColor.setAttribute('aria-label', 'Выбрать фирменный цвет')
  accentColor.addEventListener('input', () => { accentText.value = accentColor.value })
  accentText.addEventListener('input', () => { if (/^#[a-fA-F0-9]{6}$/.test(accentText.value)) accentColor.value = accentText.value })
  const accent = html('div', 'lumo-admin-accent', accentColor, accentText)
  accentText.id = 'lumo-admin-accent-hex'
  const accentLabel = html('label', 'lumo-admin-label', 'Фирменный цвет')
  accentLabel.htmlFor = accentText.id
  const logoStatus = html('small', 'lumo-admin-muted')
  logoStatus.setAttribute('aria-live', 'polite')
  const logoFile = html('input', 'lumo-admin-file')
  logoFile.type = 'file'
  logoFile.accept = 'image/jpeg,image/png,image/webp'
  logoFile.setAttribute('aria-label', 'Загрузить логотип')
  const upload = button('Загрузить логотип', () => logoFile.click(), 'plain', 'upload')
  logoFile.addEventListener('change', async () => {
    const file = logoFile.files?.[0]
    logoFile.value = ''
    if (!file) return
    upload.disabled = true
    try {
      logoUrl.value = await api.upload(file)
      logoStatus.textContent = 'Логотип загружен'
    } catch (error) {
      logoStatus.textContent = errorMessage(error)
    } finally {
      upload.disabled = false
    }
  })

  const assemblyFee = textInput('assembly-fee', String(settings.assemblyFee), { required: true, type: 'number', min: '0', max: '1000000', step: '1' })
  const telegram = check('Отправлять уведомления в Telegram', 'telegram-enabled', settings.telegramEnabled)
  const embed = multiline('embed-origins', settings.embedOrigins.join('\n'), 4)
  const apiOrigins = multiline('api-origins', (settings.apiOrigins ?? []).join('\n'), 4)
  const services = listManager(settings.services, 'Добавить услугу', (item, remove) => {
    const id = textInput('service-id', item?.id, { required: true, maxLength: 96, pattern: '[a-z0-9](?:[a-z0-9_]|-){0,95}', placeholder: 'delivery' })
    const label = textInput('service-name', item?.name, { required: true, maxLength: 100 })
    const price = textInput('service-price', String(item?.price ?? 0), { required: true, type: 'number', step: '1', min: '0', max: '1000000' })
    return {
      element: html('div', 'lumo-admin-repeater', field('Идентификатор', id), field('Название услуги', label), field('Цена, ₽', price),
        button('Убрать', remove, 'quiet', 'close')),
      value: () => ({ id: id.value.trim(), name: label.value.trim(), price: Number(price.value) }),
    }
  })
  const promotions = listManager(settings.promotions, 'Добавить промокод', (item, remove) => {
    const code = textInput('promo-code', item?.code, { required: true, maxLength: 36, pattern: '[a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*' })
    const percent = textInput('promo-percent', String(item?.percent ?? 5), { required: true, type: 'number', min: '1', max: '90', step: '1' })
    const active = check('Действует', 'promo-active', item?.active ?? true)
    return {
      element: html('div', 'lumo-admin-repeater', field('Промокод', code), field('Скидка, %', percent), active,
        button('Убрать', remove, 'quiet', 'close')),
      value: () => ({ code: code.value.trim().toUpperCase(), percent: Number(percent.value), active: active.querySelector('input')?.checked ?? false }),
    }
  })

  const save = submit('Сохранить настройки', 'check')
  const feedback = html('div')
  form.append(
    section('Оформление магазина', html('div', 'lumo-admin-fields',
      field('Название магазина', name),
      html('div', 'lumo-admin-field', accentLabel, accent),
      field('Контакты', contact),
      html('div', 'lumo-admin-media', field('Путь к логотипу', logoUrl), html('div', 'lumo-admin-actions', upload, logoStatus), logoFile))),
    section('Услуги', html('div', 'lumo-admin-small-stack', field('Сборка компьютера, ₽', assemblyFee), services.element)),
    section('Скидки и промокоды', promotions.element),
    section('Уведомления', telegram, 'Токен бота и ID чата задаются на стороне Worker.'),
    section('Встраивание и доступ к API', html('div', 'lumo-admin-fields', field('Домены для встраивания', embed),
      field('Домены с доступом к API', apiOrigins)), 'Укажите один HTTPS-адрес на строку.'),
    feedback, html('div', 'lumo-admin-toolbar', html('span'), save),
  )
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    save.disabled = true
    feedback.replaceChildren()
    try {
      const serviceRows = services.values()
      const promoRows = promotions.values()
      if (new Set(serviceRows.map(({ id }) => id)).size !== serviceRows.length
        || new Set(promoRows.map(({ code }) => code)).size !== promoRows.length) {
        throw new Error('Идентификаторы услуг и промокоды должны быть уникальными.')
      }
      await api.saveSettings({
        name: name.value.trim(), contact: contact.value.trim(), logoUrl: logoUrl.value.trim(), accent: accentText.value,
        assemblyFee: Number(assemblyFee.value), telegramEnabled: new FormData(form).has('telegram-enabled'),
        embedOrigins: parseOrigins(embed.value), apiOrigins: parseOrigins(apiOrigins.value),
        services: serviceRows, promotions: promoRows,
      })
      feedback.replaceChildren(notice('Настройки сохранены.', 'success'))
    } catch (error) {
      feedback.replaceChildren(notice(error instanceof TypeError && error.message.includes('URL')
        ? 'Проверьте HTTPS-адреса доменов.' : errorMessage(error), 'error'))
    } finally {
      save.disabled = false
      feedback.scrollIntoView({ block: 'nearest' })
    }
  })
  return form
}
