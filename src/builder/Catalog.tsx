import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDownUp, ArrowLeft, ArrowRight, Box, Check, ChevronDown, ExternalLink, GitCompareArrows, Heart, Search, X } from 'lucide-react'
import type { Build, Category, Part, Preset } from '../shared/types'
import { createCompatibilityChecker } from '../shared/compatibility'
import { categoryOrder, icons, labels, money, partCaption } from './state'

export function Modal({ title, caption, children, close, wide = false }: {
  title: string; caption?: string; children: ReactNode; close: () => void; wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return <dialog ref={ref} className={wide ? 'modal modal-wide' : 'modal'} onCancel={close}
    aria-labelledby="modal-title" onClick={event => { if (event.target === event.currentTarget) close() }}>
    <article className="modal-inner">
      <header className="modal-header">
        <div><h2 id="modal-title">{title}</h2>{caption && <p>{caption}</p>}</div>
        <button className="icon-button" aria-label="Закрыть" onClick={close}><X size={20} /></button>
      </header>
      {children}
    </article>
  </dialog>
}

const keys: Record<string, string> = {
  socket: 'Сокет', sockets: 'Поддерживаемые сокеты', formFactor: 'Форм-фактор', formFactors: 'Форматы плат',
  widthMm: 'Ширина платы, мм', heightMm: 'Высота платы, мм',
  memoryType: 'Тип памяти', memorySlots: 'Слоты памяти', memoryModules: 'Модули в комплекте', capacityGb: 'Объём, ГБ',
  speedMts: 'Скорость, МТ/с', chipset: 'Чипсет', cores: 'Ядра', threads: 'Потоки', vramGb: 'Видеопамять, ГБ',
  gpuSlots: 'Слоты расширения', gpuClearanceMm: 'Длина видеокарты до, мм', coolerClearanceMm: 'Высота кулера до, мм',
  coolerHeightMm: 'Высота кулера, мм', radiatorMm: 'Формат радиатора, мм', fanSizeMm: 'Размер вентилятора, мм',
  fanCount: 'Количество вентиляторов', psuFormFactor: 'Формат БП', psuWatts: 'Мощность БП, Вт',
  recommendedPsuWatts: 'Рекомендуемый БП, Вт', storageInterface: 'Интерфейс накопителя', wattage: 'Потребление, Вт',
  rgb: 'RGB-подсветка', maxRpm: 'Обороты до, об/мин',
}
const filterSpec: Record<Category, string> = {
  case: 'formFactors', cpu: 'socket', gpu: 'vramGb', motherboard: 'socket', ram: 'memoryType',
  cooler: 'sockets', psu: 'psuFormFactor', storage: 'storageInterface', fan: 'fanSizeMm',
}
const pageSize = 25

function facetValues(part: Part, name: string) {
  const raw = part.specs[name]
  return (Array.isArray(raw) ? raw : [raw]).flatMap(item => {
    if (typeof item === 'string' || typeof item === 'number') return [String(item)]
    return []
  })
}

export function PartDetails({ part }: { part: Part }) {
  return <div className="part-detail">
    <div className="detail-picture">
      {part.image ? <img src={part.image} alt={part.name} /> : <PartIcon part={part} size={46} />}
      <span>{part.image ? (part.specs.imageKind === 'render' ? 'Авторская 3D-визуализация' : 'Изображение товара') : 'Фотография пока недоступна'}</span>
      {part.image?.startsWith('/images/parts/') && <a className="source-link" href={`/asset-credits.html#${encodeURIComponent(part.id)}`} target="_blank" rel="noreferrer">Авторы изображений <ExternalLink size={12} /></a>}
    </div>
    <div>
      <p className="muted">{part.brand} · {part.model}</p>
      <dl className="spec-list">
        {part.dimensions && <div><dt>Габариты, мм</dt><dd>{part.dimensions.width} × {part.dimensions.height} × {part.dimensions.depth}</dd></div>}
        {part.colors.length > 0 && <div><dt>Цвет</dt><dd>{part.colors.join(', ')}</dd></div>}
        {Object.entries(part.specs).flatMap(([key, value]) => {
          if (!(key in keys)) return []
          if (typeof value === 'boolean') return [<div key={key}><dt>{keys[key]}</dt><dd>{value ? 'Да' : 'Нет'}</dd></div>]
          if (typeof value === 'string' || typeof value === 'number' || Array.isArray(value)) {
            return [<div key={key}><dt>{keys[key]}</dt><dd>{Array.isArray(value) ? value.join(', ') : value}</dd></div>]
          }
          return []
        })}
        <div><dt>3D-модель</dt><dd>{part.modelStatus === 'reference' ? 'Модель товара' : part.modelStatus === 'approximation' ? 'Авторская аппроксимация' : 'Типовая визуализация'}</dd></div>
      </dl>
      <a className="source-link" href={part.source} target="_blank" rel="noreferrer">Характеристики производителя <ExternalLink size={13} /></a>
      <span className="source-date">Сведения от {part.checkedAt}</span>
    </div>
  </div>
}

export function PartIcon({ part, size = 19 }: { part: Pick<Part, 'category'>; size?: number }) {
  const Icon = icons[part.category]
  return <Icon size={size} strokeWidth={1.55} aria-hidden />
}

export function CatalogDialog({ parts, build, category, selectedPart, currency, favorites, recentlySelected, changeFavorite, choose, close, preview }: {
  parts: readonly Part[]; build: Build; category?: Category; selectedPart?: Part; currency: string; favorites: string[]; recentlySelected: string[];
  changeFavorite: (id: string) => void; choose: (part: Part) => void; close: () => void; preview: (part: Part) => void
}) {
  const [currentCategory, setCategory] = useState<Category | ''>(category ?? '')
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState('')
  const [color, setColor] = useState('')
  const [sort, setSort] = useState('name')
  const [maxPrice, setMax] = useState('')
  const [facet, setFacet] = useState('')
  const [stockOnly, setStock] = useState(false)
  const [fitOnly, setFit] = useState(false)
  const [scope, setScope] = useState<'all' | 'favorites' | 'recent'>('all')
  const [compare, setCompare] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)
  const [detail, setDetail] = useState<Part | undefined>(selectedPart)
  const [limit, setLimit] = useState(pageSize)
  const candidates = useMemo(() => parts.filter(part => !currentCategory || part.category === currentCategory), [parts, currentCategory])
  const checkPart = useMemo(() => createCompatibilityChecker(parts), [parts])
  const brands = [...new Set(candidates.map(part => part.brand))].sort()
  const colors = [...new Set(candidates.flatMap(part => part.colors))].sort()
  const specName = currentCategory ? filterSpec[currentCategory] : ''
  const facets = specName ? [...new Set(candidates.flatMap(part => facetValues(part, specName)))].sort() : []
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru')
    return candidates.filter(part => {
      if (query && !`${part.name} ${part.brand} ${part.model} ${partCaption(part)}`.toLocaleLowerCase('ru').includes(query)) return false
      if (brand && part.brand !== brand || color && !part.colors.includes(color) || stockOnly && !part.inStock) return false
      if (maxPrice && part.price > Number(maxPrice)) return false
      if (facet && !facetValues(part, specName).includes(facet)) return false
      if (scope === 'favorites' && !favorites.includes(part.id) || scope === 'recent' && !recentlySelected.includes(part.id)) return false
      if (fitOnly) {
        const report = checkPart({ ...build, [part.category]: part.id })
        if (report.issues.some(issue => issue.severity === 'incompatible' && issue.categories.includes(part.category))) return false
      }
      return true
    }).sort((a, b) => sort === 'cheap' ? a.price - b.price : sort === 'expensive' ? b.price - a.price : a.name.localeCompare(b.name, 'ru'))
  }, [candidates, search, brand, color, stockOnly, maxPrice, facet, specName, scope, favorites, recentlySelected, fitOnly, build, checkPart, sort])
  useEffect(() => { setLimit(pageSize) }, [visible])

  function toggleCompare(id: string) {
    setCompare(current => current.includes(id) ? current.filter(key => key !== id) : [...current.slice(-2), id])
  }

  return <Modal title={comparing ? 'Сравнение комплектующих' : detail ? detail.name : 'Каталог комплектующих'} close={close} wide>
    {detail ? <>
      <button className="text-button" onClick={() => setDetail(undefined)}><ArrowLeft size={16} /> К каталогу</button>
      <PartDetails part={detail} />
      <div className="modal-actions">
        <button className="button" onClick={() => preview(detail)}><Box size={16} /> Осмотреть в 3D</button>
        <button className="button primary" disabled={!detail.inStock} onClick={() => choose(detail)}>{build[detail.category] === detail.id ? 'Уже в сборке' : 'Выбрать'} <ArrowRight size={17} /></button>
      </div>
    </> : comparing ? <>
      <button className="text-button" onClick={() => setComparing(false)}><ArrowLeft size={16} /> К каталогу</button>
      <div className="comparison-grid">
        {parts.filter(part => compare.includes(part.id)).map(part => <section key={part.id} className="compare-column">
          <h3>{part.name}</h3><strong>{money(part.price, currency)}</strong><PartDetails part={part} />
          <button className="button primary" disabled={!part.inStock} onClick={() => choose(part)}>Выбрать</button>
        </section>)}
      </div>
    </> : <>
      <div className="catalog-filters">
        <label className="search-field"><Search size={17} /><input aria-label="Поиск комплектующих" placeholder="Название или производитель" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label className="select-field"><select aria-label="Категория" value={currentCategory} onChange={event => { setCategory(event.target.value as Category | ''); setBrand(''); setColor(''); setFacet('') }}>
          <option value="">Все категории</option>{categoryOrder.map(key => <option key={key} value={key}>{labels[key]}</option>)}
        </select><ChevronDown size={14} /></label>
        <label className="select-field"><ArrowDownUp size={15} /><select aria-label="Сортировка" value={sort} onChange={event => setSort(event.target.value)}>
          <option value="name">По названию</option><option value="cheap">Дешевле</option><option value="expensive">Дороже</option>
        </select></label>
      </div>
      <div className="catalog-filters secondary-filters">
        <select aria-label="Производитель" value={brand} onChange={event => setBrand(event.target.value)}><option value="">Все бренды</option>{brands.map(item => <option key={item}>{item}</option>)}</select>
        <select aria-label="Цвет" value={color} onChange={event => setColor(event.target.value)}><option value="">Любой цвет</option>{colors.map(item => <option key={item}>{item}</option>)}</select>
        {facets.length > 0 && <select aria-label={keys[specName]} value={facet} onChange={event => setFacet(event.target.value)}><option value="">{keys[specName]}</option>{facets.map(item => <option key={item}>{item}</option>)}</select>}
        <input aria-label="Максимальная цена" type="number" min="0" placeholder="Цена до" value={maxPrice} onChange={event => setMax(event.target.value)} />
        <label><input type="checkbox" checked={stockOnly} onChange={event => setStock(event.target.checked)} /> В наличии</label>
        <label><input type="checkbox" checked={fitOnly} onChange={event => setFit(event.target.checked)} /> Без выявленных конфликтов</label>
      </div>
      <div className="catalog-meta">
        <div className="segmented mini" aria-label="Коллекция">
          <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>Все</button>
          <button className={scope === 'favorites' ? 'active' : ''} onClick={() => setScope('favorites')}>Избранное</button>
          <button className={scope === 'recent' ? 'active' : ''} onClick={() => setScope('recent')}>Недавние</button>
        </div>
        <span className="muted">{visible.length} поз.</span>
        <button className="button compact" disabled={compare.length < 2} onClick={() => setComparing(true)}><GitCompareArrows size={16} /> Сравнить{compare.length > 0 ? ` (${compare.length})` : ''}</button>
      </div>
      <div className="catalog-list">
        {visible.slice(0, limit).map(part => <article className="catalog-item" key={part.id}>
          <div className="part-tile">{part.image ? <img src={part.image} alt="" loading="lazy" /> : <PartIcon part={part} size={23} />}</div>
          <div className="catalog-item-title"><button onClick={() => setDetail(part)}>{part.name}</button><span>{[labels[part.category], partCaption(part), !part.inStock && 'Нет в наличии'].filter(Boolean).join(' · ')}</span></div>
          <strong className="catalog-price">{money(part.price, currency)}{part.priceStatus === 'demo' && <small>демо</small>}</strong>
          <button className={favorites.includes(part.id) ? 'icon-button selected' : 'icon-button'} aria-label={`Избранное: ${part.name}`} aria-pressed={favorites.includes(part.id)} onClick={() => changeFavorite(part.id)}><Heart size={17} /></button>
          <button className={compare.includes(part.id) ? 'icon-button selected' : 'icon-button'} aria-label={`Сравнить: ${part.name}`} aria-pressed={compare.includes(part.id)} onClick={() => toggleCompare(part.id)}><GitCompareArrows size={17} /></button>
          <button className="button compact" disabled={!part.inStock} onClick={() => choose(part)}>{build[part.category] === part.id ? <Check size={16} /> : 'Выбрать'}</button>
        </article>)}
        {visible.length > limit && <button className="button compact more-parts" onClick={() => setLimit(current => current + pageSize)}>Показать ещё</button>}
        {visible.length === 0 && <div className="empty">По заданным условиям комплектующие не найдены.</div>}
      </div>
    </>}
  </Modal>
}

export function PresetsDialog({ presets, parts, currency, choose, close }: {
  presets: readonly Preset[]; parts: readonly Part[]; currency: string; choose: (preset?: Preset) => void; close: () => void
}) {
  const [budget, setBudget] = useState('')
  const rows = presets.map(preset => ({
    preset,
    price: parts.filter(part => Object.values(preset.build).includes(part.id)).reduce((total, part) => total + part.price, 0),
  })).filter(item => !budget || item.price <= Number(budget))
  return <Modal title="Готовые сборки" caption="Выберите стартовую конфигурацию. Все детали можно заменить." close={close} wide>
    <div className="preset-budget"><label>Бюджет <input type="number" min="0" placeholder="Любой" value={budget} onChange={event => setBudget(event.target.value)} /></label></div>
    <div className="preset-grid">
      {rows.map(({ preset, price }) => <article key={preset.id}>
        <span className="preset-use">{preset.use}</span><h3>{preset.name}</h3><p>{preset.description}</p>
        <footer><strong>{money(price, currency)}</strong><button className="button compact" onClick={() => choose(preset)}>Открыть <ArrowRight size={15} /></button></footer>
      </article>)}
      {!budget && !presets.some(preset => Object.keys(preset.build).length === 0) && <article><span className="preset-use">Своя конфигурация</span><h3>Начать с чистого листа</h3><p>Подберите весь набор комплектующих самостоятельно.</p><footer><button className="button compact" onClick={() => choose()}>Начать <ArrowRight size={15} /></button></footer></article>}
      {rows.length === 0 && budget && <p className="empty">В этом бюджете готовых сборок пока нет.</p>}
    </div>
  </Modal>
}
