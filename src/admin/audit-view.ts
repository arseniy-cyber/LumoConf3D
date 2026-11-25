import type { AuditEntry } from './api'
import { cells, empty, html, table } from './components'

const actions: Record<string, string> = {
  login: 'Вход', logout: 'Выход', save_product: 'Сохранение комплектующего',
  archive_product: 'Архивация комплектующего', import_products: 'Импорт каталога',
  update_order: 'Обновление заявки', save_preset: 'Сохранение сборки',
  remove_preset: 'Удаление сборки', update_settings: 'Обновление настроек',
  upload_media: 'Загрузка файла', create_user: 'Создание пользователя', update_user: 'Обновление пользователя',
}

const formatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

export function auditView(entries: AuditEntry[]): HTMLElement {
  return html('section', 'lumo-admin-panel', entries.length
    ? table(['Время', 'Действие', 'Запись', 'Сотрудник'], entries.map((entry) => cells(
      formatter.format(entry.created_at * 1000), actions[entry.action] ?? entry.action,
      entry.target ?? '—', html('code', 'lumo-admin-mono', entry.user_id ?? 'Система'),
    )))
    : empty('Записей пока нет', 'Действия сотрудников появятся в журнале после первого изменения.', 'shield'))
}
