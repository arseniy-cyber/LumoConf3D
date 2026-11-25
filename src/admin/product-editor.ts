import { categories } from '../shared/types'
import type { Category, Part, Specs } from '../shared/types'
import { AdminApi, errorMessage } from './api'
import {
  button, categoryNames, check, field, html, icon, multiline, notice, select, showDialog, submit, textInput,
} from './components'

type Offset = { x: number; y: number; z: number }
type Axis = keyof Offset
type EditorContext = { api: AdminApi; host: HTMLElement; changed: (message: string) => void }

type SpecField = {
  key: Extract<keyof Specs, string>
  title: string
  type: 'string' | 'number' | 'choice' | 'list'
  choices?: readonly string[]
}

const socket = ['AM4', 'AM5', 'LGA1700', 'LGA1851']
const formFactor = ['E-ATX', 'ATX', 'Micro-ATX', 'Mini-ITX']
const powerFactor = ['ATX', 'SFX', 'SFX-L']
const memory = ['DDR4', 'DDR5']
const storage = ['M.2 NVMe', 'M.2 SATA', 'SATA']
const wattage: SpecField = { key: 'wattage', title: 'Энергопотребление, Вт', type: 'number' }
const sockets: SpecField = { key: 'socket', title: 'Сокет', type: 'choice', choices: socket }
const memoryType: SpecField = { key: 'memoryType', title: 'Тип памяти', type: 'choice', choices: memory }
const capacity: SpecField = { key: 'capacityGb', title: 'Объём, ГБ', type: 'number' }
const specFields: Record<Category, SpecField[]> = {
  case: [
    { key: 'formFactors', title: 'Поддержка плат (через запятую)', type: 'list' },
    { key: 'gpuClearanceMm', title: 'Макс. длина видеокарты, мм', type: 'number' },
    { key: 'gpuHeightClearanceMm', title: 'Макс. высота видеокарты, мм', type: 'number' },
    { key: 'gpuSlotClearance', title: 'Доступно слотов расширения', type: 'number' },
    { key: 'coolerClearanceMm', title: 'Макс. высота кулера, мм', type: 'number' },
    { key: 'psuClearanceMm', title: 'Макс. длина блока питания, мм', type: 'number' },
    { key: 'psuFormFactors', title: 'Форматы БП (через запятую)', type: 'list' },
    { key: 'storageMounts', title: 'Крепления накопителей', type: 'number' },
  ],
  gpu: [
    { key: 'vramGb', title: 'Видеопамять, ГБ', type: 'number' },
    { key: 'gpuSlots', title: 'Занимаемые слоты', type: 'number' },
    { key: 'recommendedPsuWatts', title: 'Рекомендованный БП, Вт', type: 'number' }, wattage,
  ],
  cpu: [
    sockets, { key: 'family', title: 'Семейство', type: 'string' },
    { key: 'cores', title: 'Ядра', type: 'number' }, { key: 'threads', title: 'Потоки', type: 'number' }, wattage,
  ],
  motherboard: [
    sockets, memoryType, { key: 'chipset', title: 'Чипсет', type: 'string' },
    { key: 'formFactor', title: 'Формат платы', type: 'choice', choices: formFactor },
    { key: 'memorySlots', title: 'Слоты памяти', type: 'number' },
    { key: 'cpuFamilies', title: 'Семейства процессоров (через запятую)', type: 'list' },
    { key: 'bios', title: 'Версия BIOS', type: 'string' }, wattage,
  ],
  ram: [
    memoryType, capacity, { key: 'memoryModules', title: 'Модули в комплекте', type: 'number' },
    { key: 'speedMts', title: 'Скорость, МТ/с', type: 'number' }, wattage,
  ],
  cooler: [
    { key: 'sockets', title: 'Поддерживаемые сокеты (через запятую)', type: 'list' },
    { key: 'coolerHeightMm', title: 'Высота воздушного кулера, мм', type: 'number' },
    { key: 'radiatorMm', title: 'Формат радиатора, мм', type: 'number' },
    { key: 'radiatorThicknessMm', title: 'Толщина радиатора, мм', type: 'number' }, wattage,
  ],
  psu: [
    { key: 'psuFormFactor', title: 'Формат блока питания', type: 'choice', choices: powerFactor },
    { key: 'psuWatts', title: 'Номинальная мощность, Вт', type: 'number' },
    { key: 'psuLengthMm', title: 'Длина блока питания, мм', type: 'number' },
  ],
  storage: [
    capacity, { key: 'storageInterface', title: 'Интерфейс', type: 'choice', choices: storage },
    { key: 'storageLengthMm', title: 'Длина, мм', type: 'number' }, wattage,
  ],
  fan: [
    { key: 'fanSizeMm', title: 'Размер, мм', type: 'number' },
    { key: 'fanCount', title: 'Количество в комплекте', type: 'number' },
    { key: 'maxRpm', title: 'Макс. скорость, об/мин', type: 'number' }, wattage,
  ],
}

const mountLabels: Record<Axis, string> = { x: 'X по ширине, мм', y: 'Y по высоте, мм', z: 'Z по глубине, мм' }

function editorSection(title: string, content: HTMLElement, description?: string): HTMLElement {
  return html('section', 'lumo-admin-editor-section', html('h3', '', title), description && html('p', 'lumo-admin-muted', description), content)
}

function offsetOf(part?: Part): Offset {
  const existing = part?.specs.mountOffsetMm
  if (typeof existing !== 'object' || existing === null) return { x: 0, y: 0, z: 0 }
  const offset = existing as Partial<Offset>
  return { x: offset.x ?? 0, y: offset.y ?? 0, z: offset.z ?? 0 }
}

function mountEditor(part?: Part): {
  element: HTMLElement
  values: () => { offset: Offset; yaw: number }
} {
  const offset = offsetOf(part)
  const axisInputs: Record<Axis, HTMLInputElement> = {
    x: textInput('offset-x', String(offset.x), { type: 'number', min: '-100', max: '100', step: '0.1', required: true }),
    y: textInput('offset-y', String(offset.y), { type: 'number', min: '-100', max: '100', step: '0.1', required: true }),
    z: textInput('offset-z', String(offset.z), { type: 'number', min: '-100', max: '100', step: '0.1', required: true }),
  }
  const yaw = textInput('mount-rotation', String(part?.specs.mountRotationDeg ?? 0), {
    type: 'number', min: '-180', max: '180', step: '0.1', required: true,
  })
  const projection = select('mount-view', [['x', 'Спереди · оси X и Y'], ['z', 'Сбоку · оси Z и Y']], 'x')
  const origin = html('span', 'lumo-admin-mount-origin')
  const marker = html('span', 'lumo-admin-mount-marker')
  const size = html('output', 'lumo-admin-mount-readout')
  const graph = html('div', 'lumo-admin-mount-graph', origin, marker, size)
  const refresh = () => {
    const horizontal = projection.value === 'z' ? 'z' : 'x'
    const x = Math.max(-100, Math.min(100, Number(axisInputs[horizontal].value)))
    const y = Math.max(-100, Math.min(100, Number(axisInputs.y.value)))
    marker.style.left = `${50 + x * 0.42}%`
    marker.style.top = `${50 - y * 0.42}%`
    marker.style.transform = `translate(-50%, -50%) perspective(100px) rotateY(${Math.max(-180, Math.min(180, Number(yaw.value)))}deg)`
    size.value = `${horizontal.toUpperCase()} ${x} мм  ·  Y ${y} мм`
  }
  const position = (event: PointerEvent) => {
    const rect = graph.getBoundingClientRect()
    const axis = projection.value === 'z' ? 'z' : 'x'
    const map = (value: number) => String(Math.max(-100, Math.min(100, Math.round(value / 0.0042))))
    axisInputs[axis].value = map((event.clientX - rect.left) / rect.width - 0.5)
    axisInputs.y.value = map(0.5 - (event.clientY - rect.top) / rect.height)
    refresh()
  }
  graph.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return
    graph.setPointerCapture(event.pointerId)
    position(event)
  })
  graph.addEventListener('pointermove', (event) => {
    if (graph.hasPointerCapture(event.pointerId)) position(event)
  })
  projection.addEventListener('change', refresh)
  for (const input of [...Object.values(axisInputs), yaw]) input.addEventListener('input', refresh)
  refresh()
  const controls = Object.entries(axisInputs).map(([axis, input]) => field(mountLabels[axis as Axis], input))
  return {
    element: html('div', 'lumo-admin-mount-editor',
      html('div', '', field('Проекция', projection), graph),
      html('div', 'lumo-admin-fields', ...controls, field('Поворот вокруг Y, °', yaw),
        button('Сбросить смещение', () => {
          for (const input of Object.values(axisInputs)) input.value = '0'
          yaw.value = '0'
          refresh()
        }, 'quiet', 'refresh'))),
    values: () => ({
      offset: { x: Number(axisInputs.x.value), y: Number(axisInputs.y.value), z: Number(axisInputs.z.value) },
      yaw: Number(yaw.value),
    }),
  }
}

function mediaControl(api: AdminApi, type: 'model' | 'image', existing?: string): { input: HTMLInputElement; group: HTMLElement } {
  const isModel = type === 'model'
  const input = textInput(type, existing, { placeholder: isModel ? '/models/комплектующее.glb' : '/images/комплектующее.webp', maxLength: 300 })
  const uploadResult = html('span', 'lumo-admin-muted')
  uploadResult.setAttribute('aria-live', 'polite')
  const file = html('input', 'lumo-admin-file')
  file.type = 'file'
  file.accept = isModel ? '.glb,model/gltf-binary' : 'image/jpeg,image/png,image/webp'
  file.setAttribute('aria-label', isModel ? 'Загрузить GLB-модель' : 'Загрузить фотографию')
  const limit = isModel ? 1_500_000 : 500_000
  const control = button(isModel ? 'Загрузить GLB' : 'Загрузить фото', () => file.click(), 'plain', 'upload')
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0]
    file.value = ''
    if (!chosen) return
    if (chosen.size > limit) {
      uploadResult.textContent = isModel ? 'Размер GLB должен быть до 1,5 МБ.' : 'Размер фотографии должен быть до 500 КБ.'
      return
    }
    if (isModel && !chosen.name.toLowerCase().endsWith('.glb')) {
      uploadResult.textContent = 'Выберите файл с расширением .glb.'
      return
    }
    control.disabled = true
    uploadResult.textContent = 'Загружаем файл'
    try {
      input.value = await api.upload(chosen)
      uploadResult.textContent = 'Файл загружен'
    } catch (error) {
      uploadResult.textContent = errorMessage(error)
    } finally {
      control.disabled = false
    }
  })
  const group = html('div', 'lumo-admin-media', field(isModel ? 'Путь к модели' : 'Путь к фотографии', input),
    html('div', 'lumo-admin-actions', control, existing && mediaLink(existing), uploadResult), file)
  return { input, group }
}

function sourceDate(): string {
  const today = new Date()
  const dateParts = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
  return dateParts.map((value) => String(value).padStart(2, '0')).join('-')
}

export function openProductEditor(context: EditorContext, part?: Part, archived = false): void {
  const { api, host, changed } = context
  const { dialog, body, close } = showDialog(host, part?.name ?? 'Новое комплектующее', part?.id, 'is-wide')
  const form = html('form', 'lumo-admin-form')
  const id = textInput('id', part?.id, {
    required: true, maxLength: 96, pattern: '[a-z0-9](?:[a-z0-9_]|-){0,95}', placeholder: 'manufacturer-model',
  })
  id.readOnly = Boolean(part)
  const category = select('category', categories.map((key) => [key, categoryNames[key]] as const), part?.category ?? 'case')
  category.disabled = Boolean(part)
  const name = textInput('name', part?.name, { required: true, maxLength: 160 })
  const brand = textInput('brand', part?.brand, { required: true, maxLength: 80 })
  const model = textInput('model', part?.model, { required: true, maxLength: 120 })
  const price = textInput('price', part ? String(part.price) : '', { required: true, type: 'number', min: '0', max: '10000000', step: '1' })
  const priceStatus = select('priceStatus', [['demo', 'Демонстрационная'], ['verified', 'Подтверждённая']], part?.priceStatus ?? 'demo')
  const colors = textInput('colors', part?.colors.join(', '), { placeholder: 'Чёрный, белый', maxLength: 300 })
  const available = check('Есть в наличии', 'inStock', part?.inStock ?? false)
  const rgb = check('Поддерживает RGB', 'rgb', Boolean(part?.specs.rgb))
  const dimensions = {
    width: textInput('width', String(part?.dimensions?.width ?? ''), { type: 'number', min: '0.1', max: '1500', step: '0.01' }),
    height: textInput('height', String(part?.dimensions?.height ?? ''), { type: 'number', min: '0.1', max: '1500', step: '0.01' }),
    depth: textInput('depth', String(part?.dimensions?.depth ?? ''), { type: 'number', min: '0.1', max: '1500', step: '0.01' }),
  }
  const specControls = html('div', 'lumo-admin-fields')
  const extraSpecs = multiline('extra-specs', '', 5)
  extraSpecs.classList.add('lumo-admin-code')
  let specInputs: Array<[SpecField, HTMLInputElement | HTMLSelectElement]> = []
  const fillSpecs = () => {
    const definitions = specFields[category.value as Category]
    specInputs = definitions.map((definition) => {
      const value = part?.specs[definition.key]
      const formatted = Array.isArray(value) ? value.join(', ') : String(value ?? '')
      return [definition, definition.type === 'choice'
        ? select(definition.key, [['', 'Не указано'], ...(definition.choices ?? []).map((choice) => [choice, choice] as const)], formatted)
        : textInput(definition.key, formatted, definition.type === 'number' ? { type: 'number', step: 'any', min: '0' } : {})]
    })
    specControls.replaceChildren(...specInputs.map(([definition, control]) => field(definition.title, control)), rgb)
    const reserved = new Set([...definitions.map(({ key }) => key), 'rgb', 'mountOffsetMm', 'mountRotationDeg'])
    extraSpecs.value = JSON.stringify(Object.fromEntries(Object.entries(part?.specs ?? {}).filter(([key]) => !reserved.has(key))), null, 2)
  }
  fillSpecs()
  category.addEventListener('change', fillSpecs)
  const source = textInput('source', part?.source, { required: true, type: 'url', placeholder: 'https://', maxLength: 600 })
  const checkedAt = textInput('checkedAt', part?.checkedAt.slice(0, 10) ?? sourceDate(), { type: 'date', required: true })
  const image = mediaControl(api, 'image', part?.image)
  const modelUrl = mediaControl(api, 'model', part?.modelUrl)
  const modelStatus = select('modelStatus', [['approximation', 'Приближённая'], ['reference', 'Точная модель']], part?.modelStatus ?? 'approximation')
  const mount = mountEditor(part)
  const outcome = html('div')
  const save = submit(archived ? 'Восстановить' : 'Сохранить', 'check')
  const archive = part && !archived ? button('Архивировать', () => {
    const yes = button('Подтвердить архивацию', async () => {
      save.disabled = true
      yes.disabled = true
      try {
        await api.archiveProduct(part.id)
        close()
        changed('Комплектующее архивировано.')
      } catch (error) {
        outcome.replaceChildren(notice(errorMessage(error), 'error'))
      } finally {
        save.disabled = false
        yes.disabled = false
      }
    }, 'danger', 'archive')
    outcome.replaceChildren(html('div', 'lumo-admin-confirm',
      notice('Комплектующее будет скрыто из каталога магазина.'), yes,
      button('Отмена', () => outcome.replaceChildren(), 'quiet')))
  }, 'quiet', 'archive') : undefined

  const details = html('details', 'lumo-admin-details', html('summary', '', 'Расширенные характеристики'), field('Дополнительные поля JSON', extraSpecs))
  form.append(editorSection('Карточка товара', html('div', 'lumo-admin-fields',
    field('Название', name), field('Категория', category), field('Производитель', brand),
    field('Модель', model), field('Артикул', id), field('Цвета (через запятую)', colors),
    field('Цена, ₽', price), field('Тип цены', priceStatus), available)),
  editorSection('Физические размеры', html('div', 'lumo-admin-fields is-three',
    field('Ширина, мм', dimensions.width), field('Высота, мм', dimensions.height), field('Глубина, мм', dimensions.depth))),
  editorSection('Характеристики', html('div', 'lumo-admin-stack', specControls, details)),
  editorSection('Источник данных', html('div', 'lumo-admin-fields', field('Ссылка на спецификацию', source), field('Дата проверки', checkedAt))),
  editorSection('Медиа', html('div', 'lumo-admin-fields', image.group, modelUrl.group, field('Точность 3D-модели', modelStatus)),
    'Используйте материалы с коммерческой лицензией.'),
  editorSection('Точка установки', mount.element, 'Смещение относительно штатного крепления. Переместите точку на схеме или задайте значения в полях.'),
  outcome,
  html('div', 'lumo-admin-dialog-footer', archive, html('span', 'lumo-admin-spacer'), button('Отмена', close), save))

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    outcome.replaceChildren()
    const anyDimension = Object.values(dimensions).some((input) => input.value !== '')
    const completeDimensions = Object.values(dimensions).every((input) => input.value !== '')
    if (anyDimension && !completeDimensions) {
      outcome.replaceChildren(notice('Заполните все три размера или оставьте все поля размеров пустыми.', 'error'))
      return
    }
    let specs: Specs
    try {
      const other = JSON.parse(extraSpecs.value) as unknown
      if (!other || typeof other !== 'object' || Array.isArray(other)) throw new Error()
      specs = { ...other }
    } catch {
      details.open = true
      outcome.replaceChildren(notice('Расширенные характеристики должны быть объектом JSON.', 'error'))
      extraSpecs.focus()
      return
    }
    for (const [definition, input] of specInputs) {
      const value = input.value.trim()
      if (!value) delete specs[definition.key]
      else specs[definition.key] = definition.type === 'number' ? Number(value)
        : definition.type === 'list' ? value.split(',').map((item) => item.trim()).filter(Boolean)
          : value
    }
    const { offset, yaw } = mount.values()
    delete specs.mountOffsetMm
    delete specs.mountRotationDeg
    if (Object.values(offset).some((value) => value)) specs.mountOffsetMm = offset
    if (yaw) specs.mountRotationDeg = yaw
    specs.rgb = Boolean(new FormData(form).get('rgb'))

    const item: Part = {
      id: id.value.trim(), name: name.value.trim(), brand: brand.value.trim(), model: model.value.trim(),
      category: category.value as Category, price: Number(price.value), priceStatus: priceStatus.value as Part['priceStatus'],
      inStock: Boolean(new FormData(form).get('inStock')),
      colors: colors.value.split(',').map((color) => color.trim()).filter(Boolean),
      dimensions: completeDimensions
        ? { width: Number(dimensions.width.value), height: Number(dimensions.height.value), depth: Number(dimensions.depth.value) }
        : undefined,
      source: source.value.trim(), checkedAt: checkedAt.value, specs,
      image: image.input.value.trim() || undefined,
      modelUrl: modelUrl.input.value.trim() || undefined,
      modelStatus: modelUrl.input.value.trim() ? modelStatus.value as Part['modelStatus'] : undefined,
    }
    save.disabled = true
    if (archive) archive.disabled = true
    dialog.setAttribute('aria-busy', 'true')
    try {
      await api.saveProduct(item)
      close()
      changed(archived ? 'Комплектующее восстановлено.' : 'Комплектующее сохранено.')
    } catch (error) {
      outcome.replaceChildren(notice(errorMessage(error), 'error'))
      outcome.scrollIntoView({ block: 'nearest' })
    } finally {
      save.disabled = false
      if (archive) archive.disabled = false
      dialog.removeAttribute('aria-busy')
    }
  })
  body.append(form)
  if (!part) name.focus()
}

export function filePicker(onFile: (file: File) => void): { input: HTMLInputElement; button: HTMLButtonElement } {
  const input = html('input', 'lumo-admin-file')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.setAttribute('aria-label', 'Файл каталога JSON')
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    input.value = ''
    if (file) onFile(file)
  })
  return { input, button: button('Импорт JSON', () => input.click(), 'plain', 'upload') }
}

export function mediaLink(url: string): HTMLAnchorElement | undefined {
  if (!/^\/(?:images|models|api\/media)\/[\w./-]+(?:\?store=[a-z0-9_-]+)?$/.test(url) || url.includes('..')) return
  const link = html('a', 'lumo-admin-link', icon('right'), 'Открыть')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  return link
}
