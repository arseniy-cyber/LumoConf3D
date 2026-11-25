export type BenchmarkResolution = '1080p' | '1440p' | '4K'

export interface BenchmarkReading {
  game: string
  preset: string
  resolution: BenchmarkResolution
  averageFps: number
  gpu: string
  vramGb: number
  testSystem: string
  source: string
  publishedAt: string
}

type Readings = readonly [fps1080: number | undefined, fps1440: number | undefined, fps2160: number | undefined]
interface BenchmarkSeries {
  game: string
  preset: string
  testSystem: string
  source: string
  publishedAt: string
  readings: Readonly<Record<string, { vramGb: number; averageFps: Readings }>>
}

const resolutions = ['1080p', '1440p', '4K'] as const

// Values are the published averages read from each resolution's chart.
const series: BenchmarkSeries[] = [
  {
    game: 'Crimson Desert',
    preset: 'High · нативное разрешение',
    testSystem: 'TechSpot · Ryzen 7 9800X3D · 32 ГБ DDR5-6000 CL30 · GeForce 595.79 / Radeon 26.2.2',
    source: 'https://www.techspot.com/article/3104-crimson-desert-benchmark/#High_Preset_1080p',
    publishedAt: '2026-03-18',
    readings: {
      'RTX 4090': { vramGb: 24, averageFps: [166, 140, 95] },
      'RTX 4080 SUPER': { vramGb: 16, averageFps: [140, 112, 72] },
      'RTX 4070 TI SUPER': { vramGb: 16, averageFps: [124, 100, 62] },
      'RTX 4070 SUPER': { vramGb: 12, averageFps: [112, 88, 53] },
      'RTX 4060 TI': { vramGb: 8, averageFps: [68, 52, 33] },
      'RTX 4060': { vramGb: 8, averageFps: [61, 45, 27] },
      'RX 7800 XT': { vramGb: 16, averageFps: [95, 74, 43] },
      'RX 7700 XT': { vramGb: 12, averageFps: [85, 68, 39] },
      'RX 7600': { vramGb: 8, averageFps: [59, 42, 25] },
      'RX 6600': { vramGb: 8, averageFps: [44, 33, 19] },
    },
  },
  {
    game: 'Kingdom Come: Deliverance II',
    preset: 'Medium · нативное разрешение',
    testSystem: 'TechSpot · 60-секундный заезд Quest Start. В статье CPU и память стенда не указаны.',
    source: 'https://www.techspot.com/review/2952-kingdom-come-deliverance-2-benchmark/#Medium_1080p',
    publishedAt: '2025-02-10',
    readings: {
      'RTX 4090': { vramGb: 24, averageFps: [310, 232, 125] },
      'RTX 4080 SUPER': { vramGb: 16, averageFps: [248, 179, 91] },
      'RTX 4070 TI SUPER': { vramGb: 16, averageFps: [218, 150, 77] },
      'RTX 4070 SUPER': { vramGb: 12, averageFps: [194, 129, 64] },
      'RTX 4060 TI': { vramGb: 8, averageFps: [126, 81, 40] },
      'RTX 4060': { vramGb: 8, averageFps: [94, 63, 32] },
      'RX 7800 XT': { vramGb: 16, averageFps: [141, 105, 56] },
      'RX 7700 XT': { vramGb: 12, averageFps: [136, 101, 53] },
      'RX 7600': { vramGb: 8, averageFps: [88, 59, 30] },
      'RX 6600': { vramGb: 8, averageFps: [69, 45, 23] },
    },
  },
  {
    game: 'Cyberpunk 2077: Phantom Liberty',
    preset: 'High · без трассировки лучей',
    testSystem: 'TechSpot · Ryzen 7 7800X3D · 32 ГБ DDR5-6000. RTX 4070 Ti SUPER тестировалась в исполнении MSI Ventus 3X.',
    source: 'https://www.techspot.com/review/2793-nvidia-geforce-rtx-4070-ti-super/#Benchmarks',
    publishedAt: '2024-01-23',
    readings: {
      'RTX 4070 TI SUPER': { vramGb: 16, averageFps: [undefined, 107, 53] },
      'RTX 4070 SUPER': { vramGb: 12, averageFps: [undefined, 97, 46] },
    },
  },
  {
    game: 'Cyberpunk 2077: Phantom Liberty',
    preset: 'Medium · нативное разрешение',
    testSystem: 'TechSpot · Ryzen 7 7800X3D · 32 ГБ DDR5-6000 CL30 · GeForce 537.42 / Radeon 23.9.2',
    source: 'https://www.techspot.com/review/2743-cyberpunk-phantom-liberty-benchmark/#Benchmarks_Medium_Quality',
    publishedAt: '2023-09-26',
    readings: {
      'RTX 4090': { vramGb: 24, averageFps: [208, 192, 106] },
      'RTX 4060 TI': { vramGb: 8, averageFps: [111, 75, 36] },
      'RTX 4060': { vramGb: 8, averageFps: [97, 61, 28] },
      'RX 7800 XT': { vramGb: 16, averageFps: [162, 115, 59] },
      'RX 7700 XT': { vramGb: 12, averageFps: [133, 92, 48] },
      'RX 7600': { vramGb: 8, averageFps: [95, 62, 30] },
      'RX 6600': { vramGb: 8, averageFps: [75, 47, 22] },
    },
  },
]

export function publishedBenchmarks(gpu: string | undefined, vramGb: number | undefined): BenchmarkReading[] {
  if (!gpu || vramGb === undefined) return []
  const key = gpu.trim().toUpperCase()
  return series.flatMap(({ readings, ...context }) => {
    const reading = readings[key]
    if (!reading || reading.vramGb !== vramGb) return []
    return resolutions.flatMap((resolution, index) => {
      const averageFps = reading.averageFps[index]
      return averageFps === undefined ? [] : [{ ...context, gpu: key, vramGb, resolution, averageFps }]
    })
  })
}
