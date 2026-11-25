import { publishedBenchmarks, type BenchmarkReading } from './benchmarks.ts'
import { checkCompatibility, estimateBuildPower, resolveParts, type PowerEstimate } from './compatibility.ts'
import { categories, type Build, type Category, type Part, type Preset } from './types.ts'

interface BudgetItem {
  category: Category
  name: string
  price: number
  percentage: number
}

interface Workload {
  id: 'gaming' | 'editing' | 'streaming' | 'work'
  label: string
  assessment: string
  detail: string
  source?: string
}

interface Alternative {
  id: string
  name: string
  total: number
  priceDelta: number
  estimatedWatts: number | null
  gpu: string | null
  cpu: string | null
  benchmarks: BenchmarkReading[]
}

export interface BuildAnalysis {
  power: PowerEstimate & { message: string }
  budget: { total: number; items: BudgetItem[]; demo: boolean }
  benchmarks: BenchmarkReading[]
  benchmarkMessage: string
  workloads: Workload[]
  alternatives: Alternative[]
}

function gpuBenchmarks(gpu: Part | undefined): BenchmarkReading[] {
  if (!gpu) return []
  const explicitChip = gpu.specs.gpuChip
  const chip = typeof explicitChip === 'string' ? explicitChip : /\b(?:RTX|RX)\s+\d{4}(?:\s+TI)?(?:\s+SUPER|\s+XT)?\b/i.exec(gpu.name)?.[0]
  return publishedBenchmarks(chip, gpu.specs.vramGb)
}

function budgetBreakdown(parts: Partial<Record<Category, Part>>): BuildAnalysis['budget'] {
  const selected = categories.flatMap((category) => parts[category] ?? [])
  const total = selected.reduce((sum, part) => sum + part.price, 0)
  return {
    total,
    demo: selected.some((part) => part.priceStatus === 'demo'),
    items: selected
      .map(({ category, name, price }) => ({ category, name, price, percentage: total > 0 ? 100 * price / total : 0 }))
      .sort((first, second) => second.price - first.price),
  }
}

function assessWorkloads(parts: Partial<Record<Category, Part>>, benchmarks: readonly BenchmarkReading[]): Workload[] {
  const ramGb = parts.ram?.specs.capacityGb
  const threads = parts.cpu?.specs.threads
  const videoMemoryGb = parts.gpu?.specs.vramGb
  const encoding = parts.gpu?.specs.encoder
  const memoryKnown = ramGb !== undefined && videoMemoryGb !== undefined
  const benchmarks1080 = benchmarks.filter((sample) => sample.resolution === '1080p')
  const gamesAt60 = benchmarks1080.filter((sample) => sample.averageFps >= 60).length
  const adobeMemoryProfile = memoryKnown && videoMemoryGb >= 8
    ? ramGb >= 32 ? 'Память соответствует профилю 4K' : ramGb >= 16 ? 'Память соответствует профилю HD' : 'Память ниже рекомендованной для HD'
    : 'Проверьте объём оперативной и видеопамяти'
  const blenderRecommendedMemory = memoryKnown && ramGb >= 32 && videoMemoryGb >= 8
  return [
    {
      id: 'gaming',
      label: 'Игры',
      assessment: benchmarks1080.length ? 'Ориентиры для 1080p' : 'Требования зависят от игры',
      detail: benchmarks1080.length
        ? `На тестовых стендах среднее значение достигло 60 FPS при 1080p в ${gamesAt60} из ${benchmarks1080.length} игр с доступными замерами. Настройки игр указаны в таблице.`
        : 'Сверьте системные требования конкретной игры, разрешение и настройки графики.',
    },
    {
      id: 'editing',
      label: 'Видеомонтаж',
      assessment: adobeMemoryProfile,
      detail: memoryKnown
        ? `${ramGb} ГБ оперативной и ${videoMemoryGb} ГБ видеопамяти. Сравнение по объёмам памяти для Premiere 27.0 на Windows. Процессор, накопители и кодеки учитываются отдельно.`
        : 'Для оценки объёмов памяти по рекомендациям Premiere 27.0 выберите комплект оперативной памяти и видеокарту.',
      source: 'https://helpx.adobe.com/premiere/desktop/get-started/technical-requirements/adobe-premiere-pro-technical-requirements.html',
    },
    {
      id: 'streaming',
      label: 'Стриминг',
      assessment: typeof encoding === 'string' ? 'Указан аппаратный кодировщик' : 'Требуется проверка кодировщика',
      detail: typeof encoding === 'string'
        ? `Кодировщик ${encoding}. Сверьте поддержку формата на платформе и в программе трансляции.`
        : 'Сверьте поддержку аппаратного кодирования H.264, HEVC или AV1 в спецификации видеокарты и требования платформы.',
      source: 'https://obsproject.com/kb/hardware-encoding',
    },
    {
      id: 'work',
      label: 'Рабочие задачи',
      assessment: memoryKnown ? blenderRecommendedMemory ? 'Память соответствует рекомендациям Blender' : 'Память ниже рекомендованной для Blender' : 'Требуются характеристики системы',
      detail: memoryKnown
        ? `${ramGb} ГБ оперативной и ${videoMemoryGb} ГБ видеопамяти${threads === undefined ? '' : `, ${threads} потоков CPU`}. Оценка по рекомендациям Blender к объёмам памяти. Сложность сцены влияет на производительность.`
        : 'Для оценки объёмов памяти по рекомендациям Blender выберите комплект оперативной памяти и видеокарту.',
      source: 'https://www.blender.org/download/requirements/',
    },
  ]
}

export function analyzeBuild(build: Build, catalog: readonly Part[], alternatives: readonly Preset[] = []): BuildAnalysis {
  const parts = resolveParts(build, catalog)
  const budget = budgetBreakdown(parts)
  const power = estimateBuildPower(build, catalog)
  const benchmarks = gpuBenchmarks(parts.gpu)
  const comparison = alternatives.flatMap((preset): Alternative[] => {
    if (categories.every((category) => preset.build[category] === build[category])) return []
    if (checkCompatibility(preset.build, catalog).status === 'incompatible') return []
    const candidate = resolveParts(preset.build, catalog)
    const { total } = budgetBreakdown(candidate)
    return [{
      id: preset.id,
      name: preset.name,
      total,
      priceDelta: total - budget.total,
      estimatedWatts: estimateBuildPower(preset.build, catalog).estimatedWatts,
      gpu: candidate.gpu?.name ?? null,
      cpu: candidate.cpu?.name ?? null,
      benchmarks: gpuBenchmarks(candidate.gpu),
    }]
  })

  return {
    power: {
      ...power,
      message: power.estimatedWatts === null
        ? 'Недостаточно опубликованных данных для расчёта потребления.'
        : 'Оценка расчётной нагрузки на БП. Потребление из розетки и кратковременные пики зависят от оборудования и настроек.',
    },
    budget,
    benchmarks,
    benchmarkMessage: benchmarks.length
      ? 'Опубликованный средний FPS для того же чипа и объёма видеопамяти. Фактический FPS зависит от процессора, версии игры, драйверов и конкретной видеокарты.'
      : 'Для выбранной видеокарты и объёма памяти опубликованных замеров в наборе данных пока нет.',
    workloads: assessWorkloads(parts, benchmarks),
    alternatives: comparison,
  }
}
