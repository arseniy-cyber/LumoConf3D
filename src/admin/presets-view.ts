import { categories } from '../shared/types'
import type { Build, Part, Preset } from '../shared/types'
import { AdminApi, errorMessage } from './api'
import { button, categoryNames, empty, field, html, icon, money, multiline, notice, select, showDialog, submit, textInput } from './components'

type Context = { host: HTMLElement; api: AdminApi; parts: Part[]; changed: (message: string) => void }

function editPreset(context: Context, preset?: Preset): void {
  const { body, close } = showDialog(context.host, preset?.name ?? 'Новая готовая сборка')
  const form = html('form', 'lumo-admin-form')
  const id = textInput('preset-id', preset?.id, { required: true, maxLength: 96, pattern: '[a-z0-9](?:[a-z0-9_]|-){0,95}' })
  id.readOnly = Boolean(preset)
  const title = textInput('preset-name', preset?.name, { required: true, maxLength: 100 })
  const use = textInput('preset-use', preset?.use, { required: true, maxLength: 100, placeholder: 'Игры, монтаж, стриминг' })
  const description = multiline('preset-description', preset?.description ?? '', 3)
  description.maxLength = 600
  const products = categories.map((category) => {
    const candidates = context.parts.filter((part) => part.category === category)
    const selected = preset?.build[category] ?? ''
    const options: Array<[string, string]> = [
      ['', 'Не выбрано'], ...candidates.map((part): [string, string] => [part.id, part.name]),
    ]
    if (selected && !candidates.some((part) => part.id === selected)) options.push([selected, `Позиция недоступна · ${selected}`])
    return [category, select(category, options, selected)] as const
  })
  const save = submit('Сохранить сборку', 'check')
  const feedback = html('div')
  const remove = preset && button('Удалить', () => {
    const confirm = button('Подтвердить удаление', async () => {
      confirm.disabled = true
      save.disabled = true
      try {
        await context.api.deletePreset(preset.id)
        close()
        context.changed('Готовая сборка удалена.')
      } catch (error) {
        feedback.replaceChildren(notice(errorMessage(error), 'error'))
      } finally {
        confirm.disabled = false
        save.disabled = false
      }
    }, 'danger')
    feedback.replaceChildren(html('div', 'lumo-admin-confirm', notice('Сборка будет скрыта в списке готовых конфигураций.'), confirm,
      button('Отмена', () => feedback.replaceChildren(), 'quiet')))
  }, 'quiet', 'archive')
  form.append(
    html('div', 'lumo-admin-fields', field('Название', title), field('Назначение', use), field('Идентификатор', id)),
    field('Описание', description),
    html('section', 'lumo-admin-editor-section', html('h3', '', 'Комплектация'), html('div', 'lumo-admin-fields',
      ...products.map(([category, control]) => field(categoryNames[category], control)))),
    feedback, html('div', 'lumo-admin-dialog-footer', remove, html('span', 'lumo-admin-spacer'),
      button('Отмена', close), save),
  )
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const build: Build = Object.fromEntries(products.filter(([, control]) => control.value)
      .map(([category, control]) => [category, control.value]))
    if (!Object.keys(build).length) {
      feedback.replaceChildren(notice('Выберите хотя бы одно комплектующее.', 'error'))
      return
    }
    save.disabled = true
    if (remove) remove.disabled = true
    try {
      await context.api.savePreset({
        id: id.value.trim(), name: title.value.trim(), description: description.value.trim(), use: use.value.trim(), build,
      })
      close()
      context.changed('Готовая сборка сохранена.')
    } catch (error) {
      feedback.replaceChildren(notice(errorMessage(error), 'error'))
    } finally {
      save.disabled = false
      if (remove) remove.disabled = false
    }
  })
  body.append(form)
}

export function presetsView(context: Context, presets: Preset[]): HTMLElement {
  const create = button('Новая сборка', () => editPreset(context), 'primary', 'plus')
  if (!presets.length) return html('section', 'lumo-admin-panel',
    empty('Готовых сборок пока нет', 'Создайте первую конфигурацию для покупателей.', 'presets', create))
  const partById = new Map(context.parts.map((part) => [part.id, part]))
  return html('div', 'lumo-admin-stack', html('div', 'lumo-admin-toolbar',
    html('span', 'lumo-admin-muted', `Конфигураций: ${presets.length}`), create),
  html('div', 'lumo-admin-preset-grid', ...presets.map((preset) => {
    const selection = Object.values(preset.build).map((id) => partById.get(id))
    const complete = selection.every(Boolean)
    const total = selection.reduce((sum, part) => sum + (part?.price ?? 0), 0)
    return html('article', 'lumo-admin-panel lumo-admin-preset',
      html('div', 'lumo-admin-preset-top', html('span', 'lumo-admin-part-icon', icon('presets')),
        html('small', 'lumo-admin-muted', preset.use)),
      html('h3', '', preset.name), html('p', 'lumo-admin-muted', preset.description),
      html('div', 'lumo-admin-toolbar',
        html('div', 'lumo-admin-cell-price', html('strong', '', complete ? money(total) : 'Цена уточняется'),
          html('small', 'lumo-admin-muted', `Позиций: ${selection.length}`)),
        button('Редактировать', () => editPreset(context, preset), 'plain', 'edit')))
  })))
}
