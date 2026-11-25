import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine, ArrowRight, Bookmark, Box, Check, ChevronDown, ChevronRight, CircleAlert, CircleCheck,
  CirclePlay, Clipboard, Expand, Focus, Grid3X3, Layers3, Minus, Power, Redo2, RotateCcw, ScanLine,
  Settings2, Share2, Sparkles, TriangleAlert, Undo2, Wind,
} from 'lucide-react'
import { catalog, presets } from '../shared/catalog'
import { checkCompatibility } from '../shared/compatibility'
import type { Build, Category, Part, Preset, SceneMode, SceneOptions } from '../shared/types'
import type { SceneController } from '../scene/index'
import { api, demoStore, getCatalog, getPresets, getStore, saveShare, storageSuffix } from './api'
import { CatalogDialog, Modal, PartIcon, PresetsDialog } from './Catalog'
import { Checkout } from './Checkout'
import { AnalysisPanel, FallbackModel, SettingsPanel, type Panel } from './Panels'
import { categoryOrder, defaultScene, getParts, labels, money, parseBuild, parseSceneOptions, partCaption, readStorage, recoverBuild, sharedSceneOptions, shareUrl, writeStorage, type BuilderState, type SavedBuild } from './state'

type Dialog = 'catalog' | 'presets' | 'saved' | 'checkout' | 'reset' | 'conflict' | null
interface History {
  past: BuilderState[]
  current: BuilderState
  future: BuilderState[]
}

const currentKey = `lumo.current.v1${storageSuffix}`
const savedKey = `lumo.saved.v1${storageSuffix}`
const favoriteKey = `lumo.favorites.v1${storageSuffix}`
const recentKey = `lumo.recent.v1${storageSuffix}`
const remoteEnabled = import.meta.env.PROD || import.meta.env.VITE_API_ENABLED === '1'

const panelTitles: Record<Panel, string> = {
  parts: 'Комплектующие', rgb: 'Подсветка', analysis: 'Анализ сборки', airflow: 'Воздушный поток', scene: 'Настройки сцены',
}
const modes: Record<SceneMode, string> = {
  studio: 'Тёмная студия', light: 'Светлая студия', gaming: 'Игровая комната', technical: 'Технический фон',
}

export function Builder() {
  const [history, setHistory] = useState<History>(() => ({
    past: [], current: recoverBuild(presets[0]?.build ?? {}, currentKey), future: [],
  }))
  const { build, name, options } = history.current
  const [parts, setParts] = useState<readonly Part[]>(catalog)
  const [availablePresets, setPresets] = useState<readonly Preset[]>(presets)
  const [store, setStore] = useState(demoStore)
  const [saved, setSaved] = useState(() => readStorage<SavedBuild[]>(savedKey, []))
  const [favorites, setFavorites] = useState(() => readStorage<string[]>(favoriteKey, []))
  const [recentlySelected, setRecent] = useState(() => readStorage<string[]>(recentKey, []))
  const [dialog, setDialog] = useState<Dialog>(null)
  const [panel, setPanel] = useState<Panel>('parts')
  const [catalogCategory, setCatalogCategory] = useState<Category>()
  const [detail, setDetail] = useState<Part>()
  const [preview, setPreview] = useState<Part>()
  const [candidate, setCandidate] = useState<Part>()
  const [selected, setSelected] = useState<Category>()
  const [ready, setReady] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [modelStatus, setModelStatus] = useState<Record<string, 'loaded' | 'unavailable'>>({})
  const [sharing, setSharing] = useState(false)
  const [toast, setToast] = useState('')
  const [newName, setNewName] = useState('')
  const [extras, setExtras] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const mount = useRef<HTMLDivElement>(null)
  const partList = useRef<HTMLDivElement>(null)
  const engine = useRef<SceneController>(null)
  const picked = useMemo(() => getParts(build, parts), [build, parts])
  const sum = picked.reduce((total, part) => total + part.price, 0)
  const report = useMemo(() => checkCompatibility(build, parts, { fanLocation: options.fanLocation }), [build, parts, options.fanLocation])
  const blocking = report.issues.filter(issue => issue.severity === 'incompatible')
  const selectedCpu = picked.find(part => part.category === 'cpu')
  const needsGpu = selectedCpu?.specs.hasIntegratedGraphics !== true && selectedCpu?.specs.integratedGraphics !== true
  const missing = categoryOrder.filter(category => category !== 'fan' && (category !== 'gpu' || needsGpu) && !picked.some(part => part.category === category))
  const warnings = report.issues.filter(issue => issue.severity === 'warning').length
  const priceIsDemo = picked.some(part => part.priceStatus === 'demo')

  const commit = useCallback((update: (state: BuilderState) => BuilderState) => {
    setHistory(previous => {
      const current = update(previous.current)
      if (JSON.stringify(previous.current) === JSON.stringify(current)) return previous
      return { past: [...previous.past.slice(-59), previous.current], current, future: [] }
    })
  }, [])
  const updateOptions = useCallback((patch: Partial<SceneOptions>) => {
    commit(state => ({ ...state, options: { ...state.options, ...patch } }))
  }, [commit])
  const undo = useCallback(() => setHistory(state => {
    const previous = state.past.at(-1)
    return previous ? { past: state.past.slice(0, -1), current: previous, future: [state.current, ...state.future] } : state
  }), [])
  const redo = useCallback(() => setHistory(state => {
    const next = state.future[0]
    return next ? { past: [...state.past, state.current], current: next, future: state.future.slice(1) } : state
  }), [])

  const inputs = useRef({ picked, options, preview })
  inputs.current = { picked, options, preview }

  useEffect(() => { writeStorage(currentKey, history.current) }, [history.current])
  useEffect(() => { writeStorage(savedKey, saved) }, [saved])
  useEffect(() => { writeStorage(favoriteKey, favorites) }, [favorites])
  useEffect(() => { writeStorage(recentKey, recentlySelected) }, [recentlySelected])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable], dialog')) return
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [undo, redo])

  useEffect(() => {
    if (!remoteEnabled) return
    let running = true
    Promise.all([getStore(), getCatalog()]).then(([configuration, inventory]) => {
      if (!running) return
      setStore(configuration.store)
      setParts(inventory.products)
      setPresets([])
      getPresets().then(result => {
        if (running && Array.isArray(result.presets)) setPresets(result.presets)
      }).catch(() => {})
    }).catch(() => {
      if (running && storageSuffix) setToast('Каталог магазина недоступен. Показаны демонстрационные данные.')
    })
    const shared = new URLSearchParams(location.search).get('shared')
    if (shared && /^[\w-]{8,90}$/.test(shared)) {
      api<{ build: Build; name: string }>(`/builds/${shared}`).then(result => {
        if (running) commit(state => ({
          ...state, build: parseBuild(result.build), name: result.name || 'Полученная сборка',
          options: sharedSceneOptions() ?? state.options,
        }))
      }).catch(() => { if (running) setToast('Эта ссылка на сборку недоступна.') })
    }
    return () => { running = false }
  }, [commit])

  useEffect(() => {
    const target = mount.current
    if (!target) return
    let running = true
    import('../scene/index').then(({ createScene }) => {
      if (!running) return
      const scene = createScene(target, {
        onSelect: category => { setSelected(category); setPanel('parts') },
        onUnavailable: () => setUnavailable(true),
        onReady: () => { setReady(true); setUnavailable(false) },
        onFanLocationChange: fanLocation => updateOptions({ fanLocation }),
        onMountBlocked: setToast,
        onModelStatus: (part, state) => setModelStatus(previous => ({ ...previous, [part.id]: state })),
      })
      engine.current = scene
      scene.setOptions(inputs.current.options)
      if (inputs.current.preview) scene.showPart(inputs.current.preview)
      else scene.setBuild(inputs.current.picked)
    }).catch(() => { if (running) setUnavailable(true) })
    return () => {
      running = false
      engine.current?.dispose()
      engine.current = null
    }
  }, [updateOptions])
  useEffect(() => {
    if (preview) engine.current?.showPart(preview)
    else engine.current?.setBuild(picked)
  }, [picked, preview])
  useEffect(() => { engine.current?.setOptions(options) }, [options])
  useEffect(() => {
    const list = partList.current
    const item = list?.querySelector<HTMLElement>('.part-row.active')
    if (!list || !item) return
    const area = list.getBoundingClientRect()
    const bounds = item.getBoundingClientRect()
    if (bounds.bottom > area.bottom) list.scrollTop += bounds.bottom - area.bottom
    if (bounds.top < area.top) list.scrollTop -= area.top - bounds.top
  }, [selected, panel])

  function openCatalog(category?: Category, item?: Part) {
    setCatalogCategory(category)
    setDetail(item)
    setDialog('catalog')
  }

  function pickPart(part: Part) {
    commit(state => ({
      ...state,
      build: { ...state.build, [part.category]: part.id },
      options: part.category === 'case' ? { ...state.options, finish: undefined } : state.options,
    }))
    setRecent(current => [part.id, ...current.filter(item => item !== part.id)].slice(0, 30))
    setPreview(undefined)
    setSelected(part.category)
    setPanel('parts')
    setDialog(null)
    setToast(`${labels[part.category]} · ${part.name}`)
  }

  function selectPart(part: Part) {
    if (build[part.category] === part.id) {
      setDialog(null)
      engine.current?.focus(part.category)
      return
    }
    const next = checkCompatibility({ ...build, [part.category]: part.id }, parts, { fanLocation: options.fanLocation })
    if (next.issues.some(issue => issue.severity === 'incompatible' && issue.categories.includes(part.category))) {
      setCandidate(part)
      setDialog('conflict')
      return
    }
    pickPart(part)
  }

  function loadPreset(preset?: Preset) {
    commit(state => ({ ...state, name: preset?.name ?? 'Новая сборка', build: preset?.build ?? {}, options: defaultScene }))
    setSelected(undefined)
    setPreview(undefined)
    setDialog(null)
    engine.current?.resetCamera()
  }

  function saveCurrent() {
    const title = newName.trim() || name
    const id = crypto.randomUUID?.() ?? `local-${Date.now()}`
    setSaved(current => [{ id, name: title, build, options }, ...current].slice(0, 40))
    commit(state => ({ ...state, name: title }))
    setDialog(null)
    setToast('Сборка сохранена на этом устройстве.')
  }

  async function copyShare() {
    if (sharing) return
    setSharing(true)
    let link = shareUrl(build, options)
    if (remoteEnabled && store !== demoStore) {
      try {
        const { id } = await saveShare(build, name)
        const url = new URL(link)
        url.searchParams.delete('build')
        url.searchParams.set('shared', id)
        link = url.toString()
      } catch { /* A portable URL works without the server. */ }
    }
    try {
      await navigator.clipboard.writeText(link)
      setToast('Ссылка на сборку скопирована.')
    } catch {
      setToast('Буфер обмена недоступен. Откройте ссылку из меню сборки.')
    } finally {
      setSharing(false)
    }
  }

  function exportBuild() {
    const text = [name, ...picked.map(part => `${labels[part.category]}: ${part.name} — ${money(part.price, store.currency)}`), `Итого: ${money(sum, store.currency)}`, priceIsDemo && 'Цены демонстрационные.'].filter(Boolean).join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.download = 'lumo-build.txt'
    anchor.href = url
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function openSaved() {
    setNewName(name)
    setDialog('saved')
  }

  function togglePanel(next: Panel) {
    setPanel(current => current === next ? 'parts' : next)
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen()
    else if (viewport.current?.requestFullscreen) void viewport.current.requestFullscreen().catch(() => setToast('Полноэкранный режим недоступен.'))
    else setToast('Полноэкранный режим недоступен.')
  }

  const casePart = picked.find(part => part.category === 'case')
  const inspected = picked.find(part => part.category === selected)
  const status = blocking.length ? 'danger' : missing.length || warnings ? 'warn' : 'good'
  const statusText = blocking.length ? `Конфликты: ${blocking.length}` : missing.length ? 'Сборка не заполнена' : warnings ? `Уточнения: ${warnings}` : 'Проверенные параметры совпадают'
  const StatusIcon = blocking.length ? CircleAlert : missing.length || warnings ? TriangleAlert : CircleCheck

  return <>
    <header className="site-header">
      <div className="header-inner">
        <a className="wordmark" href={storageSuffix ? `?store=${encodeURIComponent(store.slug)}` : '/'} aria-label={`${store.name} PC Builder`}>
          <img src={store.logoUrl || '/lumo.svg'} alt="" width={35} height={35} />
          <span>{store.name.toUpperCase()} <small>PC BUILDER</small></span>
        </a>
        <nav className="main-nav" aria-label="Основное меню">
          <button className={!dialog || !['catalog', 'presets'].includes(dialog) ? 'active' : ''} onClick={() => { setPanel('parts'); setDialog(null) }}><Box size={16} /> <span>Конструктор</span></button>
          <button className={dialog === 'catalog' ? 'active' : ''} onClick={() => openCatalog()}><Grid3X3 size={16} /> <span>Каталог</span></button>
          <button className={dialog === 'presets' ? 'active' : ''} onClick={() => setDialog('presets')}><Layers3 size={16} /> <span>Готовые сборки</span></button>
        </nav>
        <button className="button header-action" aria-label="Мои сборки" onClick={openSaved}><Bookmark size={16} /><span>Мои сборки</span></button>
      </div>
    </header>

    <main className="site-main" style={store.accent && /^#[0-9a-f]{6}$/i.test(store.accent) ? { '--accent': store.accent } as React.CSSProperties : undefined}>
      <section className="intro">
        <div><h1>Конфигуратор ПК<span>.</span></h1><p>Соберите компьютер под свои задачи и настройте его внешний вид в 3D.</p></div>
        <div className="intro-actions">
          <div className="history-controls">
            <button className="icon-button" title="Отменить (Ctrl+Z)" aria-label="Отменить" disabled={!history.past.length} onClick={undo}><Undo2 size={18} /></button>
            <button className="icon-button" title="Повторить (Ctrl+Shift+Z)" aria-label="Повторить" disabled={!history.future.length} onClick={redo}><Redo2 size={18} /></button>
          </div>
          <button className="button subtle" onClick={() => setDialog('reset')}><RotateCcw size={15} /><span>Сбросить</span></button>
          <button className="button subtle share-action" disabled={!picked.length || sharing} onClick={copyShare}><Share2 size={16} /><span>Поделиться</span></button>
        </div>
      </section>

      <div className="workspace">
        <section className="viewport" ref={viewport} data-mode={options.mode} aria-label="Трёхмерная модель компьютера">
          <div className="viewport-texture" aria-hidden />
          <div className="viewport-header">
            <div><span className="view-label"><i /> 3D-ПРОСМОТР</span><span className="view-name">{preview?.name ?? casePart?.name ?? 'Новая сборка'}</span></div>
            <div className="view-select"><label><select aria-label="Окружение сцены" value={options.mode} onChange={event => updateOptions({ mode: event.target.value as SceneMode })}>
              {Object.entries(modes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select><ChevronDown size={14} /></label></div>
          </div>
          <div ref={mount} className="scene-mount" data-ready={ready}
            data-loaded-models={picked.filter(part => modelStatus[part.id] === 'loaded').length} />
          {!ready && !unavailable && <div className="scene-loading"><span className="spinner" /> Загружаем 3D-сцену</div>}
          {unavailable && <FallbackModel />}
          <div className="scene-tools" aria-label="Управление сценой">
            <button title="Общий вид" className="icon-button" aria-label="Общий вид" disabled={unavailable} onClick={() => { setPreview(undefined); setSelected(undefined); engine.current?.resetCamera() }}><Focus size={19} /></button>
            <button title={options.glass ? 'Открыть стекло' : 'Закрыть стекло'} className={options.glass ? 'icon-button' : 'icon-button selected'} aria-label={options.glass ? 'Открыть стекло' : 'Закрыть стекло'} aria-pressed={!options.glass} onClick={() => updateOptions({ glass: !options.glass })}><ScanLine size={19} /></button>
            <button title="Разборка" aria-label="Разборка" className={options.exploded ? 'icon-button selected' : 'icon-button'} aria-pressed={options.exploded > 0} onClick={() => { updateOptions({ exploded: options.exploded ? 0 : .65 }); setPanel('scene') }}><Layers3 size={19} /></button>
            <button title="Подсветка" aria-label="Подсветка" className={panel === 'rgb' ? 'icon-button selected' : 'icon-button'} onClick={() => togglePanel('rgb')}><Sparkles size={19} /></button>
            <button title="Воздушный поток" aria-label="Воздушный поток" className={options.airflow || panel === 'airflow' ? 'icon-button selected' : 'icon-button'} onClick={() => { updateOptions({ airflow: !options.airflow }); togglePanel('airflow') }}><Wind size={19} /></button>
            <button title="Настройки сцены" aria-label="Настройки сцены" className={panel === 'scene' ? 'icon-button selected' : 'icon-button'} onClick={() => togglePanel('scene')}><Settings2 size={19} /></button>
          </div>
          {preview && <button className="button preview-back" onClick={() => { setPreview(undefined); engine.current?.resetCamera() }}>Вернуться к сборке</button>}
          <div className="viewport-footer">
            <div className="scene-hint"><span className="mouse-symbol" aria-hidden /> Вращение<span className="hint-divider" /> Колесо для масштаба</div>
            <div className="viewport-actions">
              <button className="icon-button" title={options.powered ? 'Выключить компьютер' : 'Включить компьютер'} aria-label={options.powered ? 'Выключить компьютер' : 'Включить компьютер'} aria-pressed={options.powered} onClick={() => updateOptions({ powered: !options.powered })}><Power size={17} /></button>
              <button className="icon-button" title="Презентация" aria-label="Презентация" disabled={unavailable} onClick={() => engine.current?.play()}><CirclePlay size={18} /></button>
              <button className="icon-button" title="На весь экран" aria-label="На весь экран" onClick={toggleFullscreen}><Expand size={17} /></button>
            </div>
          </div>
        </section>

        <aside className="build-panel" aria-label="Комплектация">
          <div className="panel-header">
            <div className="panel-title"><h2>{panelTitles[panel]}</h2>{panel === 'parts' && <span className="part-count">{picked.length}/{categoryOrder.length}</span>}</div>
            {panel !== 'parts' ? <button className="text-button panel-link" onClick={() => setPanel('parts')}>К сборке <ChevronRight size={14} /></button> :
              <button className="text-button panel-link" onClick={() => setPanel('analysis')}>Анализ <ChevronRight size={14} /></button>}
          </div>
          {panel === 'parts' ? <div className="parts-list" ref={partList}>
            {categoryOrder.map(category => {
              const part = picked.find(item => item.category === category)
              return <div className={selected === category ? 'part-row active' : 'part-row'} key={category}>
                <button className="part-row-main" onClick={() => openCatalog(category)} aria-label={`${labels[category]}: ${part?.name ?? 'выбрать'}`}>
                  <span className="part-tile">{part?.image ? <img src={part.image} alt="" /> : <PartIcon part={{ category }} />}</span>
                  <span className="part-row-text"><small>{labels[category]}</small><strong>{part?.name ?? 'Выбрать компонент'}</strong></span>
                  {part && <span className="part-row-price">{money(part.price, store.currency)}</span>}
                  <ChevronRight className="row-arrow" size={15} />
                </button>
                {selected === category && part && <div className="part-row-extra">
                  <span>{partCaption(part)}</span><button className="text-button" onClick={() => openCatalog(category, part)}>Детали</button>
                  {!unavailable && <button className="icon-button" title="Приблизить" aria-label={`Приблизить: ${labels[category]}`} onClick={() => engine.current?.focus(category)}><Focus size={15} /></button>}
                  <button className="icon-button" aria-label={`Убрать: ${labels[category]}`} title="Убрать из сборки" onClick={() => commit(state => {
                    const next = { ...state.build }
                    delete next[category]
                    return { ...state, build: next }
                  })}><Minus size={16} /></button>
                </div>}
              </div>
            })}
          </div> : panel === 'analysis' ? <AnalysisPanel build={build} parts={parts} presets={availablePresets} currency={store.currency} fanLocation={options.fanLocation} openCatalog={openCatalog} /> :
            <SettingsPanel panel={panel} options={options} parts={picked} change={updateOptions} />}

          <div className="build-total">
            <button className={`fit-label ${status}`} onClick={() => togglePanel('analysis')}><StatusIcon size={16} /> {statusText}</button>
            <div className="total-line"><div><span>Итого</span>{priceIsDemo && <small>Демонстрационные цены и наличие</small>}</div><strong>{money(sum, store.currency)}</strong></div>
            <button className="button primary checkout-button" disabled={!picked.length} onClick={() => setDialog('checkout')}>К итогам сборки <ArrowRight size={18} /></button>
          </div>
        </aside>
      </div>

      <div className="workspace-footer">
        <div className="workspace-note">
          {inspected ? <><PartIcon part={inspected} size={16} /> <button className="text-button" onClick={() => openCatalog(inspected.category, inspected)}>{inspected.name}</button></> :
            <><CircleAlert size={15} /><span>{picked.some(part => modelStatus[part.id] === 'unavailable') ?
              'Для недоступных GLB показана резервная геометрия' : picked.some(part => part.modelStatus !== 'reference') ?
                'Геометрия комплектующих приближённая' : 'Подбирайте детали в каталоге или выбирайте их в сцене'}</span></>}
        </div>
        <div className="workspace-footer-actions">
          <button className="text-button" onClick={openSaved}><Bookmark size={15} /> Сохранить</button>
          <button className="text-button" onClick={exportBuild} disabled={!picked.length}><ArrowDownToLine size={15} /> Экспорт</button>
          <button className="icon-button" title="Ссылка" aria-label="Ссылка на сборку" aria-expanded={extras} onClick={() => setExtras(value => !value)}><Clipboard size={16} /></button>
        </div>
      </div>
      {extras && <div className="share-field"><label htmlFor="share-build">Ссылка на сборку</label><input id="share-build" readOnly value={shareUrl(build, options)} onFocus={event => event.currentTarget.select()} /></div>}
    </main>
    <footer className="site-footer"><span>{store.name} PC Builder</span><a href={`/admin${location.search.startsWith('?store=') ? `?store=${encodeURIComponent(store.slug)}` : ''}`}>Панель магазина</a></footer>

    <section className="print-summary">
      <h1>{name}</h1><p>LUMO PC Builder</p>
      <table><thead><tr><th>Категория</th><th>Комплектующее</th><th>Цена</th></tr></thead>
        <tbody>{picked.map(part => <tr key={part.id}><td>{labels[part.category]}</td><td>{part.name}</td><td>{money(part.price, store.currency)}</td></tr>)}</tbody>
      </table>
      <strong>Итого {money(sum, store.currency)}</strong>{priceIsDemo && <p>Цены демонстрационные.</p>}
    </section>

    {dialog === 'catalog' && <CatalogDialog parts={parts} build={build} category={catalogCategory} selectedPart={detail} currency={store.currency}
      favorites={favorites} recentlySelected={recentlySelected} changeFavorite={id => setFavorites(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])}
      choose={selectPart} close={() => setDialog(null)} preview={part => {
        setPreview(part)
        setDialog(null)
      }} />}
    {dialog === 'presets' && <PresetsDialog parts={parts} presets={availablePresets} currency={store.currency} choose={loadPreset} close={() => setDialog(null)} />}
    {dialog === 'checkout' && <Checkout store={store} build={build} parts={picked} total={sum} fanLocation={options.fanLocation} blocked={blocking.length > 0 || missing.length > 0} close={() => setDialog(null)} />}
    {dialog === 'saved' && <Modal title="Мои сборки" close={() => setDialog(null)}>
      <form className="save-form" onSubmit={event => { event.preventDefault(); saveCurrent() }}>
        <label>Название сборки<input required maxLength={72} value={newName} onChange={event => setNewName(event.target.value)} /></label>
        <button className="button primary" disabled={!picked.length}><Bookmark size={17} /> Сохранить текущую</button>
      </form>
      {saved.length === 0 ? <p className="empty">Сохранённые сборки появятся здесь.</p> : <div className="saved-list">{saved.map(item => <div key={item.id}>
        <span><strong>{item.name}</strong><small>{Object.keys(item.build).length} комплектующих</small></span>
        <button className="button compact" onClick={() => { commit(() => ({ build: parseBuild(item.build), options: parseSceneOptions(item.options), name: item.name })); setDialog(null); setPreview(undefined) }}>Открыть <ArrowRight size={15} /></button>
        <button className="icon-button" aria-label={`Удалить сохранённую сборку: ${item.name}`} onClick={() => setSaved(current => current.filter(entry => entry.id !== item.id))}><Minus size={16} /></button>
      </div>)}</div>}
    </Modal>}
    {dialog === 'reset' && <Modal title="Сбросить конфигурацию?" caption="Текущую конфигурацию можно восстановить кнопкой отмены." close={() => setDialog(null)}>
      <div className="modal-actions"><button className="button" onClick={() => setDialog(null)}>Отмена</button>
        <button className="button primary" onClick={() => loadPreset()}>Очистить сборку <ArrowRight size={17} /></button></div>
    </Modal>}
    {dialog === 'conflict' && candidate && <Modal title="Обнаружена несовместимость" caption={candidate.name} close={() => openCatalog(candidate.category)}>
      {checkCompatibility({ ...build, [candidate.category]: candidate.id }, parts, { fanLocation: options.fanLocation }).issues.filter(issue => issue.severity === 'incompatible' && issue.categories.includes(candidate.category)).map(issue =>
        <p className="notice danger" key={issue.code}><TriangleAlert size={16} /> {issue.message}</p>)}
      <div className="modal-actions"><button className="button" onClick={() => openCatalog(candidate.category)}>Подобрать другую</button>
        <button className="button primary" onClick={() => pickPart(candidate)}>Выбрать для сравнения</button></div>
    </Modal>}
    <div className={toast ? 'toast visible' : 'toast'} role="status"><Check size={17} /> {toast}</div>
  </>
}
