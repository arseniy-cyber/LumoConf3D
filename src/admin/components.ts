import type { Category, Part } from '../shared/types'

export const categoryNames: Record<Category, string> = {
  case: 'Корпус', gpu: 'Видеокарта', cpu: 'Процессор', motherboard: 'Материнская плата',
  ram: 'Оперативная память', cooler: 'Охлаждение', psu: 'Блок питания',
  storage: 'Накопитель', fan: 'Вентилятор',
}

const icons = {
  home: ['M3 3h8v8H3z', 'M13 3h8v5h-8z', 'M13 10h8v11h-8z', 'M3 13h8v8H3z'],
  products: ['m12 3 9 5v8l-9 5-9-5V8z', 'm3 8 9 5 9-5', 'M12 13v8'],
  orders: ['M5 3h14v18H5z', 'M8 7h8m-8 5h8m-8 5h5'],
  presets: ['m12 3 9 5-9 5-9-5 9-5z', 'm3 12 9 5 9-5m-18 4 9 5 9-5'],
  settings: ['M4 7h16M4 12h16M4 17h16', 'M8 4v6m8-1v6m-6-1v6'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-4m-3-12a4 4 0 0 1 0 8'],
  arrow: ['M20 12H4m7-7-7 7 7 7'],
  right: ['M5 12h14m-7-7 7 7-7 7'],
  plus: ['M12 5v14M5 12h14'],
  search: ['m21 21-4-4M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z'],
  download: ['M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4'],
  upload: ['M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4'],
  close: ['m6 6 12 12M18 6 6 18'],
  chevron: ['m9 6 6 6-6 6'],
  shield: ['m12 2 8 4v6c0 5-5 9-8 10-3-1-8-5-8-10V6z', 'm9 12 2 2 4-4'],
  logout: ['M10 4H4v16h6m5-4 4-4-4-4m-6 4h10'],
  check: ['m5 12 4 4L19 6'],
  refresh: ['M20 8a8 8 0 1 0 0 8M20 4v4h-4'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z', 'M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0z'],
  grid: ['M3 3h18v18H3zm0 6h18M3 15h18M9 3v18m6-18v18'],
  edit: ['m13 6 5 5M4 20l5-1L21 7l-4-4L5 15z'],
  archive: ['M3 4h18v4H3zm2 4v12h14V8M10 12h4'],
} satisfies Record<string, string[]>

export type Icon = keyof typeof icons

export function icon(name: Icon): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '17')
  svg.setAttribute('height', '17')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.55')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  for (const route of icons[name]) {
    const path = document.createElementNS(ns, 'path')
    path.setAttribute('d', route)
    svg.append(path)
  }
  return svg
}

type Child = Node | string | undefined | null | false

export function html<T extends keyof HTMLElementTagNameMap>(
  tag: T, className = '', ...children: Child[]
): HTMLElementTagNameMap[T] {
  const element = document.createElement(tag)
  if (className) element.className = className
  element.append(...children.filter((child): child is Node | string => child instanceof Node || typeof child === 'string'))
  return element
}

export function button(
  label: string, action: () => void, style: 'primary' | 'plain' | 'quiet' | 'danger' = 'plain', symbol?: Icon,
): HTMLButtonElement {
  const control = html('button', `lumo-admin-button is-${style}`, symbol && icon(symbol), label)
  control.type = 'button'
  control.addEventListener('click', action)
  return control
}

export function submit(label: string, symbol?: Icon): HTMLButtonElement {
  const result = html('button', 'lumo-admin-button is-primary', symbol && icon(symbol), label)
  result.type = 'submit'
  return result
}

export function textInput(
  name: string, value = '', options: Partial<Pick<HTMLInputElement,
    'type' | 'required' | 'placeholder' | 'autocomplete' | 'inputMode' | 'min' | 'max' | 'step' | 'pattern' | 'maxLength'>> = {},
): HTMLInputElement {
  const input = html('input', 'lumo-admin-input')
  input.name = name
  Object.assign(input, options)
  input.value = value
  return input
}

export function select(
  name: string, choices: ReadonlyArray<readonly [string, string]>, value: string,
): HTMLSelectElement {
  const element = html('select', 'lumo-admin-input')
  element.name = name
  for (const [id, label] of choices) {
    const option = html('option', '', label)
    option.value = id
    element.append(option)
  }
  element.value = value
  return element
}

export function multiline(name: string, value: string, rows = 4): HTMLTextAreaElement {
  const element = html('textarea', 'lumo-admin-input')
  element.name = name
  element.value = value
  element.rows = rows
  return element
}

export function field(label: string, input: HTMLElement, hint?: string): HTMLLabelElement {
  return html('label', 'lumo-admin-field', html('span', 'lumo-admin-label', label), input,
    hint && html('small', 'lumo-admin-muted', hint))
}

export function check(label: string, name: string, checked: boolean): HTMLLabelElement {
  const input = textInput(name, 'on', { type: 'checkbox' })
  input.checked = checked
  return html('label', 'lumo-admin-check', input, html('span', '', label))
}

export function notice(content: string, tone: 'error' | 'success' | 'info' = 'info'): HTMLElement {
  const element = html('p', `lumo-admin-notice is-${tone}`, content)
  element.setAttribute('role', tone === 'error' ? 'alert' : 'status')
  return element
}

export function loading(label = 'Загружаем данные'): HTMLElement {
  return html('div', 'lumo-admin-empty', html('span', 'lumo-admin-spinner'), notice(label))
}

export function empty(title: string, detail: string, symbol: Icon = 'products', control?: HTMLElement): HTMLElement {
  return html('div', 'lumo-admin-empty', html('span', 'lumo-admin-empty-icon', icon(symbol)),
    html('h3', '', title), html('p', 'lumo-admin-muted', detail), control)
}

export function badge(label: string, tone: 'purple' | 'green' | 'orange' | 'gray' | 'red' = 'gray'): HTMLElement {
  return html('span', `lumo-admin-badge is-${tone}`, html('i'), label)
}

export function money(value: number, currency = 'RUB'): string {
  try {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
  } catch {
    return `${value.toLocaleString('ru-RU')} ${currency}`
  }
}

export function date(value: string): string {
  const at = new Date(value)
  if (!value || !Number.isFinite(at.valueOf())) return '—'
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(at)
}

export function table(columns: string[], rows: HTMLElement[]): HTMLElement {
  const headings = columns.map((text) => {
    const cell = html('th', '', text)
    cell.scope = 'col'
    return cell
  })
  return html('div', 'lumo-admin-table-wrap', html('table', 'lumo-admin-table',
    html('thead', '', html('tr', '', ...headings)),
    html('tbody', '', ...rows)))
}

export function cells(...values: Child[]): HTMLTableRowElement {
  return html('tr', '', ...values.map((value) => html('td', '', value)))
}

export function labelValue(label: string, value: string): HTMLElement {
  return html('div', 'lumo-admin-label-value', html('span', 'lumo-admin-muted', label), html('strong', '', value))
}

export function partName(part: Pick<Part, 'name' | 'brand' | 'id'>): HTMLElement {
  return html('div', 'lumo-admin-part', html('span', 'lumo-admin-part-icon', icon('products')),
    html('div', '', html('strong', '', part.name), html('small', 'lumo-admin-muted', `${part.brand} · ${part.id}`)))
}

export function showDialog(
  host: HTMLElement, title: string, description?: string, className = '',
): { dialog: HTMLDialogElement; body: HTMLElement; close: () => void } {
  const dialog = html('dialog', `lumo-admin-dialog ${className}`.trim())
  const heading = html('h2', '', title)
  heading.id = 'lumo-admin-dialog-title'
  dialog.setAttribute('aria-labelledby', heading.id)
  const body = html('div', 'lumo-admin-dialog-body')
  const close = () => dialog.close()
  const closeButton = button('Закрыть', close, 'quiet', 'close')
  closeButton.classList.add('lumo-admin-icon-action')
  dialog.append(html('header', 'lumo-admin-dialog-header',
    html('div', '', heading, description && html('p', 'lumo-admin-muted', description)), closeButton), body)
  dialog.addEventListener('close', () => dialog.remove(), { once: true })
  host.append(dialog)
  dialog.showModal()
  return { dialog, body, close }
}

export function downloadJson(filename: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }))
  const link = html('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
