import { AdminApi, errorMessage } from './api'
import type { AdminRole, User } from './api'
import { badge, button, cells, check, empty, field, html, labelValue, notice, select, showDialog, submit, table, textInput } from './components'

export const roleLabels: Record<AdminRole, string> = { owner: 'Владелец', manager: 'Менеджер', support: 'Поддержка' }
const roles = Object.entries(roleLabels).filter(([role]) => role !== 'owner')

function enrollment(host: HTMLElement, email: string, key: string, uri: string, changed: (message: string) => void): void {
  const { dialog, body, close } = showDialog(host, 'Ключ входа готов', email)
  const secret = textInput('totp-key', key)
  const uriInput = textInput('totp-link', uri)
  secret.readOnly = true
  uriInput.readOnly = true
  const state = html('div')
  const copy = button('Скопировать ключ', async () => {
    try {
      await navigator.clipboard.writeText(key)
      state.replaceChildren(notice('Ключ скопирован.', 'success'))
    } catch {
      secret.select()
      state.replaceChildren(notice('Ключ выделен. Скопируйте его вручную.'))
    }
  }, 'plain')
  body.append(html('div', 'lumo-admin-form', notice('Передайте ключ пользователю защищённым способом. Ключ отображается один раз.'),
    field('Ключ для приложения-аутентификатора', secret), field('Строка для импорта TOTP', uriInput), state,
    html('div', 'lumo-admin-dialog-footer', copy, button('Готово', close, 'primary', 'check'))))
  dialog.addEventListener('close', () => {
    secret.value = ''
    uriInput.value = ''
    changed('Пользователь добавлен.')
  }, { once: true })
}

function createUser(host: HTMLElement, api: AdminApi, changed: (message: string) => void): void {
  const { body, close } = showDialog(host, 'Новый пользователь')
  const email = textInput('email', '', { type: 'email', autocomplete: 'off', maxLength: 200, required: true })
  const role = select('role', roles, 'support')
  const password = textInput('password', '', { type: 'password', autocomplete: 'new-password', required: true, maxLength: 256 })
  password.minLength = 18
  const feedback = html('div')
  const save = submit('Создать пользователя', 'plus')
  const form = html('form', 'lumo-admin-form', field('Почта', email), field('Роль', role),
    field('Пароль', password, 'Минимум 18 символов.'), feedback,
    html('div', 'lumo-admin-dialog-footer', button('Отмена', close), save))
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    save.disabled = true
    try {
      const result = await api.saveUser(email.value.trim(), role.value as AdminRole, password.value)
      password.value = ''
      close()
      enrollment(host, result.user.email, result.totpSecret, result.totpUri, changed)
    } catch (error) {
      feedback.replaceChildren(notice(errorMessage(error), 'error'))
    } finally {
      save.disabled = false
    }
  })
  body.append(form)
}

function editUser(host: HTMLElement, api: AdminApi, user: User, changed: (message: string) => void): void {
  const { body, close } = showDialog(host, 'Права пользователя', user.email)
  const role = select('role', roles, user.role)
  const active = check('Разрешён вход в панель', 'active', user.active !== false)
  const feedback = html('div')
  const save = submit('Сохранить права', 'check')
  const form = html('form', 'lumo-admin-form', field('Роль', role), active, feedback,
    html('div', 'lumo-admin-dialog-footer', button('Отмена', close), save))
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!user.id) return
    save.disabled = true
    try {
      await api.updateUser(user.id, new FormData(form).has('active'), role.value as AdminRole)
      close()
      changed('Права пользователя обновлены.')
    } catch (error) {
      feedback.replaceChildren(notice(errorMessage(error), 'error'))
    } finally {
      save.disabled = false
    }
  })
  body.append(form)
}

export function usersView(host: HTMLElement, api: AdminApi, users: User[], current: User, changed: (message: string) => void): HTMLElement {
  const add = button('Добавить пользователя', () => createUser(host, api, changed), 'primary', 'plus')
  const rows = users.map((user) => {
    const self = user.email.toLowerCase() === current.email.toLowerCase()
    const edit = button('Изменить', () => editUser(host, api, user, changed), 'quiet', 'edit')
    edit.disabled = self || !user.id || user.role === 'owner'
    return cells(labelValue(self ? 'Ваш аккаунт' : 'Пользователь', user.email),
      roleLabels[user.role] ?? user.role, user.active !== false ? badge('Активен', 'green') : badge('Отключён', 'gray'), edit)
  })
  return html('div', 'lumo-admin-stack', html('div', 'lumo-admin-toolbar', html('span'), add),
    html('section', 'lumo-admin-panel', users.length
      ? table(['Почта', 'Роль', 'Доступ', ''], rows)
      : empty('Нет пользователей', 'Добавьте аккаунт сотрудника и передайте ему данные для входа.', 'users')))
}
