import { Activity, Check, CircleAlert, Cpu, Gauge, TriangleAlert, Zap } from 'lucide-react'
import { analyzeBuild } from '../shared/analysis'
import { checkCompatibility, findCompatibleAlternatives, resolveRadiatorLocation } from '../shared/compatibility'
import type { Build, Category, MountLocation, Part, Preset, RgbEffect, SceneOptions } from '../shared/types'
import { categoryOrder, labels, money } from './state'

export type Panel = 'parts' | 'rgb' | 'analysis' | 'airflow' | 'scene'

export function AnalysisPanel({ build, parts, presets, currency, fanLocation, openCatalog }: {
  build: Build; parts: readonly Part[]; presets: readonly Preset[]; currency: string; fanLocation: MountLocation; openCatalog: (category: Category) => void
}) {
  const analysis = analyzeBuild(build, parts, presets)
  const compatibility = checkCompatibility(build, parts, { fanLocation })
  return <div className="panel-content analysis-content">
    <div className="metrics">
      <div><Zap size={15} /><span>Нагрузка</span><strong>{analysis.power.estimatedWatts == null ? '—' : `≈ ${analysis.power.estimatedWatts} Вт`}</strong></div>
      <div><Gauge size={15} /><span>Рекомендация БП</span><strong>{analysis.power.recommendedPsuWatts == null ? '—' : `${analysis.power.recommendedPsuWatts} Вт`}</strong></div>
    </div>
    <section>
      <h3>Совместимость</h3>
      {compatibility.issues.length === 0 ? <p className="notice good"><Check size={17} /> Проверенные параметры совпадают.</p> : compatibility.issues.map((issue, index) => {
        const category = issue.categories[0]
        const alternatives = category && issue.severity === 'incompatible' ? findCompatibleAlternatives(build, parts, category) : []
        return <div className={issue.severity === 'incompatible' ? 'notice danger' : 'notice warn'} key={`${issue.code}-${index}`}>
          <TriangleAlert size={16} /><div>{issue.message}
            {category && alternatives.length > 0 && <button className="text-button inline" onClick={() => openCatalog(category)}>Открыть варианты: {alternatives.slice(0, 2).map(part => part.name).join(', ')}</button>}
          </div>
        </div>
      })}
    </section>
    <section><h3>Производительность</h3>
      <p className="muted">{analysis.benchmarkMessage}</p>
      {analysis.benchmarks.map((benchmark, index) => <div className="benchmark" key={`${benchmark.game}-${benchmark.resolution}-${index}`}>
        <div><strong>{benchmark.game}</strong><span>{benchmark.resolution} · {benchmark.preset}</span><span>{benchmark.testSystem}</span>
          <a target="_blank" rel="noreferrer" href={benchmark.source}>Опубликованный тест</a></div>
        <strong>{benchmark.averageFps} FPS</strong>
      </div>)}
      {analysis.workloads.map(workload => <div className="budget-row" key={workload.id}><span>{workload.label}</span><span title={workload.detail}>{workload.assessment}</span></div>)}
    </section>
    {analysis.budget.items.length > 0 && <section><h3>Распределение бюджета</h3>
      {analysis.budget.items.map(item => <div className="budget-item" key={item.category}>
        <div className="budget-row"><span>{labels[item.category]}</span><span>{money(item.price, currency)} · {Math.round(item.percentage)}%</span></div>
        <progress max={100} value={item.percentage} aria-label={labels[item.category]} />
      </div>)}
    </section>}
    {analysis.alternatives.length > 0 && <section><h3>Другие сборки</h3>{analysis.alternatives.slice(0, 5).map(item =>
      <div className="budget-row" key={item.id}><span>{item.name}</span><span>{money(item.total, currency)}</span></div>
    )}</section>}
  </div>
}

const effects: Record<RgbEffect, string> = {
  static: 'Постоянное свечение', breathing: 'Дыхание', wave: 'Волна', rainbow: 'Радуга',
  sequence: 'Последовательность', transition: 'Переход цвета', custom: 'Своя комбинация',
}

const locations: Record<MountLocation, string> = { front: 'Спереди', top: 'Сверху', rear: 'Сзади', bottom: 'Снизу', side: 'Сбоку' }

const colorSwatches = [
  ['Лавандовый', '#a581ff'], ['Синий', '#6396ff'], ['Бирюзовый', '#58e1d0'], ['Розовый', '#ff76bf'], ['Белый', '#eff2ff'],
]

export function SettingsPanel({ panel, options, parts, change }: {
  panel: Exclude<Panel, 'parts' | 'analysis'>; options: SceneOptions; parts: Part[]; change: (patch: Partial<SceneOptions>) => void
}) {
  const enabledZones = parts.filter(part => part.specs.rgb)
  const chassis = parts.find(part => part.category === 'case')
  const fan = parts.find(part => part.category === 'fan')
  if (panel === 'rgb') return <div className="panel-content settings">
    {enabledZones.length === 0 && <p className="notice"><CircleAlert size={16} /> У выбранных деталей нет подтверждённой поддержки RGB.</p>}
    <label className="setting-toggle"><span>Подсветка включена</span><input className="switch" type="checkbox" checked={options.powered} onChange={event => change({ powered: event.target.checked })} /></label>
    <label className="setting-toggle"><span>Синхронизировать зоны</span><input className="switch" type="checkbox" checked={options.rgbSync} onChange={event => change({ rgbSync: event.target.checked })} /></label>
    <div className="setting"><strong>Общий цвет</strong><div className="swatches">
      {colorSwatches.map(([name, color]) => <button type="button" className={options.rgbColor === color ? 'swatch active' : 'swatch'}
        key={color} style={{ background: color }} aria-label={name} aria-pressed={options.rgbColor === color} onClick={() => change({ rgbColor: color })} />)}
      <input aria-label="Свой цвет" type="color" value={options.rgbColor} onChange={event => change({ rgbColor: event.target.value })} />
    </div></div>
    <label className="setting"><strong>Эффект</strong><select value={options.rgbEffect} onChange={event => change({ rgbEffect: event.target.value as RgbEffect })}>
      {Object.entries(effects).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label>
    <Slider title="Яркость" value={options.rgbBrightness} change={rgbBrightness => change({ rgbBrightness })} />
    <Slider title="Скорость" value={options.rgbSpeed} change={rgbSpeed => change({ rgbSpeed })} />
    {(!options.rgbSync || options.rgbEffect === 'custom') && enabledZones.map(part => {
      if (part.category === 'fan') return <label className="setting-toggle" key={part.id}>Вентилятор · {locations[options.fanLocation]}
        <input aria-label="Цвет вентилятора" type="color" value={options.fanColors?.[options.fanLocation] ?? options.rgbColor}
          onChange={event => change({ fanColors: { ...options.fanColors, [options.fanLocation]: event.target.value } })} /></label>
      return <label className="setting-toggle" key={part.id}>{labels[part.category]}
        <input aria-label={`Цвет: ${labels[part.category]}`} type="color" value={options.rgbZones[part.category] ?? options.rgbColor}
          onChange={event => change({ rgbZones: { ...options.rgbZones, [part.category]: event.target.value } })} /></label>
    })}
  </div>
  if (panel === 'airflow') {
    const radiator = resolveRadiatorLocation(chassis, parts.find(part => part.category === 'cooler'), parts.find(part => part.category === 'ram'), parts.find(part => part.category === 'gpu'))
    const allowed = (chassis?.specs.fanMounts ?? []).filter(mount => fan && mount.location !== radiator && (!fan.specs.fanSizeMm || mount.fanSizes.includes(fan.specs.fanSizeMm)))
    return <div className="panel-content settings">
      <p className="notice"><Activity size={16} /> Схематичное направление потоков воздуха.</p>
      <label className="setting-toggle"><span>Показать потоки</span><input className="switch" type="checkbox" checked={options.airflow} onChange={event => change({ airflow: event.target.checked })} /></label>
      <label className="setting"><strong>Крепление вентилятора</strong><select value={options.fanLocation}
        onChange={event => change({ fanLocation: event.target.value as MountLocation })} disabled={!allowed.length}>
        <option value={options.fanLocation} hidden>{locations[options.fanLocation]}</option>
        {allowed.map(mount => <option key={mount.location} value={mount.location}>{locations[mount.location]}</option>)}
      </select></label>
      <label className="setting"><strong>Направление</strong><select value={options.airflowDirection} onChange={event => change({ airflowDirection: event.target.value as SceneOptions['airflowDirection'] })}>
        <option value="intake">Забор воздуха</option><option value="exhaust">Вывод воздуха</option>
      </select></label>
      <Slider title="Скорость визуализации" value={options.airflowSpeed} change={airflowSpeed => change({ airflowSpeed })} />
    </div>
  }
  return <div className="panel-content settings">
    <label className="setting"><strong>Качество графики</strong><select value={options.quality} onChange={event => change({ quality: event.target.value as SceneOptions['quality'] })}>
      <option value="auto">Автоматически</option><option value="low">Облегчённое</option><option value="high">Максимальное</option>
    </select></label>
    {chassis && chassis.colors.length > 1 && <label className="setting"><strong>Цвет корпуса в сцене</strong><select
      value={chassis.colors.includes(options.finish ?? '') ? options.finish : chassis.colors[0]}
      onChange={event => change({ finish: event.target.value })}>
      {chassis.colors.map(color => <option key={color}>{color}</option>)}
    </select></label>}
    <label className="setting-toggle"><span>Боковое стекло</span><input className="switch" type="checkbox" checked={options.glass} onChange={event => change({ glass: event.target.checked })} /></label>
    <label className="setting-toggle"><span>Стекло снято</span><input className="switch" type="checkbox" checked={Boolean(options.separatedGlass)} onChange={event => change({ separatedGlass: event.target.checked })} /></label>
    <label className="setting-toggle"><span>Анимации</span><input className="switch" type="checkbox" checked={options.animations} onChange={event => change({ animations: event.target.checked })} /></label>
    <Slider title="Степень разборки" value={options.exploded} change={exploded => change({ exploded })} />
    <label className="setting"><strong>Разборка по категории</strong><select value={options.explodedCategory ?? ''} onChange={event => change({ explodedCategory: (event.target.value || undefined) as Category | undefined })}>
      <option value="">Вся сборка</option>
      {categoryOrder.map(category => <option key={category} value={category}>{labels[category]}</option>)}
    </select></label>
    <label className="setting"><strong>Скорость анимации</strong><select value={options.animationSpeed} onChange={event => change({ animationSpeed: Number(event.target.value) })}>
      <option value={.5}>0,5×</option><option value={1}>1×</option><option value={1.5}>1,5×</option><option value={2}>2×</option>
    </select></label>
    <div className="setting"><strong>Видимость деталей</strong><div className="visibility-options">
      {parts.map(part => <label key={part.id}><input type="checkbox" checked={!options.hiddenCategories?.includes(part.category)} onChange={event => {
        const hidden = options.hiddenCategories ?? []
        change({ hiddenCategories: event.target.checked ? hidden.filter(category => category !== part.category) : [...hidden, part.category] })
      }} />{labels[part.category]}</label>)}
    </div></div>
  </div>
}

function Slider({ title, value, change }: { title: string; value: number; change: (value: number) => void }) {
  return <label className="setting"><strong>{title} <span>{Math.round(value * 100)}%</span></strong>
    <input type="range" min={0} max={1} step={.01} value={value} onChange={event => change(event.target.valueAsNumber)} /></label>
}

export function FallbackModel() {
  return <div className="scene-fallback"><Cpu size={45} strokeWidth={1.2} /><strong>3D недоступно</strong><span>Подбор комплектующих и проверка совместимости доступны в правой панели.</span></div>
}
